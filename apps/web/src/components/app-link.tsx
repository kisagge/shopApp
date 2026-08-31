import Link from 'next/link';
import type { Route } from 'next';
import type { LinkLike } from '@shop/ui';

/**
 * packages/ui 의 LinkLike 계약을 next/link 로 이어 주는 어댑터.
 *
 * typedRoutes 를 켜 두면 Link 의 href 가 브랜드 타입이라 `string` 을 받는
 * 일반 계약과 맞지 않는다. UI 패키지를 next 에 묶는 대신 앱 쪽에서 한 번만
 * 좁혀 준다 — 캐스팅이 이 파일 밖으로 새지 않는다.
 */
export const AppLink: LinkLike = ({ href, className, children }) => (
  <Link href={href as Route} className={className}>
    {children}
  </Link>
);
