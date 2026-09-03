import { carrierOf, formatTrackingNumber, trackingUrlFor } from '@shop/core';

/**
 * 고객에게 보이는 배송 조회.
 *
 * **송장번호를 늘 글자로 보여 준다.** 조회 링크는 택배사 사정으로 바뀔 수
 * 있고, 링크만 두면 그때 고객은 아무것도 할 수 없다. 번호가 있으면 택배사
 * 사이트에 직접 넣어 볼 수 있다.
 *
 * 번호는 4자리씩 끊어 보여 준다. 옮겨 적을 때 훨씬 덜 틀린다.
 */
export function TrackingPanel({
  carrier,
  trackingNumber,
  shippedAt,
}: {
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
}) {
  if (!carrier || !trackingNumber) return null;

  const name = carrierOf(carrier)?.name ?? carrier;
  const url = trackingUrlFor(carrier, trackingNumber);

  return (
    <section
      aria-labelledby="tracking-title"
      className="rounded-sm border border-[var(--border)] p-4"
    >
      <h2 id="tracking-title" className="mb-3 text-sm font-semibold">
        배송 조회
      </h2>

      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">택배사</dt>
          <dd className="text-[13px]">{name}</dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">송장번호</dt>
          <dd className="tnum text-[13px] font-medium select-all">
            {formatTrackingNumber(trackingNumber)}
          </dd>
        </div>
        {shippedAt && (
          <div className="flex items-baseline gap-3">
            <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">출고</dt>
            <dd className="tnum text-[13px] text-[var(--fg-secondary)]">
              {shippedAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </dd>
          </div>
        )}
      </dl>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3.5 inline-flex h-10 items-center rounded-sm border border-[var(--border)] px-4 text-[13px] font-medium text-[var(--fg)] no-underline hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          {/* 새 창으로 열린다는 것을 이름에 넣는다. 갑자기 창이 바뀌면 놀란다. */}
          {name}에서 조회
          <span className="sr-only"> (새 창)</span>
          <span aria-hidden="true" className="ml-1.5 text-[var(--fg-muted)]">
            ↗
          </span>
        </a>
      ) : (
        <p className="mt-3 text-[12px] text-[var(--fg-muted)]">
          택배사 사이트에서 위 송장번호로 조회해 주세요.
        </p>
      )}
    </section>
  );
}
