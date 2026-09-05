/**
 * 상품 화면으로 넘어가는 동안.
 *
 * 이 파일이 있으면 Next 가 화면을 Suspense 로 감싸 **머리와 껍데기를 먼저
 * 보낸다.** 없으면 서버가 상품을 다 읽을 때까지 브라우저는 이전 화면에
 * 그대로 멈춰 있고, 누른 사람은 눌리지 않은 줄 안다.
 *
 * 모양은 실제 화면의 자리를 그대로 잡는다 — 도착했을 때 튀지 않게.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <div className="h-14" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_452px] lg:gap-10">
        <div className="aspect-4/5 animate-pulse rounded-md bg-[var(--surface-2)] lg:aspect-auto lg:h-[700px]" />
        <div className="flex flex-col gap-5">
          <div className="h-3 w-24 animate-pulse rounded-xs bg-[var(--surface-2)]" />
          <div className="h-7 w-3/4 animate-pulse rounded-xs bg-[var(--surface-2)]" />
          <div className="h-9 w-40 animate-pulse rounded-xs bg-[var(--surface-2)]" />
          <div className="h-px bg-[var(--border)]" />
          <div className="h-4 w-52 animate-pulse rounded-xs bg-[var(--surface-2)]" />
          <div className="h-4 w-64 animate-pulse rounded-xs bg-[var(--surface-2)]" />
          <div className="mt-4 h-12 w-full animate-pulse rounded-sm bg-[var(--surface-2)]" />
        </div>
      </div>
    </div>
  );
}
