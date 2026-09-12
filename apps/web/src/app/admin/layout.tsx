import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { hasPermission, USER_ROLE_LABEL, type Permission } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { AdminNav } from '~/components/admin/admin-nav';
import { NO_INDEX } from '~/lib/no-index';
import { getTheme } from '~/lib/theme';

/** 운영 화면은 검색 결과에 뜰 일이 없다 */
export const metadata: Metadata = NO_INDEX;

export const dynamic = 'force-dynamic';

interface NavItem {
  readonly href: '/admin' | '/admin/orders' | '/admin/products' | '/admin/settlements' | '/admin/audit'
    | '/admin/merchants' | '/admin/users' | '/admin/points' | '/admin/banners' | '/admin/reviews'
    | '/admin/collections'
    | '/admin/inquiries' | '/admin/support'
    | '/admin/traffic' | '/admin/coupons';
  readonly label: string;
  readonly permission: Permission;
}

const NAV: readonly NavItem[] = [
  { href: '/admin', label: '대시보드', permission: 'admin:access' },
  // 전체 트래픽이라 가맹점에게는 보이지 않는다
  { href: '/admin/traffic', label: '트래픽', permission: 'analytics:all' },
  { href: '/admin/orders', label: '주문', permission: 'order:read' },
  { href: '/admin/products', label: '상품', permission: 'product:read' },
  { href: '/admin/banners', label: '배너', permission: 'banner:read' },
  { href: '/admin/collections', label: '기획전', permission: 'collection:read' },
  { href: '/admin/coupons', label: '쿠폰', permission: 'coupon:read' },
  // 가맹점에게는 보이지 않는다. 자기 상품의 혹평을 내릴 수 있으면
  // 리뷰가 상품 설명의 일부가 된다.
  { href: '/admin/reviews', label: '리뷰', permission: 'review:moderate' },
  // 가맹점도 본다 — 자기 상품 문의는 파는 사람이 답하는 것이 맞다
  { href: '/admin/inquiries', label: '문의', permission: 'inquiry:answer' },
  { href: '/admin/support', label: '공지·FAQ', permission: 'support:write' },
  { href: '/admin/settlements', label: '정산', permission: 'settlement:read' },
  { href: '/admin/merchants', label: '가맹점', permission: 'merchant:read' },
  { href: '/admin/users', label: '회원', permission: 'user:read' },
  { href: '/admin/points', label: '포인트 대사', permission: 'user:read' },
  // 가맹점에게는 보이지 않는다. 감사 로그는 운영진을 감시하는 도구다.
  { href: '/admin/audit', label: '감사 로그', permission: 'user:read' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireAdmin();

  return (
    /*
     * **좁은 화면에서는 메뉴가 위로 간다.** 옆에 세우면 232px 을 먹어 본문에
     * 143px 밖에 안 남고, 한글이 한 자씩 줄바꿈돼 세로로 선다.
     *
     * `min-w-0` 이 본문에 붙어 있는 이유 — flex 자식은 기본으로 자기 내용보다
     * 좁아지지 않는다. 없으면 표가 상자를 밀어내 화면 전체가 가로로 스크롤된다.
     */
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AdminNav
        items={NAV.filter((n) => hasPermission(actor, n.permission)).map((n) => ({
          // 권한 없는 메뉴는 아예 그리지 않는다. 눌러 보고 튕기는 것보다 낫다.
          href: n.href,
          label: n.label,
        }))}
        roleLabel={USER_ROLE_LABEL[actor.role]}
        merchant={actor.merchantId !== null}
        theme={await getTheme()}
      />

      {/*
        **`main` 이 여기 있어야 한다.** 예전에는 루트 레이아웃이 하나를 그려서
        운영 화면도 그 안에 들어갔는데, 그 레이아웃에서 매장의 머리와 발을
        떼면서 함께 나갔다. 없으면 '본문 바로가기' 가 가리킬 곳이 없어지고
        (주소만 바뀌고 초점은 사라진다), 낭독기는 이 화면에 본문이 없다고
        말한다 — 표가 가장 빽빽한 화면들이 여기다.
      */}
      <main
        id="main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col bg-[var(--surface)] focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
