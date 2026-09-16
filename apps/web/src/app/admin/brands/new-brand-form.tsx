'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 자사 브랜드 등록.
 *
 * **가맹점 브랜드는 여기서 만들지 않는다.** 그건 입점 승인이 만든다 — 한 가맹점의
 * 간판은 하나이고, 그 관계가 정산·범위 판단의 기준이다. 여기서 만드는 것은
 * 가맹점 없는 자사 브랜드뿐이라 운영진에게만 보인다(core 의 canCreateBrand).
 */
export function NewBrandForm() {
  const router = useRouter();
  const nameId = useId();
  const slugId = useId();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      if (!response.ok) {
        setError(await failureMessage(response, '만들지 못했습니다.'));
        return;
      }
      setName('');
      setSlug('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('네트워크 오류로 만들지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>자사 브랜드 등록</Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      aria-labelledby="new-brand-title"
      className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-6"
    >
      <h2 id="new-brand-title" className="text-[14px] font-semibold">자사 브랜드 등록</h2>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-[11px] text-[var(--fg-secondary)]">이름</label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={slugId} className="text-[11px] text-[var(--fg-secondary)]">
            주소 (소문자·숫자·붙임표)
          </label>
          <input
            id={slugId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={60}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="tnum h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? '만드는 중…' : '만들기'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
        </div>
      </div>

      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
