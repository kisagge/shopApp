'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { Badge, Button, Field } from '@shop/ui';
import {
  BANNER_TONE, BANNER_TONE_LABEL, BANNER_STATUS_LABEL, MAX_IMAGE_BYTES, type BannerTone,
} from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';
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

/** 화면에 적는 상한. 서버가 거절하는 기준과 같은 값에서 나온다 */
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / 1024 / 1024;

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
    /*
     * **올리기 전에 잰다.** 서버는 `MAX_IMAGE_BYTES` 로 거절하는데 화면은 재지 않아서,
     * 20MB 짜리를 고르면 그것을 통째로 올린 뒤에야 거절당했다 — 느린 회선에서는 몇 분을
     * 기다렸다가 거절을 보는 셈이고, 그동안 화면은 '올리는 중…' 이다. 상품 사진·홈 배너가
     * 같은 처방을 받았다.
     */
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(`이미지는 ${MAX_IMAGE_MB}MB 를 넘을 수 없습니다. 고른 파일은 ${(file.size / 1024 / 1024).toFixed(1)}MB 입니다.`);
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
      // 실패한 응답은 먼저 가린다 — 502 가 HTML 을 주면 json() 이 던져 "네트워크 오류" 로 샌다
      if (!response.ok) {
        setUploadError(await failureMessage(response, '올리지 못했습니다.'));
        return;
      }
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(await response.json());
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
          {/*
            **어느 기획전의 칸인지 제목으로 밝힌다.** 이 목록은 카드마다 같은 모양의 폼이라, 제목이 없으면
            낭독기로 훑을 때 지금 보는 것이 무엇인지 알 수 없다. 제목 칸(Field)은 고치는 자리이지 이름이
            아니다. 그리고 이 제목이 있어야 아래 "담긴 상품"(h3)이 단계를 건너뛰지 않는다 — 화면의 제목은
            h1(기획전) 하나뿐이었다.
          */}
          <h2 className="sr-only">{item.title}</h2>
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
              <RemoveCollection title={item.title} busy={busy} onConfirm={onDelete} />
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
                className="h-12 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
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
                className="h-12 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={endId} className="text-xs font-medium text-[var(--fg-secondary)]">
                종료 (선택)
              </label>
              <input id={endId} type="datetime-local" value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
                className="h-12 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--surface-2)] pt-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={fileId} className="text-xs font-medium text-[var(--fg-secondary)]">
                배경 이미지 (선택)
              </label>
              <input ref={fileRef} id={fileId} type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="text-[12px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--bg)] file:px-3 file:text-[12px]" />
              {/* 상한을 고르기 전에 말한다 — 올리고 나서 거절당하면 그 시간이 그대로 버려진다 */}
              <p className="text-[11px] text-[var(--fg-muted)]">
                JPEG · PNG · WebP · AVIF, {MAX_IMAGE_MB}MB 이하
              </p>
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
 * 기획전 지우기 — **한 번 더 묻는다.**
 *
 * 첫 누름에 바로 지우고 있었다. 담아 둔 상품 목록과 문구·사진이 함께 사라지고 되돌릴 길이
 * 없는데, 바로 옆이 '노출 중지' 다 — 내리려다 지우기 쉬운 자리다. 이 저장소의 다른 지우기들
 * (갈래·상품 사진·배너·배송지·주문 취소·문의·리뷰)은 전부 묻는다.
 */
function RemoveCollection({
  title, busy, onConfirm,
}: {
  title: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const what = title.trim() === '' ? '이 기획전' : `${title} 기획전`;

  if (!asking) {
    return (
      <Button
        type="button" size="sm" variant="danger"
        aria-label={`${what} 삭제`}
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        삭제
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span>지울까요?</span>
      <Button
        type="button" size="sm" variant="danger"
        aria-label={`${what} 삭제 확인`}
        disabled={busy}
        onClick={onConfirm}
      >
        지웁니다
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
        취소
      </Button>
    </span>
  );
}
