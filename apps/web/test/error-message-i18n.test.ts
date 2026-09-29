import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DICTIONARIES } from '@shop/i18n/all';

/**
 * 손님에게 가는 오류 문구가 **세 언어로** 나가는지 지킨다.
 *
 * 검증 실패(`valid.*`)는 진작에 이 길로 옮겼는데, 도메인 오류는 아니었다 — 오류 클래스 서른아홉 개가
 * 한국어 문장을 품고 있었고, 그 문장이 `apiError` 를 지나 그대로 나갔다. **일본어로 주문하던 사람이
 * 재고가 모자랄 때만 한국어를 봤다.** 화면은 서버가 준 message 를 그대로 보여 주므로 눈에 띄지도 않는다.
 *
 * 되돌아오기 쉽다. 새 오류를 더할 때 옆줄을 복사하는 것이 가장 손쉬운 길이고, **한국어로 보면 멀쩡하다.**
 *
 * ── 운영 화면은 한국어다 ─────────────────────────────────────
 * 운영진이 쓰는 화면은 한국어라고 정해 두었다(api/respond 의 주석). 그래서 여기서 보는 것은 **손님이
 * 닿는 자리**뿐이다 — 아래 목록이 그 자리다. 운영 전용 문구는 한국어로 남아 있어도 된다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

/** 손님이 닿는 창구가 부르는 파일들. 여기서 나가는 문구는 사람이 고른 말로 나가야 한다 */
const CUSTOMER_FACING = [
  'apps/web/src/lib/orders/create-order.ts',
  'apps/web/src/lib/orders/confirm-payment.ts',
  'apps/web/src/lib/orders/confirm-purchase.ts',
  'apps/web/src/lib/orders/update-address.ts',
  'apps/web/src/lib/addresses/manage-address.ts',
  'apps/web/src/lib/wishlist/wishlist.ts',
  'apps/web/src/lib/restock/notify.ts',
  'apps/web/src/lib/account/close-account.ts',
  'apps/web/src/lib/reviews/helpful.ts',
  'packages/core/src/image.ts',
  'packages/core/src/restock.ts',
  'packages/core/src/exchange.ts',
  'packages/core/src/review-report.ts',
  'packages/core/src/account-closure.ts',
];

/**
 * 한국어로 남겨 둔 자리. **이유와 함께 적는다.**
 *
 * 한 파일의 오류가 전부 손님 것은 아니다 — 같은 표에 운영진만 보는 줄이 섞여 있다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  "'처리할 신고가 없습니다.'": '운영진이 신고를 내리는 자리다 — 손님은 닿지 않는다',
};

/** 오류를 만드는 자리. 두 번째 인자가 문구다 */
const THROW = /new [A-Z][A-Za-z]*Error\(\s*'[^']*'\s*,\s*('[^']*')/g;
/** 코드별 문구 표. `CODE: '문구',` 꼴 */
const TABLE_LINE = /^\s{2}[A-Z_]+: ('[^']*'|`[^`]*`),$/gm;

const HANGUL = /[가-힣]/;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const ko = DICTIONARIES.ko as Record<string, unknown>;
const en = DICTIONARIES.en as Record<string, unknown>;
const ja = DICTIONARIES.ja as Record<string, unknown>;

describe('손님에게 가는 오류 문구', () => {
  it('볼 파일을 실제로 읽었다 — 못 읽으면 아래가 전부 헛돈다', () => {
    for (const path of CUSTOMER_FACING) expect(read(path).length, path).toBeGreaterThan(100);
  });

  it.each(CUSTOMER_FACING)('%s 는 한국어 문장을 박아 두지 않는다', (path) => {
    const source = read(path);
    const literals = [
      ...[...source.matchAll(THROW)].map((m) => m[1]!),
      ...[...source.matchAll(TABLE_LINE)].map((m) => m[1]!),
    ];

    expect(
      literals.filter((l) => HANGUL.test(l) && !(l in EXEMPT)),
      '사전 열쇠를 적으세요 — 번역은 apiError 가 한다',
    ).toEqual([]);
  });

  /**
   * 열쇠를 잘못 적으면 **그 열쇠가 그대로 사람에게 보인다.** 번역기는 없는 열쇠에 화면을 걸지 않고
   * 이름을 그대로 돌려주므로(translatorFor), 오타는 조용히 `err.order.notFund` 로 나간다.
   */
  it('오류가 부르는 열쇠가 세 사전에 모두 있다', () => {
    const source = [
      ...CUSTOMER_FACING,
      'apps/web/src/lib/orders/cancel-order.ts',
      'apps/web/src/lib/orders/return-request.ts',
      'packages/core/src/return-request.ts',
      'packages/core/src/review.ts',
      'packages/core/src/inquiry.ts',
      'packages/contract/src/order.ts',
    ]
      .map(read)
      .join('\n');

    const used = [...new Set([...source.matchAll(/'(err\.[a-zA-Z.]+)'/g)].map((m) => m[1]!))];
    expect(used.length, '오류 열쇠를 하나도 못 찾았다').toBeGreaterThan(20);

    expect(used.filter((k) => !(k in ko)), '한국어 사전에 없다').toEqual([]);
    expect(used.filter((k) => !(k in en)), '영어 사전에 없다').toEqual([]);
    expect(used.filter((k) => !(k in ja)), '일본어 사전에 없다').toEqual([]);
  });

  /**
   * **끼워 넣을 자리가 있으면 값도 함께 와야 한다.** `{max}` 만 있고 값이 없으면 번역기는 그 자리를
   * 그대로 둔다 — "배송지는 {max}개까지 저장할 수 있습니다" 가 사람에게 보인다.
   */
  it('자리를 가진 문구는 세 사전이 같은 자리를 쓴다', () => {
    const slots = (text: unknown): string =>
      [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');

    const mismatched = Object.keys(ko)
      .filter((k) => k.startsWith('err.'))
      .filter((k) => slots(ko[k]) !== slots(en[k]) || slots(ko[k]) !== slots(ja[k]));

    expect(mismatched, '한 언어에서만 값이 빠지면 그 언어만 자리가 드러난다').toEqual([]);
  });
});
