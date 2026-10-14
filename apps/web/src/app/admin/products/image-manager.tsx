'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT } from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';

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
/** 화면에 적는 상한. 서버가 거절하는 기준과 같은 값에서 나온다 */
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / 1024 / 1024;

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
  /*
   * 지우기 버튼은 자기 줄과 함께 사라진다. 챙기지 않으면 초점이 body 로
   * 떨어져, 여럿을 정리하려면 탭으로 문서 맨 앞부터 매번 다시 내려와야 한다.
   */
  const { listRef, emptyRef, rememberRemoval } = useRemovalFocus(images.length);
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
      /*
       * 앞단이 502 HTML 을 주면 `json()` 이 던진다. 그대로 두면 아래 catch 가 받아
       * **서버가 답했는데 "네트워크 오류" 라고 적는다** — `failureMessage` 가 겪고 생긴 일이다.
       */
      if (!response.ok) {
        setError(await failureMessage(response, '처리하지 못했습니다.'));
        return null;
      }
      return (await response.json().catch(() => ({}))) as Record<string, unknown>;
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

    /*
     * **적어 둔 상한을 여기서도 잰다.**
     *
     * 바로 아래 안내가 "5MB 이하" 라고 약속하는데 재는 곳이 없었다. 20MB 짜리를 고르면 그것을
     * **통째로 올린 뒤** 서버가 거절한다 — 느린 회선에서는 몇 분을 기다렸다가 "넘을 수 없습니다"
     * 를 보는 셈이고, 그동안 화면은 '올리는 중…' 이다.
     *
     * 숫자도 손으로 적혀 있었다. 상한은 core 가 쥔다(`MAX_IMAGE_BYTES`) — 서버가 거절하는
     * 기준과 화면이 적는 말이 한 값에서 나와야 둘이 갈리지 않는다.
     */
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`이미지는 ${MAX_IMAGE_MB}MB 를 넘을 수 없습니다. 고른 파일은 ${(file.size / 1024 / 1024).toFixed(1)}MB 입니다.`);
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
        <p
          ref={emptyRef as React.RefObject<HTMLParagraphElement>}
          tabIndex={-1}
          role="status" className="text-[13px] text-[var(--fg-muted)]">
          등록된 이미지가 없습니다. 첫 번째 이미지가 목록의 대표 이미지가 됩니다.
        </p>
      ) : (
        <ol ref={listRef as React.RefObject<HTMLOListElement>} className="flex flex-col gap-3">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="flex gap-3 rounded-sm border border-[var(--border)] p-3"
            >
              <Image
                src={image.url}
                alt={image.alt}
                width={72}
                height={90}
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
                  className="h-9 w-full rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
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
                  <RemoveImage
                    image={image}
                    position={index + 1}
                    busy={busy !== null}
                    onConfirm={() => {
                      rememberRemoval(index);
                      void remove(image);
                    }}
                  />
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
          className="text-[12px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--bg)] file:px-3 file:text-[12px]"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          JPEG · PNG · WebP · AVIF, {MAX_IMAGE_MB}MB 이하. 상품당 {MAX_IMAGES_PER_PRODUCT}장까지
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


/**
 * 사진 지우기 — **한 번 더 묻는다.**
 *
 * 첫 누름에 바로 지우고 있었다. 저장소에서 사라지고 되돌릴 길이 없는데, 옆의 위·아래 단추와
 * 같은 줄에 붙어 있어 손이 미끄러지기 쉬운 자리다. 이 저장소의 다른 지우기들(갈래·주문 취소·
 * 문의·리뷰)은 전부 한 번 더 묻는다.
 *
 * **무엇을 지우는지도 말한다.** 이름표가 "3번째 이미지 삭제" 뿐이라, 낭독기로 듣는 사람은
 * 순번만 알고 누른다 — 대체 텍스트가 있으면 그것이 어떤 사진인지 말해 준다.
 */
function RemoveImage({
  image, position, busy, onConfirm,
}: {
  image: ImageRow;
  position: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const what = image.alt.trim() === '' ? `${position}번째 이미지` : image.alt;

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
        data-remove-row=""
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
