import { describe, it, expect } from 'vitest';
import {
  fingerprintOf, redactHeaders, redactPath, severityOf,
  shouldNotify, pruneSeen, NOTIFY_WINDOW_MS, isIgnorableError,
} from '../src/error-report';

describe('지문', () => {
  const base = { name: 'PrismaClientKnownRequestError', routePath: '/api/orders' };

  it('id 가 달라도 같은 오류로 묶는다', () => {
    // 메시지를 그대로 쓰면 같은 버그가 요청마다 다른 오류로 보인다
    const a = fingerprintOf({ ...base, message: '주문 clv8x2k9a0001qw3f7h2n5p8z 없음' });
    const b = fingerprintOf({ ...base, message: '주문 clv8x2k9a0009zz3f7h2n5p8q 없음' });
    expect(a).toBe(b);
  });

  it('숫자도 자리 표시로 바꾼다', () => {
    const a = fingerprintOf({ ...base, message: '재고 3개 부족' });
    const b = fingerprintOf({ ...base, message: '재고 17개 부족' });
    expect(a).toBe(b);
  });

  it('다른 경로의 같은 메시지는 다른 오류다', () => {
    const a = fingerprintOf({ ...base, message: '없음' });
    const b = fingerprintOf({ ...base, routePath: '/api/cart', message: '없음' });
    expect(a).not.toBe(b);
  });

  it('다른 종류의 오류는 다르게 묶는다', () => {
    const a = fingerprintOf({ ...base, message: '없음' });
    const b = fingerprintOf({ ...base, name: 'TypeError', message: '없음' });
    expect(a).not.toBe(b);
  });

  it('아주 긴 메시지는 잘라 낸다', () => {
    const long = fingerprintOf({ ...base, message: 'x'.repeat(1000) });
    expect(long.length).toBeLessThan(200);
  });
});

describe('가림', () => {
  it('자격증명이 든 헤더를 지운다', () => {
    // 오류 보고는 가장 오래 남는 기록이다. 여기 섞이면 로그를 볼 수 있는
    // 모두가 그것도 보게 된다.
    const out = redactHeaders({
      authorization: 'Bearer abc',
      cookie: 'session=xyz',
      'x-api-key': 'k',
      'user-agent': 'Mozilla/5.0',
    });

    expect(out['authorization']).toBe('[가림]');
    expect(out['cookie']).toBe('[가림]');
    expect(out['x-api-key']).toBe('[가림]');
    expect(out['user-agent']).toBe('Mozilla/5.0');
  });

  it('대소문자를 가리지 않는다', () => {
    expect(redactHeaders({ Authorization: 'Bearer abc' })['authorization']).toBe('[가림]');
  });

  it('배열 헤더도 다룬다', () => {
    expect(redactHeaders({ 'accept-language': ['ko', 'en'] })['accept-language']).toBe('ko, en');
    expect(redactHeaders({ 'set-cookie': ['a=1', 'b=2'] })['set-cookie']).toBe('[가림]');
  });

  it('주소에서 값은 버리고 모양만 남긴다', () => {
    // 쿼리에는 검색어·토큰·이메일이 섞여 들어온다
    expect(redactPath('/search?q=코트&sort=price')).toBe('/search?q,sort');
  });

  it('쿼리가 없으면 그대로 둔다', () => {
    expect(redactPath('/product/coat')).toBe('/product/coat');
  });

  it('같은 키가 여러 번이어도 한 번만 센다', () => {
    expect(redactPath('/search?tag=a&tag=b')).toBe('/search?tag');
  });
});

describe('알림 빈도', () => {
  it('처음 본 오류는 알린다', () => {
    expect(shouldNotify('fp-1', new Map(), 1_000)).toBe(true);
  });

  it('창 안에서는 다시 알리지 않는다', () => {
    // 오류는 몰려서 난다. 한 건마다 보내면 받는 쪽이 알림을 무시하게 되고,
    // 그러면 알림이 없는 것과 같아진다.
    const seen = new Map([['fp-1', 1_000]]);
    expect(shouldNotify('fp-1', seen, 1_000 + NOTIFY_WINDOW_MS - 1)).toBe(false);
  });

  it('창이 지나면 다시 알린다', () => {
    const seen = new Map([['fp-1', 1_000]]);
    expect(shouldNotify('fp-1', seen, 1_000 + NOTIFY_WINDOW_MS)).toBe(true);
  });

  it('다른 오류는 서로를 막지 않는다', () => {
    const seen = new Map([['fp-1', 1_000]]);
    expect(shouldNotify('fp-2', seen, 1_000)).toBe(true);
  });

  it('오래된 기록을 걷어낸다 — 프로세스가 오래 살면 표가 계속 자란다', () => {
    const seen = new Map([['old', 0], ['new', 1_000]]);
    pruneSeen(seen, NOTIFY_WINDOW_MS + 500);
    expect([...seen.keys()]).toEqual(['new']);
  });
});

describe('심각도', () => {
  it('화면 렌더 실패는 fatal 이다 — 사용자가 아무것도 못 본다', () => {
    expect(severityOf('render')).toBe('fatal');
  });

  it('API 한 건은 error 다 — 나머지 화면은 살아 있다', () => {
    expect(severityOf('route')).toBe('error');
    expect(severityOf('action')).toBe('error');
  });
});

describe('보고하지 않을 오류', () => {
  it('브라우저가 끊은 프리페치는 우리 오류가 아니다', () => {
    // 작은 E2E 한 번에 8건이 났다. 이대로 두면 진짜 오류가 묻힌다.
    expect(isIgnorableError(new Error('The destination stream closed early.'))).toBe(true);
  });

  it('표준 취소 신호도 거른다', () => {
    const err = new Error('취소됨');
    err.name = 'AbortError';
    expect(isIgnorableError(err)).toBe(true);
  });

  it('그 밖의 오류는 그대로 보고한다', () => {
    // 짐작으로 목록을 늘리면 진짜 오류를 조용히 버리게 된다
    expect(isIgnorableError(new Error('주문을 찾을 수 없습니다'))).toBe(false);
    expect(isIgnorableError(new TypeError('undefined 의 속성을 읽을 수 없음'))).toBe(false);
  });

  it('Error 가 아닌 것은 거르지 않는다', () => {
    expect(isIgnorableError('문자열 오류')).toBe(false);
    expect(isIgnorableError(null)).toBe(false);
  });
});

describe('오류 묶음', () => {
  const at = (iso: string) => new Date(iso);

  it('처리한 뒤에 또 나면 다시 연다', async () => {
    /*
     * 고쳤다고 닫아 둔 오류가 또 나는 것은 안 고쳐졌다는 뜻이다. 조용히 횟수만 올리면 닫힌 목록 뒤에 숨어,
     * 처리 표시가 오히려 눈을 가린다.
     */
    const { reopensGroup } = await import('../src');
    expect(reopensGroup({ resolvedAt: at('2026-09-16T00:00:00Z') }, at('2026-09-16T01:00:00Z'))).toBe(true);
  });

  it('처리하기 전에 난 것으로는 열지 않는다 — 늦게 도착한 보고다', async () => {
    const { reopensGroup } = await import('../src');
    expect(reopensGroup({ resolvedAt: at('2026-09-16T02:00:00Z') }, at('2026-09-16T01:00:00Z'))).toBe(false);
  });

  it('처리한 적 없으면 열 것도 없다', async () => {
    const { reopensGroup } = await import('../src');
    expect(reopensGroup({ resolvedAt: null }, at('2026-09-16T01:00:00Z'))).toBe(false);
  });
});

describe('브라우저가 보낸 스택', () => {
  it('길면 자르고 잘렸다고 적는다', async () => {
    const { trimStack, MAX_ERROR_STACK } = await import('../src');
    const cut = trimStack('가'.repeat(MAX_ERROR_STACK + 100));
    expect(cut!.length).toBeLessThan(MAX_ERROR_STACK + 20);
    expect(cut).toContain('잘림');
  });

  it('비었으면 null 이다 — 빈 문자열을 스택으로 남기지 않는다', async () => {
    const { trimStack } = await import('../src');
    expect(trimStack('   ')).toBeNull();
    expect(trimStack(undefined)).toBeNull();
  });

  it('출처는 아는 값만 받는다', async () => {
    const { isErrorSource } = await import('../src');
    expect(isErrorSource('browser')).toBe(true);
    expect(isErrorSource('server')).toBe(true);
    expect(isErrorSource('app')).toBe(false);
  });
});
