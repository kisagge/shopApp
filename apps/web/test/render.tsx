import { render as baseRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ko } from '@shop/i18n/messages/ko';
import { LocaleProvider } from '~/lib/i18n/client';

/**
 * 화면 컴포넌트를 **사전 아래에서** 그린다.
 *
 * 운영에서 사전 없이 그려지는 클라이언트 컴포넌트는 없다 — `layout.tsx` 가
 * 이번 요청의 사전을 항상 걸어 준다.
 * 그러니 테스트도 그 아래에서 그려야 한다. 맨몸으로 `render` 하면 실제로는
 * 있을 수 없는 상태를 검사하게 된다.
 *
 * `@testing-library/react` 의 나머지는 그대로 통과시킨다. 테스트는 이 파일
 * 하나만 import 하면 된다.
 */
export * from '@testing-library/react';

export function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  return baseRender(ui, { wrapper: Dict, ...options });
}

function Dict({ children }: { children: ReactNode }) {
  return <LocaleProvider locale="ko" dict={ko}>{children}</LocaleProvider>;
}
