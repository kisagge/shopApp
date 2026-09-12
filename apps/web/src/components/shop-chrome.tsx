import type { ReactNode } from 'react';
import { SiteHeader } from '~/components/site-header';
import { SiteFooter } from '~/components/site-footer';
import { CompareTray } from '~/components/compare-tray';

/**
 * 매장의 머리와 발.
 *
 * **운영 화면에는 붙지 않는다.** 예전에는 루트 레이앗웃이 이것을 그려서
 * `/admin` 아래에도 그대로 붙었다 — 주문 표 밑에 카테고리 목록과 입점 신청
 * 링크가 달려 있었다. 운영진에게는 쓸 일이 없고, 화면을 못 보는 사람에게는
 * 표를 지나온 끝에 가게 메뉴가 한 벌 더 읽히는 셈이다.
 *
 * 그래서 라우트 그룹 `(shop)` 의 레이아웃으로 내렸다. 주소는 그대로다.
 *
 * `not-found` 는 이 그룹 밖에 있다 — 없는 주소를 받는 파일은 앱 뿌리에만
 * 둘 수 있기 때문이다. 그래서 그 화면은 이것을 직접 두른다.
 */
export function ShopChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        {/*
          tabIndex 가 없으면 건너뛰기 링크가 주소만 바꾸고 **초점은 body 로
          사라진다.** Chrome 은 다음 Tab 을 본문에서 이어 주지만 초점이 없으니
          낭독기는 본문에 왔다고 말하지 않고, 그 이어주기가 없는 브라우저에서는
          링크가 아무 일도 하지 않는다.
        */}
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </div>
      {/* 담아 둔 것이 없으면 아무것도 그리지 않는다 */}
      <CompareTray />
    </>
  );
}
