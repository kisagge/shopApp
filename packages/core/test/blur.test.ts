import { describe, it, expect } from 'vitest';
import {
  toBlurDataUrl, isBlurDataUrl, BLUR_WIDTH, BLUR_QUALITY, MAX_BLUR_DATA_URL,
} from '../src/blur';

/**
 * 자리표시 그림의 정책.
 *
 * 여기서 지키는 것은 화질이 아니라 **크기**다. 이 값은 이미지마다 HTML 에
 * 실려 나가므로, 상한이 무너지면 빠르게 보이려고 넣은 것이 느리게 만든다.
 */

const b64 = (n: number) => 'A'.repeat(n);

describe('자리표시 데이터 URI', () => {
  it('webp 로 만든다 — jpeg 는 같은 그림에 세 배가 든다', () => {
    expect(toBlurDataUrl(b64(10))).toBe('data:image/webp;base64,AAAAAAAAAA');
  });

  it('상한을 넘으면 두지 않는다', () => {
    const tooBig = toBlurDataUrl(b64(MAX_BLUR_DATA_URL));
    expect(tooBig).toBeNull();
  });

  it('상한 바로 아래는 그대로 둔다 — 경계에서 한 칸 어긋나기 쉽다', () => {
    const prefix = 'data:image/webp;base64,'.length;
    const just = toBlurDataUrl(b64(MAX_BLUR_DATA_URL - prefix));
    expect(just).not.toBeNull();
    expect(just).toHaveLength(MAX_BLUR_DATA_URL);
  });

  it('빈 값은 null — 만들지 못한 것과 같게 다룬다', () => {
    expect(toBlurDataUrl('')).toBeNull();
  });
});

describe('화면에 넘기기 전 확인', () => {
  it('우리가 만든 것을 통과시킨다', () => {
    expect(isBlurDataUrl(toBlurDataUrl(b64(40)))).toBe(true);
  });

  it.each([
    ['없음', null],
    ['undefined', undefined],
    ['빈 문자열', ''],
    ['남의 주소', 'https://evil.test/pixel.webp'],
    ['다른 스킴', 'javascript:alert(1)'],
    ['다른 형식', 'data:image/svg+xml;base64,AAAA'],
    ['base64 가 아님', 'data:image/webp;base64,<script>'],
  ])('%s 는 막는다', (_label, value) => {
    expect(isBlurDataUrl(value)).toBe(false);
  });

  it('상한을 넘는 값은 DB 에 있더라도 쓰지 않는다', () => {
    // 상한을 올렸다 내린 뒤 남은 행이 이 모양이다
    expect(isBlurDataUrl('data:image/webp;base64,' + b64(MAX_BLUR_DATA_URL))).toBe(false);
  });
});

describe('정책 값', () => {
  it('너비는 화면 크기가 아니라 자리표시 크기다', () => {
    // 늘리면 바이트가 그대로 늘고, 어차피 흐리게 깔린다
    expect(BLUR_WIDTH).toBeLessThanOrEqual(32);
    expect(BLUR_QUALITY).toBeLessThanOrEqual(60);
  });
});
