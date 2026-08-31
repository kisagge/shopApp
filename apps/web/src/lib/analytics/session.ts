/**
 * 익명 식별자와 세션 식별자.
 *
 * anonymousId — localStorage. 브라우저를 지우기 전까지 유지된다. 재방문 판별용.
 * sessionId   — sessionStorage + 마지막 활동 시각. **30분 무활동이면 새 세션**.
 *
 * 저장소 접근은 전부 try/catch 로 감싼다. 시크릿 모드나 쿠키 차단 환경에서
 * localStorage 접근만으로 예외가 던져지는 브라우저가 있고,
 * 그것 때문에 페이지가 죽으면 안 된다.
 */

const ANON_KEY = 'shop.aid';
const SESSION_KEY = 'shop.sid';
const SESSION_SEEN_KEY = 'shop.sid.seen';

/** 30분 무활동이면 다른 방문으로 본다. GA 관례를 따랐다. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function newId(): string {
  try {
    // 계약의 식별자 규칙(A-Za-z0-9_-, 8~64자)을 만족한다
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

const read = (store: Storage | undefined, key: string): string | null => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const write = (store: Storage | undefined, key: string, value: string): void => {
  try {
    store?.setItem(key, value);
  } catch {
    // 저장 못 해도 이벤트 자체는 보낸다. 세션이 매번 새로 잡힐 뿐이다.
  }
};

const localStore = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.localStorage;
const sessionStore = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.sessionStorage;

export function getAnonymousId(): string {
  const store = localStore();
  const existing = read(store, ANON_KEY);
  if (existing) return existing;
  const id = newId();
  write(store, ANON_KEY, id);
  return id;
}

export function getSessionId(now: number = Date.now()): string {
  const store = sessionStore();
  const existing = read(store, SESSION_KEY);
  const seenAt = Number(read(store, SESSION_SEEN_KEY) ?? 0);
  const expired = !Number.isFinite(seenAt) || now - seenAt > SESSION_TIMEOUT_MS;

  const id = existing && !expired ? existing : newId();
  write(store, SESSION_KEY, id);
  write(store, SESSION_SEEN_KEY, String(now));
  return id;
}

/** 테스트에서 상태를 비운다 */
export function resetIdentity(): void {
  try {
    localStore()?.removeItem(ANON_KEY);
    sessionStore()?.removeItem(SESSION_KEY);
    sessionStore()?.removeItem(SESSION_SEEN_KEY);
  } catch {
    /* 무시 */
  }
}
