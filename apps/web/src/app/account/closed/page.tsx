import Link from 'next/link';
import type { Metadata } from 'next';
import { NO_INDEX } from '~/lib/no-index';

export const metadata: Metadata = {
  title: '탈퇴 완료',
  ...NO_INDEX,
};

/**
 * 탈퇴가 끝났다는 것만 말하는 화면.
 *
 * 홈으로 그냥 돌려보내면 로그아웃된 첫 화면과 구분이 안 돼서 **정말
 * 처리된 것인지 알 수 없다.** 되돌릴 수 없는 동작일수록 끝났다는 말이
 * 있어야 한다.
 *
 * 로그인이 필요 없다 — 이 화면에 오는 사람은 방금 계정이 사라졌다.
 */
export default function AccountClosedPage() {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-5 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">탈퇴가 완료되었습니다</h1>

      <p className="text-[14px] leading-relaxed text-[var(--fg-secondary)]">
        이메일·이름·연락처와 배송지, 로그인 수단을 지웠습니다. 주문의 금액과 상품 정보는
        가맹점 정산의 근거라 남아 있지만, 받는 사람과 연락처는 함께 지웠습니다.
      </p>

      <p className="text-[13px] text-[var(--fg-muted)]">
        그동안 이용해 주셔서 고맙습니다. 같은 이메일로 다시 가입하실 수 있습니다.
      </p>

      <Link
        href="/"
        className="mt-2 inline-flex h-12 items-center rounded-sm bg-[var(--brand)] px-6 text-[14px] font-medium text-[var(--bg)] no-underline"
      >
        홈으로
      </Link>
    </div>
  );
}
