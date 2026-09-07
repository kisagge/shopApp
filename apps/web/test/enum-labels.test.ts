import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUS, RETURN_TYPE, RETURN_REASON,
  ORDER_STATUS_LABEL, RETURN_TYPE_LABEL, RETURN_REASON_LABEL,
  CLOSURE_EFFECT, CLOSURE_BLOCK,
} from '@shop/core';
import { LOCALES, createTranslator, messageKeys } from '@shop/i18n';
import { ORDER_STATUS_KEY, RETURN_TYPE_KEY, RETURN_REASON_KEY } from '~/lib/i18n/enum-labels';
import { CLOSURE_BLOCK_KEY } from '~/lib/i18n/closure';

/**
 * 도메인 값과 이름표가 어긋나지 않게 지킨다.
 *
 * 표를 손으로 적지 않고 값 목록에서 만들기 때문에, **값을 하나 더해도
 * 컴파일은 통과한다** — 대신 사전에 열쇠가 없어 화면에 `orderStatus.NEW`
 * 같은 글자가 그대로 뜬다. 그 조용한 실수를 여기서 잡는다.
 */

/**
 * 이름표 표를 **폴더에서 모은다.**
 *
 * 예전에는 일곱 짝을 손으로 적어 두었다. 그 사이 표는 열셋으로 늘었고,
 * 장바구니 문제 · 빈 결과 · 포인트 사유 · 리뷰 정렬 · 문의 주제 다섯이
 * **아무도 안 보는 채로** 있었다. 값 하나를 더해도 컴파일은 통과하므로,
 * 검사가 보지 않으면 화면에 `cartIssue.OUT_OF_STOCK` 같은 열쇠가 그대로 뜬다.
 *
 * 같은 실수를 접근성 훑기 · 번들 상한 · 요청 제한에서 이미 했다. 손 목록은
 * 늘 늦게 자란다. 그래서 목록을 만들지 않고 모듈에서 모은다 — 새 표를
 * 더하면 이름이 `_KEY` 로 끝나는 것만으로 검사에 들어온다.
 */
const modules = import.meta.glob('../src/lib/i18n/*.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** 이름이 _KEY 로 끝나고 값이 전부 문자열인 것 = 이름표 표 */
function labelMaps(): [string, Record<string, string>][] {
  const found: [string, Record<string, string>][] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const file = path.split('/').pop() ?? path;
    for (const [name, value] of Object.entries(mod)) {
      if (!name.endsWith('_KEY')) continue;
      if (typeof value !== 'object' || value === null) continue;
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0 || !entries.every(([, v]) => typeof v === 'string')) continue;
      found.push([`${file} · ${name}`, value as Record<string, string>]);
    }
  }
  return found.sort(([a], [b]) => a.localeCompare(b));
}

const MAPS = labelMaps();

describe('도메인 값의 이름표', () => {
  const known = new Set<string>(messageKeys());

  it('표를 실제로 모아 왔다', () => {
    // glob 이 어긋나면 아래 검사가 전부 통과해 버린다. 지금 열셋이다.
    expect(MAPS.length).toBeGreaterThanOrEqual(13);
  });

  it.each(MAPS)('%s — 모든 값에 사전 열쇠가 있다', (_name, keys) => {
    for (const [value, key] of Object.entries(keys)) {
      expect(known.has(key), `${value} → ${key} 가 사전에 없다`).toBe(true);
    }
  });

  it.each(MAPS)('%s — 세 언어 모두 빈 문구가 아니다', (_name, keys) => {
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      for (const key of Object.values(keys)) {
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
