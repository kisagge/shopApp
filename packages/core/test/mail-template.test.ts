import { describe, it, expect } from 'vitest';
import {
  checkTemplateText, renderTemplate, MAIL_TEMPLATE_KIND, MAIL_TEMPLATE_FIELD, MAIL_TEMPLATE_PARAMS, MAIL_TEMPLATE_MAX,
  MAIL_SAMPLE_PARAMS, isMailTemplateKind, MAIL_CONSENT, mayMail, needsMarketingConsent,
} from '../src';

/** 메일 문구 템플릿 — 칸마다 쓸 수 있는 값과 상한 */
describe('칸 검사', () => {
  it('그 칸에 넘기는 값만 쓸 수 있다 — 입금 확인 첫 문장에는 이름이 없다', () => {
    expect(checkTemplateText('{name}님, 감사합니다', MAIL_TEMPLATE_PARAMS.ORDER_PAID.lead, 400)).toEqual([]);
    expect(checkTemplateText('{name}님, 입금 확인', MAIL_TEMPLATE_PARAMS.ORDER_DEPOSITED.lead, 400)).toEqual([
      { kind: 'UNKNOWN_PLACEHOLDER', names: ['name'] },
    ]);
    // 머리말은 값 없이 — 메일 안 큰 제목에 주문번호를 박으면 제목과 겹친다
    expect(checkTemplateText('{orderNo}', MAIL_TEMPLATE_PARAMS.ORDER_PAID.heading, 60)).toEqual([
      { kind: 'UNKNOWN_PLACEHOLDER', names: ['orderNo'] },
    ]);
  });

  it('비었거나 넘치거나 중괄호가 깨지면 잡는다', () => {
    expect(checkTemplateText(' ', [], 10)).toEqual([{ kind: 'EMPTY' }]);
    expect(checkTemplateText('a'.repeat(11), [], 10)).toEqual([{ kind: 'TOO_LONG', max: 10 }]);
    expect(checkTemplateText('[PLAIN] {orderNo', ['orderNo'], 120)).toEqual([{ kind: 'BROKEN_BRACE' }]);
  });
});

describe('표', () => {
  it('모든 메일·칸에 값 목록과 상한이 있고, 예시 값이 그 값을 전부 채운다', () => {
    for (const kind of MAIL_TEMPLATE_KIND) {
      for (const field of MAIL_TEMPLATE_FIELD) {
        const names: readonly string[] = MAIL_TEMPLATE_PARAMS[kind][field];
        expect(MAIL_TEMPLATE_MAX[field]).toBeGreaterThan(0);
        expect(renderTemplate(names.map((n) => `{${n}}`).join(' '), MAIL_SAMPLE_PARAMS), `${kind}.${field}`).not.toBeNull();
      }
    }
    expect(isMailTemplateKind('RESTOCK')).toBe(true);
    // 보안 메일은 고칠 수 없다
    expect(isMailTemplateKind('VERIFY_EMAIL')).toBe(false);
    expect(isMailTemplateKind('RESET_PASSWORD')).toBe(false);
  });
});

/**
 * 마케팅과 거래 고지의 경계.
 *
 * 마이페이지의 마케팅 수신 스위치가 **끄든 켜든 아무것도 바꾸지 않았다.** 동의를 판단하는 함수까지
 * 있었는데 부르는 곳이 없었다. 경계를 여기서 못 박는다 — 잘못 그으면 두 가지로 틀린다: 광고를
 * 거부한 사람에게 광고가 가거나, 거래 고지가 막혀 손님이 자기 돈과 물건이 어떻게 됐는지 모른다.
 */
describe('마케팅 수신 동의', () => {
  it('모든 메일 종류가 둘 중 하나로 정해져 있다', () => {
    // 표가 종류마다 키를 갖는다 — 새 메일이 생기면 타입이 먼저 막지만, 값도 확인해 둔다
    for (const kind of MAIL_TEMPLATE_KIND) {
      expect(['marketing', 'transactional'], kind).toContain(MAIL_CONSENT[kind]);
    }
  });

  it('소멸 안내만 마케팅이다 — 손님이 요청한 적 없는 권유다', () => {
    const marketing = MAIL_TEMPLATE_KIND.filter((k) => MAIL_CONSENT[k] === 'marketing');
    expect([...marketing].sort()).toEqual(['COUPON_EXPIRING', 'POINTS_EXPIRING']);
  });

  it('거래 고지는 수신 거부로 막히지 않는다 — 안 보내면 무슨 일이 있었는지 알 길이 없다', () => {
    const optedOut = { marketingAgreedAt: null };
    for (const kind of MAIL_TEMPLATE_KIND) {
      if (MAIL_CONSENT[kind] === 'marketing') continue;
      expect(mayMail(kind, optedOut), kind).toBe(true);
    }
  });

  it('재입고 알림도 거래 고지다 — 그 옵션에 알려 달라고 직접 신청한 사람에게만 간다', () => {
    expect(needsMarketingConsent('RESTOCK')).toBe(false);
  });

  it('마케팅은 동의한 사람에게만 간다', () => {
    expect(mayMail('COUPON_EXPIRING', { marketingAgreedAt: null })).toBe(false);
    expect(mayMail('COUPON_EXPIRING', { marketingAgreedAt: new Date('2026-01-01') })).toBe(true);
  });
});
