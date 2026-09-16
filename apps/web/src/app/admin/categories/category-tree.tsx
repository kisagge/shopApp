'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 카테고리 나무.
 *
 * **순서는 단추로 옮긴다.** 끌어다 놓기는 키보드와 낭독기에게 거의 닫힌 길이고,
 * 갈래가 열 몇 개뿐이라 위·아래 단추로 충분하다.
 *
 * 화면이 규칙을 미리 말한다 — 두 단까지, 상품이 붙은 갈래 밑에는 못 만들고, 비어
 * 있어야 지운다. 서버도 같은 것을 막지만(core 의 categoryPlacementProblem), 눌러
 * 보고 나서 알게 하지 않는다.
 */

export interface CategoryNodeView {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly productCount: number;
  readonly deletable: boolean;
  readonly children: readonly CategoryNodeView[];
}

export function CategoryTree({ tree }: { tree: readonly CategoryNodeView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, init: RequestInit, fallback: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      if (!response.ok) {
        setError(await failureMessage(response, fallback));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** 같은 부모 안에서 한 칸 옮긴다. 서버는 그 부모의 자식 전부를 받는다. */
  async function move(parentId: string | null, siblings: readonly CategoryNodeView[], from: number, to: number) {
    const ids = siblings.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    await send(
      '/api/admin/categories',
      { method: 'PATCH', body: JSON.stringify({ parentId, orderedIds: ids }) },
      '순서를 바꾸지 못했습니다.',
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <NewCategory parentId={null} label="최상위 갈래 추가" send={send} busy={busy} />

      <ul className="flex flex-col gap-3">
        {tree.map((top, index) => (
          <li key={top.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
            <Row
              node={top}
              position={index}
              total={tree.length}
              busy={busy}
              send={send}
              onMove={(to) => void move(null, tree, index, to)}
            />

            {top.children.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 border-l border-[var(--border)] pl-4">
                {top.children.map((child, childIndex) => (
                  <li key={child.id}>
                    <Row
                      node={child}
                      position={childIndex}
                      total={top.children.length}
                      busy={busy}
                      send={send}
                      onMove={(to) => void move(top.id, top.children, childIndex, to)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {/*
              **상품이 붙은 갈래 밑에는 못 만든다.** 상품은 아래 갈래가 없는 곳에만
              붙는데, 밑에 자식을 넣으면 그 상품들이 어느 쪽으로 세어도 빠진다.
              서버도 막지만 눌러 보고 나서 알게 하지 않는다.
            */}
            <div className="mt-3 pl-4">
              {top.productCount > 0 ? (
                <p className="text-[11px] text-[var(--fg-muted)]">
                  상품이 붙어 있어 하위 갈래를 만들 수 없습니다. 상품을 먼저 옮겨 주세요.
                </p>
              ) : (
                <NewCategory
                  parentId={top.id}
                  label={`${top.name} 아래 갈래 추가`}
                  send={send}
                  busy={busy}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Send = (url: string, init: RequestInit, fallback: string) => Promise<boolean>;

function Row({
  node, position, total, busy, send, onMove,
}: {
  node: CategoryNodeView;
  position: number;
  total: number;
  busy: boolean;
  send: Send;
  onMove: (to: number) => void;
}) {
  const nameId = useId();
  const slugId = useId();
  const [name, setName] = useState(node.name);
  const [slug, setSlug] = useState(node.slug);
  const changed = name !== node.name || slug !== node.slug;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send(
          `/api/admin/categories/${node.id}`,
          { method: 'PATCH', body: JSON.stringify({ name, slug }) },
          '고치지 못했습니다.',
        );
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[120px] flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-[11px] text-[var(--fg-secondary)]">
            {node.name} 이름
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          />
        </div>

        <div className="flex min-w-[120px] flex-1 flex-col gap-1">
          <label htmlFor={slugId} className="text-[11px] text-[var(--fg-secondary)]">
            {node.name} 주소
          </label>
          <input
            id={slugId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={60}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="tnum h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          />
        </div>

        <div className="flex items-center gap-1">
          {/* 끌어다 놓기 대신 단추 — 키보드와 낭독기에도 열려 있다 */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || position === 0}
            onClick={() => onMove(position - 1)}
            aria-label={`${node.name} 위로`}
          >
            ↑
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || position === total - 1}
            onClick={() => onMove(position + 1)}
            aria-label={`${node.name} 아래로`}
          >
            ↓
          </Button>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !changed}>
            저장
          </Button>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 text-[11px] text-[var(--fg-muted)]">
        <span className="tnum">상품 {node.productCount.toLocaleString('ko-KR')}</span>
        {slug !== node.slug && (
          <span role="status">
            옛 주소 <span className="tnum">/category/{node.slug}</span> 는 새 주소로 넘어갑니다.
          </span>
        )}
        {node.deletable ? (
          <DeleteButton node={node} send={send} busy={busy} />
        ) : (
          <span>상품이나 하위 갈래가 있어 지울 수 없습니다.</span>
        )}
      </p>
    </form>
  );
}

/** 지우기는 한 번 더 묻는다 — 되돌릴 수 없다 */
function DeleteButton({ node, send, busy }: { node: CategoryNodeView; send: Send; busy: boolean }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-[11px] text-[var(--fg-muted)] underline"
      >
        {node.name} 지우기
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span>지울까요?</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void send(`/api/admin/categories/${node.id}`, { method: 'DELETE' }, '지우지 못했습니다.');
        }}
        className="text-[11px] text-accent underline"
      >
        지웁니다
      </button>
      <button type="button" onClick={() => setAsking(false)} className="text-[11px] underline">
        취소
      </button>
    </span>
  );
}

function NewCategory({
  parentId, label, send, busy,
}: {
  parentId: string | null;
  label: string;
  send: Send;
  busy: boolean;
}) {
  const nameId = useId();
  const slugId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  if (!open) {
    return (
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {label}
        </Button>
      </div>
    );
  }

  return (
    <form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        void send(
          '/api/admin/categories',
          { method: 'POST', body: JSON.stringify({ name, slug, parentId }) },
          '만들지 못했습니다.',
        ).then((ok) => {
          if (!ok) return;
          setName('');
          setSlug('');
          setOpen(false);
        });
      }}
      className="flex flex-wrap items-end gap-2 rounded-sm border border-[var(--border)] p-3"
    >
      <div className="flex min-w-[120px] flex-1 flex-col gap-1">
        <label htmlFor={nameId} className="text-[11px] text-[var(--fg-secondary)]">이름</label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          required
          className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
        />
      </div>
      <div className="flex min-w-[120px] flex-1 flex-col gap-1">
        <label htmlFor={slugId} className="text-[11px] text-[var(--fg-secondary)]">
          주소 (소문자·숫자·붙임표)
        </label>
        <input
          id={slugId}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          maxLength={60}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          className="tnum h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>만들기</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
      </div>
    </form>
  );
}
