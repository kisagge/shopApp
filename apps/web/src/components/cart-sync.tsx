'use client';

import { useEffect, useRef } from 'react';
import { sameCart, type CartLineState } from '@shop/core';
import { useCartStore, type CartItem } from '~/stores/cart';

/**
 * 장바구니를 서버와 맞춘다.
 *
 * 비로그인은 지금까지처럼 localStorage 만 쓴다. 로그인하면 두 장바구니가
 * 만나므로 한 번 병합하고, 그 뒤로는 바뀔 때마다 서버에 저장한다.
 *
 * **화면은 여전히 스토어를 본다.** 서버를 진실로 삼고 매번 읽어 오면
 * 수량 버튼을 누를 때마다 왕복이 생겨 느려진다. 스토어가 앞서 가고
 * 서버가 따라오는 구조다.
 */

/** 서버에 보낼 최소 정보. 금액은 보내지 않는다 — 서버가 다시 계산한다. */
function toLines(items: readonly CartItem[]): CartLineState[] {
  return items.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
    selected: i.selected,
  }));
}

/** 저장 요청을 몰아서 보낸다. 수량 버튼을 연타할 때 요청이 줄줄이 나가면 안 된다. */
const SAVE_DELAY_MS = 600;

/**
 * **누구인지는 서버가 알려 준다.**
 *
 * 예전에는 `authClient.useSession()` 으로 직접 물었는데, 그러려고 better-auth
 * 클라이언트를 모든 화면에 실어 나르고 있었다(gzip 12KB). 게다가 아래 두
 * 요청은 평범한 `fetch` 라 어차피 쿠키로 붙는다 — 서버가 못 알아보는 상황이면
 * 세션을 따로 물어봐야 소용이 없다. 서버가 아는 것과 같은 것을 보면 된다.
 */
export function CartSync({ userId }: { userId: string | null }) {

  // 마지막으로 서버에 반영된 내용. 같으면 저장하지 않는다.
  const savedRef = useRef<CartLineState[] | null>(null);
  const mergedForRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // 로그인 상태가 바뀌면 병합한다. 사용자당 한 번만.
  useEffect(() => {
    if (!userId || mergedForRef.current === userId) return;
    mergedForRef.current = userId;

    const local = toLines(useCartStore.getState().items);

    void (async () => {
      try {
        const response = await fetch('/api/cart/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lines: local }),
        });
        if (!response.ok) return;

        const data = (await response.json()) as { items: CartItem[] };
        // 서버가 돌려준 것으로 갈아 끼운다. 다른 기기에서 담아 둔 것이
        // 여기 화면에도 나타나야 한다.
        useCartStore.setState({ items: data.items.map((i) => ({ ...i })) });
        savedRef.current = toLines(data.items);
      } catch {
        // 병합에 실패해도 로컬 장바구니는 그대로다. 다음 방문에 다시 시도한다.
        mergedForRef.current = null;
      }
    })();
  }, [userId]);

  // 로그아웃하면 다음 로그인 때 다시 병합해야 한다
  useEffect(() => {
    if (!userId) {
      mergedForRef.current = null;
      savedRef.current = null;
    }
  }, [userId]);

  // 스토어가 바뀌면 서버에 저장한다
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = useCartStore.subscribe((state) => {
      const lines = toLines(state.items);
      // 병합이 끝나기 전에는 저장하지 않는다 —
      // 아직 서버 것을 못 받은 상태로 덮어쓰면 다른 기기의 장바구니가 날아간다.
      if (savedRef.current === null) return;
      if (sameCart(lines, savedRef.current)) return;

      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void fetch('/api/cart', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lines }),
        })
          .then((r) => {
            if (r.ok) savedRef.current = lines;
          })
          .catch(() => {
            // 저장 실패는 조용히 넘긴다. 다음 변경에서 다시 시도되고,
            // 로컬에는 남아 있으므로 사용자가 잃는 것은 없다.
          });
      }, SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [userId]);

  return null;
}
