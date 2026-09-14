import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 주문의 줄을 **한꺼번에** 바꾸는 곳은 취소된 줄을 건드리지 않는다.
 *
 * 부분 취소가 생기기 전에는 "주문의 줄 전부" 가 곧 "살아 있는 줄 전부" 였다. 이제는 아니다 —
 * 출고 전에 취소된 줄이 섞여 있다. `where: { orderId }` 만 걸고 상태를 바꾸면:
 *
 * - 구매확정 배치가 취소된 줄을 확정으로 되살린다 → 정산이 판 적 없는 줄을 센다
 * - 반품 접수가 취소된 줄까지 반품접수로 옮긴다 → 돌려받지도 않은 물건을 기다린다
 * - 환불이 취소 시각을 새로 찍는다 → 가맹점 환불이 두 날짜에 잡힌다
 *
 * 화면은 멀쩡해 보여서 **아무도 모른다.** 그래서 소스를 읽어 지킨다.
 */

const SRC = join(process.cwd(), 'src');

/** 취소된 줄이 있을 수 없는 자리와 그 이유 */
const EXEMPT: Readonly<Record<string, string>> = {
  'lib/payments/deposit.ts': '결제대기 → 결제완료. 일부 취소는 결제가 끝난 뒤에만 된다(cancel-items 의 NOT_PAID).',
  'lib/orders/confirm-payment.ts': '같은 이유 — 결제 승인 순간에는 취소된 줄이 없다.',
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** `orderItem.updateMany({ where: { orderId ... } })` 의 where 덩어리 */
function orderWideUpdates(source: string): string[] {
  // where 앞에 한 줄 주석이 끼어 있어도 찾는다 — 처음에 그걸 못 봐서 두 곳을 놓쳤다
  return [...source.matchAll(/orderItem\.updateMany\(\{(?:\s|\/\/[^\n]*\n)*where:\s*\{([^}]*orderId[^}]*)\}/g)]
    .map((m) => m[1]!);
}

describe('줄을 한꺼번에 바꾸는 곳', () => {
  const hits = walk(SRC)
    .map((file) => ({ rel: file.slice(SRC.length + 1), wheres: orderWideUpdates(readFileSync(file, 'utf8')) }))
    .filter((h) => h.wheres.length > 0);

  it('그런 자리를 실제로 찾아냈다', () => {
    // 정규식이 어긋나면 아래가 조용히 통과한다. 지금 여섯 파일이다
    expect(hits.length).toBeGreaterThanOrEqual(6);
  });

  it.each(hits.map((h) => [h.rel, h.wheres] as const))('%s 는 취소된 줄을 거른다', (rel, wheres) => {
    if (rel in EXEMPT) return;
    for (const where of wheres) {
      expect(where, `${rel} 가 주문의 줄 전부를 바꾼다. canceledAt: null 을 걸거나 EXEMPT 에 이유를 적는다`)
        .toContain('canceledAt: null');
    }
  });

  it('면제 목록이 실제로 있는 파일을 가리킨다', () => {
    for (const rel of Object.keys(EXEMPT)) {
      expect(hits.some((h) => h.rel === rel), `${rel} 는 더 이상 줄을 한꺼번에 바꾸지 않는다`).toBe(true);
    }
  });
});
