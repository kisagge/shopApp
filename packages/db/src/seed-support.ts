import { prisma } from './client';

/**
 * 고객센터 글 시드.
 *
 * **id 를 못 박아 upsert 한다.** 시드를 두 번 돌려도 같은 글이 두 벌 생기지
 * 않아야 하는데, 공지에는 slug 같은 자연 열쇠가 없다. 제목으로 맞추면 제목을
 * 고치는 순간 새 글이 하나 더 생긴다.
 *
 * 운영진이 화면에서 고칠 수 있는 글이므로 **update 는 비워 둔다** — 시드를
 * 다시 돌렸다고 손으로 고친 안내가 되돌아가면 안 된다.
 */

interface SeedPost {
  readonly id: string;
  readonly kind: 'NOTICE' | 'FAQ';
  readonly title: string;
  readonly body: string;
  readonly topic?: 'DELIVERY' | 'EXCHANGE' | 'PAYMENT' | 'ACCOUNT' | 'PRODUCT' | 'ETC';
  readonly pinned?: boolean;
  readonly sortOrder?: number;
}

const POSTS: readonly SeedPost[] = [
  {
    id: 'seed-notice-hours',
    kind: 'NOTICE',
    pinned: true,
    title: '고객센터 운영 안내',
    body: [
      '문의는 이 화면에서 언제든 남기실 수 있습니다.',
      '평일 10:00 – 18:00 에 순서대로 답변드리며, 주말과 공휴일에 남기신 문의는 다음 영업일에 처리됩니다.',
      '',
      '답변이 등록되면 가입하신 메일로 알려 드립니다.',
    ].join('\n'),
  },
  {
    id: 'seed-notice-delivery',
    kind: 'NOTICE',
    title: '설 연휴 배송 안내',
    body: [
      '연휴 기간에는 택배사 사정으로 배송이 평소보다 2–3일 늦어질 수 있습니다.',
      '연휴 전 수령을 원하시면 마지막 출고일 전까지 주문해 주세요.',
    ].join('\n'),
  },
  {
    id: 'seed-faq-delivery-fee',
    kind: 'FAQ',
    topic: 'DELIVERY',
    sortOrder: 0,
    title: '배송비는 얼마인가요?',
    body: '기본 배송비는 3,000원이고 5만원 이상 주문하시면 무료입니다. 제주·도서산간은 3,000원이 더해집니다.',
  },
  {
    id: 'seed-faq-delivery-time',
    kind: 'FAQ',
    topic: 'DELIVERY',
    sortOrder: 1,
    title: '주문한 상품은 언제 도착하나요?',
    body: '결제가 확인되면 영업일 기준 1–2일 안에 출고되고, 출고 후 1–3일 안에 받아 보실 수 있습니다. 송장이 등록되면 주문 상세에서 배송 조회를 하실 수 있습니다.',
  },
  {
    id: 'seed-faq-return-window',
    kind: 'FAQ',
    topic: 'EXCHANGE',
    sortOrder: 0,
    title: '반품은 언제까지 가능한가요?',
    body: '받으신 날로부터 7일 안에 주문 상세에서 신청하실 수 있습니다. 다만 착용하셨거나 택이 제거된 상품, 세탁한 상품은 어렵습니다.',
  },
  {
    id: 'seed-faq-exchange',
    kind: 'FAQ',
    topic: 'EXCHANGE',
    sortOrder: 1,
    title: '사이즈 교환도 되나요?',
    body: '같은 상품의 다른 사이즈로 교환하실 수 있습니다. 재고가 없으면 반품 후 다시 주문해 주셔야 합니다.',
  },
  {
    id: 'seed-faq-point',
    kind: 'FAQ',
    topic: 'PAYMENT',
    sortOrder: 0,
    title: '적립금은 언제 들어오나요?',
    body: '구매를 확정하시면 적립됩니다. 배송 완료 후 일정 기간이 지나면 자동으로 확정되며, 적립금은 1,000원부터 사용하실 수 있습니다.',
  },
  {
    id: 'seed-faq-point-expiry',
    kind: 'FAQ',
    topic: 'PAYMENT',
    sortOrder: 1,
    title: '적립금에 유효기간이 있나요?',
    body: '적립일로부터 1년입니다. 사라지기 30일 전부터 마이페이지에 미리 안내해 드립니다.',
  },
  {
    id: 'seed-faq-grade',
    kind: 'FAQ',
    topic: 'ACCOUNT',
    sortOrder: 0,
    title: '회원 등급은 어떻게 올라가나요?',
    body: '구매를 확정하신 금액의 합으로 정해집니다. 등급이 오르면 적립률이 함께 올라갑니다.',
  },
  {
    id: 'seed-faq-withdraw',
    kind: 'FAQ',
    topic: 'ACCOUNT',
    sortOrder: 1,
    title: '탈퇴하면 주문 내역은 어떻게 되나요?',
    body: '탈퇴하시면 계정 정보는 지워지지만, 주문 기록은 법으로 정해진 기간 동안 보관됩니다. 진행 중인 주문이 있으면 끝난 뒤에 탈퇴하실 수 있습니다.',
  },
  {
    id: 'seed-faq-restock',
    kind: 'FAQ',
    topic: 'PRODUCT',
    sortOrder: 0,
    title: '품절된 상품은 다시 들어오나요?',
    body: '상품 화면에서 재입고 알림을 신청해 두시면 다시 들어왔을 때 메일로 알려 드립니다.',
  },
];

export async function seedSupport(): Promise<void> {
  const publishedAt = new Date('2026-01-02T00:00:00Z');

  for (const post of POSTS) {
    await prisma.supportPost.upsert({
      where: { id: post.id },
      // 운영진이 고친 글을 시드가 되돌리지 않는다
      update: {},
      create: {
        id: post.id,
        kind: post.kind,
        title: post.title,
        body: post.body,
        topic: post.topic ?? null,
        pinned: post.pinned ?? false,
        sortOrder: post.sortOrder ?? 0,
        publishedAt,
      },
    });
  }

  const notices = POSTS.filter((p) => p.kind === 'NOTICE').length;
  console.log(`  공지 ${notices}개 · FAQ ${POSTS.length - notices}개`);
}
