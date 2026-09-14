import type { TemplateProblem } from '@shop/core';

/**
 * 템플릿 문제를 운영자가 읽는 말로. 저장 전 화면(template-form)과 서버의 거절(templates)이 같은 말을 한다 — 둘이 다르면
 * 화면은 괜찮다고 했는데 저장이 다른 이유로 막힌 것처럼 읽힌다.
 */
export function describeTemplateProblem(problem: TemplateProblem): string {
  switch (problem.kind) {
    case 'EMPTY':
      return '문구가 비어 있습니다. 기본 문구로 돌리려면 "기본 문구로" 를 누릅니다.';
    case 'TOO_LONG':
      return `${problem.max}자 이내로 적어 주세요.`;
    case 'BROKEN_BRACE':
      return '중괄호 짝이 맞지 않습니다. 값을 끼울 자리는 {이름} 처럼 적습니다.';
    case 'UNKNOWN_PLACEHOLDER':
      return `이 알림에 없는 값입니다: ${problem.names.map((n) => `{${n}}`).join(', ')}`;
  }
}
