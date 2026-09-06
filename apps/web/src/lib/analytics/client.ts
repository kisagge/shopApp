/*
 * **계약을 거치지 않는다.** 상수 하나 때문에 계약을 import 하면 Zod 가 통째로
 * 딸려 오고, 이 파일은 루트 레이아웃에 있어서 **모든 화면이 그것을 받는다.**
 */
import {
  isServerOnlyEvent, requiresConsent, MAX_EVENTS_PER_BATCH, type CommerceEvent,
} from '@shop/core';
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
  name: CommerceEvent;
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

  track(name: CommerceEvent, props: Readonly<Record<string, unknown>> = {}): void {
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
  singleton ??= new AnalyticsTracker();
  return singleton;
}

/** 앱 어디서나 쓰는 진입점 */
export const track = (name: CommerceEvent, props?: Record<string, unknown>): void =>
  getTracker().track(name, props);
