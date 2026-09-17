'use client';

import dynamic from 'next/dynamic';
import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { POLICY_KIND_LABEL, POLICY_PATH, type PolicyKind, type RichTextDoc } from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';
import { LastEdited } from '~/components/admin/last-edited';

const RichEditor = dynamic(() => import('../support/rich-editor').then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <p className="text-[13px] text-[var(--fg-muted)]">편집기를 불러오는 중…</p>,
});

const EMPTY: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };

export interface PolicyItem {
  readonly kind: PolicyKind;
  readonly title: string;
  readonly bodyRich: RichTextDoc | null;
  /** 'YYYY-MM-DD' (KST 기준). 폼이 날짜 칸으로 다룬다 */
  readonly effectiveOn: string;
  readonly updatedAt: string | null;
  /** 마지막으로 고친 때와 사람. 아직 쓰지 않은 문서면 null */
  readonly lastEdit: { readonly at: string; readonly by: string } | null;
  readonly revisionCount: number;
}

/**
 * 약관·개인정보처리방침 편집.
 *
 * **저장하면 지금 내용이 지난 방침으로 남고 새 내용이 올라간다.** 덮어쓰기가 아니라는 것을 단추 곁에 적는다 — 오타 하나를
 * 고쳐도 판이 하나 생기므로, 그 사실을 모르면 이력이 잔글씨로 채워진다.
 *
 * 시행일을 따로 받는다. 오늘 올리면서 다음 주부터 적용한다고 적을 수 있어야 하고(개인정보처리방침은 미리 알려야 한다),
 * 손님 화면은 그 날짜를 보고 "며칠 뒤부터" 를 말한다.
 */
export function PolicyEditor({ item }: { item: PolicyItem }) {
  const router = useRouter();
  const titleId = useId();
  const bodyId = useId();

  const [title, setTitle] = useState(item.title);
  const [effectiveOn, setEffectiveOn] = useState(item.effectiveOn);
  const [body, setBody] = useState<RichTextDoc>(item.bodyRich ?? EMPTY);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setStatus('');
    setFailure(null);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/policies/${item.kind}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, effectiveOn, bodyRich: body }),
      });
      if (!response.ok) {
        setFailure(await failureMessage(response, '저장하지 못했습니다.'));
        return;
      }
      setStatus('저장했습니다. 바뀌기 전 내용은 지난 방침으로 남았습니다.');
      router.refresh();
    } catch {
      setFailure('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby={`${titleId}-heading`}
      className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${titleId}-heading`} className="text-base font-semibold">
          {POLICY_KIND_LABEL[item.kind]}
        </h2>
        <p className="text-[12px] text-[var(--fg-muted)]">
          <a href={POLICY_PATH[item.kind]} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            손님 화면에서 보기
          </a>
          {item.revisionCount > 0 && <span className="ml-2 tnum">지난 방침 {item.revisionCount}개</span>}
        </p>
      </div>
      {item.lastEdit && <LastEdited at={item.lastEdit.at} by={item.lastEdit.by} />}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="제목"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Field
          label="시행일"
          type="date"
          required
          value={effectiveOn}
          onChange={(e) => setEffectiveOn(e.target.value)}
          hint="올린 날이 아니라 이 내용이 효력을 갖는 날입니다. 앞날로 적으면 손님 화면이 '며칠 뒤부터'라고 안내합니다."
        />

        <div className="flex flex-col gap-2">
          <span id={bodyId} className="text-xs font-medium text-[var(--fg-secondary)]">본문</span>
          <RichEditor value={body} onChange={setBody} labelledBy={bodyId} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="md" disabled={pending}>
            {pending ? '저장 중…' : '새 판으로 저장'}
          </Button>
          <p className="text-[12px] text-[var(--fg-muted)]">
            저장하면 지금 내용이 지난 방침으로 남습니다.
          </p>
        </div>

        {/* 늘 있는 알림 영역 — 새로 생기는 영역은 화면 낭독기가 놓친다 */}
        <p role="status" className="text-[12px] text-success">{status}</p>
        {failure && <p role="alert" className="text-[12px] text-accent">{failure}</p>}
      </form>
    </section>
  );
}
