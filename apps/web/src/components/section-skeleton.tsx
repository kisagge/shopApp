/**
 * 아직 오지 않은 자리.
 *
 * **높이를 미리 잡는다.** 자리를 안 잡으면 내용이 도착하는 순간 아래가
 * 통째로 밀린다 — 리뷰를 읽으려고 스크롤한 사람이 문의 쪽으로 튕긴다.
 * 스트리밍으로 얻은 것을 레이아웃 이동으로 도로 잃는 셈이다.
 *
 * **낭독기에는 알리지 않는다.** 화면 아래쪽 조각이 잠깐 비어 있는 것이라,
 * live 영역으로 "불러오는 중" 을 읽어 주면 얻는 것보다 방해가 크다. 내용이
 * 도착하면 그때 평범한 글로 읽힌다.
 */
export function SectionSkeleton({ height, label }: { height: string; label?: string }) {
  return (
    <div aria-hidden="true" className="pt-16" style={{ minHeight: height }}>
      {label && (
        <div className="border-b border-[var(--border)] pb-3">
          <span className="text-[15px] font-semibold text-[var(--fg-muted)]">{label}</span>
        </div>
      )}
      <div className="flex flex-col gap-3 pt-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded-xs bg-[var(--surface-2)]"
            style={{ width: `${[92, 78, 60][i]}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 가로로 늘어선 카드 줄 — 추천·최근 본 상품처럼 */
export function StripSkeleton({ height }: { height: string }) {
  return (
    <div aria-hidden="true" className="pt-16" style={{ minHeight: height }}>
      <div className="mb-6 h-5 w-40 animate-pulse rounded-xs bg-[var(--surface-2)]" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="aspect-4/5 w-[160px] shrink-0 animate-pulse rounded-sm bg-[var(--surface-2)] md:w-[200px]"
          />
        ))}
      </div>
    </div>
  );
}

/** 목록 화면(카테고리·검색)이 넘어가는 동안 */
export function GridSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <div className="flex flex-col gap-3 py-8">
        <div className="h-3 w-16 animate-pulse rounded-xs bg-[var(--surface-2)]" />
        <div className="h-7 w-56 animate-pulse rounded-xs bg-[var(--surface-2)]" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="aspect-4/5 animate-pulse rounded-sm bg-[var(--surface-2)]" />
            <div className="h-3 w-20 animate-pulse rounded-xs bg-[var(--surface-2)]" />
            <div className="h-4 w-full animate-pulse rounded-xs bg-[var(--surface-2)]" />
            <div className="h-4 w-24 animate-pulse rounded-xs bg-[var(--surface-2)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
