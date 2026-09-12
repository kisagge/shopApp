import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { NO_INDEX } from '~/lib/no-index';

/**
 * 이 아래는 전부 개인 화면이다. 레이아웃에 한 번 걸면 하위 페이지가
 * 모두 물려받는다 — 페이지마다 적으면 새 화면을 만들 때 빠뜨린다.
 */
export const metadata: Metadata = NO_INDEX;

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
