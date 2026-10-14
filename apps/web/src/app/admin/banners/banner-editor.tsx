'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field } from '@shop/ui';
import {
  BANNER_TONE, BANNER_TONE_LABEL, BANNER_STATUS_LABEL, MAX_IMAGE_BYTES, type BannerTone,
} from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';

/** 화면에 적는 상한. 서버가 거절하는 기준과 같은 값에서 나온다 */
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / 1024 / 1024;

export interface BannerItem {
  readonly id: string;
  readonly eyebrow: string | null;
  readonly headline: string;
  readonly subcopy: string | null;
  readonly ctaLabel: string | null;
  readonly href: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly tone: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly status: string;
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
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

/** 입력값은 KST 로 읽고 UTC ISO 로 되돌린다 */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}:00+09:00`).toISOString();
}

export function BannerEditor({ initial }: { initial: readonly BannerItem[] }) {
  const router = useRouter();
  const [banners, setBanners] = useState<readonly BannerItem[]>(initial);
  /*
   * 지우기 버튼은 자기 줄과 함께 사라진다. 챙기지 않으면 초점이 body 로
   * 떨어져, 여럿을 정리하려면 탭으로 문서 맨 앞부터 매번 다시 내려와야 한다.
   */
  const { listRef, emptyRef, rememberRemoval } = useRemovalFocus(banners.length);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  /**
   * 요청 하나를 보내고 결과를 돌려준다. 실패하면 화면에 사유를 띄우고 null.
   *
   * 응답 모양이 호출마다 달라 (배너 하나 / 배너 목록 / 삭제 확인) 제네릭으로
   * 받는다. any 로 두면 setBanners 에 아무 값이나 넣어도 조용히 통과한다.
   */
  async function send<T>(key: string, url: string, init: RequestInit): Promise<T | null> {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      /*
       * 앞단이 502 HTML 을 주면 `json()` 이 던진다. 그대로 두면 아래 catch 가 받아
       * **서버가 답했는데 "네트워크 오류" 라고 적는다** — `failureMessage` 가 겪고 생긴 일이다.
       */
      if (!response.ok) {
        setError(await failureMessage(response, '처리하지 못했습니다.'));
        return null;
      }
      return (await response.json()) as T;
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const data = await send<BannerItem>('create', '/api/admin/banners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ headline: '새 배너', isActive: false, tone: 'sand' }),
    });
    if (!data) return;
    setBanners([...banners, data]);
    setStatus('배너를 추가했습니다. 내용을 채운 뒤 노출을 켜 주세요.');
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const data = await send<BannerItem>(`patch-${id}`, `/api/admin/banners/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!data) return;
    setBanners(banners.map((b) => (b.id === id ? data : b)));
    setStatus('저장했습니다.');
    router.refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    const next = [...banners];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;

    const data = await send<{ banners: BannerItem[] }>('order', '/api/admin/banners', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((x) => x.id) }),
    });
    if (!data) return;
    setBanners(data.banners);
    setStatus(`${a.headline} 을(를) ${target + 1}번째로 옮겼습니다.`);
    router.refresh();
  }

  async function remove(banner: BannerItem) {
    const data = await send<{ ok: boolean }>(`del-${banner.id}`, `/api/admin/banners/${banner.id}`, {
      method: 'DELETE',
    });
    if (!data) return;
    setBanners(banners.filter((b) => b.id !== banner.id));
    setStatus('배너를 삭제했습니다.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-[var(--fg-muted)]">
          위에 있는 배너가 홈에서 먼저 나옵니다. 노출 중인 배너가 하나면 캐러셀 조작 장치는 그리지 않습니다.
        </p>
        <Button type="button" size="md" onClick={() => create()} disabled={busy !== null || banners.length >= 6}>
          {banners.length >= 6 ? '6개까지' : '배너 추가'}
        </Button>
      </div>

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}

      {banners.length === 0 ? (
        <p
          ref={emptyRef as React.RefObject<HTMLParagraphElement>}
          tabIndex={-1}
          role="status" className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
          배너가 없습니다. 추가하면 홈 최상단에 노출됩니다.
        </p>
      ) : (
        <ol ref={listRef as React.RefObject<HTMLOListElement>} className="flex flex-col gap-4">
          {banners.map((banner, index) => (
            <li key={banner.id}>
              <BannerCard
                banner={banner}
                index={index}
                total={banners.length}
                busy={busy !== null}
                toneClass={TONE_CLASS[banner.tone] ?? 'bg-ph-sand'}
                statusTone={STATUS_TONE[banner.status] ?? 'neutral'}
                onSave={(body) => patch(banner.id, body)}
                onMove={(dir) => move(index, dir)}
                onDelete={() => {
                  rememberRemoval(index);
                  void remove(banner);
                }}
                onUploaded={(updated) => {
                  setBanners(banners.map((b) => (b.id === updated.id ? updated : b)));
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

function BannerCard({
  banner, index, total, busy, toneClass, statusTone, onSave, onMove, onDelete, onUploaded,
}: {
  banner: BannerItem;
  index: number;
  total: number;
  busy: boolean;
  toneClass: string;
  statusTone: 'success' | 'info' | 'neutral' | 'danger';
  onSave: (body: Record<string, unknown>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onUploaded: (banner: BannerItem) => void;
}) {
  const [form, setForm] = useState({
    eyebrow: banner.eyebrow ?? '',
    headline: banner.headline,
    subcopy: banner.subcopy ?? '',
    ctaLabel: banner.ctaLabel ?? '',
    href: banner.href ?? '',
    tone: banner.tone as BannerTone,
    startsAt: toLocalInput(banner.startsAt),
    endsAt: toLocalInput(banner.endsAt),
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headlineId = useId();
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
     * 기다렸다가 거절을 보는 셈이고, 그동안 화면은 '올리는 중…' 이다. 상한은 core 가 쥔다.
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
      body.append('alt', form.headline);
      const response = await fetch(`/api/admin/banners/${banner.id}/image`, { method: 'POST', body });
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
    <div className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 lg:flex-row">
      {/* 미리보기 — 홈에서 어떻게 보일지 */}
      <div className={`relative flex h-40 w-full shrink-0 items-center overflow-hidden rounded-sm lg:w-72 ${banner.imageUrl ? 'bg-[var(--surface-2)]' : toneClass}`}>
        {banner.imageUrl && (
          <Image
            src={banner.imageUrl}
            alt={banner.imageAlt ?? ''}
            fill
            // 좁은 화면에서는 폭 전체, lg 부터는 288px(w-72)
            sizes="(min-width: 1024px) 288px, 100vw"
            className="object-cover"
          />
        )}
        <div className="relative z-10 flex flex-col gap-1 px-4">
          {banner.eyebrow && (
            <span className="text-[9px] font-medium tracking-[0.16em] text-n-700">{banner.eyebrow}</span>
          )}
          <span className="font-serif text-[17px] leading-tight font-medium whitespace-pre-line text-n-900">
            {banner.headline}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--fg-muted)]">{index + 1}번째</span>
            <Badge tone={statusTone}>
              {BANNER_STATUS_LABEL[banner.status as keyof typeof BANNER_STATUS_LABEL] ?? banner.status}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button" size="sm" variant="ghost"
              aria-label={`${index + 1}번째 배너를 앞으로`}
              disabled={index === 0 || busy} onClick={() => onMove(-1)}
            >
              <span aria-hidden="true">↑</span>
            </Button>
            <Button
              type="button" size="sm" variant="ghost"
              aria-label={`${index + 1}번째 배너를 뒤로`}
              disabled={index === total - 1 || busy} onClick={() => onMove(1)}
            >
              <span aria-hidden="true">↓</span>
            </Button>
            <Button
              type="button" size="sm" variant={banner.isActive ? 'secondary' : 'primary'}
              disabled={busy} onClick={() => onSave({ isActive: !banner.isActive })}
            >
              {banner.isActive ? '노출 중지' : '노출 시작'}
            </Button>
            <RemoveBanner
              headline={banner.headline}
              position={index + 1}
              busy={busy}
              onConfirm={onDelete}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="윗줄 (선택)" value={form.eyebrow}
            onChange={(e) => set('eyebrow', e.target.value)} maxLength={40}
            placeholder="EDITORIAL · 01" />
          <div className="flex flex-col gap-2">
            <label htmlFor={headlineId} className="text-xs font-medium text-[var(--fg-secondary)]">
              제목
              <span className="ml-1 text-accent" aria-hidden="true">*</span>
              <span className="sr-only"> (필수)</span>
            </label>
            {/* 줄바꿈이 조판의 일부라 textarea 로 받는다 */}
            <textarea
              id={headlineId} required value={form.headline} rows={2} maxLength={60}
              onChange={(e) => set('headline', e.target.value)}
              className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3.5 py-3 text-sm"
            />
            <p className="text-[11px] text-[var(--fg-muted)]">줄바꿈이 그대로 반영됩니다</p>
          </div>
        </div>

        <Field label="설명 (선택)" value={form.subcopy}
          onChange={(e) => set('subcopy', e.target.value)} maxLength={200} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="버튼 문구 (선택)" value={form.ctaLabel}
            onChange={(e) => set('ctaLabel', e.target.value)} maxLength={20}
            placeholder="기획전 보기" />
          <Field label="링크" value={form.href}
            onChange={(e) => set('href', e.target.value)} maxLength={200}
            placeholder="/category/outer"
            hint="내부 경로만 넣을 수 있습니다" />
        </div>

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
            type="button" size="md" disabled={busy}
            className="ml-auto"
            onClick={() =>
              onSave({
                eyebrow: form.eyebrow.trim() || null,
                headline: form.headline,
                subcopy: form.subcopy.trim() || null,
                ctaLabel: form.ctaLabel.trim() || null,
                href: form.href.trim() || null,
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
  );
}


/**
 * 배너 지우기 — **한 번 더 묻는다.**
 *
 * 첫 누름에 바로 지우고 있었다. 지워지는 것은 **홈 최상단에 떠 있는 것**이고, 바로 옆이
 * '노출 중지' 와 위·아래 단추라 손이 미끄러지기 쉬운 자리다. 이 저장소의 다른 지우기들
 * (갈래·상품 사진·주문 취소·문의·리뷰)은 전부 한 번 더 묻는다.
 *
 * **무엇을 지우는지도 말한다.** 이름표가 "3번째 배너 삭제" 뿐이라, 낭독기로 듣는 사람은
 * 순번만 알고 눌렀다.
 */
function RemoveBanner({
  headline, position, busy, onConfirm,
}: {
  headline: string;
  position: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const what = headline.trim() === '' ? `${position}번째 배너` : headline;

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
        data-remove-row=""
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
