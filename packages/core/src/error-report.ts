/**
 * 오류 보고 정책.
 *
 * **여기에는 보내는 코드도, 로그를 찍는 코드도 없다.** 무엇을 어떻게 묶고
 * 무엇을 가릴지만 정한다 — 정책은 core, 실행은 바깥이라는 이 저장소의 결이다.
 * 덕분에 지문·중복 판정·가림 규칙을 네트워크 없이 그냥 테스트할 수 있다.
 */

export type ErrorSeverity = 'error' | 'fatal';

export interface ErrorReport {
  /** 같은 원인끼리 묶는 열쇠 */
  readonly fingerprint: string;
  readonly severity: ErrorSeverity;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  /** Next 가 만든 digest. 사용자 화면에 뜨는 값이라 로그와 이어 붙일 수 있다. */
  readonly digest: string | null;
  readonly routePath: string;
  readonly routeType: string;
  readonly method: string;
  readonly path: string;
  readonly occurredAt: Date;
}

/**
 * 보고에서 지워야 하는 헤더.
 *
 * 오류 보고는 나중에 사람이 읽으려고 남기는 것이라 **가장 오래 남는 기록**이
 * 된다. 여기에 자격증명이 섞이면 로그를 볼 수 있는 모두가 그것도 보게 된다.
 */
const SECRET_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-csrf-token',
]);

export function redactHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const name = key.toLowerCase();
    out[name] = SECRET_HEADERS.has(name) ? '[가림]' : Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/**
 * 주소에서 값이 아니라 **모양만** 남긴다.
 *
 * 쿼리에는 검색어·토큰·이메일이 섞여 들어온다. 어떤 파라미터가 붙었는지는
 * 원인을 찾는 데 도움이 되지만 그 값까지 필요하지는 않다.
 */
export function redactPath(path: string): string {
  const [base, query] = path.split('?');
  if (!query) return base ?? path;
  // URLSearchParams 를 쓰지 않는다 — core 는 어느 런타임에서도 돌아야 하고,
  // 여기서 필요한 것은 키 목록뿐이라 직접 갈라내는 편이 가볍다.
  const keys = query
    .split('&')
    .map((pair) => pair.split('=')[0])
    .filter((key): key is string => Boolean(key));
  const shape = [...new Set(keys)].sort().join(',');
  return shape ? `${base}?${shape}` : (base ?? path);
}

/**
 * 같은 원인을 하나로 묶는 지문.
 *
 * **메시지를 그대로 쓰지 않는다.** 메시지에는 주문번호나 id 가 섞이는 일이
 * 흔해서, 같은 버그가 요청마다 다른 오류로 보인다. 숫자와 긴 식별자를 자리
 * 표시로 바꾼 뒤 이름·경로와 함께 묶는다.
 */
export function fingerprintOf(input: {
  name: string;
  message: string;
  routePath: string;
}): string {
  const normalized = input.message
    // cuid·uuid 처럼 긴 식별자
    .replace(/\b[a-z0-9]{20,}\b/gi, '<id>')
    // 남은 숫자
    .replace(/\d+/g, '<n>')
    .trim()
    .slice(0, 120);
  return `${input.name}|${input.routePath}|${normalized}`;
}

/**
 * 알림을 보낼 것인가.
 *
 * **같은 지문을 창(window) 안에서 한 번만 알린다.** 오류는 대개 몰려서 나고,
 * 한 건마다 알리면 받는 쪽이 곧 알림을 무시하게 된다 — 그러면 알림이 없는
 * 것과 같아진다. 로그는 전부 남기고 알림만 줄인다.
 */
export const NOTIFY_WINDOW_MS = 60 * 60 * 1000;

export function shouldNotify(
  fingerprint: string,
  seen: ReadonlyMap<string, number>,
  now: number,
  windowMs = NOTIFY_WINDOW_MS,
): boolean {
  const last = seen.get(fingerprint);
  return last === undefined || now - last >= windowMs;
}

/** 오래된 기록을 걷어낸다. 프로세스가 오래 살면 이 표가 계속 자란다. */
export function pruneSeen(
  seen: Map<string, number>,
  now: number,
  windowMs = NOTIFY_WINDOW_MS,
): void {
  for (const [key, at] of seen) {
    if (now - at >= windowMs) seen.delete(key);
  }
}

/**
 * 심각도.
 *
 * 화면 렌더 실패는 사용자가 아무것도 못 보는 상태라 fatal 로 본다.
 * API 한 건의 실패는 나머지 화면이 살아 있으므로 error 다.
 */
export function severityOf(routeType: string): ErrorSeverity {
  return routeType === 'render' ? 'fatal' : 'error';
}

/**
 * 보고하지 않을 오류.
 *
 * **브라우저가 요청을 끊은 것은 우리 오류가 아니다.** Next 는 프리페치가
 * 진행 중인데 사용자가 다른 곳으로 넘어가면 스트림을 닫고 오류를 던진다.
 * 화면 렌더 경로라 심각도가 fatal 로 잡히는데, 실제로는 지극히 평범한 일이다.
 *
 * 작은 E2E 한 번에 8건이 났다. 이대로 두면 로그가 이것으로 덮이고 알림도
 * 나가서, **진짜 오류가 묻힌다** — 오류 추적을 붙인 이유가 사라진다.
 *
 * 목록은 **실제로 관찰한 것만** 넣는다. 짐작으로 늘리면 언젠가 진짜 오류를
 * 조용히 버리게 되고, 그건 안 잡는 것보다 나쁘다.
 */
const IGNORED_MESSAGES = [
  // 프리페치 도중 사용자가 이동. Next 15/16 의 문구다.
  'The destination stream closed early',
];

export function isIgnorableError(error: unknown): boolean {
  if (error instanceof Error) {
    // 표준 취소 신호. 우리가 만든 것이든 런타임이 만든 것이든 뜻은 하나다.
    if (error.name === 'AbortError') return true;
    return IGNORED_MESSAGES.some((needle) => error.message.includes(needle));
  }
  return false;
}

/**
 * 오류가 어디서 났는가.
 *
 * **서버와 브라우저를 갈라 둔다.** 고치는 자리가 다르고, 재현하는 방법도 다르다 — 서버 오류는 로그와 스택이 그대로
 * 남지만 브라우저 오류는 그 기기에서만 일어난 일이라 우리가 받지 않으면 영영 모른다. 앱(웹뷰)에서는 특히 그렇다:
 * 개발자 도구도 없고 서버 로그에도 안 남는다.
 */
export const ERROR_SOURCE = ['server', 'browser'] as const;
export type ErrorSource = (typeof ERROR_SOURCE)[number];

export const isErrorSource = (value: unknown): value is ErrorSource =>
  typeof value === 'string' && (ERROR_SOURCE as readonly string[]).includes(value);

/**
 * 오류 기록을 지문별로 **묶어서** 쌓는다.
 *
 * 한 건마다 행을 남기면 표가 금방 커지고, 정작 보고 싶은 것("이 오류가 몇 번 났는가")은 매번 세어야 한다. 그래서
 * 지문 하나에 행 하나를 두고 횟수와 처음·마지막 시각을 센다 — 메일이 한 시간에 한 번만 나가는 것과 짝이 되는 규칙이다.
 * 메일만 있으면 몰려 난 오류가 한 통으로 보여 규모를 알 수 없다.
 */
export interface ErrorGroup {
  readonly count: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly resolvedAt: Date | null;
}

/**
 * 처리했다고 표시한 뒤에 또 났는가.
 *
 * **다시 나면 다시 연다.** 고쳤다고 닫아 둔 오류가 또 나는 것은 안 고쳐졌다는 뜻이고, 그걸 조용히 횟수만 올리면
 * 닫힌 목록 뒤에 숨는다 — 처리 표시가 오히려 눈을 가리게 된다.
 */
export function reopensGroup(group: Pick<ErrorGroup, 'resolvedAt'>, occurredAt: Date): boolean {
  return group.resolvedAt !== null && occurredAt.getTime() > group.resolvedAt.getTime();
}

/**
 * 브라우저가 보낸 스택을 그대로 믿지 않는다.
 *
 * 창구가 열려 있으므로 아무나 아무 길이의 글을 보낼 수 있다. 길이를 자르고, 사용자가 적은 값이 섞여 들어오는 메시지는
 * 지문을 만들 때처럼 숫자·식별자를 지운 뒤 저장한다.
 */
export const MAX_ERROR_MESSAGE = 500;
export const MAX_ERROR_STACK = 4000;

export function trimStack(stack: string | null | undefined, max = MAX_ERROR_STACK): string | null {
  if (stack === null || stack === undefined) return null;
  const trimmed = stack.trim();
  if (trimmed === '') return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}\n…(잘림)`;
}
