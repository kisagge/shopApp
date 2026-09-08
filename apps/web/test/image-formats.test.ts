import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 사진을 어떤 형식으로 내보내는가.
 *
 * 옷 가게 화면은 무게의 대부분이 사진이다. 매대 한 화면의 카드 열셋을
 * 640px 로 받아 재 보니 **WebP 502KB · AVIF 283KB** 였다 — 절반 가까이가
 * 형식 하나에서 나온다. Next 의 기본값은 WebP 하나뿐이라, 적어 두지 않으면
 * 그 절반을 그냥 흘린다.
 *
 * **화면으로 확인하지 못한다.** 상품 사진은 R2 에 있고 시드가 넣는 것이
 * 아니라 따로 채운다(seed:photos). CI 의 일회용 DB 에는 사진이 한 장도
 * 없어서 최적화기를 거치는 이미지 자체가 없다 — 그래서 설정을 본다.
 * 대신 **글자가 아니라 값으로** 본다: 순서가 뒤집히면(WebP 가 먼저) 협상이
 * AVIF 를 못 고르므로 그것도 함께 막는다.
 */
const CONFIG = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');

describe('이미지 형식', () => {
  const formats = /formats:\s*\[([^\]]*)\]/.exec(CONFIG)?.[1] ?? null;

  it('formats 를 적어 둔다 — 기본값은 WebP 하나뿐이다', () => {
    expect(formats, 'next.config 에 images.formats 가 없다').not.toBeNull();
  });

  it('AVIF 가 WebP 보다 앞이다', () => {
    const list = [...formats!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(list).toEqual(['image/avif', 'image/webp']);
  });
});
