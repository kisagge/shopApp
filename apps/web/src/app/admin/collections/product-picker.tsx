'use client';

import { useId, useState } from 'react';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { Badge, Button } from '@shop/ui';
import { MAX_COLLECTION_ITEMS } from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';
import type { PickedProduct } from './types';

/**
 * 담긴 상품 편집.
 *
 * **순서 자체가 편집이다.** 그래서 위아래로 옮기는 길을 두고, 저장은 통째로
 * 한 번에 한다 — 하나씩 넣고 빼면 순서를 바꿀 때마다 요청이 나가고, 중간에
 * 하나가 실패하면 화면과 저장된 순서가 갈라진다.
 */
export function ProductPicker({
  picked, busy, onSave,
}: {
  picked: readonly PickedProduct[];
  busy: boolean;
  onSave: (products: readonly PickedProduct[]) => void;
}) {
  const [list, setList] = useState<readonly PickedProduct[]>(picked);
  /*
   * 빼기 버튼은 자기 줄과 함께 사라진다. 챙기지 않으면 초점이 body 로
   * 떨어져, 여럿을 빼려면 탭으로 문서 맨 앞부터 다시 내려와야 한다.
   */
  const { listRef, emptyRef, rememberRemoval } = useRemovalFocus(list.length);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<readonly PickedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailure, setSearchFailure] = useState<string | null>(null);
  /** 한 번이라도 찾아봤는가. "아직 안 찾음" 과 "찾았는데 없음" 은 다른 말이다 */
  const [searched, setSearched] = useState(false);
  const searchId = useId();

  const dirty =
    list.length !== picked.length || list.some((p, i) => p.id !== picked[i]?.id);

  /**
   * 상품 찾기.
   *
   * **셋을 똑같은 침묵으로 답하고 있었다** — 찾은 것이 없을 때, 서버가 거절할 때, 길이 끊길
   * 때. 후보 칸은 하나라도 있어야 그려지므로 어느 쪽이든 화면이 그대로다. 끊긴 자리에는
   * "후보를 못 받아도 이미 담긴 것은 편집할 수 있다" 고 적어 두었는데, 그건 맞지만 **누른
   * 사람이 왜 아무 일도 안 일어났는지 모른다는 문제에는 답하지 않는다.**
   *
   * **빈 말로는 찾지 않는다.** 같은 창구를 쓰는 다른 두 화면(쿠폰 대상·쿠폰 지급)은 그렇게
   * 하고 까닭도 적어 두었다 — 열자마자 전체 명단이 뜨면 고르는 화면이 아니라 명단을 훑는
   * 화면이 된다. 여기만 빈 말을 그대로 보내고 있었다.
   */
  async function search() {
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    setSearchFailure(null);
    try {
      // 쿠폰 대상 지정과 같은 창구를 쓴다 — 같은 일이라 두 벌로 두지 않는다
      const response = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) {
        setSearchFailure(await failureMessage(response, '상품을 찾지 못했습니다.'));
        return;
      }
      const data: { products: PickedProduct[] } = await response.json();
      setFound(data.products);
      setSearched(true);
    } catch {
      // 못 받아도 이미 담긴 것은 그대로 편집할 수 있다 — 다만 왜 안 됐는지는 말한다
      setSearchFailure('네트워크 오류로 상품을 찾지 못했습니다.');
    } finally {
      setSearching(false);
    }
  }

  function add(product: PickedProduct) {
    if (list.some((p) => p.id === product.id)) return;
    if (list.length >= MAX_COLLECTION_ITEMS) return;
    setList([...list, product]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setList(next);
  }

  return (
    <section
      aria-label="담긴 상품"
      className="flex flex-col gap-3 border-t border-[var(--surface-2)] pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-[var(--fg-secondary)]">
          담긴 상품 <span className="tnum">{list.length}</span> / {MAX_COLLECTION_ITEMS}
        </h3>
        <Button
          type="button" size="sm"
          disabled={busy || !dirty}
          onClick={() => onSave(list)}
        >
          {dirty ? '상품 저장' : '저장됨'}
        </Button>
      </div>

      {list.length === 0 ? (
        <p
          ref={emptyRef as React.RefObject<HTMLParagraphElement>}
          tabIndex={-1}
          role="status"
          className="text-[12px] text-[var(--fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
        >
          아직 담긴 상품이 없습니다. 담기 전에는 손님 화면에 나오지 않습니다.
        </p>
      ) : (
        <ol ref={listRef as React.RefObject<HTMLOListElement>} className="flex flex-col gap-1.5">
          {list.map((p, index) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-sm bg-[var(--surface)] px-3 py-2"
            >
              <span className="tnum w-5 text-[11px] text-[var(--fg-muted)]">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {p.name}
                <span className="ml-2 text-[11px] text-[var(--fg-muted)]">{p.brandName}</span>
              </span>
              {/* 담긴 채로 내려간 상품은 어드민에서 감추지 않고 표시한다 */}
              {!p.onDisplay && <Badge tone="neutral">내려감</Badge>}
              <Button
                type="button" size="sm" variant="ghost"
                aria-label={`${p.name} 을(를) 앞으로`}
                disabled={index === 0} onClick={() => move(index, -1)}
              >
                <span aria-hidden="true">↑</span>
              </Button>
              <Button
                type="button" size="sm" variant="ghost"
                aria-label={`${p.name} 을(를) 뒤로`}
                disabled={index === list.length - 1} onClick={() => move(index, 1)}
              >
                <span aria-hidden="true">↓</span>
              </Button>
              <Button
                type="button" size="sm" variant="ghost"
                aria-label={`${p.name} 빼기`}
                data-remove-row=""
                onClick={() => {
                  // 빼는 순간 이 버튼도 사라진다. 어느 자리였는지 먼저 기억한다.
                  rememberRemoval(index);
                  setList(list.filter((x) => x.id !== p.id));
                }}
              >
                빼기
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <label htmlFor={searchId} className="text-xs font-medium text-[var(--fg-secondary)]">
            상품 찾기
          </label>
          <input
            id={searchId} type="search" value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // 이 칸은 폼 안에 있다 — 엔터로 화면이 통째로 보내지지 않게 막는다
                e.preventDefault();
                void search();
              }
            }}
            placeholder="상품명 · 브랜드"
            className="h-11 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
          />
        </div>
        <Button type="button" size="md" variant="secondary" disabled={searching} onClick={() => search()}>
          {searching ? '찾는 중…' : '찾기'}
        </Button>
      </div>

      {searchFailure && (
        <p role="alert" className="text-[12px] text-accent">{searchFailure}</p>
      )}
      {/* 찾았는데 없는 것과 아직 안 찾은 것은 다른 말이다 */}
      {searched && !searchFailure && found.length === 0 && (
        <p className="text-[12px] text-[var(--fg-muted)]">
          그 이름으로 찾은 상품이 없습니다. 다른 말로 찾아 보세요.
        </p>
      )}

      {found.length > 0 && (
        <ul className="flex flex-col gap-1">
          {found.map((p) => {
            const already = list.some((x) => x.id === p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fg-secondary)]">
                  {p.name}
                  <span className="ml-2 text-[11px] text-[var(--fg-muted)]">{p.brandName}</span>
                </span>
                {!p.onDisplay && <Badge tone="neutral">내려감</Badge>}
                {/*
                  **어느 상품의 단추인지 이름에 넣는다.** 후보가 스물이면 낭독기에는 "담기" 가
                  스무 번 들린다 — 위의 ↑↓·빼기는 이미 이름을 넣고 있었고 여기만 빠져 있었다.
                */}
                <Button
                  type="button" size="sm" variant="ghost"
                  aria-label={already ? `${p.name} 담김` : `${p.name} 담기`}
                  disabled={already || list.length >= MAX_COLLECTION_ITEMS}
                  onClick={() => add(p)}
                >
                  {already ? '담김' : '담기'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
