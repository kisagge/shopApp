import { describe, it, expect } from 'vitest';
import { createBannerSchema, updateBannerSchema } from '../src';

const minimal = { headline: '겨울을 오래 입는 방법' };

describe('배너 등록 계약', () => {
  it('제목만으로도 만들 수 있다', () => {
    const parsed = createBannerSchema.parse(minimal);
    expect(parsed).toMatchObject({ tone: 'sand', isActive: true, startsAt: null, endsAt: null });
  });

  it('제목은 비울 수 없다', () => {
    expect(createBannerSchema.safeParse({ headline: '  ' }).success).toBe(false);
  });
});

describe('링크는 내부 경로만', () => {
  // 운영자 계정이 털리면 홈 최상단이 외부로 가는 링크가 된다.
  // 그건 우리 도메인을 빌려준 피싱이다.
  it.each([
    ['외부 http', 'http://evil.test'],
    ['외부 https', 'https://evil.test/a'],
    ['프로토콜 상대', '//evil.test'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>'],
    ['슬래시로 시작 안 함', 'category/outer'],
    ['빈 문자열', ''],
    ['역슬래시 — 일부 파서가 / 로 취급한다', '/\\evil.test'],
    ['개행 — 헤더·로그 오염', '/a\nb'],
  ])('%s 는 거절한다', (_label, href) => {
    expect(createBannerSchema.safeParse({ ...minimal, href }).success).toBe(false);
  });

  it.each(['/category/outer', '/product/a-b', '/', '/search?q=코트'])('%s 는 통과한다', (href) => {
    expect(createBannerSchema.safeParse({ ...minimal, href }).success).toBe(true);
  });
});

describe('버튼과 링크는 짝', () => {
  it('버튼 문구만 있으면 거절한다 — 어디로 가는지 모른다', () => {
    const r = createBannerSchema.safeParse({ ...minimal, ctaLabel: '보기' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['href']);
  });

  it('링크만 있는 것은 허용한다 — 배너 전체를 링크로 쓸 수 있다', () => {
    expect(createBannerSchema.safeParse({ ...minimal, href: '/cart' }).success).toBe(true);
  });
});

describe('게시 기간', () => {
  it('종료가 시작보다 빠르면 거절한다 — 아무 때도 안 나온다', () => {
    expect(createBannerSchema.safeParse({
      ...minimal,
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-11-01T00:00:00.000Z',
    }).success).toBe(false);
  });

  it('빈 문자열은 null 로 읽는다 — 폼이 비워 두면 보내는 값이다', () => {
    expect(createBannerSchema.parse({ ...minimal, startsAt: '' }).startsAt).toBeNull();
  });

  it('ISO 문자열을 Date 로 바꾼다', () => {
    const parsed = createBannerSchema.parse({ ...minimal, startsAt: '2026-12-01T00:00:00.000Z' });
    expect(parsed.startsAt).toBeInstanceOf(Date);
  });
});

describe('배너 수정 계약', () => {
  it('보내지 않은 필드는 결과에 나타나지 않는다', () => {
    // .partial() 은 .default() 를 걷어내지 않는다. 기본값을 등록 스키마에만
    // 둔 이유이고, 상품에서 이미 한 번 당한 문제다.
    expect(updateBannerSchema.parse({ headline: '새 제목' })).toEqual({ headline: '새 제목' });
    expect(updateBannerSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('명시적 null 로 지울 수 있다', () => {
    expect(updateBannerSchema.parse({ subcopy: null })).toEqual({ subcopy: null });
  });

  it('수정에서도 외부 링크를 막는다', () => {
    expect(updateBannerSchema.safeParse({ href: 'https://evil.test' }).success).toBe(false);
  });
});
