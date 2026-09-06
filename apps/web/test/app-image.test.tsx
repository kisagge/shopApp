// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * next/image 로 이어 주는 어댑터.
 *
 * **자리표시 그림이 값이 되는 마지막 문**이다. DB 문자열이 그대로 브라우저가
 * 받아 오는 주소가 되므로, 모양이 아니면 여기서 떨군다 — 지금은 우리가 쓴
 * 것뿐이지만 표의 문자열을 그대로 꽂는 자리는 언젠가 바깥 값이 들어온다.
 */

const seen: Record<string, unknown>[] = [];
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    seen.push(props);
    return null;
  },
}));

const { AppImage } = await import('~/components/app-image');

const draw = (blurDataUrl?: string | null) => {
  seen.length = 0;
  render(<AppImage src="/a.jpg" alt="코트" {...(blurDataUrl === undefined ? {} : { blurDataUrl })} />);
  return seen[0]!;
};

describe('AppImage 의 자리표시', () => {
  it('우리가 만든 값이면 blur 로 깐다', () => {
    const props = draw('data:image/webp;base64,AAAA');
    expect(props['placeholder']).toBe('blur');
    expect(props['blurDataURL']).toBe('data:image/webp;base64,AAAA');
  });

  it('값이 없으면 속성 자체를 넘기지 않는다', () => {
    const props = draw(undefined);
    expect(props).not.toHaveProperty('placeholder');
    expect(props).not.toHaveProperty('blurDataURL');
  });

  it.each([
    ['남의 주소', 'https://evil.test/pixel.webp'],
    ['다른 스킴', 'javascript:alert(1)'],
    ['svg', 'data:image/svg+xml;base64,AAAA'],
    ['빈 값', ''],
    ['null', null],
  ])('%s 는 깔지 않는다 — 없이 가면 톤 블록이 남는다', (_label, value) => {
    const props = draw(value);
    expect(props).not.toHaveProperty('placeholder');
  });

  it('자리표시와 무관하게 sizes 와 fill 은 그대로다', () => {
    const props = draw('data:image/webp;base64,AAAA');
    expect(props['fill']).toBe(true);
    expect(props['sizes']).toBe('100vw');
  });
});
