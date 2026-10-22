// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const {
  CollectionHero, COLLECTION_CARD_SIZES, COLLECTION_HERO_SIZES,
} = await import('~/components/collection-hero');

/**
 * 기획전 머리.
 *
 * 144줄에 검사가 없었다(파일 이름·심볼·화면 문구 셋 다로 확인했다). 그런데 이 조각이 들고
 * 있는 규칙은 하나같이 **겪어서 생긴 것**이고, 셋은 화면을 봐서는 드러나지 않는다 —
 * 제목 단계를 잘못 줘도 눈에는 똑같이 보이고, `sizes` 가 격자와 어긋나도 그림은 멀쩡히
 * 뜨며(다만 1,200px 이면 될 것을 3,840px 로 받는다), `priority` 를 모두에게 주면 아무도
 * 우선이 아니게 된다.
 */

const base = {
  eyebrow: 'COLLECTION', title: '겨울을 오래 입는 방법', subtitle: '한 벌로 계절을 나는 아우터',
  imageUrl: null as string | null, tone: 'sand',
};

describe('제목 단계', () => {
  /**
   * **같은 조각이 화면의 제목일 때도 있고 목록의 한 칸일 때도 있다.** 늘 h1 로 그렸더니
   * 기획전 목록에 h1 이 셋 생겼다 — 낭독기로 훑는 사람에게 화면의 주제가 셋으로 들린다.
   */
  it.each([1, 2, 3] as const)('%s 단계로 그린다', (level) => {
    render(<CollectionHero {...base} headingLevel={level} />);
    expect(screen.getByRole('heading', { level, name: base.title })).toBeInTheDocument();
  });

  it('안 주면 2단계다 — 목록 안에 놓이는 쪽이 기본이다', () => {
    render(<CollectionHero {...base} />);
    expect(screen.getByRole('heading', { level: 2, name: base.title })).toBeInTheDocument();
  });
});

describe('사진', () => {
  const withImage = { ...base, imageUrl: 'https://cdn.test/hero.jpg' };

  it('장식으로 둔다 — 뜻은 옆의 제목이 이미 전한다', () => {
    render(<CollectionHero {...withImage} />);
    // alt 가 비어 있고 aria-hidden 이라 낭독기에는 없는 것과 같다
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('받은 크기 정보를 그대로 넘긴다 — 격자와 어긋나면 최적화가 헛돈다', () => {
    const { container } = render(<CollectionHero {...withImage} sizes={COLLECTION_CARD_SIZES} />);
    expect(container.querySelector('img')?.getAttribute('sizes')).toBe(COLLECTION_CARD_SIZES);
  });

  it('자리표시는 **쓸 수 있는 값일 때만** 깐다', () => {
    /*
     * 자리표시가 아닌 글자를 그대로 넘기면 Next 가 그것을 배경으로 그린다. 값이 틀린
     * 날에는 사진이 오기 전 화면이 깨져 보인다 — core 의 isBlurDataUrl 이 거르는 자리다.
     */
    const { container: good } = render(
      <CollectionHero {...withImage} blurDataUrl="data:image/webp;base64,UklGRg==" />,
    );
    expect(good.querySelector('img')?.getAttribute('style') ?? '').toContain('data:image/webp');

    const { container: bad } = render(<CollectionHero {...withImage} blurDataUrl="그냥 글자" />);
    expect(bad.querySelector('img')?.getAttribute('style') ?? '').not.toContain('그냥 글자');
  });

  it('사진이 없으면 톤 블록이 남고, 모르는 톤이면 기본 톤이다', () => {
    const { container: known } = render(<CollectionHero {...base} tone="olive" />);
    expect(known.firstElementChild?.className).toContain('bg-ph-olive');

    const { container: unknown } = render(<CollectionHero {...base} tone="없는톤" />);
    expect(unknown.firstElementChild?.className).toContain('bg-ph-sand');
  });

  it('사진이 없으면 가림막도 두지 않는다', () => {
    // 가림막은 사진 위 글자의 대비를 지키는 것이다. 사진이 없으면 톤 블록을 덮기만 한다.
    const { container } = render(<CollectionHero {...base} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it('남의 사진이면 작가를 적는다', () => {
    render(<CollectionHero {...withImage} imageCredit="Photo: 아무개 / Unsplash" />);
    expect(screen.getByText('Photo: 아무개 / Unsplash')).toBeInTheDocument();
  });
});

describe('없는 값은 자리를 차지하지 않는다', () => {
  it('부제와 설명이 없으면 그리지 않는다', () => {
    const { container } = render(<CollectionHero {...base} subtitle={null} />);
    expect(container.textContent).not.toContain('한 벌로');
  });
});

/**
 * **크기 정보는 한 곳에서 나온다.**
 *
 * 부르는 쪽마다 따로 적고 있었다 — 셋이 같은 컨테이너 안에 있는데 각자 `50vw`·`100vw` 를
 * 적어 두어서 본문이 1280px 에서 멈춘다는 사실을 아무도 반영하지 않았다. 1512px 화면에서
 * 592px 자리에 1920px 짜리를 받아 왔다.
 *
 * 그래서 상수 두 벌로 모았는데, **그 상수를 쓰는지는 아무도 안 봤다.** 다음 사람이 한 줄
 * 적어 넣으면 조용히 갈라진다 — 그림은 멀쩡히 뜨고 바이트만 는다.
 */
describe('부르는 쪽이 그 상수를 쓴다', () => {
  const ROOT = resolve(import.meta.dirname, '..');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, out);
      else if (entry.name.endsWith('.tsx')) out.push(path);
    }
    return out;
  };

  /** 손 목록을 쓰지 않는다 — 새 자리가 생기면 저절로 끌려 들어온다 */
  const callers = walk(join(ROOT, 'src'))
    .map((file) => [file, readFileSync(file, 'utf8')] as const)
    .filter(([file, source]) => source.includes('<CollectionHero') && !file.endsWith('collection-hero.tsx'));

  it('부르는 자리가 있다 — 없으면 이 검사가 빈손으로 통과한다', () => {
    expect(callers.length).toBeGreaterThan(0);
  });

  it.each(callers.map(([file, source]) => [file.slice(ROOT.length + 1), source] as const))(
    '%s 가 상수로 크기를 넘긴다',
    (_name, source) => {
      const sizes = [...source.matchAll(/sizes=\{([^}]+)\}/g)].map((m) => m[1]!.trim());
      expect(sizes.length, 'sizes 를 안 넘기면 100vw 로 떨어진다').toBeGreaterThan(0);
      for (const value of sizes) {
        expect(value, '글자로 적으면 상수와 갈라진다').toMatch(/^COLLECTION_(CARD|HERO)_SIZES$/);
      }
    },
  );

  it('두 상수는 본문 상한(1280px)을 넘지 않는다', () => {
    // 여백을 뺀 값이라 1200·600 이다. 더 크게 적으면 받을 필요 없는 후보가 생긴다
    expect(COLLECTION_HERO_SIZES).toContain('1200px');
    expect(COLLECTION_CARD_SIZES).toContain('600px');
  });
});
