import type { ReactNode } from 'react';
import { ShopChrome } from '~/components/shop-chrome';

/**
 * 매장 화면들.
 *
 * 이 그룹은 **주소에 안 들어간다** — `(shop)` 은 폴더 이름일 뿐이고 `/cart` 는
 * 그대로 `/cart` 다. 갈라 둔 이유는 하나, 운영 화면(`/admin`)에 가게의 머리와
 * 발이 붙지 않게 하려는 것이다. 자세한 이유는 `ShopChrome` 에 적었다.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <ShopChrome>{children}</ShopChrome>;
}
