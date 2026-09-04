import type React from 'react';
import { render, screen } from '@testing-library/react';
import { won } from '@shop/core';
import { describe, it, expect } from 'vitest';
import { ProductCard } from '../src/components/product-card';
import { expectNoA11yViolations } from './a11y';

const base = {
  href: '/product/oversized-wool-coat',
  brand: 'STUDIO NOON',
  name: '오버사이즈 울 블렌드 코트',
  price: won(289_000),
};

describe('ProductCard', () => {
  it('상품명이 제목 요소로 렌더된다 — 목록 훑기가 가능해야 한다', () => {
    render(<ProductCard {...base} />);
    expect(screen.getByRole('heading', { name: base.name })).toBeInTheDocument();
  });

  it('카드 전체가 상세로 가는 링크다', () => {
    render(<ProductCard {...base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', base.href);
  });

  it('할인 정보를 스크린리더에 한 번만 전달한다 — 뱃지와 가격이 겹쳐 읽히면 안 된다', () => {
    render(<ProductCard {...base} listPrice={won(413_000)} discountPercent={30} />);
    expect(screen.getAllByText('할인')).toHaveLength(1);
    expect(screen.getByText('정가')).toBeInTheDocument();
  });

  it('품절이면 색이 아니라 텍스트로 알리고, NEW 뱃지는 띄우지 않는다', () => {
    render(<ProductCard {...base} soldOut isNew />);
    expect(screen.getByText('품절')).toBeInTheDocument();
    // 살 수 없는 상품에 NEW를 남겨두면 오해를 부른다
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('품절이어도 상세로는 갈 수 있다 — 재입고 알림을 신청해야 한다', () => {
    render(<ProductCard {...base} soldOut />);
    expect(screen.getByRole('link')).toHaveAttribute('href', base.href);
  });

  it('이미지가 있으면 의미 있는 alt를 단다', () => {
    render(<ProductCard {...base} image={{ src: '/a.jpg', alt: `${base.name} 착용 컷` }} />);
    expect(screen.getByRole('img', { name: `${base.name} 착용 컷` })).toBeInTheDocument();
  });

  it('플레이스홀더는 장식이라 보조기기에 노출하지 않는다', () => {
    render(<ProductCard {...base} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('리뷰 수를 천단위로 끊어 표시한다', () => {
    render(<ProductCard {...base} rating={4.8} reviewCount={1204} />);
    expect(screen.getByText('리뷰 1,204개')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
  });

  it('locale 을 넘기면 그 말로 그린다 — 이 패키지는 요청을 모른다', () => {
    // linkComponent 와 같은 결이다. 쓰는 쪽이 알려 준다.
    render(<ProductCard {...base} locale="en" soldOut rating={4.8} reviewCount={1} />);
    expect(screen.getByText('Sold out')).toBeInTheDocument();
    // 영어는 개수에 따라 모양이 바뀐다
    expect(screen.getByText('1 review')).toBeInTheDocument();
  });

  it('기본은 평범한 a 태그다 — packages/ui 는 라우터를 모른다', () => {
    render(<ProductCard {...base} />);
    expect(screen.getByRole('link').tagName).toBe('A');
  });

  it('linkComponent 를 넘기면 그것으로 렌더한다', () => {
    const Spy = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
      <a href={href} className={className} data-router="next">
        {children}
      </a>
    );
    render(<ProductCard {...base} linkComponent={Spy} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-router', 'next');
    expect(link).toHaveAttribute('href', base.href);
  });

  it('접근성 위반이 없다', async () => {
    const { container } = render(
      <ProductCard {...base} listPrice={won(413_000)} discountPercent={30} rating={4.8} reviewCount={1204} />,
    );
    await expectNoA11yViolations(container);
  });

  it('품절 상태에서도 접근성 위반이 없다', async () => {
    const { container } = render(<ProductCard {...base} soldOut />);
    await expectNoA11yViolations(container);
  });
});
