'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { useRouter } from 'next/navigation';
import {
  INQUIRY_TOPIC, SUPPORT_POST_KIND, topicRequired,
  SUPPORT_TITLE_MAX_LENGTH,
  type InquiryTopic, type RichTextDoc, type SupportPostKind,
} from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { TOPIC_KEY } from '~/lib/i18n/support';

/**
 * 편집기는 **열어 볼 때 받아 온다.**
 *
 * TipTap 과 ProseMirror 는 이 화면에서만 쓰는데 무게가 만만치 않다. 같은
 * 묶음에 넣으면 공지를 고치러 오지 않은 사람도 그 무게를 치른다 — 운영
 * 화면의 무게 상한(bundle-budget-admin)을 두고 있는 이유다.
 *
 * `ssr: false` 인 이유는 편집기가 DOM 을 직접 만지기 때문이다. 서버에서 한 번
 * 그리면 하이드레이션이 어긋난다.
 */
const RichEditor = dynamic(() => import('./rich-editor').then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <div className="min-h-60 rounded-sm border border-[var(--border-strong)] bg-[var(--surface)]" />,
});

/** 편집기가 빈 문서로 여기는 모양 */
const emptyDoc = (): RichTextDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });

/**
 * 서식 없이 쓰인 옛 글을 편집기에 올린다.
 *
 * 나무가 없는 행은 평문뿐이다. 그대로 두면 고치러 들어온 사람에게 빈 편집기가
 * 보이고, 저장하는 순간 본문이 사라진다. 줄바꿈으로 끊어 문단으로 만든다.
 */
const docFrom = (bodyRich: RichTextDoc | null, body: string): RichTextDoc => {
  if (bodyRich) return bodyRich;
  const paragraphs = body.split('\n').map((line) =>
    line.length === 0
      ? { type: 'paragraph' as const }
      : { type: 'paragraph' as const, content: [{ type: 'text' as const, text: line }] },
  );
  return { type: 'doc', content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }] };
};

export interface SupportPostItem {
  readonly id: string;
  readonly kind: SupportPostKind;
  readonly title: string;
  readonly body: string;
  readonly bodyRich: RichTextDoc | null;
  readonly topic: InquiryTopic | null;
  readonly pinned: boolean;
  readonly sortOrder: number;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  readonly authorName: string | null;
}

const KIND_LABEL: Record<SupportPostKind, string> = { NOTICE: '공지', FAQ: 'FAQ' };

interface Draft {
  kind: SupportPostKind;
  title: string;
  bodyRich: RichTextDoc;
  topic: InquiryTopic | null;
  pinned: boolean;
  sortOrder: number;
  published: boolean;
}

const emptyDraft = (): Draft => ({
  kind: 'NOTICE',
  title: '',
  bodyRich: emptyDoc(),
  topic: null,
  pinned: false,
  sortOrder: 0,
  published: false,
});

const draftOf = (post: SupportPostItem): Draft => ({
  kind: post.kind,
  title: post.title,
  bodyRich: docFrom(post.bodyRich, post.body),
  topic: post.topic,
  pinned: post.pinned,
  sortOrder: post.sortOrder,
  published: post.publishedAt !== null,
});

/**
 * 공지와 FAQ 를 **한 화면에서** 관리한다.
 *
 * 담는 것이 같아 표를 하나로 두었으므로 화면도 하나면 된다. 갈래만 종류에
 * 따라 나타났다 사라진다 — FAQ 에는 있어야 하고 공지에는 없어야 한다는
 * 규칙을 core 가 정하고, 이 화면은 그것을 따른다.
 */
export function SupportEditor({ initial }: { initial: readonly SupportPostItem[] }) {
  const router = useRouter();
  const t = useT();
  const formId = useId();

  /*
   * 내리기 버튼은 자기 줄과 함께 사라진다. 다만 여기는 지운 뒤 서버에서
   * 목록을 다시 받아 오므로(router.refresh) 줄이 사라지는 시점이 한 박자
   * 늦다 — 훅이 목록 길이를 보고 있어 그때 초점을 옮긴다.
   */
  const { listRef, emptyRef, rememberRemoval } = useRemovalFocus(initial.length);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const needsTopic = topicRequired(draft.kind);

  function startNew() {
    setEditing(null);
    setDraft(emptyDraft());
    setError(null);
  }

  function startEdit(post: SupportPostItem) {
    setEditing(post.id);
    setDraft(draftOf(post));
    setError(null);
  }

  async function send(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? '저장하지 못했습니다.');
        return false;
      }
      return true;
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...draft,
      // 공지에 갈래를 실어 보내면 계약이 거절한다
      topic: needsTopic ? draft.topic : null,
    };
    const ok = editing
      ? await send(`/api/admin/support/${editing}`, 'PUT', payload)
      : await send('/api/admin/support', 'POST', payload);

    if (!ok) return;
    setNotice(editing ? '수정했습니다.' : '등록했습니다.');
    startNew();
    router.refresh();
  }

  async function remove(post: SupportPostItem) {
    if (!window.confirm(`"${post.title}" 을(를) 내릴까요?`)) return;
    if (!(await send(`/api/admin/support/${post.id}`, 'DELETE'))) return;
    setNotice('내렸습니다.');
    if (editing === post.id) startNew();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <form
        onSubmit={(event) => void submit(event)}
        className="flex w-full shrink-0 flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-6 lg:w-[420px]"
      >
        <h2 className="text-[15px] font-semibold">{editing ? '글 수정' : '새 글'}</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-kind`} className="text-[12px] text-[var(--fg-muted)]">
            종류
          </label>
          <select
            id={`${formId}-kind`}
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as SupportPostKind;
              // 종류를 바꾸면 갈래도 규칙에 맞게 따라간다
              setDraft((d) => ({
                ...d,
                kind,
                topic: topicRequired(kind) ? (d.topic ?? 'DELIVERY') : null,
              }));
            }}
            className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
          >
            {SUPPORT_POST_KIND.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {needsTopic && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-topic`} className="text-[12px] text-[var(--fg-muted)]">
              갈래
            </label>
            <select
              id={`${formId}-topic`}
              value={draft.topic ?? 'DELIVERY'}
              onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value as InquiryTopic }))}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
            >
              {INQUIRY_TOPIC.map((topic) => (
                <option key={topic} value={topic}>
                  {t(TOPIC_KEY[topic])}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-title`} className="text-[12px] text-[var(--fg-muted)]">
            {draft.kind === 'FAQ' ? '질문' : '제목'}
          </label>
          <input
            id={`${formId}-title`}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            required
            maxLength={SUPPORT_TITLE_MAX_LENGTH}
            className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {/*
            편집기는 `<textarea>` 가 아니라 `contenteditable` 이라 `<label for>`
            가 안 붙는다. 이름표를 id 로 주고 편집 영역이 자기를 가리키게 한다.
          */}
          <span id={`${formId}-body`} className="text-[12px] text-[var(--fg-muted)]">
            {draft.kind === 'FAQ' ? '답변' : '내용'}
          </span>
          <RichEditor
            key={editing ?? 'new'}
            value={draft.bodyRich}
            onChange={(bodyRich) => setDraft((d) => ({ ...d, bodyRich }))}
            labelledBy={`${formId}-body`}
          />
        </div>

        {draft.kind === 'NOTICE' ? (
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
              className="h-4 w-4"
            />
            목록 맨 위에 고정
          </label>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-order`} className="text-[12px] text-[var(--fg-muted)]">
              순서 (작을수록 위)
            </label>
            <input
              id={`${formId}-order`}
              type="number"
              min={0}
              max={9999}
              value={draft.sortOrder}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
              className="tnum h-10 w-24 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))}
            className="h-4 w-4"
          />
          지금 내보내기
        </label>

        {error && (
          <p role="alert" className="text-[13px] text-accent">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="h-11 flex-1 rounded-sm bg-[var(--brand)] text-[13px] font-medium text-[var(--bg)] disabled:opacity-40"
          >
            {editing ? '수정' : '등록'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={startNew}
              className="h-11 rounded-sm border border-[var(--border-strong)] px-4 text-[13px]"
            >
              취소
            </button>
          )}
        </div>
      </form>

      <div className="min-w-0 flex-1">
        {/* 저장 결과는 눈에만 보이면 안 된다 */}
        <p role="status" className="sr-only">
          {notice}
        </p>

        {initial.length === 0 ? (
          <p
            ref={emptyRef as React.RefObject<HTMLParagraphElement>}
            tabIndex={-1}
            role="status" className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-20 text-center text-[13px] text-[var(--fg-muted)]">
            아직 등록한 글이 없습니다.
          </p>
        ) : (
          <ul ref={listRef as React.RefObject<HTMLUListElement>} className="flex list-none flex-col gap-2 p-0">
            {initial.map((post, index) => (
              <li
                key={post.id}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="text-[14px] font-medium">
                    <span className="mr-2 rounded-xs bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-semibold">
                      {KIND_LABEL[post.kind]}
                    </span>
                    {post.title}
                  </h3>
                  <p className="flex items-center gap-2 text-[12px] text-[var(--fg-muted)]">
                    {post.pinned && <span>고정</span>}
                    {post.topic && <span>{t(TOPIC_KEY[post.topic])}</span>}
                    <span className={post.publishedAt ? 'text-success' : 'text-accent'}>
                      {post.publishedAt ? '게시중' : '초안'}
                    </span>
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    className="h-9 rounded-sm border border-[var(--border-strong)] px-3 text-[12px]"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    data-remove-row=""
                    onClick={() => {
                      rememberRemoval(index);
                      void remove(post);
                    }}
                    disabled={pending}
                    className="h-9 rounded-sm border border-[var(--border-strong)] px-3 text-[12px] text-accent disabled:opacity-40"
                  >
                    내리기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
