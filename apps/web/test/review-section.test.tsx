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
  createdAt: new Date('2026-09-01T00:00:00Z'), isMine: false,
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
