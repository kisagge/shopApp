/**
 * 쪽 번호.
 *
 * 운영 목록은 **훑고 처리하는 자리**다. "더 보기" 로만 내려가면 일곱 쪽 뒤의 주문을 보려고 여섯 번을 눌러야 하고,
 * 지금 어디쯤인지도 알 수 없다. 그래서 번호를 둔다 — 대신 커서가 주던 성질 하나를 내준다: 2쪽을 보는 사이 앞에
 * 새 줄이 들어오면 한 줄이 밀려 겹쳐 보일 수 있다. 훑는 자리에서는 그 편이 낫다고 봤다.
 */

/** 한 번에 보여 줄 번호의 수. 홀수라야 지금 쪽이 가운데에 선다 */
export const PAGE_WINDOW = 5;

export interface PageNav {
  readonly page: number;
  readonly totalPages: number;
  /** 화면에 그릴 번호들 */
  readonly pages: readonly number[];
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
}

/**
 * 쪽 수를 센다. 줄이 하나도 없어도 **1쪽**이다 — 0쪽은 화면에 그릴 수 없는 수다.
 */
export function totalPagesOf(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * 주소로 들어온 쪽 번호를 믿을 수 있는 값으로 만든다.
 *
 * **주소는 손으로 고칠 수 있다.** 0, -3, 'abc', 999999 가 그대로 들어온다. 범위를 벗어나면 가장 가까운 쪽으로
 * 당긴다 — 빈 화면을 보여 주고 "없는 쪽입니다" 라고 말하는 것보다, 있는 것을 보여 주는 편이 낫다.
 */
export function clampPage(raw: unknown, totalPages: number): number {
  /*
   * 숫자와 문자열만 읽는다. 그 밖의 값을 String() 에 넘기면 "[object Object]" 같은 것이 들어오고,
   * 그것을 숫자로 읽으려다 NaN 을 거쳐 1 이 된다 — 같은 답이지만 무엇을 읽었는지가 흐려진다.
   */
  const parsed =
    typeof raw === 'number' ? raw
      : typeof raw === 'string' ? Number.parseInt(raw, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.trunc(parsed), 1), Math.max(totalPages, 1));
}

/**
 * 그릴 번호 묶음.
 *
 * **지금 쪽을 가운데 두되 끝에서는 밀어 붙인다.** 1쪽에서 가운데를 고집하면 왼쪽이 비어 번호가 세 개만 뜬다 —
 * 폭이 들쭉날쭉하면 누르려던 자리가 쪽을 넘길 때마다 움직인다.
 */
export function pageNav(input: {
  readonly page: number;
  readonly total: number;
  readonly pageSize: number;
  readonly window?: number;
}): PageNav {
  const totalPages = totalPagesOf(input.total, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const size = Math.min(input.window ?? PAGE_WINDOW, totalPages);

  // 가운데에 두려면 왼쪽으로 절반만큼 물러난다. 끝에 닿으면 그만큼 반대로 민다.
  const half = Math.floor(size / 2);
  const start = Math.min(Math.max(page - half, 1), Math.max(totalPages - size + 1, 1));

  return {
    page,
    totalPages,
    pages: Array.from({ length: size }, (_, i) => start + i),
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

/** 이 쪽의 첫 줄이 몇 번째인가. Prisma 의 skip 에 그대로 들어간다 */
export function offsetOf(page: number, pageSize: number): number {
  return (Math.max(page, 1) - 1) * pageSize;
}
