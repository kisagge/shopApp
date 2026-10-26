// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { HomeBanners } = await import('~/components/home-banners');
type HomeBanner = import('~/components/home-banners').HomeBanner;

/**
 * 홈 히어로.
 *
 * **이 가게의 첫 화면인데 검사가 한 줄도 없었다.** e2e 도 못 본다 — `image-priority.spec.ts` 가 홈이 미리
 * 받는 사진 수를 상한으로 보는 것이 전부이고, 나머지는 축에 안 걸린다.
 *
 * 여기 담긴 규칙은 눈으로 보면 다 멀쩡하다.
 *
 * - **자리표시가 쓸 수 있는 값일 때만 깔린다.** 아니면 Next 가 그 글자를 그대로 배경으로 그려서, 사진이
 *   오기 전 화면이 깨진다.
 * - **배너 문구는 제목이 아니다.** 제목으로 올리면 슬라이드를 넘길 때마다 **문서의 제목이 바뀐다** —
 *   홈의 h1 은 `page.tsx` 에 sr-only 로 따로 있다. 보기에는 똑같고 낭독기에서만 드러난다.
 * - **배경 사진은 장식이다.** 뜻은 옆 문구가 이미 전하므로 두 번 읽히면 안 된다.
 * - **톤은 사진이 없을 때만.** 사진 위에 톤 색을 깔면 사진이 그 색으로 물든다.
 */

/** 캐러셀이 움직임 설정을 묻는다 — jsdom 에는 matchMedia 가 없다 */
beforeEach(() =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
afterEach(() => vi.unstubAllGlobals());

/** 운영이 적는 칸 전부를 채운 배너. 비는 칸은 검사마다 null 로 덮어 쓴다 */
const BANNER: HomeBanner = {
  id: 'b-winter',
  eyebrow: 'WINTER',
  headline: '겨울을 오래 입는\n한 벌',
  subcopy: '한 벌로 계절을 나는 아우터',
  ctaLabel: '보러 가기',
  href: '/collection/winter-outer',
  imageUrl: null,
  blurDataUrl: null,
  imageAlt: null,
  imageCredit: null,
  tone: 'sand',
};

const banner = (over: Partial<HomeBanner> = {}): HomeBanner => ({ ...BANNER, ...over });
const WITH_IMAGE = { imageUrl: 'https://cdn.test/winter.jpg' } as const;

const draw = (...banners: HomeBanner[]) => render(<HomeBanners banners={banners} />);

/** 슬라이드의 겉 상자 — 톤과 배경이 여기 붙는다 */
const slideBox = (container: HTMLElement) =>
  container.querySelector('[aria-roledescription="슬라이드"] > div');

const paragraphWith = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('p')].find((p) => p.textContent?.includes(text));

describe('배너가 없으면', () => {
  it('아무것도 그리지 않는다', () => {
    /*
     * 배너가 하나도 없는 것은 가게를 막 세운 상태지 평소의 모습이 아니다. 빈 캐러셀을 두면
     * 홈 맨 위에 조작 장치만 남은 빈 칸이 생긴다.
     *
     * **두 겹으로 막혀 있다.** 여기서 일찍 돌아가고, `Carousel` 도 슬라이드가 없으면
     * 스스로 null 이다 — 한쪽을 떼도 이 단정은 통과한다. 그래도 남겨 둔다: 지키려는 것은
     * 어느 한 줄이 아니라 **배너가 없을 때 홈이 조용한 것**이고, 두 겹 중 하나만 남아도
     * 그 약속은 지켜져야 한다.
     */
    const { container } = draw();
    expect(container.innerHTML).toBe('');
  });
});

describe('영역의 이름', () => {
  it('기획전 배너로 이름이 붙어 있다 — 낭독기가 지나칠 때 읽는다', () => {
    draw(banner());
    expect(screen.getByRole('region', { name: '기획전 배너' })).toBeInTheDocument();
  });
});

describe('배너 문구', () => {
  it('제목이 아니다 — 넘길 때마다 문서의 제목이 바뀌면 안 된다', () => {
    /*
     * 홈의 h1 은 `page.tsx` 가 sr-only 로 들고 있다. 여기 문구를 제목으로 올리면 슬라이드마다
     * 문서의 주제가 달라지고, 숨은 슬라이드의 제목까지 개요에 섞인다.
     */
    const { container } = draw(banner());
    expect(screen.queryByRole('heading')).toBeNull();
    expect(paragraphWith(container, '겨울을 오래 입는')?.tagName).toBe('P');
  });

  it('줄바꿈을 그대로 살린다 — 어디서 끊기느냐까지 운영자가 정한다', () => {
    const { container } = draw(banner());
    const headline = paragraphWith(container, '겨울을 오래 입는');
    expect(headline?.textContent).toBe('겨울을 오래 입는\n한 벌');
    expect(headline?.className).toContain('whitespace-pre-line');
  });

  it('없는 값은 자리를 차지하지 않는다', () => {
    /*
     * **글자가 없는 것으로는 모자란다.** 조건을 빼고 늘 그리게 해도 글자는 비어 있어서
     * 글만 보는 단정은 그대로 통과한다 — 대신 **빈 칸이 남아** 세로 간격(gap-4)이 한 칸
     * 더 벌어진다. 그래서 글자가 아니라 **칸의 수**를 본다.
     */
    const { container } = draw(banner({ eyebrow: null, subcopy: null }));
    const column = slideBox(container)?.lastElementChild;

    expect(container.textContent).toContain('겨울을 오래 입는');
    expect([...(column?.children ?? [])].map((e) => e.textContent)).toEqual([
      '겨울을 오래 입는\n한 벌',
      '보러 가기',
    ]);
  });

  it('다 있으면 윗말·문구·부제·단추가 그 차례로 선다', () => {
    const { container } = draw(banner());
    const column = slideBox(container)?.lastElementChild;
    expect([...(column?.children ?? [])].map((e) => e.textContent)).toEqual([
      'WINTER',
      '겨울을 오래 입는\n한 벌',
      '한 벌로 계절을 나는 아우터',
      '보러 가기',
    ]);
  });
});

describe('누를 자리', () => {
  it('라벨과 주소가 둘 다 있을 때만 그린다', () => {
    draw(banner());
    expect(screen.getByRole('link', { name: '보러 가기' })).toHaveAttribute(
      'href',
      '/collection/winter-outer',
    );
  });

  it('주소 없는 라벨은 그리지 않는다 — 누를 수 있어 보이는데 안 가는 것이 더 나쁘다', () => {
    draw(banner({ href: null }));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('라벨 없는 주소도 그리지 않는다 — 무엇을 누르는지 말하지 않는 링크가 된다', () => {
    draw(banner({ ctaLabel: null }));
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('배경 사진', () => {
  it('장식으로 둔다 — 뜻은 옆 문구가 이미 전한다', () => {
    // alt 가 비어 있고 aria-hidden 이라 낭독기에는 없는 것과 같다
    draw(banner(WITH_IMAGE));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('이름을 적어 두었어도 읽히지 않는다 — 두 번 읽으면 같은 말을 두 번 듣는다', () => {
    const { container } = draw(banner({ ...WITH_IMAGE, imageAlt: '겨울 코트를 입은 사람' }));
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(container.textContent).not.toContain('겨울 코트를 입은 사람');
  });

  it('화면 폭을 꽉 채운다고 말한다 — 어긋나면 최적화가 헛돈다', () => {
    const { container } = draw(banner(WITH_IMAGE));
    expect(container.querySelector('img')?.getAttribute('sizes')).toBe('100vw');
  });

  it('자리표시는 쓸 수 있는 값일 때만 깐다', () => {
    /*
     * 자리표시가 아닌 글자를 넘기면 Next 가 그것을 배경으로 그린다 — core 의 isBlurDataUrl 이
     * 거르는 자리다. 값이 틀린 날에는 사진이 오기 전 화면이 깨져 보인다.
     */
    const { container: good } = draw(
      banner({ ...WITH_IMAGE, blurDataUrl: 'data:image/webp;base64,UklGRg==' }),
    );
    expect(good.querySelector('img')?.getAttribute('style')).toContain('UklGRg==');

    const { container: bad } = draw(banner({ ...WITH_IMAGE, blurDataUrl: '그냥 글자' }));
    expect(bad.querySelector('img')?.getAttribute('style')).not.toContain('그냥 글자');
  });

  it('첫 장만 먼저 받는다 — 전부 우선이면 아무도 우선이 아니다', () => {
    /*
     * 홈의 첫 화면이라 여기가 늦으면 사이트가 늦은 것으로 보인다. 그렇다고 넘겨야 보이는
     * 뒷장까지 미리 받으면 첫 장과 대역폭을 나눠 쓴다 — 홈에서 일곱 장을 미리 받던 때가 있었다.
     */
    const { container } = draw(banner(WITH_IMAGE), banner({ ...WITH_IMAGE, id: 'b-2' }));
    const [first, second] = [...container.querySelectorAll('img')];

    expect(first?.getAttribute('loading'), '첫 장은 미루지 않는다').toBeNull();
    expect(second?.getAttribute('loading'), '뒷장은 보일 때 받는다').toBe('lazy');
  });

  it('남의 사진이면 작가를 적는다', () => {
    draw(banner({ ...WITH_IMAGE, imageCredit: 'Photo: 아무개 / Unsplash' }));
    expect(screen.getByText('Photo: 아무개 / Unsplash')).toBeInTheDocument();
  });

  it('사진 위 글자의 대비를 지키는 가림막을 함께 깐다', () => {
    const { container } = draw(banner(WITH_IMAGE));
    expect(container.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(1);
  });

  it('사진이 없으면 가림막도 두지 않는다 — 톤 블록을 덮기만 한다', () => {
    const { container } = draw(banner());
    expect(container.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(0);
  });
});

describe('톤', () => {
  it('사진이 없으면 그 톤의 블록이 선다', () => {
    const { container } = draw(banner({ tone: 'olive' }));
    expect(slideBox(container)?.className).toContain('bg-ph-olive');
  });

  it('모르는 톤이면 기본 톤 — 배경 없는 칸을 내보내지 않는다', () => {
    const { container } = draw(banner({ tone: '없는톤' }));
    expect(slideBox(container)?.className).toContain('bg-ph-sand');
  });

  it('사진이 있으면 톤 대신 중립 배경 — 톤 색이 사진을 물들이면 안 된다', () => {
    const { container } = draw(banner({ ...WITH_IMAGE, tone: 'olive' }));
    const box = slideBox(container)?.className ?? '';
    expect(box).toContain('bg-[var(--surface-2)]');
    expect(box).not.toContain('bg-ph-olive');
  });
});
