'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOutEverywhere } from '@shop/auth/client';
import { CLOSURE_CONFIRM_PHRASE, CLOSURE_BLOCK_MESSAGE, type ClosureBlock } from '@shop/core';

/**
 * 탈퇴 확인.
 *
 * **문구를 직접 치게 한다.** 되돌릴 수 없는 동작이고, 체크박스 하나는
 * 읽지 않고도 눌린다. 문구를 옮겨 적는 동안 무엇을 하는지 한 번은 읽는다.
 */
export function CloseAccountForm() {
  const router = useRouter();
  const phraseId = useId();
  const reviewsId = useId();

  const [phrase, setPhrase] = useState('');
  const [eraseReviews, setEraseReviews] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<readonly ClosureBlock[]>([]);

  const matched = phrase.trim() === CLOSURE_CONFIRM_PHRASE;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setBlocks([]);

    try {
      const response = await fetch('/api/account/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phrase: phrase.trim(), eraseReviews }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
          blocks?: ClosureBlock[];
        };
        setError(data.message ?? '탈퇴하지 못했습니다.');
        setBlocks(data.blocks ?? []);
        return;
      }

      /*
       * 계정은 지워졌지만 **이 브라우저의 쿠키는 아직 남아 있다.**
       *
       * 세션 행을 지워도 Better Auth 의 쿠키 캐시(5분)는 DB 를 다시 보지
       * 않는다. 로그아웃까지 해야 지금 바로 끊긴다.
       */
      await signOutEverywhere();
      router.replace('/account/closed');
      router.refresh();
    } catch {
      setError('네트워크 오류로 탈퇴하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-8 flex flex-col gap-4 rounded-sm border border-accent/40 p-5"
    >
      <h2 className="text-[15px] font-semibold">정말 탈퇴하시겠습니까?</h2>

      <label className="flex items-start gap-2.5 text-[13px]">
        <input
          id={reviewsId}
          type="checkbox"
          checked={eraseReviews}
          onChange={(event) => setEraseReviews(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          작성한 리뷰도 함께 지웁니다
          <span className="block text-[12px] text-[var(--fg-muted)]">
            선택하지 않으면 리뷰는 남고 작성자 이름만 지워집니다.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={phraseId} className="text-[13px]">
          확인을 위해 <b>{CLOSURE_CONFIRM_PHRASE}</b> 를 입력해 주세요
        </label>
        <input
          id={phraseId}
          type="text"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          autoComplete="off"
          className="h-11 w-full max-w-[240px] rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-[14px]"
        />
      </div>

      {error && (
        <div role="alert" className="text-[13px] text-accent">
          <p>{error}</p>
          {blocks.length > 0 && (
            <ul className="mt-1.5 flex list-none flex-col gap-1 p-0">
              {blocks.map((block) => (
                <li key={block}>{CLOSURE_BLOCK_MESSAGE[block]}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="submit"
        /*
         * 문구가 맞기 전에는 누를 수 없다. 다만 disabled 로만 막지 않는다 —
         * 서버도 같은 문구를 본다(closeAccountSchema).
         */
        disabled={!matched || pending}
        className="h-12 rounded-sm bg-accent px-5 text-[14px] font-medium text-n-0 disabled:opacity-40"
      >
        {pending ? '탈퇴 처리 중…' : '탈퇴하기'}
      </button>
    </form>
  );
}
