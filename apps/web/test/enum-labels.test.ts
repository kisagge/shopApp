import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUS, MEMBER_GRADE, RETURN_TYPE, RETURN_REASON, RETURN_STATUS,
  SIZE_FIT, REPORT_REASON,
  ORDER_STATUS_LABEL, RETURN_TYPE_LABEL, RETURN_REASON_LABEL,
  CLOSURE_EFFECT, CLOSURE_BLOCK,
} from '@shop/core';
import { LOCALES, createTranslator, messageKeys } from '@shop/i18n';
import {
  ORDER_STATUS_KEY, GRADE_KEY, RETURN_TYPE_KEY, RETURN_REASON_KEY,
  RETURN_STATUS_KEY, SIZE_FIT_KEY, REPORT_REASON_KEY,
} from '~/lib/i18n/enum-labels';
import { CLOSURE_BLOCK_KEY } from '~/lib/i18n/closure';

/**
 * 도메인 값과 이름표가 어긋나지 않게 지킨다.
 *
 * 표를 손으로 적지 않고 값 목록에서 만들기 때문에, **값을 하나 더해도
 * 컴파일은 통과한다** — 대신 사전에 열쇠가 없어 화면에 `orderStatus.NEW`
 * 같은 글자가 그대로 뜬다. 그 조용한 실수를 여기서 잡는다.
 */

const GROUPS = [
  ['주문 상태', ORDER_STATUS, ORDER_STATUS_KEY],
  ['회원 등급', MEMBER_GRADE, GRADE_KEY],
  ['반품 종류', RETURN_TYPE, RETURN_TYPE_KEY],
  ['반품 사유', RETURN_REASON, RETURN_REASON_KEY],
  ['반품 상태', RETURN_STATUS, RETURN_STATUS_KEY],
  ['사이즈 표현', SIZE_FIT, SIZE_FIT_KEY],
  ['신고 사유', REPORT_REASON, REPORT_REASON_KEY],
] as const;

describe('도메인 값의 이름표', () => {
  const known = new Set<string>(messageKeys());

  it.each(GROUPS)('%s — 모든 값에 사전 열쇠가 있다', (_name, values, keys) => {
    for (const value of values) {
      const key = (keys as Record<string, string>)[value]!;
      expect(known.has(key), `${key} 가 사전에 없다`).toBe(true);
    }
  });

  it.each(GROUPS)('%s — 세 언어 모두 빈 문구가 아니다', (_name, values, keys) => {
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      for (const value of values) {
        const key = (keys as Record<string, string>)[value]!;
        expect(t(key as never).trim(), `${locale}/${key}`).not.toBe('');
      }
    }
  });
});

describe('core 에 남겨 둔 한국어 표', () => {
  /**
   * 세 표는 core 에 남아 있다. 화면이 아니라 **기록과 예외 문구**가 쓰기
   * 때문이다 — 주문 상태 로그의 note, 반품 신청 기록 같은 것들은 운영진이
   * 나중에 읽는 기록이지 손님이 보는 화면이 아니다.
   *
   * 그래서 한국어가 두 곳에 있다. 어긋나면 같은 값이 화면과 기록에서 다르게
   * 불리므로, 어긋나는 순간 여기서 걸리게 한다.
   */
  const ko = createTranslator('ko');

  it('주문 상태 이름이 사전과 같다', () => {
    for (const s of ORDER_STATUS) expect(ORDER_STATUS_LABEL[s]).toBe(ko(ORDER_STATUS_KEY[s]));
  });

  it('반품 종류·사유 이름이 사전과 같다', () => {
    for (const v of RETURN_TYPE) expect(RETURN_TYPE_LABEL[v]).toBe(ko(RETURN_TYPE_KEY[v]));
    for (const v of RETURN_REASON) expect(RETURN_REASON_LABEL[v]).toBe(ko(RETURN_REASON_KEY[v]));
  });
});

describe('탈퇴 안내문', () => {
  /**
   * core 는 무엇이 지워지고 무엇이 남는지만 정하고, 그것을 어떻게 설명할지는
   * 사전이 가진다. 항목을 하나 더하고 사전을 잊으면 화면에 `closure.newThing`
   * 같은 글자가 그대로 뜬다.
   */
  const known = new Set<string>(messageKeys());

  it('모든 항목에 사전 열쇠가 있다', () => {
    for (const effect of CLOSURE_EFFECT) {
      expect(known.has(`closure.${effect.id}`), effect.id).toBe(true);
      if (effect.explains) {
        expect(known.has(`closure.${effect.id}Why`), `${effect.id}Why`).toBe(true);
      }
    }
  });

  it('막는 이유에도 모두 열쇠가 있다', () => {
    for (const block of CLOSURE_BLOCK) expect(known.has(CLOSURE_BLOCK_KEY[block])).toBe(true);
  });
});
