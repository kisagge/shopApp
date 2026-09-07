import { resolve } from 'node:path';
import { config } from 'dotenv';

// 모노레포 루트의 .env 를 읽는다 (cwd 는 packages/db)
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

import { searchTextFor } from '@shop/core';
import { prisma } from './client';
import { seedReviews } from './seed-reviews';
import { seedSupport } from './seed-support';
import { seedCollections } from './seed-collections';

/**
 * 개발용 시드. 여러 번 돌려도 같은 상태가 되도록 전부 upsert 로 쓴다.
 * 시안(design/)에 나오는 상품과 같은 데이터라 화면을 붙일 때 눈으로 대조하기 쉽다.
 */

const CATEGORIES = [
  { slug: 'outer', name: '아우터', children: [
    { slug: 'outer-coat', name: '코트' },
    { slug: 'outer-padding', name: '패딩' },
    { slug: 'outer-jacket', name: '자켓' },
    { slug: 'outer-blouson', name: '블루종' },
  ]},
  { slug: 'knit', name: '니트', children: [
    { slug: 'knit-crewneck', name: '크루넥' },
    { slug: 'knit-cardigan', name: '가디건' },
  ]},
  { slug: 'pants', name: '팬츠', children: [
    { slug: 'pants-wide', name: '와이드' },
    { slug: 'pants-straight', name: '스트레이트' },
  ]},
  { slug: 'shoes', name: '슈즈', children: [] },
  { slug: 'accessory', name: '액세서리', children: [] },
];

/// 가맹점. PLAIN LABEL 은 자사 브랜드라 가맹점에 속하지 않는다(merchantId = null).
/// 자사 상품은 가맹점이 건드릴 수 없고 운영진만 다룬다 — authz 의 ownsMerchant 참고.
const MERCHANTS = [
  {
    name: '스튜디오눈', businessName: '주식회사 스튜디오눈',
    businessNumber: '000-00-00001', representative: '[대표자명]',
    contactEmail: 'contact@studionoon.test', contactPhone: '02-0000-0001',
    commissionPercent: 15, brands: ['studio-noon'],
  },
  {
    name: '아뜰리에케이', businessName: '아뜰리에케이',
    businessNumber: '000-00-00002', representative: '[대표자명]',
    contactEmail: 'contact@atelierk.test', contactPhone: '02-0000-0002',
    commissionPercent: 18, brands: ['atelier-k'],
  },
  {
    name: '무어', businessName: '무어컴퍼니',
    businessNumber: '000-00-00003', representative: '[대표자명]',
    contactEmail: 'contact@moor.test', contactPhone: '02-0000-0003',
    commissionPercent: 12, brands: ['moor'],
  },
];

const BRANDS = [
  { slug: 'studio-noon', name: 'STUDIO NOON' },
  { slug: 'atelier-k', name: 'ATELIER K' },
  { slug: 'moor', name: 'MOOR' },
  { slug: 'plain-label', name: 'PLAIN LABEL' },
];

interface SeedProduct {
  slug: string;
  name: string;
  description: string;
  brandSlug: string;
  categorySlug: string;
  listPrice: number;
  /** 실제 판매가. null 이면 정가 판매 */
  salePrice: number | null;
  colors: { value: string; hex: string }[];
  sizes: string[];
  /** 사이즈별 재고. 없는 사이즈는 0(품절)으로 둔다. */
  stock: Record<string, number>;
  /**
   * 평점은 시드하지 않는다.
   *
   * 집계 컬럼(ratingSum·reviewCount·ratingScore)의 진실은 reviews 테이블이고,
   * 리뷰를 쓸 때마다 원본을 다시 세어 갱신한다. 뒷받침하는 행 없이 숫자만
   * 넣어 두면 첫 리뷰가 그 숫자를 덮어써 갑자기 떨어진다.
   *
   * 두 값은 상품 정의에 남겨 두었지만 DB 에 넣지 않는다 — 나중에 실제 리뷰를
   * 시드할 때 목표치로 쓸 수 있다.
   */
  rating: number;
  reviewCount: number;
  soldCount: number;
}

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'oversized-wool-coat', name: '오버사이즈 울 블렌드 코트',
    description: '이탈리아산 울을 62% 혼방해 무게감은 덜고 보온성은 유지했습니다. 어깨선을 낮춘 오버핏이라 두꺼운 니트를 이너로 입어도 당기지 않고, 무릎 살짝 위 기장으로 코트 특유의 부담스러움을 덜었습니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-coat',
    listPrice: 413_000, salePrice: 289_000,
    colors: [{ value: '오트밀', hex: '#E6DFD3' }, { value: '차콜', hex: '#45423E' }, { value: '블랙', hex: '#181613' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stock: { S: 4, M: 12, L: 0, XL: 7 },
    rating: 4.8, reviewCount: 1204, soldCount: 3120,
  },
  {
    slug: 'short-padding-blouson', name: '숏 패딩 블루종',
    description: '가벼운 구스 충전재에 짧은 기장. 슬랙스에도 무리 없이 어울립니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-padding',
    listPrice: 198_000, salePrice: null,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '아이보리', hex: '#F0EBE2' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 30, M: 52, L: 30 },
    rating: 4.6, reviewCount: 318, soldCount: 640,
  },
  {
    slug: 'lambswool-crewneck', name: '램스울 크루넥 니트',
    description: '램스울 100%. 목둘레를 좁게 잡아 이너로 입기 편합니다.',
    brandSlug: 'atelier-k', categorySlug: 'knit-crewneck',
    listPrice: 129_000, salePrice: null,
    colors: [{ value: '차콜', hex: '#45423E' }, { value: '오트밀', hex: '#E6DFD3' }],
    sizes: ['M', 'L'],
    stock: { M: 4, L: 18 },
    rating: 4.9, reviewCount: 876, soldCount: 2140,
  },
  {
    slug: 'wool-double-jacket', name: '울 더블 브레스티드 자켓',
    description: '허리선을 잡아 준 더블 브레스티드. 안감까지 울로 마감했습니다.',
    brandSlug: 'atelier-k', categorySlug: 'outer-jacket',
    listPrice: 246_000, salePrice: null,
    colors: [{ value: '네이비', hex: '#2A3242' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 0, M: 0, L: 0 },
    rating: 4.9, reviewCount: 512, soldCount: 980,
  },
  {
    slug: 'cotton-twill-wide-pants', name: '코튼 트윌 와이드 팬츠',
    description: '두께감 있는 코튼 트윌. 밑단이 접히지 않게 기장을 넉넉히 뒀습니다.',
    brandSlug: 'moor', categorySlug: 'pants-wide',
    listPrice: 89_000, salePrice: 71_000,
    colors: [{ value: '베이지', hex: '#D9CEC4' }, { value: '블랙', hex: '#181613' }],
    sizes: ['28', '30', '32', '34'],
    stock: { '28': 40, '30': 88, '32': 76, '34': 42 },
    rating: 4.6, reviewCount: 2318, soldCount: 5240,
  },
  {
    slug: 'cable-knit-muffler', name: '케이블 니트 머플러',
    description: '울 혼방 케이블 니트. 한 바퀴 감아도 부하지 않은 두께입니다.',
    brandSlug: 'moor', categorySlug: 'accessory',
    listPrice: 68_000, salePrice: null,
    colors: [{ value: '오트밀', hex: '#E6DFD3' }, { value: '차콜', hex: '#45423E' }],
    sizes: ['FREE'],
    stock: { FREE: 120 },
    rating: 4.5, reviewCount: 327, soldCount: 810,
  },
  {
    slug: 'heavy-cotton-hoodie', name: '헤비 코튼 후디 · 차콜',
    description: '480g 헤비 코튼. 세탁 후에도 형태가 무너지지 않습니다.',
    brandSlug: 'plain-label', categorySlug: 'knit-crewneck',
    listPrice: 98_000, salePrice: null,
    colors: [{ value: '차콜', hex: '#45423E' }],
    sizes: ['M', 'L', 'XL'],
    stock: { M: 25, L: 41, XL: 19 },
    rating: 4.7, reviewCount: 1041, soldCount: 2380,
  },
  {
    slug: 'washed-denim-straight', name: '워시드 데님 스트레이트',
    description: '중청 워싱에 스트레이트 실루엣. 신축성 없는 원단입니다.',
    brandSlug: 'plain-label', categorySlug: 'pants-straight',
    listPrice: 112_000, salePrice: null,
    colors: [{ value: '인디고', hex: '#3A4A63' }],
    sizes: ['28', '30', '32'],
    stock: { '28': 22, '30': 35, '32': 28 },
    rating: 4.4, reviewCount: 211, soldCount: 470,
  },

  // ── 아래는 매대를 채우려고 나중에 더한 것들 ──────────────────────
  //
  // 처음 여덟 개는 화면을 만들면서 필요한 모양(할인 · 품절 · 옵션 많음)을
  // 하나씩 담당했다. 그것만으로는 **카테고리마다 한두 개**라 목록·필터·정렬이
  // 실제로 어떻게 보이는지 알 수 없었다. 슈즈와 가디건과 블루종은 아예
  // 비어 있었다.
  //
  // 값과 재고는 실제 있을 법한 폭으로 흩어 둔다. 전부 재고가 넉넉하면
  // 품절 표시도, 재입고 알림도, 마지막 한 장을 두고 벌어지는 일도 볼 수 없다.

  {
    slug: 'cashmere-blend-balmacaan', name: '캐시미어 혼방 발마칸 코트',
    description: '캐시미어를 12% 섞어 표면을 부드럽게 했습니다. 래글런 소매라 어깨가 좁거나 넓어도 선이 어색하지 않고, 앞을 여미지 않고 걸쳐 입어도 형태가 무너지지 않습니다.',
    brandSlug: 'atelier-k', categorySlug: 'outer-coat',
    listPrice: 529_000, salePrice: 419_000,
    colors: [{ value: '카멜', hex: '#B08A5E' }, { value: '차콜', hex: '#45423E' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 3, M: 9, L: 5 },
    rating: 4.7, reviewCount: 412, soldCount: 980,
  },
  {
    slug: 'single-chesterfield-coat', name: '싱글 체스터필드 코트',
    description: '허리선을 살짝 잡아 정장 위에도 어울립니다. 안감을 등판까지만 넣어 봄가을에도 입을 수 있게 했습니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-coat',
    listPrice: 368_000, salePrice: null,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '그레이', hex: '#8C8880' }],
    sizes: ['M', 'L', 'XL'],
    stock: { M: 11, L: 6, XL: 2 },
    rating: 4.5, reviewCount: 205, soldCount: 470,
  },
  {
    slug: 'hooded-duffle-coat', name: '후드 더플 코트',
    description: '토글 여밈과 후드. 소매 안쪽에 바람막이 립을 넣어 손목으로 들어오는 바람을 줄였습니다.',
    brandSlug: 'moor', categorySlug: 'outer-coat',
    listPrice: 289_000, salePrice: 219_000,
    colors: [{ value: '네이비', hex: '#2C3446' }, { value: '오트밀', hex: '#E6DFD3' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 0, M: 4, L: 0 },
    rating: 4.4, reviewCount: 96, soldCount: 240,
  },

  {
    slug: 'long-goose-down', name: '롱 구스 다운 패딩',
    description: '무릎 아래 기장에 충전재 800필. 목이 높아 머플러 없이도 버틸 수 있고, 옆선 지퍼로 앉을 때 당기지 않습니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-padding',
    listPrice: 459_000, salePrice: 329_000,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '카키', hex: '#5A5A48' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stock: { S: 6, M: 14, L: 9, XL: 0 },
    rating: 4.8, reviewCount: 733, soldCount: 1580,
  },
  {
    slug: 'light-down-vest', name: '라이트 다운 베스트',
    description: '자켓 안에 겹쳐 입기 좋은 두께. 접으면 주머니 하나에 들어갑니다.',
    brandSlug: 'plain-label', categorySlug: 'outer-padding',
    listPrice: 119_000, salePrice: null,
    colors: [{ value: '아이보리', hex: '#F0EBE2' }, { value: '블랙', hex: '#181613' }, { value: '올리브', hex: '#6B6B4E' }],
    sizes: ['M', 'L'],
    stock: { M: 22, L: 18 },
    rating: 4.3, reviewCount: 154, soldCount: 390,
  },

  {
    slug: 'linen-blend-blazer', name: '린넨 혼방 싱글 블레이저',
    description: '린넨을 42% 섞어 늦봄부터 초가을까지 입을 수 있습니다. 안감을 반만 넣어 가볍고, 구김이 남아도 이상해 보이지 않는 원단입니다.',
    brandSlug: 'atelier-k', categorySlug: 'outer-jacket',
    listPrice: 268_000, salePrice: 198_000,
    colors: [{ value: '베이지', hex: '#CDBFA7' }, { value: '네이비', hex: '#2C3446' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 8, M: 12, L: 3 },
    rating: 4.6, reviewCount: 288, soldCount: 610,
  },
  {
    slug: 'corduroy-work-jacket', name: '코듀로이 워크 자켓',
    description: '골이 굵은 코듀로이. 앞주머니를 크게 잡아 손을 넣어도 형태가 늘어지지 않습니다.',
    brandSlug: 'moor', categorySlug: 'outer-jacket',
    listPrice: 179_000, salePrice: null,
    colors: [{ value: '브라운', hex: '#6E5844' }, { value: '차콜', hex: '#45423E' }],
    sizes: ['M', 'L', 'XL'],
    stock: { M: 7, L: 10, XL: 4 },
    rating: 4.4, reviewCount: 121, soldCount: 265,
  },

  {
    slug: 'suede-trucker-blouson', name: '스웨이드 트러커 블루종',
    description: '허리에서 딱 떨어지는 기장. 스웨이드라 처음에는 뻣뻣하지만 몇 번 입으면 몸을 따라 접힙니다.',
    brandSlug: 'atelier-k', categorySlug: 'outer-blouson',
    listPrice: 349_000, salePrice: 279_000,
    colors: [{ value: '탠', hex: '#A67C52' }, { value: '블랙', hex: '#181613' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 2, M: 5, L: 1 },
    rating: 4.7, reviewCount: 176, soldCount: 320,
  },
  {
    slug: 'nylon-coach-jacket', name: '나일론 코치 자켓',
    description: '가벼운 나일론에 발수 가공. 소나기 정도는 털어 내고 접어서 가방에 넣을 수 있습니다.',
    brandSlug: 'plain-label', categorySlug: 'outer-blouson',
    listPrice: 98_000, salePrice: null,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '아이보리', hex: '#F0EBE2' }],
    sizes: ['M', 'L', 'XL'],
    stock: { M: 25, L: 30, XL: 12 },
    rating: 4.2, reviewCount: 342, soldCount: 890,
  },
  {
    slug: 'wool-varsity-blouson', name: '울 바시티 블루종',
    description: '몸판은 울, 소매는 가죽. 립 배색을 낮은 채도로 잡아 캐주얼한 형태지만 튀지 않습니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-blouson',
    listPrice: 289_000, salePrice: null,
    colors: [{ value: '차콜', hex: '#45423E' }],
    sizes: ['M', 'L'],
    stock: { M: 4, L: 6 },
    rating: 4.5, reviewCount: 88, soldCount: 190,
  },

  {
    slug: 'merino-turtleneck', name: '메리노 터틀넥 니트',
    description: '메리노 울 100%. 목을 두 번 접어 입도록 여유를 두었고, 세탁기 울 코스로 빨 수 있습니다.',
    brandSlug: 'atelier-k', categorySlug: 'knit-crewneck',
    listPrice: 149_000, salePrice: 119_000,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '오트밀', hex: '#E6DFD3' }, { value: '와인', hex: '#6E3140' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 9, M: 16, L: 11 },
    rating: 4.8, reviewCount: 521, soldCount: 1240,
  },
  {
    slug: 'cotton-cable-crewneck', name: '코튼 케이블 크루넥',
    description: '면 혼방이라 봄가을에 입기 좋습니다. 케이블 폭을 좁게 잡아 두께에 비해 부해 보이지 않습니다.',
    brandSlug: 'plain-label', categorySlug: 'knit-crewneck',
    listPrice: 89_000, salePrice: null,
    colors: [{ value: '아이보리', hex: '#F0EBE2' }, { value: '그레이', hex: '#8C8880' }],
    sizes: ['M', 'L'],
    stock: { M: 20, L: 14 },
    rating: 4.3, reviewCount: 198, soldCount: 520,
  },

  {
    slug: 'wool-knit-cardigan', name: '울 니트 가디건',
    description: '단추를 다 잠그면 니트처럼, 풀면 겉옷처럼 입을 수 있는 두께입니다. 앞단을 두 겹으로 대 늘어짐을 줄였습니다.',
    brandSlug: 'atelier-k', categorySlug: 'knit-cardigan',
    listPrice: 169_000, salePrice: 139_000,
    colors: [{ value: '차콜', hex: '#45423E' }, { value: '오트밀', hex: '#E6DFD3' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 5, M: 13, L: 7 },
    rating: 4.6, reviewCount: 267, soldCount: 590,
  },
  {
    slug: 'alpaca-shawl-cardigan', name: '알파카 숄 가디건',
    description: '알파카를 섞어 결이 깁니다. 숄 카라라 목이 허전하지 않고, 벨트 없이 여며 입어도 형태가 잡힙니다.',
    brandSlug: 'moor', categorySlug: 'knit-cardigan',
    listPrice: 229_000, salePrice: null,
    colors: [{ value: '카멜', hex: '#B08A5E' }, { value: '그레이', hex: '#8C8880' }],
    sizes: ['M', 'L'],
    stock: { M: 3, L: 0 },
    rating: 4.7, reviewCount: 143, soldCount: 280,
  },
  {
    slug: 'fine-gauge-cardigan', name: '파인 게이지 가디건',
    description: '얇게 짠 가디건. 셔츠 위에 겹쳐 입어도 부하지 않아 사무실에서 냉방 대비로 두기 좋습니다.',
    brandSlug: 'plain-label', categorySlug: 'knit-cardigan',
    listPrice: 79_000, salePrice: 59_000,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '베이지', hex: '#CDBFA7' }, { value: '네이비', hex: '#2C3446' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 18, M: 26, L: 21 },
    rating: 4.4, reviewCount: 389, soldCount: 1020,
  },

  {
    slug: 'wool-wide-slacks', name: '울 와이드 슬랙스',
    description: '허리는 밴딩, 앞은 주름. 밴딩이 겉에서 보이지 않게 안쪽으로만 넣어 정장 느낌을 남겼습니다.',
    brandSlug: 'atelier-k', categorySlug: 'pants-wide',
    listPrice: 139_000, salePrice: null,
    colors: [{ value: '차콜', hex: '#45423E' }, { value: '베이지', hex: '#CDBFA7' }],
    sizes: ['28', '30', '32', '34'],
    stock: { '28': 6, '30': 14, '32': 10, '34': 3 },
    rating: 4.5, reviewCount: 312, soldCount: 780,
  },
  {
    slug: 'linen-wide-pants', name: '린넨 와이드 팬츠',
    description: '여름용 린넨. 비침을 줄이려고 안단을 무릎까지 덧대 속옷 자국이 드러나지 않습니다.',
    brandSlug: 'moor', categorySlug: 'pants-wide',
    listPrice: 109_000, salePrice: 79_000,
    colors: [{ value: '아이보리', hex: '#F0EBE2' }, { value: '올리브', hex: '#6B6B4E' }],
    sizes: ['28', '30', '32'],
    stock: { '28': 0, '30': 8, '32': 5 },
    rating: 4.2, reviewCount: 167, soldCount: 430,
  },

  {
    slug: 'cotton-straight-chino', name: '코튼 스트레이트 치노',
    description: '무릎에서 밑단까지 폭이 일정합니다. 밑단을 한 번 접어 입어도 선이 흐트러지지 않는 두께입니다.',
    brandSlug: 'plain-label', categorySlug: 'pants-straight',
    listPrice: 89_000, salePrice: null,
    colors: [{ value: '베이지', hex: '#CDBFA7' }, { value: '블랙', hex: '#181613' }, { value: '올리브', hex: '#6B6B4E' }],
    sizes: ['28', '30', '32', '34'],
    stock: { '28': 12, '30': 24, '32': 19, '34': 7 },
    rating: 4.4, reviewCount: 455, soldCount: 1310,
  },
  {
    slug: 'raw-denim-straight', name: '로우 데님 스트레이트',
    description: '가공하지 않은 생지. 처음에는 뻣뻣하고 물이 빠지지만, 입는 사람의 주름이 그대로 남습니다.',
    brandSlug: 'moor', categorySlug: 'pants-straight',
    listPrice: 159_000, salePrice: null,
    colors: [{ value: '인디고', hex: '#31445E' }],
    sizes: ['30', '32', '34'],
    stock: { '30': 4, '32': 7, '34': 2 },
    rating: 4.6, reviewCount: 201, soldCount: 380,
  },

  {
    slug: 'leather-derby-shoes', name: '레더 더비 슈즈',
    description: '소가죽에 굿이어 웰트. 밑창을 갈아 오래 신도록 만든 구조라, 처음 몇 번은 뒤꿈치가 배깁니다.',
    brandSlug: 'atelier-k', categorySlug: 'shoes',
    listPrice: 329_000, salePrice: 259_000,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '브라운', hex: '#6E5844' }],
    sizes: ['250', '260', '270', '280'],
    stock: { '250': 3, '260': 8, '270': 6, '280': 2 },
    rating: 4.7, reviewCount: 234, soldCount: 470,
  },
  {
    slug: 'suede-chelsea-boots', name: '스웨이드 첼시 부츠',
    description: '옆면 고무 밴드. 발등이 높아도 신고 벗기 쉽고, 밑창을 두껍게 잡아 겨울 아스팔트에서 덜 미끄럽습니다.',
    brandSlug: 'studio-noon', categorySlug: 'shoes',
    listPrice: 289_000, salePrice: null,
    colors: [{ value: '탠', hex: '#A67C52' }, { value: '차콜', hex: '#45423E' }],
    sizes: ['250', '260', '270'],
    stock: { '250': 0, '260': 5, '270': 4 },
    rating: 4.5, reviewCount: 158, soldCount: 310,
  },
  {
    slug: 'canvas-low-sneakers', name: '캔버스 로우 스니커즈',
    description: '면 캔버스에 고무 밑창. 세탁기에 넣어도 형태가 크게 무너지지 않게 뒤축을 단단히 잡았습니다.',
    brandSlug: 'plain-label', categorySlug: 'shoes',
    listPrice: 79_000, salePrice: 59_000,
    colors: [{ value: '아이보리', hex: '#F0EBE2' }, { value: '블랙', hex: '#181613' }],
    sizes: ['250', '260', '270', '280'],
    stock: { '250': 15, '260': 28, '270': 22, '280': 9 },
    rating: 4.3, reviewCount: 612, soldCount: 1840,
  },
  {
    slug: 'wool-felt-loafers', name: '울 펠트 로퍼',
    description: '겉은 울 펠트, 안은 양모. 실내에서 신기 좋은 두께라 슬리퍼 대신 두는 분이 많습니다.',
    brandSlug: 'moor', categorySlug: 'shoes',
    listPrice: 119_000, salePrice: null,
    colors: [{ value: '그레이', hex: '#8C8880' }, { value: '네이비', hex: '#2C3446' }],
    sizes: ['250', '260', '270'],
    stock: { '250': 7, '260': 11, '270': 6 },
    rating: 4.1, reviewCount: 87, soldCount: 210,
  },

  {
    slug: 'leather-belt-35mm', name: '레더 벨트 35mm',
    description: '소가죽 한 장을 그대로 재단했습니다. 폭 35mm 라 슬랙스와 데님 어느 쪽에도 어색하지 않습니다.',
    brandSlug: 'atelier-k', categorySlug: 'accessory',
    listPrice: 89_000, salePrice: null,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '브라운', hex: '#6E5844' }],
    sizes: ['85', '90', '95', '100'],
    stock: { '85': 9, '90': 14, '95': 10, '100': 4 },
    rating: 4.6, reviewCount: 176, soldCount: 420,
  },
  {
    slug: 'wool-beanie', name: '울 비니',
    description: '접어 쓰는 길이. 이마에 닿는 면만 면 안감을 대 울이 직접 닿지 않습니다.',
    brandSlug: 'plain-label', categorySlug: 'accessory',
    listPrice: 39_000, salePrice: 29_000,
    colors: [{ value: '차콜', hex: '#45423E' }, { value: '오트밀', hex: '#E6DFD3' }, { value: '와인', hex: '#6E3140' }],
    sizes: ['FREE'],
    stock: { FREE: 46 },
    rating: 4.4, reviewCount: 298, soldCount: 910,
  },
  {
    slug: 'leather-card-wallet', name: '레더 카드 지갑',
    description: '카드 여섯 장과 지폐 몇 장. 두께를 늘리지 않으려고 안주머니를 하나만 두었습니다.',
    brandSlug: 'studio-noon', categorySlug: 'accessory',
    listPrice: 69_000, salePrice: null,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '탠', hex: '#A67C52' }],
    sizes: ['FREE'],
    stock: { FREE: 0 },
    rating: 4.5, reviewCount: 132, soldCount: 350,
  },
];

async function main(): Promise<void> {
  console.log('시드 시작');

  // ── 카테고리 (부모 먼저, 자식 나중)
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: i },
      create: { slug: c.slug, name: c.name, sortOrder: i },
    });
    for (const [j, child] of c.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, sortOrder: j },
        create: { slug: child.slug, name: child.name, parentId: parent.id, sortOrder: j },
      });
    }
  }
  console.log(`  카테고리 ${CATEGORIES.length}개 (하위 포함)`);

  // ── 브랜드
  for (const b of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: b.slug }, update: { name: b.name }, create: b,
    });
  }
  console.log(`  브랜드 ${BRANDS.length}개`);
  // ── 가맹점 + 브랜드 연결
  for (const m of MERCHANTS) {
    const { brands, ...data } = m;
    const merchant = await prisma.merchant.upsert({
      where: { businessNumber: m.businessNumber },
      update: { status: 'APPROVED', approvedAt: new Date('2026-01-15T00:00:00Z') },
      create: { ...data, status: 'APPROVED', approvedAt: new Date('2026-01-15T00:00:00Z') },
    });
    await prisma.brand.updateMany({
      where: { slug: { in: brands } },
      data: { merchantId: merchant.id },
    });
  }
  console.log(`  가맹점 ${MERCHANTS.length}개 (PLAIN LABEL 은 자사 브랜드)`);


  // ── 상품 · 옵션 · 변형
  let variantCount = 0;
  for (const p of PRODUCTS) {
    const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: p.brandSlug } });
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: p.categorySlug } });

    const totalStock = Object.values(p.stock).reduce((a, b) => a + b, 0);
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name, description: p.description, listPrice: p.listPrice,
        // 검색이 보는 칸. 어드민 쓰기 경로와 같은 규칙을 쓴다 — 여기서
        // 빠뜨렸더니 갓 시드한 DB 에서 검색이 아무것도 못 찾았다.
        searchText: searchTextFor({ name: p.name, brandName: brand.name }),
        salePrice: p.salePrice, brandId: brand.id, categoryId: category.id,
        status: totalStock === 0 ? 'SOLD_OUT' : 'ACTIVE',
        // 평점 집계는 여기서 건드리지 않는다. reviews 테이블이 진실이고
        // seedReviews 가 원본을 세어 채운다. 여기서 0 으로 되돌리면
        // 시드를 두 번 돌렸을 때 이미 쌓인 리뷰의 집계가 사라진다.
        soldCount: p.soldCount,
        publishedAt: new Date('2026-07-01T00:00:00Z'),
      },
      create: {
        slug: p.slug, name: p.name, description: p.description,
        searchText: searchTextFor({ name: p.name, brandName: brand.name }),
        listPrice: p.listPrice, salePrice: p.salePrice,
        brandId: brand.id, categoryId: category.id,
        status: totalStock === 0 ? 'SOLD_OUT' : 'ACTIVE',
        // 평점은 0 에서 시작한다. 뒷받침하는 Review 행 없이 숫자만 넣으면
        // 첫 리뷰가 그 숫자를 덮어써 "리뷰 2,318개" 가 갑자기 1개가 된다.
        ratingSum: 0, reviewCount: 0,
        soldCount: p.soldCount,
        publishedAt: new Date('2026-07-01T00:00:00Z'),
      },
    });

    const colorGroup = await prisma.productOptionGroup.upsert({
      where: { productId_name: { productId: product.id, name: '색상' } },
      update: { sortOrder: 0 },
      create: { productId: product.id, name: '색상', sortOrder: 0 },
    });
    const sizeGroup = await prisma.productOptionGroup.upsert({
      where: { productId_name: { productId: product.id, name: '사이즈' } },
      update: { sortOrder: 1 },
      create: { productId: product.id, name: '사이즈', sortOrder: 1 },
    });

    for (const [i, c] of p.colors.entries()) {
      await prisma.productOptionValue.upsert({
        where: { groupId_value: { groupId: colorGroup.id, value: c.value } },
        update: { swatchHex: c.hex, sortOrder: i },
        create: { groupId: colorGroup.id, value: c.value, swatchHex: c.hex, sortOrder: i },
      });
    }
    for (const [i, s] of p.sizes.entries()) {
      await prisma.productOptionValue.upsert({
        where: { groupId_value: { groupId: sizeGroup.id, value: s } },
        update: { sortOrder: i },
        create: { groupId: sizeGroup.id, value: s, sortOrder: i },
      });
    }

    // 색상 × 사이즈 전 조합을 SKU로 만든다
    for (const color of p.colors) {
      const colorValue = await prisma.productOptionValue.findUniqueOrThrow({
        where: { groupId_value: { groupId: colorGroup.id, value: color.value } },
      });
      for (const size of p.sizes) {
        const sizeValue = await prisma.productOptionValue.findUniqueOrThrow({
          where: { groupId_value: { groupId: sizeGroup.id, value: size } },
        });
        const sku = `${p.slug}-${color.value}-${size}`.toUpperCase().replace(/\s+/g, '');
        await prisma.productVariant.upsert({
          where: { sku },
          update: {
            label: `${color.value} / ${size}`,
            stock: p.stock[size] ?? 0,
            isActive: true,
            optionValues: { set: [{ id: colorValue.id }, { id: sizeValue.id }] },
          },
          create: {
            sku, productId: product.id,
            label: `${color.value} / ${size}`,
            stock: p.stock[size] ?? 0,
            optionValues: { connect: [{ id: colorValue.id }, { id: sizeValue.id }] },
          },
        });
        variantCount += 1;
      }
    }
  }
  console.log(`  상품 ${PRODUCTS.length}개 · 변형 ${variantCount}개`);

  // ── 쿠폰
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10000' },
    update: {},
    create: {
      code: 'WELCOME10000', name: '신규회원 10,000원 할인', kind: 'AMOUNT',
      value: 10_000, minimumOrder: 30_000,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
    },
  });
  await prisma.coupon.upsert({
    where: { code: 'AUTUMN20' },
    update: {},
    create: {
      code: 'AUTUMN20', name: '가을 아우터 20% (최대 3만원)', kind: 'PERCENT',
      percent: 20, maxDiscount: 30_000, minimumOrder: 50_000,
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-11-30T23:59:59Z'),
    },
  });
  console.log('  쿠폰 2개');

  // 계정은 @shop/auth 의 시드가 만든다. 비밀번호 해시를 여기서 흉내 내지 않고
  // 실제 가입 API 를 호출하기 위해서다. pnpm db:seed 가 두 단계를 이어서 돌린다.

  await seedCollections();

  await seedSupport();

  await seedReviews();

  console.log('시드 완료');
}

main()
  .catch((e: unknown) => {
    console.error('시드 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
