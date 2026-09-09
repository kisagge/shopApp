import { describe, it, expect } from 'vitest';
import * as contract from '../src';
import { checksWithoutMessage, isSchema } from './lib/walk-checks';

/**
 * **제약에는 문구가 붙어 있어야 한다.**
 *
 * 계약의 문구는 사전 열쇠(`valid.*`)이고 응답을 만드는 서버가 그것을 요청의
 * 언어로 바꾼다. 문구를 아예 안 붙이면 Zod 의 기본 문구가 그대로 나간다 —
 * 한국어 화면에 `Too big: expected string to have <=30 characters` 가 뜬다.
 * 쿠폰 코드 칸에서 실제로 그랬고, 이 검사를 만들면서 세어 보니 스키마
 * 마흔 개가 같은 상태였다.
 *
 * 이웃한 `validation-messages.test.ts`(apps/web)는 **적어 둔 열쇠가 사전에
 * 있는지**를 본다. 둘이 짝이다 — 저쪽은 틀린 열쇠를, 이쪽은 없는 열쇠를 잡는다.
 *
 * ── 소스를 훑지 않고 스키마를 거는 이유 ──────────────────────────
 * 처음에는 계약 소스를 정규식으로 훑었다. 주석과 응답 스키마와 `.catch()` 로
 * 감싼 쿼리 파라미터가 섞여 들어와 실제의 세 배가 나왔고, 그 목록으로는
 * 무엇을 고쳐야 하는지 알 수 없었다. Zod 4 는 검사 하나하나를 객체로 들고
 * 있고 사용자 문구를 준 것에만 `error` 가 붙는다. 그래서 스키마를 직접 건다.
 */

/**
 * 문구가 없어도 되는 스키마와 그 이유.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다. 왜 빼는지가 남아 있어야
 * 나중에 그 판단이 아직 맞는지 볼 수 있다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  cartQuoteLineSchema:
    '서버가 만드는 응답의 한 줄이다. 여기서 실패하면 우리 코드가 잘못 만든 것이고, 그 문구는 사람에게 가지 않는다.',
  cartQuoteResponseSchema: '같은 이유 — 서버가 만드는 응답이다.',
  eventBatchResponseSchema: '같은 이유 — 서버가 만드는 응답이다.',
};

const schemas = Object.entries(contract).filter(([, value]) => isSchema(value));

describe('계약의 제약에 붙은 문구', () => {
  it('스키마를 실제로 걷고 있다 — 걸을 것이 없으면 아래가 전부 헛돈다', () => {
    expect(schemas.length).toBeGreaterThan(40);
  });

  it.each(schemas)('%s 의 모든 제약에 문구가 있다', (name, schema) => {
    if (name in EXEMPT) return;

    const missing = checksWithoutMessage(schema);

    expect(
      missing.map((m) => `${m.path}:${m.check}`),
      `문구가 없으면 Zod 의 영어 기본 문구가 그대로 나간다.\n` +
        `사전 열쇠를 붙이거나, 빼야 한다면 EXEMPT 에 이유와 함께 적는다.`,
    ).toEqual([]);
  });

  it('면제 목록에 이름만 적힌 것이 없다', () => {
    expect(Object.entries(EXEMPT).filter(([, why]) => why.trim().length < 20)).toEqual([]);
  });

  /** 고친 스키마가 사라지면 면제만 남아 검사가 조용히 헐거워진다 */
  it('면제된 이름이 전부 실제로 있다', () => {
    const known = new Set(schemas.map(([name]) => name));
    expect(Object.keys(EXEMPT).filter((name) => !known.has(name))).toEqual([]);
  });
});
