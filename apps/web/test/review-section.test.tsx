// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ratingBreakdown, sizeFitSummary } from '@shop/core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn<(...a: any[]) => any>() }) }));

const { ReviewSection } = await import('~/components/review-section');
const { ReviewStars } = await import('~/components/review-stars');

const review = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', rating: 4, content: '두껍고 따뜻합니다',
  sizeFit: 'TRUE', height: 175, weight: 70,
  authorName: '데****자', optionLabel: '오트밀 / M',
  createdAt: new Date('2026-09-01T00:00:00Z'), imageUrls: [], isMine: false,
  canReport: false, reportedByMe: false,
  helpfulCount: 0, helpfulByMe: false,
  ...over,
});

const summary = (over: Record<string, unknown> = {}) => ({
  average: 4.0,
  total: 1,
  breakdown: ratingBreakdown({ 4: 1 }),
  sizeFit: sizeFitSummary(['TRUE']),
  ...over,
});

describe('별점', () => {
  it('별 모양이 아니라 숫자가 읽힌다', () => {
    // 별만 그리면 "★★★☆☆" 가 그대로 읽히거나 아무것도 안 읽힌다
    render(<ReviewStars rating={4.3} />);
    expect(screen.getByText('5점 만점에 4.3점')).toBeDefined();
  });

  it('별 글리프는 접근성 트리에서 감춘다', () => {
    const { container } = render(<ReviewStars rating={4} />);
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toContain('★');
  });
});

describe('요약', () => {
  it('별점 분포를 숫자로도 제공한다', () => {
    // 막대는 그림이라 스크린리더에는 아무 정보도 아니다
    render(<ReviewSection summary={summary({ breakdown: ratingBreakdown({ 5: 3, 4: 1 }) })} reviews={[]} />);
    const list = screen.getByText('별점 분포').parentElement!;
    expect(within(list).getByText('5점')).toBeDefined();
    expect(within(list).getByText('3')).toBeDefined();
  });

  it('막대 자체는 감춘다', () => {
    const { container } = render(<ReviewSection summary={summary()} reviews={[]} />);
    const bars = container.querySelectorAll('[aria-hidden="true"][class*="rounded-full"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('0건인 점수도 빠뜨리지 않는다', () => {
    render(<ReviewSection summary={summary({ breakdown: ratingBreakdown({ 5: 1 }) })} reviews={[]} />);
    for (const label of ['5점', '4점', '3점', '2점', '1점']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('아무도 사이즈를 답하지 않으면 그 영역을 그리지 않는다', () => {
    render(<ReviewSection summary={summary({ sizeFit: sizeFitSummary([null]) })} reviews={[]} />);
    expect(screen.queryByText('사이즈')).toBeNull();
  });
});

describe('리뷰가 없을 때', () => {
  it('요약을 그리지 않고 안내만 한다', () => {
    render(<ReviewSection summary={summary({ total: 0, average: undefined })} reviews={[]} />);
    expect(screen.getByText(/아직 리뷰가 없습니다/)).toBeDefined();
    expect(screen.queryByText('별점 분포')).toBeNull();
  });
});

describe('리뷰 목록', () => {
  it('가려진 이름을 그대로 쓴다', () => {
    render(<ReviewSection summary={summary()} reviews={[review()]} />);
    expect(screen.getByText('데****자')).toBeDefined();
  });

  it('옵션·사이즈·체형을 함께 보여 준다 — 사이즈 판단에 쓰인다', () => {
    render(<ReviewSection summary={summary()} reviews={[review()]} />);
    expect(screen.getByText(/오트밀 \/ M · 정사이즈 · 175cm · 70kg/)).toBeDefined();
  });

  it('키만 있고 몸무게가 없으면 체형을 적지 않는다', () => {
    render(<ReviewSection summary={summary()} reviews={[review({ weight: null })]} />);
    expect(screen.queryByText(/175cm/)).toBeNull();
  });

  it('남의 리뷰에는 삭제 버튼이 없다', () => {
    render(<ReviewSection summary={summary()} reviews={[review({ isMine: false })]} />);
    expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull();
  });

  it('내 리뷰에만 삭제 버튼이 있다', () => {
    render(<ReviewSection summary={summary()} reviews={[review({ isMine: true })]} />);
    expect(screen.getByRole('button', { name: '내 리뷰 삭제' })).toBeDefined();
  });

  it('작성 시각을 time 으로 표시한다', () => {
    const { container } = render(<ReviewSection summary={summary()} reviews={[review()]} />);
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('리뷰 사진', () => {
  const photos = [
    'https://cdn.example/reviews/a/1.png',
    'https://cdn.example/reviews/a/2.png',
  ];

  it('사진이 없으면 목록 자체를 그리지 않는다', () => {
    render(<ReviewSection summary={summary()} reviews={[review()]} />);
    expect(screen.queryByRole('img', { name: /후기 사진/ })).toBeNull();
  });

  it('올린 순서대로 보여 준다', () => {
    render(<ReviewSection summary={summary()} reviews={[review({ imageUrls: photos })]} />);

    const imgs = screen.getAllByRole('img', { name: /후기 사진/ });
    expect(imgs).toHaveLength(2);

    /*
     * src 는 원본 주소가 아니라 최적화기를 거친 주소다
     * (/_next/image?url=...). 원본은 url 매개변수 안에 들어 있다.
     */
    const originals = imgs.map((img) => {
      const src = img.getAttribute('src') ?? '';
      return new URLSearchParams(src.split('?')[1] ?? '').get('url') ?? src;
    });
    expect(originals).toEqual(photos);
  });

  it('대체 텍스트가 누구의 몇 번째 사진인지 말한다', () => {
    // 작성자에게 대체 텍스트를 받지 않는다. 억지로 받으면 "사진" 이라고 적힌다.
    render(<ReviewSection summary={summary()} reviews={[review({ imageUrls: photos })]} />);

    expect(screen.getByAltText('데****자 님의 후기 사진 1')).toBeDefined();
    expect(screen.getByAltText('데****자 님의 후기 사진 2')).toBeDefined();
  });

  it('원본은 새 탭으로 연다', () => {
    render(<ReviewSection summary={summary()} reviews={[review({ imageUrls: [photos[0]!] })]} />);

    const link = screen.getByRole('link', { name: /후기 사진 1/ });
    expect(link.getAttribute('href')).toBe(photos[0]);
    // 새 탭으로 열 때 rel 을 빠뜨리면 열린 문서가 원래 창을 조작할 수 있다
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('아래쪽 사진은 늦게 받는다', () => {
    render(<ReviewSection summary={summary()} reviews={[review({ imageUrls: photos })]} />);
    for (const img of screen.getAllByRole('img', { name: /후기 사진/ })) {
      expect(img.getAttribute('loading')).toBe('lazy');
    }
  });
});
