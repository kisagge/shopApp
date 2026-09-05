import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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

  /**
   * **loading.tsx 가 있는 화면은 404 를 낼 수 없다.**
   *
   * 그 파일이 있으면 Next 가 껍데기를 먼저 흘려보내고, 그 순간 상태 코드가
   * 200 으로 확정된다. 뒤에 notFound() 를 불러도 본문만 404 화면이고 코드는
   * 200 인 **가짜 404** 가 된다 — 검색엔진은 그 주소를 살아 있는 것으로 보고
   * 계속 들고 있는다.
   *
   * 상품·카테고리·브랜드에 붙였다가 없는 주소가 전부 200 으로 나가는 것을
   * 보고 뺐다. 눈으로는 404 화면이 그대로 보여서 **화면만 봐서는 모른다.**
   */
  it('loading.tsx 와 notFound() 를 같은 화면에 두지 않는다', () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === 'loading.tsx') {
          const page = join(dir, 'page.tsx');
          if (!existsSync(page)) continue;
          if (readFileSync(page, 'utf8').includes('notFound()')) {
            offenders.push(page.replace(SRC, ''));
          }
        }
      }
    };
    walk(join(SRC, 'app'));

    expect(offenders, '이 화면들은 죽은 주소에 200 을 돌려준다').toEqual([]);
  });
});
