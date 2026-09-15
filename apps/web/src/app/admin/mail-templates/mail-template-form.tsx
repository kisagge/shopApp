'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { checkTemplateText, type MailTemplateField, type MailTemplateKind } from '@shop/core';
import { describeTemplateProblem } from '~/lib/notifications/template-problems';

const FIELDS: readonly { key: MailTemplateField; label: string; multiline: boolean }[] = [
  { key: 'subject', label: '제목', multiline: false },
  { key: 'heading', label: '머리말', multiline: false },
  { key: 'lead', label: '첫 문장', multiline: true },
];

type Wording = Record<MailTemplateField, string>;

/**
 * 메일 한 종류·한 말의 문구.
 *
 * **미리보기는 실제로 보내는 코드가 만든다**(서버의 previewMail) — 화면에서 흉내 내 그리면 실제 메일과 어긋나도 모른다.
 * 미리보기는 격리한 틀(sandbox iframe)에 넣는다: 메일 HTML 이 운영 화면의 스타일·스크립트와 섞이지 않게.
 *
 * 칸을 비우면 기본 문구다. 기본 문구는 칸 안에 흐리게(placeholder) 보여 준다 — 무엇이 나가는지 알고 고치게.
 */
export function MailTemplateForm({
  kind, locale, title, defaults, saved, params, max,
}: {
  kind: MailTemplateKind;
  locale: string;
  title: string;
  defaults: Readonly<Wording>;
  saved: Readonly<Record<MailTemplateField, string | null>>;
  params: Readonly<Record<MailTemplateField, readonly { name: string; label: string }[]>>;
  max: Readonly<Record<MailTemplateField, number>>;
}) {
  const router = useRouter();
  const baseId = useId();
  const [values, setValues] = useState<Wording>({ subject: saved.subject ?? '', heading: saved.heading ?? '', lead: saved.lead ?? '' });
  const [pending, setPending] = useState<'save' | 'preview' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const problems = Object.fromEntries(
    FIELDS.map(({ key }) => [
      key,
      values[key].trim() === '' ? [] : checkTemplateText(values[key], params[key].map((p) => p.name), max[key]),
    ]),
  ) as Record<MailTemplateField, ReturnType<typeof checkTemplateText>>;
  const invalid = FIELDS.some(({ key }) => problems[key].length > 0);
  const payload = (w: Wording) => ({
    kind, locale,
    subject: w.subject.trim() || null, heading: w.heading.trim() || null, lead: w.lead.trim() || null,
  });

  async function send(action: 'save' | 'preview' | 'reset') {
    setPending(action);
    setError(null);
    setStatus('');
    const body = action === 'reset' ? payload({ subject: '', heading: '', lead: '' }) : payload(values);
    try {
      const response = await fetch(action === 'preview' ? '/api/admin/mail-templates/preview' : '/api/admin/mail-templates', {
        method: action === 'preview' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; subject?: string; html?: string };
      if (!response.ok) {
        setError(data.message ?? '처리하지 못했습니다.');
        return;
      }
      if (action === 'preview') {
        setPreview({ subject: data.subject ?? '', html: data.html ?? '' });
        setStatus('미리보기를 만들었습니다.');
        return;
      }
      if (action === 'reset') setValues({ subject: '', heading: '', lead: '' });
      setStatus(action === 'reset' ? '기본 문구로 되돌렸습니다.' : '저장했습니다.');
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(null);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invalid) void send('save');
  }

  const hasSaved = saved.subject !== null || saved.heading !== null || saved.lead !== null;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={onSubmit} aria-labelledby={`${baseId}-title`} className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5">
        <h2 id={`${baseId}-title`} className="text-[15px] font-semibold">
          {title} <span className="text-[11px] font-normal text-[var(--fg-muted)]">{hasSaved ? '고친 문구' : '기본 문구'}</span>
        </h2>

        {FIELDS.map(({ key, label, multiline }) => {
          const id = `${baseId}-${key}`;
          const hintId = `${id}-hint`;
          const problemId = `${id}-problems`;
          const bad = problems[key].length > 0;
          const common = {
            id,
            value: values[key],
            placeholder: defaults[key],
            maxLength: max[key],
            onChange: (e: { target: { value: string } }) => {
              setValues((prev) => ({ ...prev, [key]: e.target.value }));
              setStatus('');
            },
            'aria-invalid': bad ? true : undefined,
            'aria-describedby': bad ? `${hintId} ${problemId}` : hintId,
            className: 'rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] leading-relaxed',
          } as const;
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-[12px] font-medium text-[var(--fg-secondary)]">{label}</label>
              {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
              <p id={hintId} className="text-[11px] text-[var(--fg-muted)]">
                비우면 기본 문구.{' '}
                {params[key].length === 0
                  ? '끼울 수 있는 값이 없습니다.'
                  : <>쓸 수 있는 값: {params[key].map((p, i) => <span key={p.name}>{i > 0 && ', '}<code>{`{${p.name}}`}</code> {p.label}</span>)}</>}
              </p>
              {bad && (
                <ul id={problemId} className="text-[12px] text-accent">
                  {problems[key].map((p) => <li key={p.kind}>{describeTemplateProblem(p)}</li>)}
                </ul>
              )}
            </div>
          );
        })}

        {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending !== null || invalid} className="h-9 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)] disabled:bg-[var(--bg-disabled)] disabled:text-[var(--fg-disabled)]">
            {pending === 'save' ? '저장 중…' : '저장'}
          </button>
          <button type="button" onClick={() => void send('preview')} disabled={pending !== null || invalid} className="h-9 rounded-sm border border-[var(--border-strong)] px-4 text-[13px] disabled:text-[var(--fg-disabled)]">
            {pending === 'preview' ? '만드는 중…' : '미리보기'}
          </button>
          {hasSaved && (
            <button type="button" onClick={() => void send('reset')} disabled={pending !== null} className="h-9 px-3 text-[13px] text-[var(--fg-secondary)] underline underline-offset-2">
              모두 기본 문구로
            </button>
          )}
          <p role="status" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
        </div>
      </form>

      <section aria-labelledby={`${baseId}-preview-title`} className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5">
        <h2 id={`${baseId}-preview-title`} className="text-[15px] font-semibold">미리보기 (예시 주문·상품)</h2>
        {preview ? (
          <>
            <dl className="text-[13px]">
              <dt className="text-[11px] text-[var(--fg-muted)]">제목</dt>
              <dd data-testid="mail-preview-subject">{preview.subject}</dd>
            </dl>
            {/* 메일 HTML 은 격리한 틀에 — 스크립트를 막고 운영 화면 스타일과 섞지 않는다 */}
            <iframe title={`${title} 메일 미리보기`} sandbox="" srcDoc={preview.html} className="h-[520px] w-full rounded-sm border border-[var(--border)] bg-white" />
          </>
        ) : (
          <p className="text-[13px] text-[var(--fg-muted)]">"미리보기" 를 누르면 실제로 보내는 모양대로 만듭니다. 저장하지 않은 문구로도 볼 수 있습니다.</p>
        )}
      </section>
    </div>
  );
}
