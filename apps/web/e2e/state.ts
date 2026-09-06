/** 역할별 세션 파일. .gitignore 의 test-results/ 아래에 둔다. */
export const STATE_FILE = {
  customer: 'test-results/.auth/customer.json',
  admin: 'test-results/.auth/admin.json',
  merchant: 'test-results/.auth/merchant.json',
} as const;

/**
 * 화면이 **눌릴 준비가 됐는지** 기다린다.
 *
 * 하이드레이션 도중에 떨어진 클릭은 삼켜진다 — 링크의 기본 동작은 React 가
 * 막고, 정작 클라이언트 이동은 아직 시작할 수 없는 그 짧은 사이다. 빠른
 * 기계에서는 거의 안 나지만 CI 처럼 느린 곳에서는 실제로 난다. CPU 를 12배
 * 늦춰서 재현했다.
 *
 * 신호는 헤더의 로그인 상태 조각이다 — 세션을 읽기 전에는 자리만 잡고 있다가,
 * 하이드레이션이 끝나고 나서야 로그인이나 마이페이지 링크로 바뀐다.
 */
export async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page
    .locator('header a[href="/login"], header a[href="/mypage"]')
    .first()
    .waitFor({ state: 'attached' });
}
