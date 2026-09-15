import { describe, it, expect } from 'vitest';
import {
  checkTemplateText, renderTemplate, MAIL_TEMPLATE_KIND, MAIL_TEMPLATE_FIELD, MAIL_TEMPLATE_PARAMS, MAIL_TEMPLATE_MAX,
  MAIL_SAMPLE_PARAMS, isMailTemplateKind,
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
