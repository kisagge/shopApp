'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { CollectionCard } from './collection-card';
import type { CollectionItem, PickedProduct } from './types';

export function CollectionEditor({ initial }: { initial: readonly CollectionItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<readonly CollectionItem[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function send<T>(key: string, url: string, init: RequestInit): Promise<T | null> {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      if (response.status === 204) return {} as T;
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'message' in data
            ? (data as { message?: unknown }).message
            : undefined;
        setError(typeof message === 'string' ? message : '처리하지 못했습니다.');
        return null;
      }
      return data as T;
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    // 주소는 유일해야 하므로 겹치지 않을 값으로 만들어 두고 고치게 한다
    const slug = `collection-${Date.now().toString(36)}`;
    const data = await send<Omit<CollectionItem, 'products'>>('create', '/api/admin/collections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, title: '새 기획전', isActive: false, tone: 'sand' }),
    });
    if (!data) return;
    setItems([...items, { ...data, products: [] }]);
    setStatus('기획전을 추가했습니다. 상품을 담고 주소를 정한 뒤 노출을 켜 주세요.');
    router.refresh();
  }

  function replace(id: string, patch: Partial<CollectionItem>) {
    setItems(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function save(id: string, body: Record<string, unknown>) {
    const data = await send<Omit<CollectionItem, 'products'>>(
      `patch-${id}`,
      `/api/admin/collections/${id}`,
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!data) return;
    replace(id, data);
    setStatus('저장했습니다.');
    router.refresh();
  }

  async function saveProducts(id: string, products: readonly PickedProduct[]) {
    const data = await send<Omit<CollectionItem, 'products'>>(
      `items-${id}`,
      `/api/admin/collections/${id}/items`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productIds: products.map((p) => p.id) }),
      },
    );
    if (!data) return;
    replace(id, { ...data, products });
    setStatus(`상품 ${products.length}개로 저장했습니다.`);
    router.refresh();
  }

  async function remove(item: CollectionItem) {
    const data = await send<unknown>(`del-${item.id}`, `/api/admin/collections/${item.id}`, {
      method: 'DELETE',
    });
    if (!data) return;
    setItems(items.filter((c) => c.id !== item.id));
    setStatus('기획전을 삭제했습니다.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-[var(--fg-muted)]">
          담긴 상품이 하나도 없거나 모두 내려간 기획전은 손님 화면에 나오지 않습니다.
        </p>
        <Button type="button" size="md" onClick={() => create()} disabled={busy !== null}>
          기획전 추가
        </Button>
      </div>

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}

      {items.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
          기획전이 없습니다. 추가하면 /collections 에 나옵니다.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <CollectionCard
                item={item}
                busy={busy !== null}
                onSave={(body) => save(item.id, body)}
                onSaveProducts={(products) => saveProducts(item.id, products)}
                onDelete={() => remove(item)}
                onUploaded={(updated) => {
                  replace(item.id, updated);
                  setStatus('배경 이미지를 바꿨습니다.');
                  router.refresh();
                }}
              />
            </li>
          ))}
        </ol>
      )}

      <p aria-live="polite" className="sr-only">{status}</p>
    </div>
  );
}
