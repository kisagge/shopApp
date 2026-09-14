'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { decodeUpload } from '~/lib/csv/decode-upload';

interface Failure {
  readonly sku: string;
  readonly lines: readonly number[];
  readonly message: string;
}

interface Result {
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly failures: readonly Failure[];
}

const n = (value: number) => value.toLocaleString('ko-KR');

/**
 * 재고 내려받기 · 일괄 수정.
 *
 * **내려받은 파일이 곧 올리는 양식이다.** 창고 실사를 엑셀에 맞춰 적는 것이 보통이라, 재고 칸의
 * 숫자만 고쳐 그대로 올리면 된다. 받은 뒤 오래 들고 있으면 그 사이 팔린 만큼이 되살아나므로,
 * 실사 직전에 받으라고 적어 둔다.
 */
export function StockBulkActions({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const ids = { heading: useId(), file: useId(), hint: useId() };
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    setStatus('');
    try {
      const response = await fetch('/api/admin/products/stock/export');
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? '내려받지 못했습니다.');
        return;
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'stock.csv';
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1_000);
      setStatus('재고 파일을 내려받았습니다.');
    } catch {
      setError('네트워크 오류로 내려받지 못했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    setError(null);
    setResult(null);
    if (!file || file.size === 0) {
      setError('올릴 CSV 파일을 골라 주세요.');
      return;
    }
    setUploading(true);
    try {
      const response = await fetch('/api/admin/products/stock/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: decodeUpload(await file.arrayBuffer()) }),
      });
      const body = (await response.json().catch(() => ({}))) as Result & { message?: string };
      if (!response.ok) {
        setError(body.message ?? '재고를 올리지 못했습니다.');
        return;
      }
      setResult(body);
      formRef.current?.reset();
      if (body.updated > 0) router.refresh();
    } catch {
      setError('네트워크 오류로 올리지 못했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby={ids.heading} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <h2 id={ids.heading} className="text-[14px] font-semibold">재고 내려받기 · 일괄 수정</h2>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[12px] text-[var(--fg-muted)]">
            옵션마다 SKU·판매 여부·지금 재고가 한 줄씩 들어 있습니다. 실사 직전에 받아 주세요 — 받은 뒤 팔린
            수량은 파일에 없어서, 오래된 파일을 올리면 그만큼이 되살아납니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void download()}
              disabled={downloading}
              aria-disabled={downloading}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-4 text-[13px] font-medium text-[var(--fg)] disabled:cursor-not-allowed disabled:text-[var(--fg-disabled)]"
            >
              {downloading ? '만드는 중…' : '재고 CSV 내려받기'}
            </button>
            <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
          </div>
        </div>

        {canWrite && (
          <form ref={formRef} onSubmit={(e) => void upload(e)} className="flex min-w-0 flex-1 flex-col gap-2">
            <p id={ids.hint} className="text-[12px] text-[var(--fg-muted)]">
              내려받은 파일의 재고(와 판매) 칸을 고쳐 올리세요. 재고 칸이 빈 줄과 값이 그대로인 줄은 건너뜁니다.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.file} className="text-xs font-medium text-[var(--fg-secondary)]">재고 CSV 파일</label>
                <input
                  ref={fileRef}
                  id={ids.file}
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  aria-describedby={ids.hint}
                  className="max-w-full text-[13px] file:mr-3 file:h-10 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--bg)] file:px-3 file:text-[13px] file:text-[var(--fg)]"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                aria-disabled={uploading}
                className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)] disabled:cursor-not-allowed disabled:bg-[var(--bg-disabled)] disabled:text-[var(--fg-disabled)]"
              >
                {uploading ? '올리는 중…' : '재고 올리기'}
              </button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-accent">{error}</p>
      )}

      <p aria-live="polite" className="mt-3 text-[13px] text-[var(--fg-secondary)]">
        {result &&
          `${n(result.updated)}개 수정` +
            (result.unchanged > 0 ? `, 값이 같은 ${n(result.unchanged)}개` : '') +
            (result.skipped > 0 ? `, 재고 칸이 빈 ${n(result.skipped)}줄 건너뜀` : '') +
            (result.failures.length > 0 ? `, ${n(result.failures.length)}건 실패` : '')}
      </p>

      {result && result.failures.length > 0 && (
        <div className="table-scroll mt-2" tabIndex={0} role="region" aria-label="고치지 못한 줄">
          <table className="w-full">
            <caption className="py-1 text-left text-[12px] text-[var(--fg-muted)]">
              고치지 못한 줄 — 고쳐서 이 줄만 다시 올리면 됩니다
            </caption>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="px-3 py-2 text-left text-xs text-[var(--fg-secondary)]">줄</th>
                <th scope="col" className="px-3 py-2 text-left text-xs text-[var(--fg-secondary)]">SKU</th>
                <th scope="col" className="px-3 py-2 text-left text-xs text-[var(--fg-secondary)]">사유</th>
              </tr>
            </thead>
            <tbody>
              {result.failures.map((f, index) => (
                <tr key={`${f.sku}-${index}`} className="border-b border-[var(--surface-2)] last:border-0">
                  <td className="tnum px-3 py-2 text-[12px]">{f.lines.join(', ')}</td>
                  <td className="tnum px-3 py-2 text-[12px]">{f.sku}</td>
                  <td className="px-3 py-2 text-[12px]">{f.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
