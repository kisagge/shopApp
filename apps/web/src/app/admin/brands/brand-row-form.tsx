'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@shop/ui';
import {
  BRAND_NAME_MAX, BRAND_SLUG_MAX, BRAND_SLUG_MIN, BRAND_SLUG_PATTERN,
} from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';

/*
 * **상한과 모양은 core 가 쥔다.** 계약이 그 값으로 거절하는데(`createBrandSchema`), 화면이
 * 숫자와 정규식을 따로 적어 두면 한쪽을 고치는 날 둘이 갈린다 — 그때 화면은 받아 주고 서버는
 * 거절한다. 이미지 상한이 같은 까닭으로 core 에서 뽑도록 바뀌었다.
 *
 * **최소 두 자도 화면이 말한다.** `a` 한 자는 `pattern` 과 `required` 를 통과해 서버까지 갔다가
 * 거절당했다 — 서버도 막지만 눌러 보고 나서 알게 하지 않는다.
 */
/** `pattern` 속성은 정규식 객체가 아니라 글자를 받는다 — core 의 것을 그대로 쓴다 */
const SLUG_PATTERN = BRAND_SLUG_PATTERN.source;

/**
 * 브랜드 한 줄 고치기.
 *
 * **주소를 바꾸는 것이 이 화면의 요점이다.** 한글 이름으로 입점하면 주소가
 * `brand-a1b2c3d4` 가 되는데, 그건 사람이 읽을 수도 공유할 수도 없는 주소다.
 * 바꿔도 옛 주소는 새 주소로 넘어간다(BrandSlug) — 그걸 화면이 미리 말해 준다.
 * 안 말하면 무서워서 못 바꾼다.
 */
export function BrandRowForm({
  brandId,
  name: initialName,
  slug: initialSlug,
  merchantName,
  productCount,
  slugIsGenerated,
}: {
  brandId: string;
  name: string;
  slug: string;
  merchantName: string | null;
  productCount: number;
  slugIsGenerated: boolean;
}) {
  const router = useRouter();
  const nameId = useId();
  const slugId = useId();

  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = name !== initialName || slug !== initialSlug;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      if (!response.ok) {
        setError(await failureMessage(response, '고치지 못했습니다.'));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('네트워크 오류로 고치지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-[var(--fg-muted)]">
        <span>{merchantName ?? '자사 브랜드'}</span>
        <span aria-hidden="true">·</span>
        <span className="tnum">상품 {productCount.toLocaleString('ko-KR')}</span>
        <Link href={`/brand/${initialSlug}`} className="underline">매대에서 보기</Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-[11px] text-[var(--fg-secondary)]">
            {initialName} 이름
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={BRAND_NAME_MAX}
            required
            className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={slugId} className="text-[11px] text-[var(--fg-secondary)]">
            {initialName} 주소
          </label>
          <input
            id={slugId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={BRAND_SLUG_MAX}
            minLength={BRAND_SLUG_MIN}
            required
            /* 주소는 소문자·숫자·붙임표뿐이다. 한글은 인코딩되면 공유될 때 알아볼 수 없다. */
            pattern={SLUG_PATTERN}
            className="tnum h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          />
        </div>

        <Button type="submit" size="sm" variant="secondary" disabled={pending || !changed}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>

      {/*
        **고치라고 짚어 준다.** 자동으로 지어진 주소는 사람이 읽을 수 없다.
        그냥 두면 그 상태가 영영 간다는 것을 아무도 모른다.
      */}
      {slugIsGenerated && (
        <p className="text-[11px] text-[var(--fg-secondary)]">
          입점할 때 자동으로 지어진 주소입니다. 사람이 읽을 수 있는 주소로 바꿔 주세요.
        </p>
      )}

      {/* 바꿔도 되는 일이라는 것을 미리 말한다 — 안 그러면 무서워서 못 바꾼다 */}
      {slug !== initialSlug && (
        <p role="status" className="text-[11px] text-[var(--fg-secondary)]">
          옛 주소 <span className="tnum">/brand/{initialSlug}</span> 는 새 주소로 넘어갑니다.
        </p>
      )}

      {saved && !changed && (
        <p role="status" className="text-[11px] text-success">저장했습니다.</p>
      )}
      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
