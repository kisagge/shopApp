'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { Badge, Button, Field } from '@shop/ui';
import {
  BANNER_TONE, BANNER_TONE_LABEL, BANNER_STATUS_LABEL, type BannerTone,
} from '@shop/core';
import { ProductPicker } from './product-picker';
import type { CollectionItem, PickedProduct } from './types';

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

export function CollectionCard({
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

