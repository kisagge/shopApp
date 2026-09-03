import type { ReactNode } from 'react';
import Link from 'next/link';
import { hasPermission, USER_ROLE_LABEL, type Permission } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { AdminSignOut } from '~/components/admin-sign-out';

export const dynamic = 'force-dynamic';

interface NavItem {
  readonly href: '/admin' | '/admin/orders' | '/admin/products' | '/admin/settlements' | '/admin/audit'
    | '/admin/merchants' | '/admin/users' | '/admin/points' | '/admin/banners'
    | '/admin/traffic';
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
    <div className="flex min-h-dvh">
      <div className="flex w-[232px] shrink-0 flex-col gap-7 bg-dark-bg px-4 py-6">
        <p className="flex items-baseline gap-2 px-1.5">
          <span className="font-serif text-[19px] font-medium tracking-[0.16em] text-n-0">PLAIN</span>
          <span className="text-[10px] font-medium tracking-[0.14em] text-n-600">ADMIN</span>
        </p>

        <nav aria-label="관리자 메뉴" className="flex-1">
          <ul className="flex flex-col gap-0.5">
            {/* 권한 없는 메뉴는 아예 그리지 않는다. 눌러 보고 튕기는 것보다 낫다. */}
            {NAV.filter((n) => hasPermission(actor, n.permission)).map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className="flex min-h-11 items-center rounded-[5px] px-3.5 text-sm text-dark-muted no-underline hover:bg-dark-surface hover:text-n-0"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-dark-surface2 pt-3">
          <p className="px-3.5 pb-2">
            <span className="block text-[13px] font-medium text-n-0">
              {USER_ROLE_LABEL[actor.role]}
            </span>
            {actor.merchantId && (
              <span className="block text-[11px] text-dark-muted">가맹점 계정</span>
            )}
          </p>
          <AdminSignOut />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--surface)]">{children}</div>
    </div>
  );
}
