'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field } from '@shop/ui';
import {
  BANNER_TONE, BANNER_TONE_LABEL, BANNER_STATUS_LABEL,
  MAX_COLLECTION_ITEMS, type BannerTone,
} from '@shop/core';

export interface PickedProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly imageUrl: string | null;
  readonly onDisplay: boolean;
}

export interface CollectionItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly tone: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly status: string;
  readonly itemCount: number;
  readonly products: readonly PickedProduct[];
}

const TONE_CLASS: Record<string, string> = {
  sand: 'bg-ph-sand', stone: 'bg-ph-stone', clay: 'bg-ph-clay',
  olive: 'bg-ph-olive', mist: 'bg-ph-mist',
};

const STATUS_TONE: Record<string, 'success' | 'info' | 'neutral' | 'danger'> = {
  LIVE: 'success', SCHEDULED: 'info', ENDED: 'neutral', PAUSED: 'danger',
};

/** datetime-local 입력이 쓰는 'YYYY-MM-DDTHH:mm' 로 (KST 기준) */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

/** 입력값은 KST 로 읽고 UTC ISO 로 되돌린다 */
function fromLocalInput(value: string): string | null {
  return value ? new Date(`${value}:00+09:00`).toISOString() : null;
}

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

function CollectionCard({
  item, busy, onSave, onSaveProducts, onDelete, onUploaded,
}: {
  item: CollectionItem;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onSaveProducts: (products: readonly PickedProduct[]) => void;
  onDelete: () => void;
  onUploaded: (item: Partial<CollectionItem>) => void;
}) {
  const [form, setForm] = useState({
    slug: item.slug,
    title: item.title,
    subtitle: item.subtitle ?? '',
    description: item.description ?? '',
    tone: item.tone as BannerTone,
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toneId = useId();
  const startId = useId();
  const endId = useId();
  const fileId = useId();

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError('이미지 파일을 선택해 주세요.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('alt', form.title);
      const response = await fetch(`/api/admin/collections/${item.id}/image`, {
        method: 'POST',
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        setUploadError(typeof data?.message === 'string' ? data.message : '올리지 못했습니다.');
        return;
      }
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(data);
    } catch {
      setUploadError('네트워크 오류로 올리지 못했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5">
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 미리보기 — 손님 화면에서 어떻게 보일지 */}
        <div
          className={`relative flex h-40 w-full shrink-0 items-end overflow-hidden rounded-sm lg:w-72 ${
            item.imageUrl ? 'bg-[var(--surface-2)]' : (TONE_CLASS[item.tone] ?? 'bg-ph-sand')
          }`}
        >
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt={item.imageAlt ?? ''}
              fill
              sizes="(min-width: 1024px) 288px, 100vw"
              className="object-cover"
            />
          )}
          <div className="relative z-10 flex flex-col gap-1 px-4 pb-4">
            <span className="font-serif text-[17px] leading-tight font-medium text-n-900">
              {item.title}
            </span>
            <span className="text-[10px] text-n-700">/collection/{item.slug}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>
                {BANNER_STATUS_LABEL[item.status as keyof typeof BANNER_STATUS_LABEL] ?? item.status}
              </Badge>
              <span className="text-[11px] text-[var(--fg-muted)]">
                상품 <span className="tnum">{item.products.length}</span>개
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button" size="sm"
                variant={item.isActive ? 'secondary' : 'primary'}
                disabled={busy} onClick={() => onSave({ isActive: !item.isActive })}
              >
                {item.isActive ? '노출 중지' : '노출 시작'}
              </Button>
              <Button
                type="button" size="sm" variant="danger"
                aria-label={`${item.title} 기획전 삭제`}
                disabled={busy} onClick={onDelete}
              >
                삭제
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="제목" value={form.title} required
              onChange={(e) => set('title', e.target.value)} maxLength={60} />
            <Field label="주소" value={form.slug}
              onChange={(e) => set('slug', e.target.value)} maxLength={60}
              placeholder="winter-outer"
              hint="영소문자·숫자·하이픈만. /collection/<주소> 로 열립니다" />
          </div>

          <Field label="부제 (선택)" value={form.subtitle}
            onChange={(e) => set('subtitle', e.target.value)} maxLength={120} />

          <Field label="설명 (선택)" value={form.description}
            onChange={(e) => set('description', e.target.value)} maxLength={600} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label htmlFor={toneId} className="text-xs font-medium text-[var(--fg-secondary)]">
                배경 톤
              </label>
              <select
                id={toneId} value={form.tone}
                onChange={(e) => set('tone', e.target.value as BannerTone)}
                className="h-12 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm"
              >
                {BANNER_TONE.map((t) => (
                  <option key={t} value={t}>{BANNER_TONE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={startId} className="text-xs font-medium text-[var(--fg-secondary)]">
                시작 (선택)
              </label>
              <input id={startId} type="datetime-local" value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
                className="h-12 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={endId} className="text-xs font-medium text-[var(--fg-secondary)]">
                종료 (선택)
              </label>
              <input id={endId} type="datetime-local" value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
                className="h-12 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--surface-2)] pt-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={fileId} className="text-xs font-medium text-[var(--fg-secondary)]">
                배경 이미지 (선택)
              </label>
              <input ref={fileRef} id={fileId} type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="text-[12px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-n-300 file:bg-[var(--bg)] file:px-3 file:text-[12px]" />
            </div>
            <Button type="button" size="md" variant="secondary" disabled={uploading} onClick={() => upload()}>
              {uploading ? '올리는 중…' : '이미지 교체'}
            </Button>

            <Button
              type="button" size="md" disabled={busy} className="ml-auto"
              onClick={() =>
                onSave({
                  slug: form.slug.trim(),
                  title: form.title,
                  subtitle: form.subtitle.trim() || null,
                  description: form.description.trim() || null,
                  tone: form.tone,
                  startsAt: fromLocalInput(form.startsAt),
                  endsAt: fromLocalInput(form.endsAt),
                })
              }
            >
              내용 저장
            </Button>
          </div>

          {uploadError && <p role="alert" className="text-[12px] text-accent">{uploadError}</p>}
        </div>
      </div>

      <ProductPicker
        picked={item.products}
        busy={busy}
        onSave={onSaveProducts}
      />
    </div>
  );
}

/**
 * 담긴 상품 편집.
 *
 * **순서 자체가 편집이다.** 그래서 위아래로 옮기는 길을 두고, 저장은 통째로
 * 한 번에 한다 — 하나씩 넣고 빼면 순서를 바꿀 때마다 요청이 나가고, 중간에
 * 하나가 실패하면 화면과 저장된 순서가 갈라진다.
 */
function ProductPicker({
  picked, busy, onSave,
}: {
  picked: readonly PickedProduct[];
  busy: boolean;
  onSave: (products: readonly PickedProduct[]) => void;
}) {
  const [list, setList] = useState<readonly PickedProduct[]>(picked);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<readonly PickedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchId = useId();

  const dirty =
    list.length !== picked.length || list.some((p, i) => p.id !== picked[i]?.id);

  async function search() {
    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/collections/candidates?q=${encodeURIComponent(term)}`,
      );
      if (!response.ok) return;
      const data: { products: PickedProduct[] } = await response.json();
      setFound(data.products);
    } catch {
      // 후보를 못 받아도 이미 담긴 것은 그대로 편집할 수 있다
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
        <p className="text-[12px] text-[var(--fg-muted)]">
          아직 담긴 상품이 없습니다. 담기 전에는 손님 화면에 나오지 않습니다.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
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
                onClick={() => setList(list.filter((x) => x.id !== p.id))}
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
            className="h-11 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm"
          />
        </div>
        <Button type="button" size="md" variant="secondary" disabled={searching} onClick={() => search()}>
          {searching ? '찾는 중…' : '찾기'}
        </Button>
      </div>

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
                <Button
                  type="button" size="sm" variant="ghost"
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
