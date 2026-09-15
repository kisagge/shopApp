import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAIL_TEMPLATE_KIND, MAIL_TEMPLATE_FIELD, MAIL_TEMPLATE_PARAMS, type Actor, type MailTemplateKind,
} from '@shop/core';

/**
 * 메일 문구 템플릿 — 메일이 고친 문구로 나가는가, 저장·되돌리기, 미리보기·저장 창구.
 */

const db = vi.hoisted(() => ({
  mailTemplate: {
    findUnique: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>(),
    upsert: vi.fn<(...a: any[]) => any>(), delete: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const { getMailWording, saveMailTemplate } = await import('~/lib/mail/templates');
const { orderMail } = await import('~/lib/orders/notify');
const { restockMail, inquiryAnswerMail } = await import('~/lib/mail/notices');
const { previewMail } = await import('~/lib/mail/preview');
const { PATCH } = await import('~/app/api/admin/mail-templates/route');
const { POST: PREVIEW } = await import('~/app/api/admin/mail-templates/preview/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const order = {
  to: 'demo@plain.test', buyerName: '데모', orderNo: '20260915-0000001', locale: 'ko' as const,
  items: [{ productName: '울 코트', optionLabel: 'M', quantity: 1, unitPrice: 100_000 }], payable: 100_000, shipTo: '데모 · 서울',
};

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  db.mailTemplate.findUnique.mockResolvedValue(null);
});

describe('메일이 고친 문구로 나간다', () => {
  it('주문 완료 — 제목·머리말·첫 문장을 고친 대로, 표·금액·버튼은 그대로', () => {
    const mail = orderMail('paid', order, { subject: '[PLAIN] {orderNo} 주문 고마워요', heading: '주문 받았어요', lead: '{name}님 고마워요' });
    expect(mail.subject).toBe('[PLAIN] 20260915-0000001 주문 고마워요');
    expect(mail.html).toContain('주문 받았어요');
    expect(mail.html).toContain('데모님 고마워요');
    expect(mail.text.split('\n')[0]).toBe('데모님 고마워요');
    // 거래 내용은 문구가 아니다
    expect(mail.html).toContain('100,000원');
    expect(mail.html).toContain('/order/20260915-0000001');
  });

  it('비운 칸은 기본 문구 — 고친 칸만 바뀐다', () => {
    const mail = orderMail('paid', order, { heading: '주문 받았어요' });
    expect(mail.subject).toBe(orderMail('paid', order).subject);
    expect(mail.html).toContain('주문 받았어요');
  });

  it('문구에 넣은 값은 이스케이프된다 — 이름에 태그가 있어도 메일 HTML 이 깨지지 않는다', () => {
    const mail = orderMail('paid', { ...order, buyerName: '<b>x</b>' }, { lead: '{name}님' });
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;님');
    expect(mail.html).not.toContain('<b>x</b>');
  });

  it('재입고·문의 답변도 같은 칸을 쓴다', () => {
    const restock = restockMail({ to: 'a@b', productName: '코트', optionLabel: 'M', url: 'https://x', locale: 'ko' }, { subject: '{item} 들어왔어요' });
    expect(restock.subject).toBe('코트 (M) 들어왔어요');
    const inquiry = inquiryAnswerMail({ to: 'a@b', question: 'q', answer: 'a', url: 'https://x', locale: 'ko' }, { lead: '{about} 답을 달았어요' });
    expect(inquiry.html).toContain('고객센터 답을 달았어요');
  });

  /*
   * 메일을 만드는 코드가 칸마다 넘기는 값이 core 의 값 목록과 같은가. 목록에만 있고 코드가 안 넘기면 운영자가 쓴 {값} 이
   * 늘 기본 문구로 물러나 "저장은 됐는데 아무 데도 안 보이는" 고장이 된다 — 실제 미리보기 함수로 모든 메일·칸을 만들어 본다.
   */
  it.each(MAIL_TEMPLATE_KIND)('%s — 칸마다 쓸 수 있는 값을 전부 넣으면 전부 채워진다', (kind: MailTemplateKind) => {
    const marker = (field: string) => `≪${field}≫`;
    const wording = Object.fromEntries(MAIL_TEMPLATE_FIELD.map((f) => [
      f, `${marker(f)} ${(MAIL_TEMPLATE_PARAMS[kind][f] as readonly string[]).map((n) => `{${n}}`).join(' ')}`,
    ]));
    const mail = previewMail(kind, 'ko', wording);
    for (const field of MAIL_TEMPLATE_FIELD) {
      const where = field === 'subject' ? mail.subject : mail.html;
      expect(where, `${kind}.${field} 고친 문구가 안 쓰였다(값이 빠져 기본 문구로 물러났다)`).toContain(marker(field));
    }
    expect(mail.subject + mail.html).not.toMatch(/\{\w+\}/);
  });
});

describe('저장', () => {
  it('앞뒤 공백을 지우고 빈 칸은 null, 전후를 돌려준다', async () => {
    db.mailTemplate.findUnique.mockResolvedValue({ subject: '옛 제목', heading: null, lead: null });
    const { before, after } = await saveMailTemplate(admin, { kind: 'RESTOCK', locale: 'ko', subject: ' {item} 재입고 ', heading: '  ', lead: null });
    expect(before).toEqual({ subject: '옛 제목', heading: null, lead: null });
    expect(after).toEqual({ subject: '{item} 재입고', heading: null, lead: null });
    expect(db.mailTemplate.upsert.mock.calls[0]![0].update).toMatchObject({ subject: '{item} 재입고', heading: null, lead: null, updatedBy: 'u-a' });
  });

  it('칸마다 규칙 — 입금 확인 첫 문장에 {name} 은 쓸 수 없다, 저장하지 않는다', async () => {
    await expect(saveMailTemplate(admin, { kind: 'ORDER_DEPOSITED', locale: 'ko', subject: null, heading: null, lead: '{name}님 입금 확인' }))
      .rejects.toThrow(/첫 문장: 이 알림에 없는 값입니다: \{name\}/);
    expect(db.mailTemplate.upsert).not.toHaveBeenCalled();
  });

  it('세 칸이 다 비면 줄을 지운다(기본으로 되돌리기)', async () => {
    db.mailTemplate.findUnique.mockResolvedValue({ subject: 'x', heading: null, lead: null });
    await saveMailTemplate(admin, { kind: 'RESTOCK', locale: 'ko', subject: null, heading: null, lead: null });
    expect(db.mailTemplate.delete).toHaveBeenCalled();
  });

  it('가맹점은 고칠 수 없고, 표를 못 읽으면 보낼 때 기본 문구로 간다', async () => {
    await expect(saveMailTemplate(merchant, { kind: 'RESTOCK', locale: 'ko', subject: 'x', heading: null, lead: null })).rejects.toThrow();
    db.mailTemplate.findUnique.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getMailWording('ORDER_PAID', 'ko')).toEqual({});
  });
});

describe('창구', () => {
  const body = { kind: 'RESTOCK', locale: 'ko', subject: '{item} 들어왔어요', heading: null, lead: null };
  const patch = (b: unknown) => PATCH(new Request('http://localhost/api/admin/mail-templates', { method: 'PATCH', body: JSON.stringify(b) }));
  const preview = (b: unknown) => PREVIEW(new Request('http://localhost/api/admin/mail-templates/preview', { method: 'POST', body: JSON.stringify(b) }));

  it('저장은 전후를 감사 로그에 남긴다 — 다 비우면 되돌리기로', async () => {
    expect((await patch(body)).status).toBe(200);
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'mail.template.update', targetType: 'mail_template', targetId: 'RESTOCK:ko', after: { subject: '{item} 들어왔어요' } });
    await patch({ ...body, subject: null });
    expect(recordAudit.mock.calls[1]![0]).toMatchObject({ action: 'mail.template.reset' });
  });

  it('미리보기는 저장하지 않은 문구로 실제 메일을 만들어 돌려주고, 아무것도 저장·기록하지 않는다', async () => {
    const response = await preview(body);
    expect(response.status).toBe(200);
    const mail = (await response.json()) as { subject: string; html: string };
    expect(mail.subject).toBe('울 코트 (오트 / M) 들어왔어요');
    expect(mail.html).toContain('울 코트 (오트 / M)');
    expect(db.mailTemplate.upsert).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('틀린 문구는 400, 보안 메일·모르는 종류는 계약에서, 가맹점은 403', async () => {
    expect((await preview({ ...body, subject: '{orderNo} 재입고' })).status).toBe(400);
    expect((await patch({ ...body, kind: 'RESET_PASSWORD' })).status).toBe(400);
    getActor.mockResolvedValue(merchant);
    expect((await preview(body)).status).toBe(403);
    expect((await patch(body)).status).toBe(403);
  });
});
