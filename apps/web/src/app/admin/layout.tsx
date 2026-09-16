import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { hasPermission, USER_ROLE_LABEL, type Permission } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { AdminNav } from '~/components/admin/admin-nav';
import { NO_INDEX } from '~/lib/no-index';
import { getTheme } from '~/lib/theme';
import { countUnread } from '~/lib/queries/notifications';
import { countPendingInquiries } from '~/lib/queries/inquiries';

/** 운영 화면은 검색 결과에 뜰 일이 없다 */
export const metadata: Metadata = NO_INDEX;

export const dynamic = 'force-dynamic';

interface NavItem {
  readonly href: '/admin' | '/admin/notifications' | '/admin/orders' | '/admin/returns' | '/admin/products' | '/admin/settlements' | '/admin/audit' | '/admin/policies'
    | '/admin/merchants' | '/admin/users' | '/admin/points' | '/admin/banners' | '/admin/reviews'
    | '/admin/collections'
    | '/admin/inquiries' | '/admin/support'
    | '/admin/traffic' | '/admin/coupons' | '/admin/shipping' | '/admin/notification-templates' | '/admin/mail-templates';
  readonly label: string;
  readonly permission: Permission;
}

const NAV: readonly NavItem[] = [
  { href: '/admin', label: '대시보드', permission: 'admin:access' },
  // 운영 알림함. 지금은 재고 부족뿐이라 가맹점에게 가장 쓸모가 있다
  { href: '/admin/notifications', label: '알림', permission: 'admin:access' },
  // 전체 트래픽이라 가맹점에게는 보이지 않는다
  { href: '/admin/traffic', label: '트래픽', permission: 'analytics:all' },
  { href: '/admin/orders', label: '주문', permission: 'order:read' },
  // 반품은 가맹점과 운영진이 나눠 처리한다 — 누구 차례인지 모아 본다
  { href: '/admin/returns', label: '반품·교환', permission: 'return:resolve' },
  { href: '/admin/products', label: '상품', permission: 'product:read' },
  { href: '/admin/banners', label: '배너', permission: 'banner:read' },
  { href: '/admin/collections', label: '기획전', permission: 'collection:read' },
  { href: '/admin/coupons', label: '쿠폰', permission: 'coupon:read' },
  // 가맹점에게는 보이지 않는다. 자기 상품의 혹평을 내릴 수 있으면
  // 리뷰가 상품 설명의 일부가 된다.
  // 가맹점도 들어온다 — 자기 상품만, 읽기만. 자세한 이유는 authz 의 review:read 에
  { href: '/admin/reviews', label: '리뷰', permission: 'review:read' },
  // 가맹점도 본다 — 자기 상품 문의는 파는 사람이 답하는 것이 맞다
  { href: '/admin/inquiries', label: '문의', permission: 'inquiry:answer' },
  { href: '/admin/support', label: '공지·FAQ', permission: 'support:write' },
  // 가입·결제 화면이 가리키는 문서다. 공지와 달리 한 벌이고 시행일과 지난 이력이 있다
  { href: '/admin/policies', label: '약관·방침', permission: 'support:write' },
  { href: '/admin/shipping', label: '배송비', permission: 'shipping:write' },
  // 손님에게 가는 말투라 가맹점에게는 보이지 않는다(authz 의 notification:write)
  { href: '/admin/notification-templates', label: '알림 문구', permission: 'notification:write' },
  // 같은 권한 — 손님에게 우리 이름으로 나가는 말이다
  { href: '/admin/mail-templates', label: '메일 문구', permission: 'notification:write' },
  { href: '/admin/settlements', label: '정산', permission: 'settlement:read' },
  { href: '/admin/merchants', label: '가맹점', permission: 'merchant:read' },
  { href: '/admin/users', label: '회원', permission: 'user:read' },
  { href: '/admin/points', label: '포인트 대사', permission: 'user:read' },
  // 가맹점에게는 보이지 않는다. 감사 로그는 운영진을 감시하는 도구다.
  { href: '/admin/audit', label: '감사 로그', permission: 'user:read' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireAdmin();
  /*
   * **메뉴에 안 읽은 수를 붙인다.** 알림함은 열어야 보이는데, 열어야 알 수 있는
   * 것은 대시보드의 재고 부족 수와 다를 바가 없다. 운영 알림함만 센다 — 매장
   * 알림(배송·쿠폰)이 섞이면 가맹점에게 할 일이 아닌 것이 뱃지를 채운다.
   */
  /*
   * **답변 대기 문의도 메뉴에 붙인다.** 문의는 손님이 답을 기다리는 일감인데, 들어가 봐야 몇 건인지
   * 알았다 — 가맹점은 문의 메뉴를 매일 열어 보지 않고, 그 사이 손님은 답 없는 문의를 보고 떠난다.
   * 세는 조건은 문의 화면의 "답변 대기" 탭과 하나다(countPendingInquiries).
   */
  const [unread, pendingInquiries] = await Promise.all([
    countUnread(actor.id, 'console'),
    countPendingInquiries(actor),
  ]);

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
          ...(n.href === '/admin/notifications' && unread > 0 ? { badge: unread, badgeLabel: '안 읽은 알림' } : {}),
          ...(n.href === '/admin/inquiries' && pendingInquiries > 0
            ? { badge: pendingInquiries, badgeLabel: '답변 대기 문의' }
            : {}),
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
