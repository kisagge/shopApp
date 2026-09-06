/*
 * **계약을 거치지 않는다.** 상수 하나 때문에 계약을 import 하면 Zod 가 통째로
 * 딸려 오고, 이 파일은 루트 레이아웃에 있어서 **모든 화면이 그것을 받는다.**
 */
import {
  isServerOnlyEvent, requiresConsent, MAX_EVENTS_PER_BATCH, type EventName,
} from '@shop/core';
import { getLocalConsent } from './consent';
import { getAnonymousId, getSessionId } from './session';

/**
 * 브라우저 이벤트 트래커.
 *
 * 큐에 모아 배치로 보낸다. 이벤트 하나마다 요청을 날리면 상품 목록을 훑는
 * 것만으로 수십 개의 요청이 나간다.
 *
 * 페이지를 떠날 때는 sendBeacon 을 쓴다. fetch 는 문서가 언로드되면 취소되는데,
 * 하필 그때 큐에 남아 있던 이벤트가 이탈 분석에 가장 중요한 것들이다.
 */

export interface Transport {
  /** 평상시 전송 */
  post(url: string, body: string): void;
  /** 페이지 이탈 시 전송. 성공 여부를 boolean 으로 준다. */
  beacon(url: string, body: string): boolean;
}

export interface TrackerOptions {
  endpoint?: string;
  /** 이 개수가 차면 즉시 보낸다 */
  batchSize?: number;
  /** 차지 않아도 이 시간이 지나면 보낸다 */
  flushIntervalMs?: number;
  /** 분석 동의 여부. false 면 필수 이벤트만 나간다. */
  hasConsent?: () => boolean;
  transport?: Transport;
  now?: () => number;
  onDropped?: (name: string, reason: 'server-only' | 'no-consent') => void;
}

const defaultTransport: Transport = {
  post(url, body) {
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // 분석 전송 실패가 화면에 영향을 주면 안 된다
    });
  },
  beacon(url, body) {
    try {
      return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } catch {
      return false;
    }
  },
};

interface QueuedEvent {
  name: EventName;
  occurredAt: string;
  sessionId: string;
  anonymousId: string;
  path: string;
  referrer: string | null;
  [key: string]: unknown;
}

export class AnalyticsTracker {
  readonly #endpoint: string;
  readonly #batchSize: number;
  readonly #flushIntervalMs: number;
  readonly #hasConsent: () => boolean;
  readonly #transport: Transport;
  readonly #now: () => number;
  readonly #onDropped: ((name: string, reason: 'server-only' | 'no-consent') => void) | undefined;

  #queue: QueuedEvent[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;

  constructor(options: TrackerOptions = {}) {
    this.#endpoint = options.endpoint ?? '/api/events';
    this.#batchSize = Math.min(options.batchSize ?? MAX_EVENTS_PER_BATCH, MAX_EVENTS_PER_BATCH);
    this.#flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.#hasConsent = options.hasConsent ?? (() => true);
    this.#transport = options.transport ?? defaultTransport;
    this.#now = options.now ?? (() => Date.now());
    this.#onDropped = options.onDropped;
  }

  get pending(): number {
    return this.#queue.length;
  }

  track(name: EventName, props: Readonly<Record<string, unknown>> = {}): void {
    if (this.#disposed) return;

    // purchase·refund 는 서버가 기록한다. 여기서 보내도 API 가 거부하므로
    // 애초에 큐에 넣지 않는다.
    if (isServerOnlyEvent(name)) {
      this.#onDropped?.(name, 'server-only');
      return;
    }
    if (requiresConsent(name) && !this.#hasConsent()) {
      this.#onDropped?.(name, 'no-consent');
      return;
    }

    const now = this.#now();
    this.#queue.push({
      ...props,
      name,
      occurredAt: new Date(now).toISOString(),
      sessionId: getSessionId(now),
      anonymousId: getAnonymousId(),
      path: typeof location === 'undefined' ? '/' : location.pathname,
      referrer: typeof document === 'undefined' || document.referrer === '' ? null : document.referrer,
    });

    if (this.#queue.length >= this.#batchSize) {
      this.flush();
      return;
    }
    this.#scheduleFlush();
  }

  /** 큐를 비워 전송한다. beacon=true 면 페이지 이탈용 경로를 쓴다. */
  flush(useBeacon = false): void {
    this.#clearTimer();
    if (this.#queue.length === 0) return;

    // 계약이 배치당 개수를 제한하므로 잘라서 보낸다
    while (this.#queue.length > 0) {
      const batch = this.#queue.splice(0, this.#batchSize);
      const body = JSON.stringify({ events: batch });
      if (useBeacon) {
        // beacon 이 거절되면(크기 초과 등) 마지막으로 fetch 를 시도한다
        if (!this.#transport.beacon(this.#endpoint, body)) {
          this.#transport.post(this.#endpoint, body);
        }
      } else {
        this.#transport.post(this.#endpoint, body);
      }
    }
  }

  /**
   * 큐에 남은 것을 **보내지 않고 버린다.**
   *
   * 수집을 끄는 순간에 쓴다. flush 로 비우면 방금 거부한 사람의 기록이
   * 마지막으로 한 번 더 나간다 — 거부를 존중한다고 할 수 없다.
   */
  discard(): void {
    this.#clearTimer();
    this.#queue = [];
  }

  dispose(): void {
    this.flush(true);
    this.#disposed = true;
  }

  #scheduleFlush(): void {
    if (this.#timer !== null) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.flush();
    }, this.#flushIntervalMs);
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}

let singleton: AnalyticsTracker | null = null;

export function getTracker(): AnalyticsTracker {
  /*
   * **거부를 실제로 존중한다.**
   *
   * 동의를 읽는 모듈은 진작 있었는데 아무도 부르지 않아서, 트래커가 기본값
   * `() => true` 로 돌고 있었다 — 브라우저에서 거부해도 그대로 보냈다는
   * 뜻이다. 문서에는 "거부는 즉시 존중한다" 고 적혀 있었다.
   *
   * 매번 읽는다. 한 번 읽어 두면 설정을 끈 뒤에도 그 탭이 살아 있는 동안은
   * 계속 보낸다.
   */
  singleton ??= new AnalyticsTracker({ hasConsent: getLocalConsent });
  return singleton;
}

/** 앱 어디서나 쓰는 진입점 */
export const track = (name: EventName, props?: Record<string, unknown>): void =>
  getTracker().track(name, props);
