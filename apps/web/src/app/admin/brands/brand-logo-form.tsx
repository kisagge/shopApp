'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 브랜드 로고 올리기·바꾸기·떼기.
 *
 * **매장은 로고를 그리는데 올리는 곳이 없었다.** 브랜드 화면 머리에 로고 자리가 있지만
 * 쓰는 코드가 없어서 모든 브랜드가 이름만 떴다.
 *
 * 매장에서 로고는 이름 옆의 **작은 네모**(56px)로 뜬다 — 여기 미리보기도 같은 크기로
 * 보여 준다. 크게 보면 괜찮은데 작게 줄이면 뭉개지는 로고가 흔하다.
 *
 * 저장소가 설정되지 않았으면 올리는 칸을 잠그고 까닭을 말한다(상품 사진과 같다).
 */
export function BrandLogoForm({
  brandId, brandName, logoUrl, storageConfigured,
}: {
  brandId: string;
  brandName: string;
  logoUrl: string | null;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const fileId = useId();
  const hintId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('로고 파일을 골라 주세요.');
      return;
    }
    const body = new FormData();
    body.append('file', file);

    setBusy('upload');
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/admin/brands/${brandId}/logo`, { method: 'POST', body });
      if (!response.ok) {
        setError(await failureMessage(response, '로고를 올리지 못했습니다.'));
        return;
      }
      setStatus(logoUrl ? '로고를 바꿨습니다. 매장 브랜드 화면에 곧 반영됩니다.' : '로고를 올렸습니다. 매장 브랜드 화면에 곧 반영됩니다.');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch {
      setError('네트워크 오류로 올리지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/admin/brands/${brandId}/logo`, { method: 'DELETE' });
      if (!response.ok) {
        setError(await failureMessage(response, '로고를 떼지 못했습니다.'));
        return;
      }
      setStatus('로고를 뗐습니다. 매장에는 이름만 뜹니다.');
      router.refresh();
    } catch {
      setError('네트워크 오류로 떼지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--surface-2)] pt-4">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <span className="relative block size-14 shrink-0 overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--surface)]">
            <Image src={logoUrl} alt={`${brandName} 로고`} fill sizes="56px" className="object-cover" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-dashed border-[var(--border-strong)] text-[10px] text-[var(--fg-muted)]"
          >
            없음
          </span>
        )}
        <p className="text-[12px] text-[var(--fg-secondary)]">
          {logoUrl ? '매장 브랜드 화면에서 이름 옆에 이 크기로 뜹니다.' : '로고가 없어 매장에는 이름만 뜹니다.'}
        </p>
      </div>

      {!storageConfigured && (
        <p role="alert" className="rounded-sm border border-warning bg-warning-soft px-3 py-2 text-[12px] text-warning">
          이미지 저장소가 설정되지 않아 로고를 올릴 수 없습니다.
          <code className="mx-1">S3_BUCKET</code> 등 환경변수를 확인해 주세요.
        </p>
      )}

      <form onSubmit={(e) => void upload(e)} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label htmlFor={fileId} className="text-[11px] text-[var(--fg-secondary)]">
            {brandName} 로고 파일
          </label>
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-describedby={hintId}
            disabled={!storageConfigured || busy !== null}
            className="text-[12px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--bg)] file:px-3 file:text-[12px]"
          />
          <p id={hintId} className="text-[11px] text-[var(--fg-muted)]">
            JPEG · PNG · WebP · AVIF, 5MB 이하. 정사각형이 가장 잘 맞습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={!storageConfigured || busy !== null}>
            {busy === 'upload' ? '올리는 중…' : logoUrl ? '로고 바꾸기' : '로고 올리기'}
          </Button>
          {logoUrl && (
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove()}>
              {busy === 'remove' ? '떼는 중…' : '로고 떼기'}
            </Button>
          )}
        </div>
      </form>

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
      <p role="status" className="text-[12px] text-success">{status}</p>
    </div>
  );
}
