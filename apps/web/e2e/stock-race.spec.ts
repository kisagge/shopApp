import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { STATE_FILE, addFirstProductToCart } from './state';

/**
 * 마지막 한 개를 두 사람이 동시에 산다.
 *
 * **코드는 이 경쟁을 막게 짜여 있다.** 재고를 읽고 나서 쓰는 대신 조건부
 * UPDATE 한 번으로 깎고(`stock: { gte: quantity }`), 안 깎였으면 품절로
 * 본다. 포인트와 쿠폰도 같은 모양이다.
 *
 * **그런데 그게 진짜 막는지는 아무도 돌려 본 적이 없다.** 주문 만들기의 단위
 * 검사는 prisma 를 통째로 흉내 내므로, `updateMany` 가 0 을 돌려주는 상황을
 * **내가 적어 넣는다** — 데이터베이스가 정말 그렇게 동작하는지는 그 검사가
 * 말해 줄 수 없는 것이다. 여기서는 진짜 Postgres 를 상대로 두 요청을 같은
 * 순간에 던진다.
 *
 * 여기서 틀리면 없는 물건을 팔게 된다. 돈은 받았고 보낼 것은 없다.
 */

/*
 * **이 명세도 장바구니를 쥔다.** 겨룰 물건을 고르느라 A 의 장바구니를 비우고
 * 채운다. 여기서 선언해 두지 않으면 cart-isolation 문지기가 잡는다 — 실제로
 * 잡혔다. 아래 검사는 맥락을 손으로 만들어 쓰므로 이 기본 세션을 쓰지 않지만,
 * **누구의 장바구니를 쥐는지 밝히는 자리**로서 그대로 둔다.
 */
test.use({ storageState: STATE_FILE.raceBuyerA });
test.describe.configure({ mode: 'serial' });

interface Buyer {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly addressId: string;
}

async function buyer(
  browser: import('@playwright/test').Browser,
  storageState: string,
): Promise<Buyer> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  const body = (await (await page.request.get('/api/addresses')).json()) as
    | { id: string; isDefault: boolean }[]
    | { addresses: { id: string; isDefault: boolean }[] };
  const rows = Array.isArray(body) ? body : body.addresses;
  const address = rows.find((a) => a.isDefault) ?? rows[0];
  expect(address, '시드가 이 계정에 배송지를 안 만들었다').toBeDefined();

  return { context, page, addressId: address!.id };
}

/** 되돌린다. 못 되돌리면 그 주문이 재고를 물고 다음 실행을 오염시킨다. */
async function undo(b: Buyer, orderNo: string): Promise<void> {
  const res = await b.page.request.post(`/api/orders/${orderNo}/cancel`, {
    data: { reason: '검사가 만든 주문을 되돌립니다' },
    failOnStatusCode: false,
  });
  expect(res.ok(), `주문 ${orderNo} 을 되돌리지 못했다 (${res.status()})`).toBe(true);
}

/** 주문 하나를 던진다. 성공이든 품절이든 그대로 돌려준다. */
async function order(b: Buyer, variantId: string) {
  const response = await b.page.request.post('/api/orders', {
    data: {
      lines: [{ variantId, quantity: 1 }],
      addressId: b.addressId,
      paymentMethod: 'CARD',
      agreedToTerms: true,
    },
    failOnStatusCode: false,
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

test('마지막 한 개는 한 사람에게만 간다', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: STATE_FILE.admin });
  const a = await buyer(browser, STATE_FILE.raceBuyerA);
  const b = await buyer(browser, STATE_FILE.raceBuyerB);

  /*
   * **이 검사가 만든 주문은 무슨 일이 있어도 되돌린다.** 안 되돌리면 그 주문이
   * 재고를 물고 있고, 30분이 지나면 다음 실행에서 "풀 수 있는 재고" 가 되어
   * 경쟁을 흐린다 — 실제로 내 앞선 실패들이 그렇게 쌓였다.
   */
  const created: { buyer: Buyer; orderNo: string }[] = [];

  try {
    const adminPage = await admin.newPage();

    // 겨룰 물건을 고른다. 화면에서 고르는 이유는 재고 있는 조합만 담기기 때문이다.
    const variantId = await addFirstProductToCart(a.page);
    expect(variantId, '담을 수 있는 상품이 없다 — 시드가 비었다').not.toBeNull();

    /*
     * 재고는 **상품 단위로** 세운다. 그런데 손에 있는 것은 변형 id 뿐이라 그
     * 상품을 다시 찾아야 한다. **슬러그로는 못 찾는다** — 운영 검색은
     * 이름·브랜드를 모아 둔 칸을 보지 슬러그를 보지 않는다. 장바구니가 주는
     * 이름으로 찾는다.
     */
    const cart = (await (await a.page.request.get('/api/cart')).json()) as {
      items: { variantId: string; productName: string }[];
    };
    const picked = cart.items.find((i) => i.variantId === variantId);
    expect(picked, '방금 담은 줄을 장바구니에서 못 찾았다').toBeDefined();

    const found = (await (
      await adminPage.request.get(
        `/api/admin/products/search?q=${encodeURIComponent(picked!.productName)}`,
      )
    ).json()) as { products: { id: string; name: string }[] };
    const hits = found.products.filter((p) => p.name === picked!.productName);
    // 같은 이름이 둘이면 어느 쪽 재고를 세운 것인지 알 수 없다
    expect(hits.length, `운영 검색이 "${picked!.productName}" 를 ${hits.length}개 찾았다`).toBe(1);
    const productId = hits[0]!.id;

    const setStock = async (stock: number) => {
      const res = await adminPage.request.patch(`/api/admin/products/${productId}/stock`, {
        data: { variants: [{ variantId: variantId!, stock }] },
      });
      expect(res.ok(), `재고를 ${stock} 으로 못 세웠다 (${res.status()})`).toBe(true);
    };

    const stockNow = async (): Promise<number> => {
      const res = await a.page.request.post('/api/cart/quote', {
        data: { lines: [{ variantId: variantId!, quantity: 1 }] },
      });
      return ((await res.json()) as { lines: { stock: number }[] }).lines[0]!.stock;
    };

    /*
     * **한 번으로 안 끝날 수 있다.**
     *
     * 이 앱에는 품절에 막혔을 때 **버려진 주문이 물고 있던 재고를 풀고 한 번
     * 다시 해 보는** 길이 있다(create-order 의 releaseAbandonedHolds). 결제
     * 없이 떠난 주문은 회수 배치가 돌 때까지 재고를 쥐는데 그 배치가 하루에
     * 한 번이라, 아무도 안 산 물건이 하루 종일 품절로 보이는 것을 막으려고
     * 둔 것이다.
     *
     * 그래서 **풀 것이 남아 있으면 재고 1 개에 두 사람이 다 성공하는 것이
     * 맞다.** 처음에 그것을 결함으로 읽을 뻔했다. 겨루기를 되풀이하면 그
     * 웅덩이는 마른다 — 푼 주문은 다시 풀리지 않는다. 새 DB 로 도는 CI 는
     * 첫 판에 끝난다.
     */
    let decided = false;
    for (let round = 0; round < 8 && !decided; round += 1) {
      await setStock(1);
      expect(await stockNow(), '출발선을 1 로 못 맞췄다').toBe(1);

      /*
       * **둘을 같은 순간에 던진다.** 하나씩 보내면 두 번째가 첫 번째의 결과를
       * 보고 시작하므로 경쟁이 아니다 — 그건 그냥 "품절이면 못 산다" 검사다.
       */
      const results = await Promise.all([order(a, variantId!), order(b, variantId!)]);
      const roundWinners = results.filter((r) => r.status < 400);
      for (const [i, r] of results.entries()) {
        if (r.status < 400) {
          created.push({ buyer: i === 0 ? a : b, orderNo: r.body['orderNo'] as string });
        }
      }

      /*
       * **여기가 이 파일의 요점이다.** 재고가 음수가 됐다면 없는 물건을 판
       * 것이다 — 조건부 UPDATE 가 아니라 읽고 나서 쓴 것이고, 돈은 받았는데
       * 보낼 것이 없다. 성공한 주문 수가 아니라 **남은 재고**를 보는 이유는,
       * 푼 재고가 있으면 둘 다 성공하는 것이 맞기 때문이다.
       */
      expect(
        await stockNow(),
        `재고가 음수다 — 없는 물건을 팔았다. ${JSON.stringify(results)}`,
      ).toBeGreaterThanOrEqual(0);

      if (roundWinners.length === 1) {
        const loser = results.find((r) => r.status >= 400)!;
        expect(loser.body['code'], '거절 이유가 품절이 아니다').toBe('OUT_OF_STOCK');
        expect(await stockNow(), '한 사람이 샀는데 재고가 0 이 아니다').toBe(0);
        decided = true;
      }

      // 판마다 되돌린다. 남겨 두면 다음 판이 그 재고를 풀어 쓴다.
      while (created.length > 0) {
        const made = created.pop()!;
        await undo(made.buyer, made.orderNo);
      }
    }

    expect(
      decided,
      '여덟 판을 겨뤘는데 매번 둘 다 샀다 — 풀 수 있는 버려진 주문이 계속 나왔다는 뜻이다. ' +
        '이 DB 에는 미결제 주문이 쌓여 있다(CI 의 새 DB 에서는 첫 판에 끝난다).',
    ).toBe(true);

    // 취소가 재고를 돌려줬는지도 본다 — 안 돌려주면 취소 한 번에 물건이 사라진다
    expect(await stockNow(), '취소했는데 재고가 안 돌아왔다').toBe(1);

    // 시드 값으로 되돌려 둔다. 1 로 남겨 두면 다른 검사가 담을 것이 없다.
    await setStock(20);
  } finally {
    for (const { buyer: who, orderNo } of created) {
      await who.page.request
        .post(`/api/orders/${orderNo}/cancel`, {
          data: { reason: '검사가 만든 주문을 되돌립니다' },
          failOnStatusCode: false,
        })
        .catch(() => null);
    }
    await Promise.all([admin.close(), a.context.close(), b.context.close()]);
  }
});
