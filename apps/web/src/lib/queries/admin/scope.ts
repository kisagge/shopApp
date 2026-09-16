import 'server-only';
import { merchantScope, assertPermission, type Actor, type Permission } from '@shop/core';

/**
 * 어드민 조회.
 *
 * **모든 쿼리가 merchantScope 를 통과한다.** 가맹점은 자기 상품이 들어간
 * 주문과 자기 브랜드의 상품만 본다. 화면에서 메뉴를 가리는 것으로는 부족하다 —
 * 데이터를 가져오는 쪽에서 막아야 한다.
 *
 * 매출도 마찬가지다. 가맹점의 매출은 주문 총액이 아니라 **그 가맹점 상품 줄의
 * 합계**다. 한 주문에 여러 가맹점 상품이 섞이기 때문이다.
 */

/**
 * 어드민 조회의 권한 확인.
 *
 * **콘솔 진입 권한을 함께 본다.** 고객도 order:read·product:read 를 갖기
 * 때문에 개별 권한만 확인하면 그대로 통과한다 — requireAdmin 이 정확히 그
 * 실수로 결함이었고, 여기서 같은 실수를 반복할 뻔했다.
 *
 * 범위 제한(where 절)과는 다른 일이다. where 절은 "남의 것을 빼고 읽는다"
 * 이지 "이 사람이 봐도 되는가" 가 아니다.
 */
export function assertAdminQuery(actor: Actor, permission: Permission): void {
  assertPermission(actor, 'admin:access');
  assertPermission(actor, permission);
}

export class ScopeError extends Error {
  constructor() {
    super('조회 권한이 없습니다.');
    this.name = 'ScopeError';
  }
}

/** undefined 면 아무것도 볼 수 없다는 뜻이라 던진다 */
export function scopeOf(actor: Actor): string | null {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ScopeError();
  return scope;
}

/** 주문자 이름은 가운데를 가린다. 운영에 필요한 건 식별이지 전체 이름이 아니다. */
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}○`;
  return `${name[0]}${'○'.repeat(name.length - 2)}${name.at(-1)}`;
}

/**
 * 목록 한 쪽.
 *
 * **쪽 번호로 넘긴다.** 예전에는 커서였다 — 보는 사이 앞에 행이 끼어들어도 같은 행을 두 번 보여 주지 않는다는
 * 장점이 있고, 그래서 그렇게 두었다. 그런데 운영 목록은 **훑고 처리하는 자리**다: "더 보기" 로만 내려가면 일곱 쪽
 * 뒤의 주문을 보려고 여섯 번을 눌러야 하고, 지금 어디쯤인지도 알 수 없다. 그 불편이 겹쳐 보이는 한 줄보다 크다.
 *
 * 그 대신 내준 것을 적어 둔다 — 2쪽을 보는 사이 새 줄이 앞에 들어오면 한 줄이 밀려 겹쳐 보일 수 있다.
 *
 * total 은 따로 센다 — 화면 상단의 "N건" 이 한 쪽 크기가 되면 안 되고, 쪽 수도 이 값으로 나온다.
 */
export interface Paged<T> {
  readonly rows: readonly T[];
  readonly total: number;
}

export const PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;
