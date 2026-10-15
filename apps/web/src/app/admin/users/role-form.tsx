'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import type { UserRoleInput } from '@shop/contract';
// 계약을 거치면 Zod 가 딸려 온다 — 값 목록은 core 의 것이다
import { USER_ROLE, USER_ROLE_LABEL } from '@shop/core';

/**
 * 권한 부여.
 *
 * 가맹점으로 올릴 때만 소속 선택이 열린다. 소속 없는 가맹점 계정은 아무
 * 권한도 갖지 못해 로그인만 되는 계정이 된다.
 */
export function RoleForm({
  userId,
  userName,
  role,
  merchantId,
  merchants,
  disabledReason,
}: {
  userId: string;
  userName: string;
  role: UserRoleInput;
  merchantId: string | null;
  merchants: readonly { id: string; name: string }[];
  disabledReason?: string | undefined;
}) {
  const router = useRouter();
  const [next, setNext] = useState<UserRoleInput>(role);
  const [nextMerchant, setNextMerchant] = useState(merchantId ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const roleId = useId();
  const merchantSelectId = useId();
  const reasonId = useId();

  if (disabledReason) {
    return <p className="text-[11px] text-[var(--fg-muted)]">{disabledReason}</p>;
  }

  const changed = next !== role || (next === 'MERCHANT' && nextMerchant !== (merchantId ?? ''));

  /**
   * **가맹점으로 올리려면 소속을 골라야 한다.**
   *
   * 계약이 이미 막고 있고(`assignRoleSchema`), 그 까닭도 거기 적혀 있다 — "소속 없는 가맹점
   * 계정은 아무것도 볼 수 없다. 만들어 봐야 로그인만 되는 계정이 된다." 그런데 **화면은 그
   * 사실을 눌러 본 뒤에야 알려 줬다.** 이 저장소는 반대로 한다: 서버도 막지만 눌러 보고 나서
   * 알게 하지 않는다(카테고리 나무가 같은 말을 적어 두었다).
   *
   * 사유도 같다. 계약은 다듬은 뒤 한 글자를 요구하는데, 화면의 `required` 는 공백만 적은 것을
   * 그대로 통과시킨다.
   */
  const missingScope = next === 'MERCHANT' && nextMerchant === '';
  const missingReason = reason.trim() === '';
  const ready = changed && !missingScope && !missingReason;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role: next,
          merchantId: next === 'MERCHANT' ? nextMerchant || null : null,
          reason: reason.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '권한을 바꾸지 못했습니다.');
        return;
      }
      setReason('');
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-2">
      <label htmlFor={roleId} className="sr-only">{userName} 권한</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={roleId}
          value={next}
          onChange={(e) => setNext(e.target.value as UserRoleInput)}
          className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
        >
          {USER_ROLE.map((r) => (
            <option key={r} value={r}>{USER_ROLE_LABEL[r]}</option>
          ))}
        </select>

        {next === 'MERCHANT' && (
          <>
            <label htmlFor={merchantSelectId} className="sr-only">{userName} 소속 가맹점</label>
            <select
              id={merchantSelectId}
              value={nextMerchant}
              onChange={(e) => setNextMerchant(e.target.value)}
              className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
            >
              <option value="">소속 선택</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </>
        )}

        <Button type="submit" size="sm" variant="secondary" disabled={pending || !ready}>
          {pending ? '적용 중…' : '적용'}
        </Button>
      </div>

      {/* 무엇이 모자라 못 누르는지 말한다 — 흐려진 단추만 두면 까닭을 알 수 없다 */}
      {changed && missingScope && (
        <p className="text-[11px] text-[var(--fg-muted)]">
          가맹점으로 올리려면 소속을 골라 주세요. 소속이 없으면 로그인만 되는 계정이 됩니다.
        </p>
      )}

      {changed && (
        <>
          <label htmlFor={reasonId} className="text-[11px] text-[var(--fg-secondary)]">
            사유 (필수)
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            required
            className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
          />
        </>
      )}

      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
