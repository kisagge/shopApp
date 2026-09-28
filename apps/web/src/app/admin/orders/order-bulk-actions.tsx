'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BulkShipmentResult, BulkDeliveryResult } from '@shop/contract';
import { decodeUpload } from '~/lib/csv/decode-upload';
import { saveResponseAsFile } from '~/lib/csv/save-download';
import { failureMessage } from '~/lib/client/failure-message';

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
  /*
   * **접어 둔다.** 펼친 채로 두었더니 좁은 화면에서 이 덩이가 473px 을 차지해, 첫 주문 줄이 919px 지점으로
   * 밀렸다 — 폰에서는 한 화면을 다 넘기고도 더 내려가야 목록이 보인다. 주문 화면을 여는 까닭은 목록을 보려는
   * 것이고, 내려받기·송장 올리기는 가끔 쓰는 도구다. 상품 목록의 좁혀 보기가 같은 이유로 접혀 있다.
   *
   * details 를 쓴다 — 여닫는 데 자바스크립트가 필요 없고 summary 는 그 자체로 낭독기가 읽는 단추다.
   */
  return (
    <details
      // 접힌 덩이에도 이름을 준다 — summary 는 여는 단추로 읽히고, 이름이 없으면 그 안이 무엇인지 안 들린다
      aria-label="내려받기 · 일괄 처리"
      className="group mb-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-[10px] text-[var(--fg-muted)] transition-transform group-open:rotate-90"
        >
          &#9654;
        </span>
        {/* 제목은 제목으로 남긴다 — 안의 h3 가 h2 없이 뜨면 제목으로 훑는 사람에게 소속이 흐려진다 */}
        <h2 className="text-[14px] font-semibold">내려받기 · 일괄 처리</h2>
      </summary>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:gap-10">
        <ExportOrders filter={filter} />
        {canFulfill && <UploadShipments />}
        {canFulfill && <UploadDeliveries />}
      </div>
    </details>
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
        setError(await failureMessage(response, '내려받지 못했습니다.'));
        return;
      }
      await saveResponseAsFile(response, 'orders.csv');

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

interface UploadFailure {
  readonly orderNo: string | null;
  readonly lines: readonly number[];
  readonly code: string;
  readonly message: string;
}

interface UploadResult {
  readonly failures: readonly UploadFailure[];
}

/**
 * CSV 를 올려 일괄 처리한다 — 송장 등록과 배송완료가 같은 모양이다.
 *
 * **둘이 하는 일은 다르지만 올리는 방식은 같다**: 내려받은 파일을 고르고, 글자로 읽어 보내고, 몇 건이
 * 됐는지 듣고, 안 된 줄을 줄 번호와 함께 표로 본다. 두 벌로 두면 한쪽만 고쳐진다 — 인코딩 처리(decodeUpload),
 * 실패 표의 모양, 결과를 소리로 알리는 자리까지 전부 같은 것이다.
 *
 * 다른 것은 **무엇을 부르고 결과를 뭐라고 말하는가**뿐이라 그것만 받는다.
 */
function CsvUpload<T extends UploadResult>({
  title, hint, endpoint, submitLabel, pendingLabel, fileLabel, failureLabel, summarize, changed,
}: {
  readonly title: string;
  readonly hint: string;
  readonly endpoint: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  /**
   * 파일 칸의 이름.
   *
   * **둘 다 "CSV 파일" 이면 안 된다.** 한 화면에 파일 칸이 둘인데 이름이 같으면, 낭독기로 훑는 사람은
   * 어느 것이 송장이고 어느 것이 배송완료인지 알 수 없다 — 올리는 순간 되돌리기 어려운 일이 일어난다.
   */
  readonly fileLabel: string;
  /** 실패 표의 이름과 설명 */
  readonly failureLabel: string;
  /** 결과를 사람의 말로. 소리로도 읽히는 줄이다 */
  readonly summarize: (result: T) => string;
  /** 목록을 다시 그려야 하는 결과인가 — 아무것도 안 바뀌었으면 화면을 흔들지 않는다 */
  readonly changed: (result: T) => boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);

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
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const body = (await response.json().catch(() => ({}))) as T & { message?: string };
      if (!response.ok) {
        setError(body.message ?? '올리지 못했습니다.');
        return;
      }
      setResult(body);
      formRef.current?.reset();
      if (changed(body)) router.refresh();
    } catch {
      setError('네트워크 오류로 올리지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className="flex min-w-0 flex-1 flex-col gap-2">
      <h3 className="text-[13px] font-medium text-[var(--fg-secondary)]">{title}</h3>
      <p id={hintId} className="text-[12px] text-[var(--fg-muted)]">{hint}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-xs font-medium text-[var(--fg-secondary)]">
            {fileLabel}
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
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}

      {/* 결과 요약은 소리로도 알린다. 실패 표는 요약을 듣고 찾아 들어간다 */}
      <p aria-live="polite" className="text-[13px] text-[var(--fg-secondary)]">
        {result && summarize(result)}
      </p>

      {result && result.failures.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={failureLabel}>
          <table className="w-full">
            <caption className="py-1 text-left text-[12px] text-[var(--fg-muted)]">
              {failureLabel} — 고쳐서 이 줄만 다시 올리면 됩니다
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

const count = (n: number) => n.toLocaleString('ko-KR');

function UploadShipments() {
  return (
    <CsvUpload<BulkShipmentResult>
      title="송장 일괄 등록"
      hint="내려받은 파일의 택배사·송장번호 칸을 채워 올리세요. 송장이 빈 줄은 건너뜁니다. 배송준비 상태로 걸러 받으면 이미 보낸 주문이 섞이지 않습니다."
      endpoint="/api/admin/orders/shipments"
      submitLabel="송장 올리기"
      pendingLabel="올리는 중…"
      fileLabel="송장 CSV 파일"
      failureLabel="등록하지 못한 줄"
      changed={(r) => r.registered > 0}
      summarize={(r) =>
        `${count(r.registered)}건 등록` +
        (r.unchanged > 0 ? `, 이미 같은 송장 ${count(r.unchanged)}건` : '') +
        (r.skipped > 0 ? `, 송장이 빈 ${count(r.skipped)}줄 건너뜀` : '') +
        (r.failures.length > 0 ? `, ${count(r.failures.length)}건 실패` : '')
      }
    />
  );
}

/**
 * 배송완료 일괄 처리.
 *
 * **송장은 한 번에 올리는데 도착 처리는 주문마다 눌러야 했다.** 그런데 배송완료일부터 시계가 돈다 —
 * 반품·교환 기한도, 자동 구매확정도, 후기를 쓸 수 있는 때도. 안 눌리면 손님은 반품 신청조차 못 한다.
 */
function UploadDeliveries() {
  return (
    <CsvUpload<BulkDeliveryResult>
      title="배송완료 일괄 처리"
      hint="배송중 상태로 걸러 내려받은 파일을 그대로 올리세요. 주문번호 칸만 봅니다. 도착한 주문만 담아 올려 주세요 — 되돌리려면 주문마다 상태를 바꿔야 합니다."
      endpoint="/api/admin/orders/deliveries"
      submitLabel="배송완료 처리"
      pendingLabel="처리하는 중…"
      fileLabel="배송완료 CSV 파일"
      failureLabel="처리하지 못한 줄"
      changed={(r) => r.delivered > 0}
      summarize={(r) =>
        `${count(r.delivered)}건 배송완료` +
        (r.merged > 0 ? `, 같은 주문 ${count(r.merged)}줄 묶음` : '') +
        (r.failures.length > 0 ? `, ${count(r.failures.length)}건 실패` : '')
      }
    />
  );
}
