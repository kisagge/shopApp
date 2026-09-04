import type { Message } from '../message';

/**
 * 한국어 사전 — **이 파일이 열쇠 목록의 원본이다.**
 *
 * 다른 언어 사전은 이 객체의 모양을 그대로 따르도록 타입이 걸려 있어서,
 * 여기에 열쇠를 하나 더하면 나머지 두 벌이 컴파일에서 막힌다. 번역이 빠진 채
 * 배포되어 영어 화면에 한국어가 섞이는 일을 사람의 주의력이 아니라 타입으로
 * 막으려는 것이다. 반대로 안 쓰는 열쇠를 지우면 세 벌에서 같이 지워진다.
 *
 * 열쇠는 `화면.무엇` 으로 적는다. 문장을 열쇠로 쓰면(영어 원문을 열쇠로 쓰는
 * 방식) 문구를 다듬을 때마다 세 벌을 모두 고쳐야 한다.
 */
export const ko = {
  // ── 공통 ────────────────────────────────────────────────
  'common.brand': 'PLAIN',
  'common.search': '검색',
  'common.cancel': '취소',
  'common.confirm': '확인',
  'common.close': '닫기',
  'common.loading': '불러오는 중',
  'common.retry': '다시 시도',
  'common.more': '더 보기',
  'common.won': '{amount}',

  // ── 헤더·푸터 ────────────────────────────────────────────
  'nav.skipToContent': '본문 바로가기',
  'nav.menu': '메뉴',
  'nav.categories': '주요 카테고리',
  'nav.categoriesPlain': '카테고리',
  'nav.categoriesFooter': '카테고리 (푸터)',
  'nav.searchLabel': '상품 검색',
  'nav.searchPlaceholder': '상품 · 브랜드',
  'nav.home': '홈',
  'nav.breadcrumb': '현재 위치',
  'nav.cart': '장바구니',
  'nav.cartCount': { one: '장바구니, 상품 {count}개', other: '장바구니, 상품 {count}개' },
  'nav.login': '로그인',
  'nav.logout': '로그아웃',
  'nav.mypage': '마이페이지',
  'nav.merchantApply': '입점 신청',
  'nav.language': '언어',
  'nav.languageChange': '언어 선택',
  'footer.disclaimer': '포트폴리오 목적으로 제작된 화면입니다. 브랜드명과 사업자 정보는 플레이스홀더입니다.',

  // ── 카테고리 이름 ────────────────────────────────────────
  'category.outer': '아우터',
  'category.outer-coat': '코트',
  'category.outer-padding': '패딩',
  'category.outer-jacket': '자켓',
  'category.outer-blouson': '블루종',
  'category.knit': '니트',
  'category.knit-crewneck': '크루넥',
  'category.knit-cardigan': '가디건',
  'category.pants': '팬츠',
  'category.pants-wide': '와이드',
  'category.pants-straight': '스트레이트',
  'category.shoes': '슈즈',
  'category.accessory': '액세서리',

  // ── 역할 배지 ────────────────────────────────────────────
  'role.superAdmin': '슈퍼관리자',
  'role.admin': '관리자',
  'role.merchant': '가맹점',

  // ── 목록·검색 ────────────────────────────────────────────
  'price.listPrice': '정가',
  'price.discount': '할인',
  'category.subcategories': '하위 카테고리',
  'category.all': '전체',
  'catalog.productList': '상품 목록',
  'catalog.sort': '정렬',
  'catalog.sortNewest': '신상품순',
  'catalog.sortPriceAsc': '낮은 가격순',
  'catalog.sortPriceDesc': '높은 가격순',
  'catalog.sortRecommended': '추천순',
  'catalog.sortRating': '평점순',
  'catalog.priceRange': '가격대',
  'catalog.minPrice': '최소 가격',
  'catalog.maxPrice': '최대 가격',
  'catalog.apply': '적용',
  'catalog.reset': '초기화',
  'catalog.empty': '조건에 맞는 상품이 없습니다.',
  'catalog.count': { one: '상품 {count}개', other: '상품 {count}개' },
  'catalog.totalCount': '총 {count}개',
  'catalog.showMore': '상품 더 보기',
  'catalog.noLimit': '제한 없음',
  'catalog.resetPrice': '가격 초기화',
  'catalog.prev': '이전',
  'catalog.next': '다음',
  'catalog.soldOut': '품절',
  'catalog.discount': '{percent} 할인',

  'empty.title': '조건에 맞는 상품이 없습니다',
  'empty.searchTitle': '검색 결과가 없습니다',
  'empty.widen_price': '가격 범위를 넓혀 보세요.',
  'empty.widen_category': '카테고리를 넓혀 보세요.',
  'empty.widen_both': '가격 범위와 카테고리를 넓혀 보세요.',
  'empty.other_term': '다른 검색어를 써 보시거나 철자를 확인해 주세요.',
  'empty.no_products': '아직 등록된 상품이 없습니다.',

  'search.heading': '검색',
  'search.resultsFor': '“{term}” 검색 결과',
  'search.prompt': '찾으시는 상품명이나 브랜드를 입력해 주세요.',
  'search.tooShort': '검색어는 {min}글자 이상 입력해 주세요.',

  // ── 상품 상세 ────────────────────────────────────────────
  'product.addToCart': '장바구니 담기',
  'product.buyNow': '바로 구매',
  'product.soldOut': '품절',
  'product.selectOption': '옵션을 선택해 주세요',
  'product.quantity': '수량',
  'product.wishlistAdd': '찜하기',
  'product.wishlistRemove': '찜 해제',
  'product.restock': '재입고 알림 받기',
  'product.restockDone': '재입고 알림 신청됨',
  'product.reviews': '리뷰',
  'product.reviewCount': { one: '리뷰 {count}개', other: '리뷰 {count}개' },
  'product.noReviews': '아직 리뷰가 없습니다.',
  'product.inquiries': '상품 문의',
  'product.notFound': '상품을 찾을 수 없습니다',
  'product.mainImage': '{name} 대표 이미지',
  'product.photoCredit': '사진',
  'product.allSoldOut': '전 옵션 품절',
  'product.rewardLabel': '적립',
  'product.rewardValue': '구매 시 {points}P 적립 ({percent}%)',
  'product.shippingLabel': '배송',
  'product.shippingValue': '{threshold} 이상 무료배송 · 제주·도서산간 {surcharge} 추가',
  'product.info': '상품 정보',

  // ── 장바구니 ────────────────────────────────────────────
  'recent.heading': '최근 본 상품',
  'recent.clear': '기록 지우기',
  'recent.cleared': '최근 본 상품을 지웠습니다',
  'recent.note': '이 목록은 이 기기에만 남고 서버로 보내지 않습니다.',

  'cartIssue.NOT_FOUND': '판매가 종료된 상품입니다',
  'cartIssue.INACTIVE': '판매가 중지된 옵션입니다',
  'cartIssue.SOLD_OUT': '품절되었습니다',
  'cartIssue.STOCK_REDUCED': '재고가 부족해 수량을 줄였습니다',

  'cart.heading': '장바구니',
  'cart.empty': '장바구니가 비어 있습니다.',
  'cart.emptyAction': '쇼핑 계속하기',
  'cart.remove': '삭제',
  'cart.subtotal': '상품 금액',
  'cart.shippingFee': '배송비',
  'cart.discount': '할인',
  'cart.total': '결제 예정 금액',
  'cart.checkout': '주문하기',
  'cart.freeShipping': '무료',
  'cart.itemUnavailable': '판매하지 않는 상품입니다',
  'cart.stockShort': '재고가 {count}개 남았습니다',
  'cart.selectAll': '전체선택',
  'cart.deleteSelected': '선택삭제',
  'cart.nothingBuyable': '주문할 수 있는 상품이 없습니다',
  'cart.checkoutCount': '주문하기 ({count})',
  'cart.selectItem': '{name} 주문 상품으로 선택',
  'cart.itemImage': '{name} 상품 이미지',
  'cart.removeItem': '{name} 장바구니에서 삭제',
  'cart.decrease': '수량 줄이기',
  'cart.increase': '수량 늘리기',
  'cart.quantityOf': '수량 {count}개',
  'cart.calculating': '계산 중…',
  'cart.selectToCalculate': '선택하면 계산됩니다',
  'cart.selectSomething': '주문할 상품을 선택해 주세요.',
  'cart.quoteFailed': '금액을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  'cart.summary': '결제 예정 금액',
  'cart.productDiscount': '상품 할인',
  'cart.couponDiscount': '쿠폰 할인',
  'cart.couponDiscountNamed': '쿠폰 할인 ({name})',
  'cart.pointsUsed': '포인트 사용',
  'cart.payable': '결제 예정',
  'cart.freeShippingLeft': '더 담으면 무료배송입니다',
  'cart.rewardPreview': '구매 시 {amount}P 적립 예정',
  'cart.goShopping': '쇼핑하러 가기',
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof ko;

/** 세 벌이 같은 모양이어야 한다는 규칙 자체 */
export type Dictionary = { readonly [K in MessageKey]: Message };
