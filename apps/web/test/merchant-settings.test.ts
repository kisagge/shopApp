import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

/**
 * 가맹점 정보와 정산 계좌 — **돈 받는 주체를 정하는 자리.**
 *
 * 그 파일의 첫 주석이 걸린 것을 말한다: "연락처와 계좌는 가맹점이 자기 것을 고치고,
 * 상호·사업자등록번호·대표자는 운영진만 고친다 — 정산과 세금계산서가 그 값을 근거로 삼으므로,
 * 스스로 바꿀 수 있으면 **돈 받는 주체가 심사 없이 바뀐다**."
 *
 * **판정은 core 가 하고 각각 검사가 있다**(canEditMerchantSettings·canEditBusinessInfo·
 * canEditCommission). 없던 것은 **그 판정을 부르는 자리**다 — 규칙은 멀쩡한데 어느 날 규칙을
 * 안 부르고 지나가도 아무도 모른다. 169줄에 검사가 한 줄도 없었다.
 *
 * 그래서 여기서는 판정을 흉내 내지 않는다. 진짜 core 를 그대로 쓰고, **이 모듈이 그것을
 * 지나는지**만 본다.
 */

const db = vi.hoisted(() => ({
  merchant: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const isUniqueViolation = vi.hoisted(() => vi.fn<(...a: any[]) => boolean>(() => false));
vi.mock('~/lib/db/unique-violation', () => ({ isUniqueViolation }));

const {
  getMerchantSettings, updateMerchantSettings, updateMerchantBusiness, updateMerchantCommission,
  MerchantSettingsError,
} = await import('~/lib/admin/merchant-settings');

/** 운영진은 소속이 없다 — 그 값이 "모든 가맹점" 을 뜻한다 */
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
/** 입점 승인 권한은 슈퍼관리자만 갖는다(merchant:approve) */
const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const mine: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const other: Actor = { id: 'u-o', role: 'MERCHANT', merchantId: 'm-2' };

const row = {
  id: 'm-1', name: '무어', status: 'ACTIVE',
  businessName: '무어상회', businessNumber: '123-45-67890', representative: '장무어',
  contactEmail: 'moor@plain.test', contactPhone: '010-1234-5678',
  commissionPercent: 12,
  settlementBank: 'KB', settlementAccount: '12345678901234', settlementHolder: '장무어',
};

beforeEach(() => {
  vi.clearAllMocks();
  isUniqueViolation.mockReturnValue(false);
  db.merchant.findUnique.mockResolvedValue(row);
  db.merchant.update.mockResolvedValue(row);
});

describe('설정 읽기', () => {
  it('운영진은 아무 가맹점이나 연다', async () => {
    expect(await getMerchantSettings(admin, 'm-1')).toEqual(row);
  });

  it('가맹점은 자기 것을 연다', async () => {
    await expect(getMerchantSettings(mine, 'm-1')).resolves.toBeTruthy();
  });

  it('가맹점은 남의 것을 못 연다 — 계좌가 거기 있다', async () => {
    await expect(getMerchantSettings(other, 'm-1')).rejects.toThrow(ForbiddenError);
  });

  it('막힌 조회는 DB 를 건드리지 않는다', async () => {
    await expect(getMerchantSettings(other, 'm-1')).rejects.toThrow();
    expect(db.merchant.findUnique).not.toHaveBeenCalled();
  });

  it('없는 가맹점이면 404 로 말한다', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    await expect(getMerchantSettings(admin, 'm-없음')).rejects.toMatchObject({ status: 404 });
  });
});

describe('연락처·계좌 고치기', () => {
  /** 은행은 **코드**로 받는다 — 화면에 보이는 이름은 core 가 붙인다 */
  const input = {
    contactEmail: 'new@plain.test', contactPhone: '010-9999-8888',
    settlementBank: 'SHINHAN', settlementAccount: '99998888777766', settlementHolder: '장무어',
  } as const;

  it('남의 가맹점은 못 고친다 — 그리고 고치러 가지도 않는다', async () => {
    await expect(updateMerchantSettings(other, 'm-1', input)).rejects.toThrow(ForbiddenError);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('이 창구로는 사업자 정보도 수수료율도 안 바뀐다', async () => {
    /*
     * **같은 창구로 새어 들어가면 권한을 나눈 뜻이 없다.** 가맹점이 쓸 수 있는 창구라,
     * 여기 적히는 칸이 늘어나는 순간 심사 없이 상호나 요율이 바뀐다.
     */
    await updateMerchantSettings(mine, 'm-1', input);

    const data = db.merchant.update.mock.calls[0]![0].data;
    expect(Object.keys(data).sort()).toEqual([
      'contactEmail', 'contactPhone', 'settlementAccount', 'settlementBank', 'settlementHolder',
    ]);
  });

  it('감사 기록에 계좌번호를 통째로 남기지 않는다', async () => {
    /*
     * 무엇이 바뀌었는지는 뒤 네 자리로도 안다. 감사 로그는 운영진이 열어 보는 자리고,
     * 계좌번호가 거기 그대로 쌓이면 로그 한 벌이 곧 계좌 목록이 된다.
     */
    db.merchant.update.mockResolvedValue({
      contactEmail: input.contactEmail, contactPhone: input.contactPhone,
      settlementBank: input.settlementBank, settlementAccount: input.settlementAccount,
      settlementHolder: input.settlementHolder,
    });

    const { before, after } = await updateMerchantSettings(mine, 'm-1', input);

    for (const side of [before, after]) {
      expect(JSON.stringify(side)).not.toContain(row.settlementAccount);
      expect(JSON.stringify(side)).not.toContain(input.settlementAccount);
      expect(side).not.toHaveProperty('settlementAccount');
    }
    // 뒤 네 자리는 남는다 — 아니면 "무엇이 바뀌었는가" 에 답할 수 없다
    expect(after.accountTail).toContain('7766');
  });
});

describe('사업자 정보 고치기', () => {
  const input = {
    name: '무어', businessName: '무어주식회사',
    businessNumber: '111-22-33333', representative: '장무어',
  };

  it('가맹점은 자기 것도 못 고친다 — 세금계산서가 이 값을 근거로 삼는다', async () => {
    await expect(updateMerchantBusiness(mine, 'm-1', input)).rejects.toThrow(ForbiddenError);
    expect(db.merchant.findUnique).not.toHaveBeenCalled();
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('운영진은 고친다', async () => {
    await updateMerchantBusiness(admin, 'm-1', input);
    expect(db.merchant.update.mock.calls[0]![0].data).toEqual(input);
  });

  it('없는 가맹점이면 404', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    await expect(updateMerchantBusiness(admin, 'm-없음', input)).rejects.toMatchObject({ status: 404 });
  });

  it('이미 있는 사업자등록번호면 무엇이 겹쳤는지 말한다', async () => {
    // "저장하지 못했습니다" 만 돌려주면 무엇을 고쳐야 할지 알 수 없다
    isUniqueViolation.mockReturnValue(true);
    db.merchant.update.mockRejectedValue(new Error('unique'));

    await expect(updateMerchantBusiness(admin, 'm-1', input)).rejects.toMatchObject({
      code: 'DUPLICATE', status: 409,
    });
  });

  it('겹침이 아닌 오류는 삼키지 않는다', async () => {
    // 전부 409 로 바꾸면 진짜 고장이 "중복입니다" 로 보인다
    db.merchant.update.mockRejectedValue(new Error('연결 끊김'));

    await expect(updateMerchantBusiness(admin, 'm-1', input)).rejects.toThrow('연결 끊김');
  });
});

describe('수수료율 고치기', () => {
  const input = { commissionPercent: 15, reason: '거래액이 늘어 재협상' };

  it('운영진이어도 입점 승인 권한이 없으면 못 바꾼다', async () => {
    /*
     * 요율은 돈이 나뉘는 비율이다 — 고치기(merchant:write)와 같은 권한에 두지 않는다.
     */
    await expect(updateMerchantCommission(admin, 'm-1', input)).rejects.toThrow(ForbiddenError);
    expect(db.merchant.findUnique).not.toHaveBeenCalled();
  });

  it('가맹점은 당연히 못 바꾼다', async () => {
    await expect(updateMerchantCommission(mine, 'm-1', input)).rejects.toThrow(ForbiddenError);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('슈퍼관리자는 바꾸고, 요율만 쓴다', async () => {
    db.merchant.update.mockResolvedValue({ commissionPercent: 15 });

    await updateMerchantCommission(superAdmin, 'm-1', input);

    expect(db.merchant.update.mock.calls[0]![0].data).toEqual({ commissionPercent: 15 });
  });

  it('전후와 사유와 가맹점 이름을 돌려준다 — 감사 로그가 그것으로 적는다', async () => {
    // 숫자만 바뀐 기록은 "왜 이 요율이 됐는가" 에 답하지 못한다
    db.merchant.update.mockResolvedValue({ commissionPercent: 15 });

    expect(await updateMerchantCommission(superAdmin, 'm-1', input)).toEqual({
      before: 12, after: 15, reason: input.reason, merchantName: '무어',
    });
  });

  it('없는 가맹점이면 404', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    await expect(updateMerchantCommission(superAdmin, 'm-없음', input)).rejects.toBeInstanceOf(MerchantSettingsError);
  });
});
