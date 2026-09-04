'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { USER_ROLE_INPUT, type UserRoleInput } from '@shop/contract';
import { USER_ROLE_LABEL } from '@shop/core';

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
          reason,
        }),
      });
      const data = (await response.json()) as { message?: string };
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
          className="h-9 rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
        >
          {USER_ROLE_INPUT.map((r) => (
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
              className="h-9 rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
            >
              <option value="">소속 선택</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </>
        )}

        <Button type="submit" size="sm" variant="secondary" disabled={pending || !changed}>
          {pending ? '적용 중…' : '적용'}
        </Button>
      </div>

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
            className="h-9 rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
          />
        </>
      )}

      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
