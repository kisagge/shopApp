import { z } from 'zod';

/**
 * **아무 검사도 영어로 답하지 않게 하는 바닥.**
 *
 * 계약의 제약에는 사전 열쇠를 붙인다(`validation-message-coverage` 가 지킨다).
 * 그런데 열쇠를 붙일 자리가 없는 실패가 있다 — **칸을 아예 안 보냈거나, 문자열
 * 자리에 숫자를 보냈거나, 고를 수 없는 값을 골랐을 때.** 그건 검사가 아니라
 * 타입 자체의 실패라 `.max(30, '...')` 처럼 문구를 달 곳이 없다. 그래서
 * Zod 의 기본 문구가 그대로 나갔다 —
 * `Invalid input: expected string, received number`.
 *
 * Zod 는 문구를 못 찾았을 때 부를 자리를 하나 열어 둔다. 여기서 **열쇠를
 * 돌려준다.** 번역은 늘 하던 자리(`validationFailed`)에서 그대로 일어난다.
 *
 * 붙여 둔 문구보다 **먼저 오지 않는다.** `.max(30, 'valid.tooLongChars')`
 * 가 있으면 그것이 이긴다. 이건 바닥이지 덮개가 아니다.
 *
 * **모듈을 불러오는 것만으로 걸린다.** Zod 설정은 인스턴스 하나에 붙는
 * 전역이고, 이 저장소는 계약과 앱이 같은 zod 를 쓴다 — 그래서 앱이 라우트
 * 안에서 직접 만든 스키마에도 함께 적용된다. 부르는 것을 잊을 수 있는
 * 함수로 두지 않은 이유가 그것이다. 실제로 걸렸는지는
 * `test/error-map.test.ts` 가 계약을 불러오기만 해서 확인한다.
 */

type Issue = { readonly code?: string; readonly origin?: string; readonly input?: unknown };

/**
 * 실패의 갈래를 사전 열쇠로 바꾼다.
 *
 * 숫자가 들어가는 열쇠(`{min}` · `{max}`)를 골라도 된다 — 이슈가 그 값을
 * 함께 싣고 있어서 `translateIssue` 가 채운다.
 */
export function messageKeyForIssue(issue: Issue): string {
  switch (issue.code) {
    /** 칸이 비었는지, 종류가 다른지는 갈라서 말해 준다 — 사람이 할 일이 다르다 */
    case 'invalid_type':
      return issue.input === undefined ? 'valid.required' : 'valid.invalidType';

    /** enum·literal — 고를 수 있는 것 밖의 값 */
    case 'invalid_value':
      return 'valid.invalidChoice';

    /** 이메일·정규식·날짜처럼 모양이 정해진 것 */
    case 'invalid_format':
      return 'valid.invalidFormat';

    case 'too_small':
      return issue.origin === 'string'
        ? 'valid.tooShortChars'
        : issue.origin === 'array' || issue.origin === 'set'
          ? 'valid.tooFewItems'
          : 'valid.tooSmall';

    case 'too_big':
      return issue.origin === 'string'
        ? 'valid.tooLongChars'
        : issue.origin === 'array' || issue.origin === 'set'
          ? 'valid.tooManyItems'
          : 'valid.tooBig';

    /*
     * 남는 갈래(union 전체 실패, 모르는 열쇠, 배수 아님, refine 실패…)는
     * 하나로 묶는다. 갈래마다 문구를 만들어 두면 정작 사람에게는 다 같은
     * 말로 읽히고, 사전만 늘어난다.
     */
    default:
      return 'valid.generic';
  }
}

z.config({ customError: (issue) => messageKeyForIssue(issue) });
