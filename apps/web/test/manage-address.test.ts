import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  address: {
    count: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { createAddress, setDefaultAddress, deleteAddress, AddressError } = await import(
  '~/lib/addresses/manage-address'
);

const input = (over: Record<string, unknown> = {}) => ({
  recipient: '장보영',
  phone: '01012345678',
  postalCode: '04766',
  address1: '서울 성동구 왕십리로 000',
  isDefault: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.address.count.mockResolvedValue(0);
  db.address.create.mockResolvedValue({ id: 'a-1' });
  db.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg),
  );
});

describe('도서산간은 서버가 정한다', () => {
  it('제주 우편번호면 요청과 무관하게 true 다', async () => {
    await createAddress('u-1', input({ postalCode: '63309' }));

    expect(db.address.create.mock.calls[0]?.[0].data).toMatchObject({ isRemoteArea: true });
  });

  it('육지면 false 다', async () => {
    await createAddress('u-1', input({ postalCode: '04766' }));

    expect(db.address.create.mock.calls[0]?.[0].data).toMatchObject({ isRemoteArea: false });
  });

  it('요청에 isRemoteArea 를 끼워 넣어도 무시한다', async () => {
    // 계약에 없는 필드지만, 있다고 가정해도 우편번호가 이긴다.
    // 받아 쓰면 제주 주소에 false 를 보내 3,000원을 피할 수 있다.
    await createAddress('u-1', input({ postalCode: '63309', isRemoteArea: false }));

    expect(db.address.create.mock.calls[0]?.[0].data).toMatchObject({ isRemoteArea: true });
  });
});

describe('기본 배송지', () => {
  it('첫 배송지는 요청이 무엇이든 기본이 된다', async () => {
    db.address.count.mockResolvedValue(0);

    await createAddress('u-1', input({ isDefault: false }));

    // 기본이 하나도 없으면 주문 화면이 "배송지 없음" 으로 보인다
    expect(db.address.create.mock.calls[0]?.[0].data).toMatchObject({ isDefault: true });
  });

  it('기본으로 지정하면 기존 기본을 내린다 — 둘이 되면 안 된다', async () => {
    db.address.count.mockResolvedValue(2);

    await createAddress('u-1', input({ isDefault: true }));

    expect(db.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('기본이 아니면 기존 기본을 건드리지 않는다', async () => {
    db.address.count.mockResolvedValue(2);

    await createAddress('u-1', input({ isDefault: false }));

    expect(db.address.updateMany).not.toHaveBeenCalled();
  });
});

describe('전화번호', () => {
  it('한 모양으로 통일해 저장한다', async () => {
    await createAddress('u-1', input({ phone: '010 1234 5678' }));

    expect(db.address.create.mock.calls[0]?.[0].data).toMatchObject({ phone: '010-1234-5678' });
  });
});

describe('개수 제한', () => {
  it('10개를 넘기지 않는다', async () => {
    db.address.count.mockResolvedValue(10);

    await expect(createAddress('u-1', input())).rejects.toBeInstanceOf(AddressError);
    expect(db.address.create).not.toHaveBeenCalled();
  });
});

describe('남의 배송지', () => {
  it('기본으로 지정할 수 없다', async () => {
    db.address.findFirst.mockResolvedValue(null);

    await expect(setDefaultAddress('u-1', 'a-남의것')).rejects.toMatchObject({ status: 404 });
    // 조회에 userId 를 함께 걸었는지
    expect(db.address.findFirst.mock.calls[0]?.[0].where).toMatchObject({ userId: 'u-1' });
  });

  it('지울 수 없다', async () => {
    db.address.findFirst.mockResolvedValue(null);

    await expect(deleteAddress('u-1', 'a-남의것')).rejects.toMatchObject({ status: 404 });
    expect(db.address.delete).not.toHaveBeenCalled();
  });
});

describe('삭제', () => {
  it('기본을 지우면 남은 것 중 하나를 기본으로 올린다', async () => {
    db.address.findFirst
      .mockResolvedValueOnce({ id: 'a-1', isDefault: true }) // 지울 대상
      .mockResolvedValueOnce({ id: 'a-2' }); // 다음 기본

    await deleteAddress('u-1', 'a-1');

    // 안 올리면 배송지가 있는데도 "등록된 배송지가 없습니다" 가 뜬다
    expect(db.address.update).toHaveBeenCalledWith({
      where: { id: 'a-2' },
      data: { isDefault: true },
    });
  });

  it('기본이 아니면 승격시키지 않는다', async () => {
    db.address.findFirst.mockResolvedValueOnce({ id: 'a-2', isDefault: false });

    await deleteAddress('u-1', 'a-2');

    expect(db.address.update).not.toHaveBeenCalled();
  });

  it('마지막 하나를 지우면 승격할 것이 없다', async () => {
    db.address.findFirst
      .mockResolvedValueOnce({ id: 'a-1', isDefault: true })
      .mockResolvedValueOnce(null);

    await deleteAddress('u-1', 'a-1');

    expect(db.address.update).not.toHaveBeenCalled();
  });
});
