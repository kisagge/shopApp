'use client';

import { useState } from 'react';
import { Button, Field } from '@shop/ui';
import { failureMessage } from '~/lib/client/failure-message';
import type { CouponRow, NamedOption } from './types';

/**
 * 고른 회원에게 쿠폰을 지급한다.
 *
 * **누구에게 줄지가 이 화면의 전부다.** 그래서 이름으로 찾아 담는 창구만
 * 둔다 — 쿠폰 대상 지정·기획전 담기와 같은 모양이다.
 *
 * **검색어 없이는 아무것도 보여 주지 않는다.** 창구를 열자마자 전체 명단이
 * 뜨면 고르는 화면이 아니라 명단을 훑는 화면이 된다.
 */
export function CouponGrant({
  coupon, onDone, onClose,
}: {
  coupon: CouponRow;
  onDone: (summary: { issued: number; skipped: number }) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<readonly (NamedOption & { email: string })[]>([]);
  const [picked, setPicked] = useState<readonly (NamedOption & { email: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const has = (id: string) => picked.some((p) => p.id === id);

  /**
   * 회원 찾기.
   *
   * **셋을 똑같은 침묵으로 답하고 있었다** — 찾은 사람이 없을 때, 서버가 거절할 때, 길이
   * 끊길 때. 결과 칸은 하나라도 있어야 그려지므로 어느 쪽이든 화면이 그대로다. 누른 사람은
   * "그런 회원이 없구나" 와 "검색이 고장났구나" 를 가릴 수 없었다. catch 도 없어 망이 끊기면
   * 처리되지 않은 거절로 조용히 샜다.
   */
  async function search() {
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) {
        setError(await failureMessage(response, '회원을 찾지 못했습니다.'));
        return;
      }
      const data = (await response.json()) as { users: (NamedOption & { email: string })[] };
      setFound(data.users);
      setSearched(true);
    } catch {
      setError('네트워크 오류로 회원을 찾지 못했습니다.');
    } finally {
      setSearching(false);
    }
  }

  async function grant() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}/issue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: picked.map((p) => p.id) }),
      });
      // 502 가 HTML 을 주면 json() 이 던진다 — 그것까지 "네트워크 오류" 로 뭉뚱그리지 않는다
      const result = (await response.json().catch(() => ({}))) as {
        issued?: number; skipped?: number; message?: string;
      };
      if (!response.ok || result.issued === undefined) {
        setError(result.message ?? '지급하지 못했습니다.');
        return;
      }
      onDone({ issued: result.issued, skipped: result.skipped ?? 0 });
    } catch {
      setError('네트워크 오류로 지급하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label={`${coupon.name} 지급`}
      className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">
          쿠폰 지급 <span className="text-[13px] font-normal text-[var(--fg-muted)]">{coupon.name}</span>
        </h2>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>닫기</Button>
      </div>

      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <Field
          label="회원 검색"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // 이 자리는 폼이 아니다. 엔터로 바깥 폼이 제출되지 않게 막는다.
              e.preventDefault();
              void search();
            }
          }}
          placeholder="이름 · 이메일"
          className="w-[280px]"
        />
        <Button type="button" variant="secondary" onClick={() => void search()} disabled={searching}>
          {searching ? '찾는 중…' : '찾기'}
        </Button>
      </div>

      {/* 찾았는데 없는 것과 아직 안 찾은 것은 다른 말이다 */}
      {searched && !error && found.length === 0 && (
        <p className="text-[12px] text-[var(--fg-muted)]">
          그 이름·이메일로 찾은 회원이 없습니다. 다른 말로 찾아 보세요.
        </p>
      )}

      {found.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {found.map((u) => (
            <li key={u.id}>
              <label className="flex items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={has(u.id)}
                  onChange={() =>
                    setPicked((list) =>
                      has(u.id) ? list.filter((p) => p.id !== u.id) : [...list, u],
                    )
                  }
                />
                <span>{u.name}</span>
                <span className="text-[11px] text-[var(--fg-muted)]">{u.email}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {/*
        **누구에게 주는지 끝까지 보여 준다.**

        고른 사람을 수로만 적고 있었다. 그런데 검색 결과는 다음 검색에 통째로 갈리므로,
        "코트" 로 찾아 둘 고르고 다시 찾는 순간 **앞서 고른 사람이 화면에서 사라지고 "3명" 만
        남는다.** 쿠폰이 누구에게 가는지 확인할 방법이 없는 셈이고, 그건 돈이다.
      */}
      {picked.length > 0 && (
        <ul aria-label="지급할 회원" className="flex flex-wrap gap-1.5">
          {picked.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                aria-label={`${u.name} 빼기`}
                onClick={() => setPicked((list) => list.filter((p) => p.id !== u.id))}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                {u.name}
                <span aria-hidden="true" className="text-[var(--fg-muted)]">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[13px] text-[var(--fg-secondary)]">
        고른 회원 <span className="tnum font-semibold">{picked.length}</span>명
        {coupon.issueLimit !== null && (
          <span className="text-[var(--fg-muted)]">
            {' '}· 남은 수량 <span className="tnum">{coupon.issueLimit - coupon.issuedCount}</span>장
          </span>
        )}
      </p>

      <div>
        <Button type="button" onClick={() => void grant()} disabled={pending || picked.length === 0}>
          {pending ? '지급하는 중…' : `${picked.length}명에게 지급`}
        </Button>
      </div>
    </section>
  );
}
