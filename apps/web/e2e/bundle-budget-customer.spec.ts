import { test, expect } from '@playwright/test';
import { addFirstProductToCart } from './state';
import { budgetTests } from './bundle';

/**
 * 로그인한 손님 화면의 상한.
 *
 * **이 파일이 없어서 사고가 났다.** 상한 검사는 손님 화면 네 개(/ · /signup ·
 * /cart · /support)만 보고 있었고, 결제 화면은 로그인과 장바구니가 있어야
 * 열리니 목록에 없었다. 그 사이 checkout-form 이 계약에서 결제수단 목록을
 * 값으로 가져가면서 Zod 가 되돌아왔다 — /cart 730KB 옆에서 /checkout 만
 * 1,128KB 였고, 이미 상한을 넘긴 채로 아무 검사도 안 걸렸다.
 *
 * 하필 결제 화면이었다. 가장 느려서는 안 되는 자리다.
 */

/** 장바구니가 비면 /checkout 이 /cart 로 돌려보낸다 — 잴 것이 사라진다 */
budgetTests(test, expect, ['/checkout'], async (page) => {
  await addFirstProductToCart(page);
});

budgetTests(test, expect, ['/mypage', '/mypage/orders']);
