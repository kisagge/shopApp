import { describe, it, expect } from 'vitest';
import {
  PRODUCT_REPORT_REASON, AUTO_ARCHIVE_ON_REPORTS, isProductReportReason,
  productReportPriority, productReportState, PRODUCT_REPORT_RESOLUTION,
  type ProductReportReason,
} from '../src/product-report';

/**
 * 상품 신고 규칙.
 *
 * 리뷰 신고와 **다른 집합**이라는 것이 이 파일의 요점이다. 글을 신고하는 말로는 파는
 * 물건을 가리킬 수 없고, 짝퉁·금지 품목은 글에 쓸 말이 아니다.
 */

describe('사유 집합', () => {
  it('상품을 가리키는 말만 있다 — 글을 신고하는 말이 섞이면 화면이 고를 수 없는 것을 보여 준다', () => {
    expect([...PRODUCT_REPORT_REASON]).toEqual([
      'COUNTERFEIT', 'PROHIBITED', 'WRONG_INFO', 'UNSAFE', 'OTHER',
    ]);
  });

  it.each(PRODUCT_REPORT_REASON)('%s 는 사유로 받는다', (reason) => {
    expect(isProductReportReason(reason)).toBe(true);
  });

  /** 리뷰 신고의 말이 그대로 들어오면 거절해야 한다 — 두 집합을 섞지 않는 이유다 */
  it.each(['SPAM', 'ABUSE', 'IRRELEVANT', 'PRIVACY', 'counterfeit', ''])(
    '%s 는 사유가 아니다',
    (value) => {
      expect(isProductReportReason(value)).toBe(false);
    },
  );
});

describe('자동으로 내리지 않는다', () => {
  /**
   * 내려가는 것이 남의 매출이다. 계정 몇 개로 경쟁 브랜드의 잘 팔리는 상품을 대기줄에
   * 올려 자동으로 내릴 수 있다면 신고는 신호가 아니라 무기가 된다.
   */
  it('신고가 쌓여도 사람이 정한다', () => {
    expect(AUTO_ARCHIVE_ON_REPORTS).toBe(false);
  });
});

describe('처리 순서', () => {
  const of = (...reasons: ProductReportReason[]) => reasons.map((reason) => ({ reason }));

  it('신고가 없으면 0 이다', () => {
    expect(productReportPriority([])).toBe(0);
  });

  /** 법과 안전이 먼저다 — 팔리는 동안 계속 커지고 우리가 책임을 진다 */
  it.each([
    ['PROHIBITED', 'COUNTERFEIT'],
    ['UNSAFE', 'COUNTERFEIT'],
    ['COUNTERFEIT', 'WRONG_INFO'],
    ['WRONG_INFO', 'OTHER'],
  ] as const)('%s 한 건이 %s 한 건보다 먼저다', (heavier, lighter) => {
    expect(productReportPriority(of(heavier))).toBeGreaterThan(productReportPriority(of(lighter)));
  });

  /**
   * **같은 사유가 쌓이는 것보다 사유가 갈리는 쪽을 위로.** 같은 사유 여러 건은 한 사람이
   * 계정을 바꿔 가며 누른 것일 수 있지만, 사유가 갈린다는 것은 서로 다른 이유로 눈에
   * 걸렸다는 뜻이다.
   */
  it('서로 다른 사유 둘이 같은 사유 여럿보다 먼저다', () => {
    const mixed = productReportPriority(of('WRONG_INFO', 'OTHER'));
    const same = productReportPriority(of('WRONG_INFO', 'WRONG_INFO', 'WRONG_INFO'));

    expect(mixed).toBeGreaterThan(same);
  });

  it('건수를 아예 무시하지는 않는다 — 그러면 진짜 도배를 놓친다', () => {
    expect(productReportPriority(of('OTHER', 'OTHER'))).toBeGreaterThan(
      productReportPriority(of('OTHER')),
    );
  });

  it('같은 사유를 여러 번 세지 않는다 — 한 사람이 여러 계정으로 누를 수 있다', () => {
    // 사유별로는 가장 무거운 것 하나만 센다. 더해지는 것은 건수뿐이다.
    const once = productReportPriority(of('PROHIBITED'));
    const twice = productReportPriority(of('PROHIBITED', 'PROHIBITED'));

    expect(twice - once).toBe(1);
  });
});

describe('상품 하나의 처리 상태', () => {
  it('신고가 없으면 clean', () => {
    expect(productReportState({ archived: false, openReports: 0, totalReports: 0 })).toBe('clean');
  });

  it('처리 안 된 신고가 있으면 reported', () => {
    expect(productReportState({ archived: false, openReports: 1, totalReports: 3 })).toBe('reported');
  });

  it('전부 처리했고 상품이 남아 있으면 kept', () => {
    expect(productReportState({ archived: false, openReports: 0, totalReports: 3 })).toBe('kept');
  });

  /** 이미 끝난 건이다. 대기줄에 다시 세우면 같은 일을 두 번 처리한다. */
  it('내려간 상품은 신고가 남아 있어도 archived', () => {
    expect(productReportState({ archived: true, openReports: 5, totalReports: 5 })).toBe('archived');
  });
});

describe('처리 결과로 적는 값', () => {
  it('둘뿐이다 — 문제없음과 내림', () => {
    expect([...PRODUCT_REPORT_RESOLUTION]).toEqual(['kept', 'archived']);
  });
});
