import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AFTER_SALE_KIND, NOTIFICATION_KIND, NOTIFICATION_PARAMS, type Actor } from '@shop/core';
import { LOCALES, translatorFor } from '@shop/i18n';
import { ko } from '@shop/i18n/messages/ko';
import { DICTIONARIES } from '@shop/i18n/all';
import { TEMPLATE_LOCALES } from '@shop/contract';

/**
 * 알림 문구 템플릿 — 저장·되돌리기·창구, 그리고 알림함이 그 문구로 읽는가.
 */

const db = vi.hoisted(() => ({
  notificationTemplate: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const { saveNotificationTemplate, getNotificationTemplates, TemplateError } = await import('~/lib/notifications/templates');
const { PATCH } = await import('~/app/api/admin/notification-templates/route');
const { notificationText } = await import('~/lib/i18n/notification');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/admin/notification-templates', { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  db.notificationTemplate.findUnique.mockResolvedValue(null);
});

describe('저장', () => {
  it('앞뒤 공백을 지워 저장하고 전후를 돌려준다', async () => {
    db.notificationTemplate.findUnique.mockResolvedValue({ body: '옛 문구 {orderNo}' });
    const result = await saveNotificationTemplate(admin, { kind: 'ORDER_SHIPPED', locale: 'ko', body: '  {orderNo} 출발했어요 ' });
    expect(result).toEqual({ before: '옛 문구 {orderNo}', after: '{orderNo} 출발했어요' });
    expect(db.notificationTemplate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind_locale: { kind: 'ORDER_SHIPPED', locale: 'ko' } },
      update: { body: '{orderNo} 출발했어요', updatedBy: 'u-a' },
    }));
  });

  it('없는 값을 부르면 저장하지 않고 무엇이 틀렸는지 말한다', async () => {
    const saving = saveNotificationTemplate(admin, { kind: 'COUPON_ISSUED', locale: 'ko', body: '{recipientPhone} 님 쿠폰' });
    await expect(saving).rejects.toBeInstanceOf(TemplateError);
    await expect(saving).rejects.toThrow('{recipientPhone}');
    expect(db.notificationTemplate.upsert).not.toHaveBeenCalled();
  });

  it('null 은 기본 문구로 — 줄을 지운다. 없던 줄이면 지울 것도 없다', async () => {
    db.notificationTemplate.findUnique.mockResolvedValue({ body: '고친 문구' });
    expect(await saveNotificationTemplate(admin, { kind: 'RESTOCKED', locale: 'en', body: null })).toEqual({ before: '고친 문구', after: null });
    expect(db.notificationTemplate.delete).toHaveBeenCalledTimes(1);

    db.notificationTemplate.findUnique.mockResolvedValue(null);
    await saveNotificationTemplate(admin, { kind: 'RESTOCKED', locale: 'en', body: null });
    expect(db.notificationTemplate.delete).toHaveBeenCalledTimes(1);
  });

  it('가맹점은 고칠 수 없다', async () => {
    await expect(saveNotificationTemplate(merchant, { kind: 'STOCK_LOW', locale: 'ko', body: '재고 {stock}' })).rejects.toThrow();
    expect(db.notificationTemplate.findUnique).not.toHaveBeenCalled();
  });
});

describe('창구', () => {
  it('저장·되돌리기를 전후 문구와 함께 감사 로그에 남긴다', async () => {
    expect((await patch({ kind: 'ORDER_SHIPPED', locale: 'ja', body: '{orderNo} 発送' })).status).toBe(200);
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'notification.template.update', targetType: 'notification_template', targetId: 'ORDER_SHIPPED:ja',
      before: { body: null }, after: { body: '{orderNo} 発送' },
    }));

    db.notificationTemplate.findUnique.mockResolvedValue({ body: '{orderNo} 発送' });
    await patch({ kind: 'ORDER_SHIPPED', locale: 'ja', body: null });
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'notification.template.reset' }));
  });

  it('틀린 문구는 400 과 문제 목록, 모르는 종류·말은 계약에서 막고, 가맹점은 403', async () => {
    const bad = await patch({ kind: 'ORDER_SHIPPED', locale: 'ko', body: '{orderNo 출고' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'INVALID_TEMPLATE', problems: [{ kind: 'BROKEN_BRACE' }] });

    expect((await patch({ kind: 'ORDER_LOST', locale: 'ko', body: 'x' })).status).toBe(400);
    expect((await patch({ kind: 'ORDER_SHIPPED', locale: 'fr', body: 'x' })).status).toBe(400);

    getActor.mockResolvedValue(merchant);
    expect((await patch({ kind: 'STOCK_LOW', locale: 'ko', body: '재고 {stock}' })).status).toBe(403);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('알림함이 읽는 문구', () => {
  const t = translatorFor('ko', ko);

  it('고친 문구가 있으면 그것으로, 없으면 사전의 기본 문구로', () => {
    expect(notificationText(t, 'COUPON_ISSUED', { couponName: '가을' }, '{couponName} 받아 가세요')).toBe('가을 받아 가세요');
    expect(notificationText(t, 'COUPON_ISSUED', { couponName: '가을' })).toBe('가을 쿠폰이 도착했습니다');
  });

  it('정산 알림은 말마다 기간과 금액을 둘 다 말한다', () => {
    /*
     * **금액이 빠지면 알린 뜻이 없다.** "정산이 확정되었습니다" 만으로는 얼마인지
     * 보러 결국 정산 화면을 열게 되는데, 화면을 안 열어도 알게 하려고 만든 알림이다.
     * 옮긴 문구에서 {amount} 하나가 떨어지는 것은 눈에 잘 띄지 않아 검사로 막는다.
     */
    for (const locale of LOCALES) {
      const tr = translatorFor(locale, DICTIONARIES[locale]);
      for (const kind of ['SETTLEMENT_CLOSED', 'SETTLEMENT_PAID'] as const) {
        const line = notificationText(tr, kind, { period: '2026-08', amount: '750,000' });
        expect(line, `${locale}/${kind}`).toContain('2026-08');
        expect(line, `${locale}/${kind}`).toContain('750,000');
      }
    }
  });

  it('끼울 값이 빠진 옛 알림은 고친 문구 대신 기본 문구로 — 자리표시가 글자로 보이지 않는다', () => {
    expect(notificationText(t, 'INQUIRY_ANSWERED', {}, '{productName} 문의에 답했어요')).toBe('문의에 답변이 달렸습니다.');
  });

  it('표를 못 읽으면 빈 표 — 알림함은 기본 문구로 열린다', async () => {
    db.notificationTemplate.findMany.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await getNotificationTemplates('ko')).size).toBe(0);
  });
});

describe('표가 코드와 맞는다', () => {
  it('계약의 말 목록이 사전의 말 목록과 같다', () => {
    expect([...TEMPLATE_LOCALES]).toEqual([...LOCALES]);
  });

  it('기본 문구가 쓰는 자리는 그 종류에 실리는 값뿐이다 — 기본 문구가 곧 올바른 템플릿의 예다', () => {
    for (const kind of NOTIFICATION_KIND) {
      const body = (ko as Record<string, unknown>)[`notif.${kind}`] as string;
      const used = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      expect(used.every((n) => (NOTIFICATION_PARAMS[kind] as readonly string[]).includes(n!)), kind).toBe(true);
    }
  });

  /**
   * 알림을 남기는 코드가 싣는 값과 NOTIFICATION_PARAMS 가 같은가. 여기가 틀리면 운영자가 쓸 수 있다고 안내받은 값이
   * 실제로는 비어 있어, 고친 문구가 늘 기본 문구로 물러난다 — 저장은 됐는데 아무 데도 안 보이는 고장이다.
   */
  it('알림을 남기는 코드가 싣는 값이 종류별 값 목록과 같다', () => {
    const SRC = join(process.cwd(), 'src');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);

    const found = new Map<string, Set<string>>();
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\bkind:/.test(line)) return;
        const literal = [...line.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!).filter((k) => (NOTIFICATION_KIND as readonly string[]).includes(k));
        /*
         * **한 함수가 종류를 받아 남기는 자리가 둘 있다.** 거기에는 글자로 적힌 종류가 없다.
         *
         * · notify-after-sale: `kind: input.kind` — AfterSaleKind 넷 모두를 싣는 것으로 센다.
         * · orders/notify: `kind: ORDER_NOTIFICATION_KIND[kind]` — 주문 접수·가상계좌·입금 확인 셋.
         *
         * 묶어서 세는 것이 맞는 이유는 **그 종류들의 값 목록이 서로 같기** 때문이다(셋 다 orderNo
         * 하나). 갈라져야 할 만큼 달라지면 종류마다 따로 적게 되고, 그때는 이 예외가 필요 없어진다.
         * 목록이 같다는 것 자체는 core 검사가 본다.
         */
        const byMap: Readonly<Record<string, readonly string[]>> = {
          'notify-after-sale.ts': AFTER_SALE_KIND,
          'notify.ts': ['ORDER_PAID', 'ORDER_PENDING', 'ORDER_DEPOSITED'],
        };
        const mapped = literal.length === 0 && /kind:\s*(input\.kind|ORDER_NOTIFICATION_KIND\[)/.test(line)
          ? byMap[basename(file)] ?? []
          : [];
        const kinds = mapped.length > 0 ? [...mapped] : literal;
        if (kinds.length === 0) return;
        const near = lines.slice(i, i + 8).join('\n');
        const params = /params:\s*\{([\s\S]*?)\}/.exec(near);
        if (!params) return;
        const keys = [...params[1]!.matchAll(/(\w+):/g)].map((m) => m[1]!);
        for (const k of kinds) found.set(k, new Set([...(found.get(k) ?? []), ...keys]));
      });
    }

    expect([...found.keys()].sort()).toEqual([...NOTIFICATION_KIND].sort());
    for (const kind of NOTIFICATION_KIND) {
      expect([...found.get(kind)!].sort(), kind).toEqual([...NOTIFICATION_PARAMS[kind]].sort());
    }
  });
});
