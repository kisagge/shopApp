import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

/**
 * 도메인 오류를 응답으로 옮기는 한 자리.
 *
 * **같은 말미를 서른아홉 곳이 적고 있었다** — 자기 도메인 오류를 `{ code, message }` 로
 * 내보내고, 권한 오류는 403 으로 돌리고, 나머지는 다시 던진다. 도메인 오류 클래스가
 * 서른아홉인데 전부 같은 모양이라, 새 오류를 하나 더할 때마다 그것을 던지는 라우트도
 * 함께 고쳐야 했다.
 *
 * 한 자리로 모았으니 **여기서 한 번 확인한다** — 라우트마다 확인할 수 없던 것들이다.
 */

/**
 * 사전 한 벌을 흉내 낸다. **`has` 가 곧 "이것은 열쇠인가" 다** — 도메인 오류의 문구가 열쇠면
 * 이 요청의 말로 바꾸고, 아니면(운영용 한국어) 그대로 내보낸다.
 */
const DICT: Record<string, string> = {
  'err.order.notFound': '(ja) 注文が見つかりません',
  'err.order.alreadyIn': '(ja) すでに{status}の注文です',
  'orderStatus.CANCELLED': '(ja) キャンセル',
  'err.address.tooMany': '(ja) 住所は{max}件まで',
};
vi.mock('~/lib/i18n/server', () => ({
  getT: async () =>
    Object.assign(
      (key: string, vars?: Record<string, string | number>) =>
        (DICT[key] ?? key).replace(/\{(\w+)\}/g, (_m, name: string) => String(vars?.[name] ?? `{${name}}`)),
      { has: (key: string) => key in DICT },
    ),
}));

const { apiError } = await import('~/lib/api/respond');

/** 이 저장소의 도메인 오류 모양 — 코드·메시지·상태를 스스로 안다 */
class OrderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

describe('도메인 오류', () => {
  it('코드와 메시지를 그 오류가 아는 상태로 내보낸다', async () => {
    const res = await apiError(new OrderError('ALREADY_SHIPPED', '이미 보낸 주문입니다.', 409));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'ALREADY_SHIPPED',
      message: '이미 보낸 주문입니다.',
    });
  });

  it('어느 칸이 틀렸는지 아는 오류는 그것까지 넘긴다 — 폼이 그 칸에 표시한다', async () => {
    const res = await apiError(
      new OrderError('INVALID', '값을 확인해 주세요.', 400, { discountPercent: '0~100' }),
    );

    expect(await res.json()).toMatchObject({ fields: { discountPercent: '0~100' } });
  });

  it('빈 칸 목록은 싣지 않는다 — 없는 것과 비어 있는 것이 화면에서 다르게 읽힌다', async () => {
    const res = await apiError(new OrderError('NOPE', '안 됩니다.', 400));

    expect(Object.keys(await res.json())).toEqual(['code', 'message']);
  });
});

/**
 * **일본어로 요청해도 한국어 문장이 나갔다.** 오류를 던지는 자리(lib·core)는 요청의 언어를 모른다 —
 * 배치도 웹훅도 같은 함수를 부른다. 그래서 문구 자리에 사전 열쇠를 적고, 번역은 응답을 만드는 여기서 한다.
 */
describe('문구를 이 요청의 말로', () => {
  it('문구가 열쇠면 바꾼다', async () => {
    const res = await apiError(new OrderError('ORDER_NOT_FOUND', 'err.order.notFound', 404));

    expect((await res.json()).message).toBe('(ja) 注文が見つかりません');
  });

  /** 옮기는 중에도 화면은 살아 있어야 한다 — 운영용 한국어 문구는 그대로 나간다 */
  it('열쇠가 아니면 그대로 내보낸다', async () => {
    const res = await apiError(new OrderError('NOT_APPROVED', '승인한 신청만 회수를 확인할 수 있습니다.'));

    expect((await res.json()).message).toBe('승인한 신청만 회수를 확인할 수 있습니다.');
  });

  it('끼워 넣을 숫자를 함께 넘긴다', async () => {
    const error = Object.assign(new OrderError('TOO_MANY', 'err.address.tooMany', 409), {
      vars: { max: 10 },
    });

    expect((await (await apiError(error)).json()).message).toBe('(ja) 住所は10件まで');
  });

  /** "이미 {status}된 주문입니다" 의 상태 이름도 번역거리다 */
  it('끼워 넣을 값이 열쇠면 그것도 바꾼다', async () => {
    const error = Object.assign(new OrderError('ALREADY_CANCELLED', 'err.order.alreadyIn', 409), {
      vars: { status: 'orderStatus.CANCELLED' },
    });

    expect((await (await apiError(error)).json()).message).toBe('(ja) すでに(ja) キャンセルの注文です');
  });

  it('열쇠가 아닌 값(상품명·옵션명)은 그대로 넣는다', async () => {
    const error = Object.assign(new OrderError('X', 'err.order.alreadyIn', 409), {
      vars: { status: '코트 / M' },
    });

    expect((await (await apiError(error)).json()).message).toBe('(ja) すでに코트 / Mの注文です');
  });
});

describe('권한 오류', () => {
  it('403 으로 돌리고, 무엇이 모자란지는 말하지 않는다', async () => {
    /*
     * 도메인 메시지를 그대로 내보내면 "정산 지급 권한이 필요합니다" 같은 말이 나가고,
     * 그건 우리가 권한을 어떻게 나눠 두었는지 밖에서 세어 볼 수 있게 한다.
     */
    const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
    const error = new ForbiddenError(merchant, 'settlement:pay');

    const res = await apiError(error);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(error.message, '이 오류는 권한 이름을 품고 있다').toContain('settlement:pay');
    expect(body.message, '그 이름이 응답으로 새어 나갔다').not.toContain('settlement:pay');
  });
});

describe('모르는 고장', () => {
  it('평범한 오류는 다시 던진다 — 삼켜서 400 으로 내보내면 버그가 잘못된 요청으로 둔갑한다', async () => {
    const boom = new Error('DB 가 안 열린다');

    await expect(apiError(boom)).rejects.toBe(boom);
  });

  it('상태를 모르는 오류도 다시 던진다 — Prisma 오류에는 code 만 있고 status 가 없다', async () => {
    const prismaLike = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

    await expect(apiError(prismaLike)).rejects.toBe(prismaLike);
  });

  it('Error 가 아닌 것도 다시 던진다', async () => {
    await expect(apiError({ code: 'FAKE', status: 400, message: '흉내' })).rejects.toBeTruthy();
  });
});
