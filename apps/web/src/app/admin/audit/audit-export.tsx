'use client';

import { useState } from 'react';
import { saveResponseAsFile } from '~/lib/csv/save-download';
import { failureMessage } from '~/lib/client/failure-message';

export interface AuditExportFilter {
  readonly action?: string | undefined;
  readonly targetType?: string | undefined;
  readonly actor?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * 감사 로그 내려받기.
 *
 * **적용된 조건 그대로** 받는다 — 폼에 고쳐 적고 아직 "적용" 을 안 누른 값이 아니라 주소에 걸린 값이다. 화면에 보이는
 * 목록과 파일이 같은 기록이어야 한다.
 */
export function AuditExport({ filter }: { filter: AuditExportFilter }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function onExport() {
    setPending(true);
    setError(null);
    setStatus('');
    const query = new URLSearchParams(
      Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    try {
      const response = await fetch(`/api/admin/audit/export?${query}`, { method: 'POST' });
      if (!response.ok) {
        setError(await failureMessage(response, '내려받지 못했습니다.'));
        return;
      }
      await saveResponseAsFile(response, 'audit.csv');
      setStatus('감사 로그를 내려받았습니다.');
    } catch {
      setError('네트워크 오류로 내려받지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={pending}
          aria-describedby="audit-export-hint"
          className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-4 text-[13px] font-medium text-[var(--fg)] disabled:cursor-not-allowed disabled:text-[var(--fg-disabled)]"
        >
          {pending ? '만드는 중…' : 'CSV 내려받기'}
        </button>
      </div>
      <p id="audit-export-hint" className="text-[11px] text-[var(--fg-muted)]">
        적용된 조건의 기록을 받습니다. 받은 기록도 감사 로그에 남습니다.
      </p>
      {error && <p role="alert" className="text-[13px] text-accent">{error}</p>}
    </div>
  );
}
