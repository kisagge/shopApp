'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { MAX_IMAGES_PER_PRODUCT } from '@shop/core';

export interface ImageRow {
  readonly id: string;
  readonly url: string;
  readonly alt: string;
  readonly sortOrder: number;
}

/**
 * 상품 이미지 관리.
 *
 * 순서를 드래그가 아니라 **위/아래 버튼**으로 바꾼다. 드래그는 키보드로
 * 쓸 수 없고 터치에서도 스크롤과 싸운다. 버튼이면 탭으로 짚어 엔터로 옮길 수
 * 있고, 옮긴 결과를 aria-live 로 알려 줄 수 있다.
 */
export function ImageManager({
  productId,
  initial,
  storageConfigured,
}: {
  productId: string;
  initial: readonly ImageRow[];
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [images, setImages] = useState<readonly ImageRow[]>(initial);
  const [alts, setAlts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((i) => [i.id, i.alt])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();

  const full = images.length >= MAX_IMAGES_PER_PRODUCT;

  function apply(next: readonly ImageRow[]) {
    setImages(next);
    setAlts(Object.fromEntries(next.map((i) => [i.id, i.alt])));
  }

  async function send(
    key: string,
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown> | null> {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(typeof data['message'] === 'string' ? data['message'] : '처리하지 못했습니다.');
        return null;
      }
      return data;
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('이미지 파일을 선택해 주세요.');
      return;
    }

    const body = new FormData();
    body.append('file', file);

    const data = await send('upload', `/api/admin/products/${productId}/images`, {
      method: 'POST',
      body,
    });
    if (!data) return;

    apply([...images, data as unknown as ImageRow]);
    setStatus(`이미지를 추가했습니다. 현재 ${images.length + 1}장.`);
    if (fileRef.current) fileRef.current.value = '';
    router.refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;

    const next = [...images];
    const moved = next[index];
    const swapped = next[target];
    if (!moved || !swapped) return;
    next[index] = swapped;
    next[target] = moved;

    const data = await send('order', `/api/admin/products/${productId}/images`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((i) => i.id) }),
    });
    if (!data) return;

    apply(data['images'] as ImageRow[]);
    setStatus(`${moved.alt} 을(를) ${target + 1}번째로 옮겼습니다.`);
    router.refresh();
  }

  async function saveAlt(image: ImageRow) {
    const alt = alts[image.id]?.trim() ?? '';
    if (alt === image.alt) return;

    const data = await send(`alt-${image.id}`, `/api/admin/products/${productId}/images/${image.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alt }),
    });
    if (!data) return;

    apply(images.map((i) => (i.id === image.id ? (data as unknown as ImageRow) : i)));
    setStatus('대체 텍스트를 저장했습니다.');
    router.refresh();
  }

  async function remove(image: ImageRow) {
    const data = await send(`del-${image.id}`, `/api/admin/products/${productId}/images/${image.id}`, {
      method: 'DELETE',
    });
    if (!data) return;

    apply(data['images'] as ImageRow[]);
    setStatus('이미지를 삭제했습니다.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {!storageConfigured && (
        <p role="alert" className="rounded-sm border border-warning bg-warning-soft px-4 py-3 text-[12px] text-warning">
          이미지 저장소가 설정되지 않아 업로드할 수 없습니다.
          <code className="mx-1">S3_BUCKET</code> 등 환경변수를 확인해 주세요.
        </p>
      )}

      {images.length === 0 ? (
        <p className="text-[13px] text-[var(--fg-muted)]">
          등록된 이미지가 없습니다. 첫 번째 이미지가 목록의 대표 이미지가 됩니다.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="flex gap-3 rounded-sm border border-[var(--border)] p-3"
            >
              <img
                src={image.url}
                alt={image.alt}
                width={72}
                height={90}
                loading="lazy"
                decoding="async"
                className="h-[90px] w-[72px] shrink-0 rounded-xs bg-[var(--surface-2)] object-cover"
              />

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-[11px] text-[var(--fg-muted)]">
                  {index === 0 ? '대표 이미지' : `${index + 1}번째`}
                </p>

                <label className="sr-only" htmlFor={`alt-${image.id}`}>
                  {index + 1}번째 이미지 대체 텍스트
                </label>
                <input
                  id={`alt-${image.id}`}
                  value={alts[image.id] ?? ''}
                  onChange={(e) => setAlts((prev) => ({ ...prev, [image.id]: e.target.value }))}
                  onBlur={() => saveAlt(image)}
                  maxLength={200}
                  className="h-9 w-full rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
                />

                <div className="flex flex-wrap gap-1.5">
                  {/* 이름을 aria-label 로 통째로 준다. 글리프 뒤에 sr-only 를
                      이어 붙이면 "아래쪽 화살표 2번째 이미지를 뒤로" 처럼
                      기호까지 읽히고, 이름 계산도 브라우저마다 다르다. */}
                  <Button
                    type="button" size="sm" variant="ghost"
                    aria-label={`${index + 1}번째 이미지를 앞으로`}
                    disabled={index === 0 || busy !== null}
                    onClick={() => move(index, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost"
                    aria-label={`${index + 1}번째 이미지를 뒤로`}
                    disabled={index === images.length - 1 || busy !== null}
                    onClick={() => move(index, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </Button>
                  <Button
                    type="button" size="sm" variant="danger"
                    aria-label={`${index + 1}번째 이미지 삭제`}
                    disabled={busy !== null}
                    onClick={() => remove(image)}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={(e) => upload(e)} className="flex flex-col gap-3 border-t border-[var(--surface-2)] pt-5">
        <label htmlFor={fileId} className="text-xs font-medium text-[var(--fg-secondary)]">
          이미지 추가
        </label>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={!storageConfigured || full}
          className="text-[12px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-n-300 file:bg-[var(--bg)] file:px-3 file:text-[12px]"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          JPEG · PNG · WebP · AVIF, 5MB 이하. 상품당 {MAX_IMAGES_PER_PRODUCT}장까지
          {full && ' — 한도에 도달했습니다'}
        </p>
        <div>
          <Button type="submit" size="md" variant="secondary" disabled={!storageConfigured || full || busy === 'upload'}>
            {busy === 'upload' ? '올리는 중…' : '업로드'}
          </Button>
        </div>
      </form>

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
      {/* 순서 변경처럼 화면이 조용히 바뀌는 동작은 읽어 줘야 한다 */}
      <p aria-live="polite" className="sr-only">{status}</p>
    </div>
  );
}
