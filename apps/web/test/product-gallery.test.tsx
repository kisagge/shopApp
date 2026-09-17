// @vitest-environment jsdom
import { render, screen, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

// 모양만 본다 — next/image 의 주소 검사는 이 검사의 관심이 아니다
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { ProductGallery } = await import('~/components/product-gallery');

/**
 * 상품 사진.
 *
 * 조회는 사진을 전부 실어 왔는데 화면은 첫 장만 그렸다. 뒷모습·소재 사진을 올려도 손님은 볼 길이 없었다.
 */

const photo = (n: number, credit: string | null = null) => ({
  url: `https://img.test/coat-${n}.jpg`,
  alt: `울 코트 ${n}`,
  blurDataUrl: null,
  credit,
  creditUrl: credit ? `https://unsplash.com/@${credit}` : null,
});

const main = () => screen.getAllByRole('img').find((img) => img.getAttribute('alt') !== '')!;

describe('여러 장', () => {
  it('첫 장을 크게 보여 주고, 작은 사진 단추를 장 수만큼 둔다', () => {
    render(<ProductGallery images={[photo(1), photo(2), photo(3)]} name="울 코트" />);

    expect(main().getAttribute('alt')).toBe('울 코트 1');
    const list = screen.getByRole('list', { name: '상품 사진 3장' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
  });

  it('단추를 누르면 그 사진이 크게 보이고, 지금 보이는 단추를 알린다', async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={[photo(1), photo(2)]} name="울 코트" />);

    const second = screen.getByRole('button', { name: /2번째 사진 보기/ });
    await user.click(second);

    expect(main().getAttribute('alt')).toBe('울 코트 2');
    // 색 테두리만으로는 화면을 못 보는 사람이 모른다
    expect(second.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /1번째 사진 보기/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('단추 이름은 무엇을 보여 주는지 말하고, 안의 작은 그림은 장식이다', () => {
    render(<ProductGallery images={[photo(1), photo(2)]} name="울 코트" />);

    expect(screen.getByRole('button', { name: '1번째 사진 보기 — 울 코트 1' })).toBeTruthy();
    // 작은 그림은 alt 가 비어 낭독기가 두 번 읽지 않는다
    const thumbs = within(screen.getByRole('list')).getAllByRole('presentation', { hidden: true });
    expect(thumbs.every((img) => img.getAttribute('alt') === '')).toBe(true);
  });

  it('키보드로 고를 수 있다 — 단추다', async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={[photo(1), photo(2)]} name="울 코트" />);

    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');

    expect(main().getAttribute('alt')).toBe('울 코트 2');
  });

  it('출처는 지금 보이는 사진의 것을 적는다 — 사진마다 찍은 사람이 다르다', async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={[photo(1, 'kim'), photo(2, 'lee')]} name="울 코트" />);

    expect(screen.getByRole('link', { name: 'kim' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /2번째 사진 보기/ }));
    expect(screen.getByRole('link', { name: 'lee' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'kim' })).toBeNull();
  });
});

describe('한 장 이하', () => {
  it('한 장이면 고를 것이 없으니 단추를 두지 않는다', () => {
    render(<ProductGallery images={[photo(1)]} name="울 코트" />);

    expect(main().getAttribute('alt')).toBe('울 코트 1');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('사진이 없으면 자리표시만 — 낭독기에는 감춘다', () => {
    const { container } = render(<ProductGallery images={[]} name="울 코트" />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('IMAGE');
  });
});
