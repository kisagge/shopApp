'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BulkShipmentResult } from '@shop/contract';
import { decodeUpload } from '~/lib/csv/decode-upload';

export interface OrderExportFilter {
  readonly status?: string | undefined;
  readonly q?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * 주문 내려받기 · 송장 일괄 올리기.
 *
 * 둘이 한 자리에 있는 이유 — **내려받은 파일이 곧 올리는 양식이다.** 따로
 * 양식을 두면 칸 이름이 어긋나고, 운영자는 주소를 한 파일에서 다른 파일로
 * 옮겨 적는다. 택배사·송장번호 칸만 채워 그대로 올리면 된다.
 */
export function OrderBulkActions({
  filter,
  canFulfill,
}: {
  filter: OrderExportFilter;
  canFulfill: boolean;
}) {
  return (
    <section aria-labelledby="bulk-heading" className="mb-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <h2 id="bulk-heading" className="text-[14px] font-semibold">내려받기 · 일괄 처리</h2>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:gap-10">
        <ExportOrders filter={filter} />
        {canFulfill && <UploadShipments />}
      </div>
    </section>
  );
}

function ExportOrders({ filter }: { filter: OrderExportFilter }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function onExport() {
    setPending(true);
    setError(null);
    setStatus('');

    // 화면의 조건을 그대로 넘긴다. 목록과 파일이 다른 주문을 담으면 안 된다
    const query = new URLSearchParams(
      Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );

    try {
      const response = await fetch(`/api/admin/orders/export?${query}`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? '내려받지 못했습니다.');
        return;
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'orders.csv';

      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // 클릭 직후 끊으면 일부 브라우저가 받기를 시작하기 전에 주소가 사라진다
      setTimeout(() => URL.revokeObjectURL(href), 1_000);

      setStatus('주문 파일을 내려받았습니다.');
    } catch {
      setError('네트워크 오류로 내려받지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <h3 className="text-[13px] font-medium text-[var(--fg-secondary)]">주문 내려받기 (CSV)</h3>
      <p className="text-[12px] text-[var(--fg-muted)]">
        지금 걸어 둔 상태·검색 조건 그대로, 상품 한 줄씩 받습니다. 받는 사람의 연락처와 주소가
        들어 있으니 쓰고 나면 지워 주세요. 받은 기록은 감사 로그에 남습니다.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={pending}
          aria-disabled={pending}
          className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-4 text-[13px] font-medium text-[var(--fg)] disabled:cursor-not-allowed disabled:text-[var(--fg-disabled)]"
        >
          {pending ? '만드는 중…' : 'CSV 내려받기'}
        </button>
        <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

function UploadShipments() {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkShipmentResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    setError(null);
    setResult(null);

    if (!file || file.size === 0) {
      setError('올릴 CSV 파일을 골라 주세요.');
      return;
    }

    setPending(true);
    try {
      const csv = decodeUpload(await file.arrayBuffer());
      const response = await fetch('/api/admin/orders/shipments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const body = (await response.json().catch(() => ({}))) as BulkShipmentResult & { message?: string };
      if (!response.ok) {
        setError(body.message ?? '송장을 올리지 못했습니다.');
        return;
      }
      setResult(body);
      formRef.current?.reset();
      if (body.registered > 0) router.refresh();
    } catch {
      setError('네트워크 오류로 올리지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className="flex min-w-0 flex-1 flex-col gap-2">
      <h3 className="text-[13px] font-medium text-[var(--fg-secondary)]">송장 일괄 등록</h3>
      <p id={hintId} className="text-[12px] text-[var(--fg-muted)]">
        내려받은 파일의 택배사·송장번호 칸을 채워 올리세요. 송장이 빈 줄은 건너뜁니다.
        배송준비 상태로 걸러 받으면 이미 보낸 주문이 섞이지 않습니다.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-xs font-medium text-[var(--fg-secondary)]">
            CSV 파일
          </label>
          <input
            ref={fileRef}
            id={inputId}
            name="file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby={hintId}
            className="max-w-full text-[13px] file:mr-3 file:h-10 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--bg)] file:px-3 file:text-[13px] file:text-[var(--fg)]"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)] disabled:cursor-not-allowed disabled:bg-[var(--bg-disabled)] disabled:text-[var(--fg-disabled)]"
        >
          {pending ? '올리는 중…' : '송장 올리기'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}

      {/* 결과 요약은 소리로도 알린다. 실패 표는 요약을 듣고 찾아 들어간다 */}
      <p aria-live="polite" className="text-[13px] text-[var(--fg-secondary)]">
        {result &&
          `${result.registered.toLocaleString('ko-KR')}건 등록` +
            (result.unchanged > 0 ? `, 이미 같은 송장 ${result.unchanged.toLocaleString('ko-KR')}건` : '') +
            (result.skipped > 0 ? `, 송장이 빈 ${result.skipped.toLocaleString('ko-KR')}줄 건너뜀` : '') +
            (result.failures.length > 0 ? `, ${result.failures.length.toLocaleString('ko-KR')}건 실패` : '')}
      </p>

      {result && result.failures.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="등록하지 못한 줄">
          <table className="w-full">
            <caption className="py-1 text-left text-[12px] text-[var(--fg-muted)]">
              등록하지 못한 줄 — 고쳐서 이 줄만 다시 올리면 됩니다
            </caption>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="px-3 py-2 text-left text-xs text-[var(--fg-secondary)]">줄</th>
                <th scope="col" className="px-3 py-2 text-left text-xs text-[var(--fg-secondary)]">주문번호</th>
                <th scope="col" className="px-3 py-2 text-left text-xs text-[var(--fg-secondary)]">사유</th>
              </tr>
            </thead>
            <tbody>
              {result.failures.map((f, index) => (
                <tr key={`${f.orderNo ?? ''}-${index}`} className="border-b border-[var(--surface-2)] last:border-0">
                  <td className="tnum px-3 py-2 text-[12px]">{f.lines.join(', ')}</td>
                  <td className="tnum px-3 py-2 text-[12px]">{f.orderNo ?? '—'}</td>
                  <td className="px-3 py-2 text-[12px]">{f.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}
