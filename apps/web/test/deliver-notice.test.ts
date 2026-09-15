import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 손님에게 알리기 — 문구를 읽어 메일을 만들고, 메일이 실패해도 알림함에는 남기고, 던지지 않는다 */

const getMailWording = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/mail/templates', () => ({ getMailWording }));
const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));

const { deliverNotice } = await import('~/lib/notifications/deliver');

const MAIL = { to: 'a@b.c', subject: 's', text: 't', html: 'h' };
const NOTICE = { userId: 'u-1', kind: 'ORDER_SHIPPED' as const, params: { orderNo: '1' } };

beforeEach(() => {
  vi.clearAllMocks();
  getMailWording.mockResolvedValue({ subject: '고친 제목' });
  send.mockResolvedValue(undefined);
});

describe('deliverNotice', () => {
  it('받는 사람의 말로 고친 문구를 읽어 메일을 만들어 보내고, 알림함에 남긴다', async () => {
    const build = vi.fn(() => MAIL);
    await deliverNotice({ tag: 't', ref: 'r', mail: { template: 'ORDER_PAID', locale: 'en', build }, notification: NOTICE });
    expect(getMailWording).toHaveBeenCalledWith('ORDER_PAID', 'en');
    expect(build).toHaveBeenCalledWith({ subject: '고친 제목' });
    expect(send).toHaveBeenCalledWith(MAIL);
    expect(recordNotification).toHaveBeenCalledWith(NOTICE);
  });

  it('메일을 만들거나 보내다 실패해도 알림함에는 남기고 던지지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    send.mockRejectedValue(new Error('smtp'));
    await expect(deliverNotice({ tag: 't', ref: 'r', mail: { template: 'ORDER_PAID', locale: 'ko', build: () => MAIL }, notification: NOTICE })).resolves.toBeUndefined();
    expect(recordNotification).toHaveBeenCalled();
    expect(error.mock.calls[0]?.[0]).toBe('[t] 메일 발송 실패');
    error.mockRestore();
  });

  it('메일 없이 알림만, 알림 없이 메일만도 된다', async () => {
    await deliverNotice({ tag: 't', ref: 'r', mail: null, notification: NOTICE });
    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    await deliverNotice({ tag: 't', ref: 'r', mail: { template: 'ORDER_PAID', locale: 'ko', build: () => MAIL }, notification: null });
    expect(send).toHaveBeenCalledTimes(1);
    expect(recordNotification).not.toHaveBeenCalled();
  });
});
