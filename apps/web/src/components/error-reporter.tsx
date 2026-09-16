'use client';

import { useEffect } from 'react';

/**
 * 브라우저에서 난 오류를 서버로 보낸다.
 *
 * **그 전까지 브라우저 오류는 아무도 몰랐다.** 서버 오류는 instrumentation 이 받아 로그와 메일로 나가지만, 화면이
 * 하얗게 뜨는 쪽은 그 기기에서만 일어난 일이라 사용자가 "안 돼요" 라고 말해 주지 않으면 끝이다. 앱(웹뷰)에서는
 * 더하다 — 개발자 도구도 없고 배포 로그에도 안 남는다.
 *
 * 두 가지를 듣는다: 처리되지 않은 오류(`error`)와 붙잡히지 않은 거절(`unhandledrejection`). 화면 경계(error.tsx)는
 * 자기가 따로 보낸다 — React 가 잡은 오류는 window 까지 올라오지 않는다.
 *
 * **같은 오류를 한 번만 보낸다.** 렌더 하나가 깨지면 리렌더마다 같은 것이 또 나서, 그대로 두면 한 화면에서 수십 번
 * 나간다. 서버도 지문별로 묶지만 그건 받고 난 뒤의 이야기다.
 */
export function ErrorReporter() {
  useEffect(() => {
    const sent = new Set<string>();

    const onError = (event: ErrorEvent) => {
      report(event.error, event.message, sent);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      report(event.reason, '처리되지 않은 거절', sent);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

/**
 * 던져진 값에서 읽을 만한 말을 뽑는다.
 *
 * **Error 가 아닌 것도 던져진다.** 문자열, 숫자, 그리고 객체 — 객체를 그냥 String() 으로 넘기면
 * "[object Object]" 가 저장되고, 그건 아무것도 말해 주지 않는다. 차라리 JSON 으로 적는다.
 */
function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      // 순환 참조 같은 것. 여기서 또 던지면 오류 보고가 오류를 낸다
      return Object.prototype.toString.call(value);
    }
  }
  // 함수가 던져지는 일은 드물지만, String() 으로 넘기면 본문 전체가 메시지가 된다
  if (typeof value === 'function') return `${value.name || '익명'}()`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  // 여기까지 오는 값은 없다. 그래도 조용히 빈 문자열을 주지 않는다 — 부르는 쪽이 기본 문구로 채운다
  return '';
}

/**
 * 오류 하나를 보낸다.
 *
 * **동의를 묻지 않는다.** 분석 이벤트와 다르다 — 이것은 서비스가 제대로 도는지 보는 일이고, 사용자 식별자를 담지
 * 않는다(누가 겪었는지가 아니라 어느 화면에서 무엇이 터졌는지가 필요하다).
 *
 * 실패해도 조용하다. 오류를 보내다 또 오류가 나면 원래 문제만 가린다.
 */
export function reportClientError(error: unknown, fallback: string, sent?: Set<string>): void {
  report(error, fallback, sent ?? new Set());
}

function report(error: unknown, fallback: string, sent: Set<string>): void {
  const name = error instanceof Error ? error.name : 'Error';
  const message = messageOf(error) || fallback;
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  const key = `${name}|${message}`;
  if (sent.has(key)) return;
  sent.add(key);

  const body = JSON.stringify({
    name,
    message,
    stack,
    routePath: window.location.pathname,
  });

  /*
   * keepalive 로 보낸다 — 오류 직후 사용자가 화면을 떠나면 평범한 fetch 는 취소되고,
   * 하필 그때가 가장 알고 싶은 순간이다(이벤트 트래커가 sendBeacon 을 쓰는 것과 같은 이유).
   */
  void fetch('/api/errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // 오류 보고가 실패했다고 화면에 무언가를 띄우지 않는다
  });
}
