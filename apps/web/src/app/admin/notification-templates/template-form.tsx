'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { checkTemplate, renderTemplate, type NotificationKind } from '@shop/core';
import { describeTemplateProblem } from '~/lib/notifications/template-problems';

/**
 * 알림 한 종류의 문구.
 *
 * **적는 대로 미리 본다** — 예시 값을 끼운 문장을 옆에 보여 준다. 저장하고 알림을 하나 만들어 봐야 틀린 줄 알면
 * 아무도 고치지 않는다. 문제는 저장 전에 글로 알리고, 서버도 같은 검사(core checkTemplate)로 다시 막는다.
 *
 * 기본 문구로 되돌리기는 **줄을 지우는 것**이다 — 기본 문구를 복사해 저장하면 나중에 사전을 고쳐도 이 종류만 옛 말로 남는다.
 */
export function TemplateForm({
  kind,
  locale,
  title,
  where,
  defaultBody,
  customBody,
  updatedAt,
  params,
  sample,
}: {
  kind: NotificationKind;
  locale: string;
  title: string;
  where: string;
  defaultBody: string;
  customBody: string | null;
  updatedAt: string | null;
  params: readonly { name: string; label: string }[];
  sample: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const ids = { heading: useId(), body: useId(), hint: useId(), problems: useId(), preview: useId() };
  const [body, setBody] = useState(customBody ?? defaultBody);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const problems = checkTemplate(kind, body);
  const preview = problems.length === 0 ? renderTemplate(body.trim(), sample) : null;
  const unchanged = body.trim() === (customBody ?? defaultBody);

  async function send(next: string | null) {
    setPending(true);
    setError(null);
    setStatus('');
    try {
      const response = await fetch('/api/admin/notification-templates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, locale, body: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '저장하지 못했습니다.');
        return;
      }
      if (next === null) setBody(defaultBody);
      setStatus(next === null ? '기본 문구로 되돌렸습니다.' : '저장했습니다.');
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problems.length > 0) return;
    void send(body);
  }

  return (
    <section aria-labelledby={ids.heading} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={ids.heading} className="text-[15px] font-semibold">
          {title} <span className="text-[11px] font-normal text-[var(--fg-muted)]">{kind}</span>
        </h2>
        {/* 고친 문구인지 글로 적는다 — 색 점 하나로는 안 읽힌다 */}
        <p className="text-[11px] text-[var(--fg-secondary)]">
          {where} · {customBody === null ? '기본 문구' : '고친 문구'}
          {updatedAt && (
            <>
              {' · '}
              <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
            </>
          )}
        </p>
      </div>

      <form onSubmit={onSubmit} aria-labelledby={ids.heading} className="flex flex-col gap-2">
        <label htmlFor={ids.body} className="text-[12px] font-medium text-[var(--fg-secondary)]">
          문구
        </label>
        <textarea
          id={ids.body}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setStatus('');
          }}
          rows={2}
          aria-invalid={problems.length > 0 ? true : undefined}
          aria-describedby={`${ids.hint}${problems.length > 0 ? ` ${ids.problems}` : ''}`}
          className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] leading-relaxed"
        />
        <p id={ids.hint} className="text-[11px] text-[var(--fg-muted)]">
          쓸 수 있는 값:{' '}
          {params.map((p, i) => (
            <span key={p.name}>
              {i > 0 && ', '}
              <code>{`{${p.name}}`}</code> {p.label}
            </span>
          ))}
        </p>
        {problems.length > 0 && (
          <ul id={ids.problems} className="text-[12px] text-accent">
            {problems.map((p) => (
              <li key={p.kind}>{describeTemplateProblem(p)}</li>
            ))}
          </ul>
        )}

        <div className="rounded-sm bg-[var(--surface)] px-3 py-2">
          <p id={ids.preview} className="text-[10px] font-semibold text-[var(--fg-muted)]">미리보기 (예시 값)</p>
          <output aria-labelledby={ids.preview} className="block text-[13px]">
            {preview ?? '—'}
          </output>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending || problems.length > 0 || unchanged}
            className="h-9 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)] disabled:bg-[var(--bg-disabled)] disabled:text-[var(--fg-disabled)]"
          >
            {pending ? '저장 중…' : '저장'}
          </button>
          {customBody !== null && (
            <button
              type="button"
              onClick={() => void send(null)}
              disabled={pending}
              className="h-9 rounded-sm border border-[var(--border-strong)] px-4 text-[13px] text-[var(--fg)] disabled:text-[var(--fg-disabled)]"
            >
              기본 문구로
            </button>
          )}
          <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
        </div>
        {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
      </form>
    </section>
  );
}
