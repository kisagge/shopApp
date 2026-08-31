import { won, type Won } from '@shop/core';

/**
 * 화면을 세우기 위한 임시 데이터. packages/db 의 Prisma 스키마가 붙으면
 * 이 파일은 사라지고 서버 컴포넌트가 DB에서 직접 읽는다.
 */
export interface SampleProduct {
  readonly slug: string;
  readonly brand: string;
  readonly name: string;
  readonly price: Won;
  readonly listPrice?: Won;
  readonly discountPercent?: number;
  readonly rating: number;
  readonly reviewCount: number;
  readonly soldOut?: boolean;
  readonly isNew?: boolean;
  readonly tone: 'sand' | 'stone' | 'clay' | 'olive' | 'mist';
}

export const SAMPLE_PRODUCTS: readonly SampleProduct[] = [
  {
    slug: 'oversized-wool-coat', brand: 'STUDIO NOON', name: '오버사이즈 울 블렌드 코트',
    price: won(289_000), listPrice: won(413_000), discountPercent: 30,
    rating: 4.8, reviewCount: 1204, tone: 'sand',
  },
  {
    slug: 'lambswool-crewneck', brand: 'ATELIER K', name: '램스울 크루넥 니트',
    price: won(129_000), rating: 4.9, reviewCount: 876, tone: 'stone',
  },
  {
    slug: 'cotton-twill-wide-pants', brand: 'MOOR', name: '코튼 트윌 와이드 팬츠',
    price: won(71_200), listPrice: won(89_000), discountPercent: 20,
    rating: 4.6, reviewCount: 2318, tone: 'clay',
  },
  {
    slug: 'heavy-cotton-hoodie', brand: 'PLAIN LABEL', name: '헤비 코튼 후디 · 차콜',
    price: won(98_000), rating: 4.7, reviewCount: 1041, tone: 'olive',
  },
  {
    slug: 'cable-knit-muffler', brand: 'MOOR', name: '케이블 니트 머플러',
    price: won(68_000), rating: 4.5, reviewCount: 327, isNew: true, tone: 'mist',
  },
  {
    slug: 'wool-double-jacket', brand: 'ATELIER K', name: '울 더블 브레스티드 자켓',
    price: won(246_000), rating: 4.9, reviewCount: 512, soldOut: true, tone: 'clay',
  },
];
