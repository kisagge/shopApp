'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';
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
  const panelId = useId();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * **초점을 챙긴다.** 누른 단추가 사라지고 그 자리를 폼이 차지하므로, 아무것도 안 하면 초점이
   * `<body>` 로 떨어진다 — 키보드 사용자는 탭을 문서 맨 앞부터 다시 눌러야 하고 낭독기는 무엇이
   * 열렸는지 말하지 않는다. 닫을 때도 같다. 규칙은 훅에 모여 있다(useDisclosureFocus).
   */
  const { triggerRef, panelRef } = useDisclosureFocus(open);

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
        <Button
          type="button"
          size="sm"
          ref={triggerRef}
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
        >
          자사 브랜드 등록
        </Button>
      </div>
    );
  }

  return (
    <form
      id={panelId}
      ref={panelRef}
      /* 초점을 받을 수 있게 하되 탭 순서에는 넣지 않는다 */
      tabIndex={-1}
      onSubmit={(e) => void onSubmit(e)}
      aria-labelledby="new-brand-title"
      className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
    >
      <h2 id="new-brand-title" className="text-[14px] font-semibold">자사 브랜드 등록</h2>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-[11px] text-[var(--fg-secondary)]">이름</label>
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
            주소 (소문자·숫자·붙임표)
          </label>
          <input
            id={slugId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={BRAND_SLUG_MAX}
            minLength={BRAND_SLUG_MIN}
            required
            pattern={SLUG_PATTERN}
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
