// 계약을 거치면 Zod 가 딸려 온다 — 값 목록은 core 의 것이다
import { LINE_ISSUE, type LineIssue } from '@shop/core';
import type { MessageKey } from '@shop/i18n';

/**
 * 장바구니에 담아 둔 사이에 생긴 문제를 문구로 잇는다.
 *
 * 계약은 코드만 정하고 문구는 여기서 고른다. 표를 손으로 적는 대신
 * 코드 목록에서 만들면, 계약에 문제 유형이 하나 늘었을 때 **여기가 아니라
 * 사전에서** 걸린다 — 열쇠가 없으면 컴파일되지 않는다.
 */
export const CART_ISSUE_KEY = Object.fromEntries(
  LINE_ISSUE.map((issue) => [issue, `cartIssue.${issue}`]),
) as Record<LineIssue, MessageKey>;
