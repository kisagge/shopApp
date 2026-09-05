import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 첫 화면 밖의 조회가 첫 화면을 붙잡지 않게 지킨다.
 *
 * 상품 화면은 예전에 리뷰·문의·추천을 **모두 기다린 뒤에** 첫 바이트를
 * 보냈다. 상품 사진과 가격은 진작 준비됐는데도 아무 픽셀도 나가지 않았다.
 *
 * 되돌아오기 쉬운 종류다 — 조회 하나를 위쪽 Promise.all 에 끼워 넣는 것이
 * 가장 손쉬운 길이고, 그렇게 하는 순간 경계가 조용히 사라진다. 화면에서는
 * 아무 차이도 안 보이고 느린 DB 에서만 드러난다.
 */

const SRC = join(process.cwd(), 'src');
const page = readFileSync(join(SRC, 'app', 'product', '[slug]', 'page.tsx'), 'utf8');

describe('상품 화면의 스트리밍 경계', () => {
  it('첫 화면 밖 조각을 Suspense 로 감싼다', () => {
    for (const component of ['ProductReviews', 'ProductInquiries', 'Recommendations']) {
      expect(page, `${component} 가 Suspense 밖에 있으면 첫 바이트를 붙잡는다`).toMatch(
        new RegExp(`<Suspense[^>]*>[\\s\\S]{0,400}<${component}`),
      );
    }
  });

  it('아래쪽 조회를 화면이 직접 하지 않는다 — 하는 순간 경계가 사라진다', () => {
    expect(page).not.toContain('getProductReviews');
    expect(page).not.toContain('getReviewSummary');
    expect(page).not.toContain('getProductInquiries');
  });

  it('빈자리에 높이를 준다 — 도착할 때 아래가 밀리면 얻은 것을 도로 잃는다', () => {
    const fallbacks = [...page.matchAll(/fallback=\{<(\w+)[^>]*height="(\d+)px"/g)];
    expect(fallbacks.length).toBeGreaterThanOrEqual(3);
    for (const [, , height] of fallbacks) {
      expect(Number(height)).toBeGreaterThan(100);
    }
  });

  it('넘어가는 동안 보여 줄 화면이 있다', () => {
    for (const route of [
      ['product', '[slug]'],
      ['category', '[slug]'],
      ['search'],
    ]) {
      expect(() => readFileSync(join(SRC, 'app', ...route, 'loading.tsx'), 'utf8')).not.toThrow();
    }
  });
});
