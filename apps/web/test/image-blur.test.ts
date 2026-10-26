import { describe, it, expect, afterEach } from 'vitest';
import sharp from 'sharp';
import { isBlurDataUrl, BLUR_WIDTH } from '@shop/core';

/**
 * 올라온 사진에서 자리표시 그림을 만든다.
 *
 * **절대 던지지 않는 것이 이 조각의 약속이다.** 자리표시는 있으면 좋은 것이지 업로드의 조건이 아니다 —
 * 여기서 던지면 **사진이 멀쩡한데도 등록이 실패하고**, 운영자는 왜 안 되는지 알 수 없다. 그런데 그 약속을
 * 보는 검사가 없었다: `blur-boundary.test.ts` 는 이 폴더를 클라이언트가 못 가져오는지(경계)만 본다.
 *
 * **만들어 낸 값이 쓰는 쪽의 관문을 통과하는지도 본다.** 홈 배너와 기획전 머리는 `isBlurDataUrl` 로 거른 뒤에만
 * 자리표시를 깐다. 만드는 쪽이 그 관문을 못 넘는 값을 내면 자리표시가 조용히 전부 사라지고, 그래도 사진은
 * 뜨기 때문에 아무도 모른다. 둘은 상한(MAX_BLUR_DATA_URL)으로 묶여 있어 한쪽만 고치면 갈라진다.
 *
 * 부르는 것은 스크립트뿐이다(시드·사진 받기·백필). 그래서 앱 검사로는 한 번도 안 지나갔다.
 */

const { makeBlur, makeBlurFromUrl } = await import('~/lib/images/blur');

const PREFIX = 'data:image/webp;base64,';

/** 세로가 더 긴 진짜 사진 — 비율을 지키는지 함께 본다 */
const photo = (width = 200, height = 300) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .png()
    .toBuffer()
    .then((png) => new Uint8Array(png));

const decode = (dataUrl: string) => Buffer.from(dataUrl.slice(PREFIX.length), 'base64');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('사진에서 만든다', () => {
  it('자리표시 그림을 돌려준다', async () => {
    expect(await makeBlur(await photo())).toMatch(/^data:image\/webp;base64,/);
  });

  it('쓰는 쪽의 관문을 통과하는 값이다', async () => {
    /*
     * 화면은 `isBlurDataUrl` 로 거른 뒤에만 자리표시를 깐다. 그 관문을 못 넘는 값을 만들면
     * 자리표시가 조용히 전부 사라진다 — 사진은 그대로 뜨므로 눈으로는 모른다.
     */
    expect(isBlurDataUrl(await makeBlur(await photo()))).toBe(true);
  });

  it('정책대로 줄인다 — 긴 변이 아니라 너비를 맞추고 비율은 지킨다', async () => {
    const result = await makeBlur(await photo(200, 300));
    const meta = await sharp(decode(result!)).metadata();

    expect(meta.width).toBe(BLUR_WIDTH);
    expect(meta.height).toBe(BLUR_WIDTH * 1.5);
  });

  it('webp 로 만든다 — 같은 크기에 가장 작다', async () => {
    const result = await makeBlur(await photo());
    expect((await sharp(decode(result!)).metadata()).format).toBe('webp');
  });

  it('가로로 긴 사진도 너비를 맞춘다', async () => {
    const result = await makeBlur(await photo(400, 100));
    const meta = await sharp(decode(result!)).metadata();
    expect([meta.width, meta.height]).toEqual([BLUR_WIDTH, BLUR_WIDTH / 4]);
  });
});

describe('만들 수 없을 때', () => {
  it('사진이 아닌 바이트면 던지지 않고 비운다', async () => {
    /*
     * 여기서 던지면 사진이 멀쩡한데도 등록이 실패한다. 자리표시가 없으면 톤 블록이 깔릴 뿐이다 —
     * 그쪽이 훨씬 가벼운 손실이다.
     */
    expect(await makeBlur(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('빈 바이트도 비운다', async () => {
    expect(await makeBlur(new Uint8Array())).toBeNull();
  });
});

describe('주소로만 아는 사진에서', () => {
  it('받아서 만든다', async () => {
    const bytes = await photo();
    globalThis.fetch = (async () => new Response(bytes));

    expect(isBlurDataUrl(await makeBlurFromUrl('https://cdn.test/a.png'))).toBe(true);
  });

  it('없는 사진이면 비운다 — 안내 그림을 그 상품의 자리표시로 삼지 않는다', async () => {
    /*
     * **본문이 사진인 404 가 실제로 있다.** CDN 과 저장소는 없는 열쇠에 안내 그림이나 placeholder 를
     * 돌려주기도 한다. 상태를 안 보면 그 그림으로 자리표시를 만들어 **그 상품의 행에 저장한다** —
     * 그러면 사진이 오기 전 화면에 엉뚱한 그림의 흐린 상이 깔리고, 되짚을 단서가 없다.
     *
     * 본문이 사진이 아닐 때로 재면 이 줄을 떼도 sharp 가 넘어져 결과가 같아진다. 그래서
     * **사진인 404** 로 잰다.
     */
    globalThis.fetch = (async () => new Response(await photo(), { status: 404 }));

    expect(await makeBlurFromUrl('https://cdn.test/none.png')).toBeNull();
  });

  it('사진이 아닌 본문이 와도 던지지 않는다', async () => {
    globalThis.fetch = (async () => new Response('없습니다', { status: 404 }));
    await expect(makeBlurFromUrl('https://cdn.test/none.png')).resolves.toBeNull();
  });

  it('망이 끊겨도 던지지 않는다 — 백필이 한 줄에서 멈추면 안 된다', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ENOTFOUND')));

    await expect(makeBlurFromUrl('https://cdn.test/a.png')).resolves.toBeNull();
  });

  it('받은 주소로 묻는다', async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      return new Response(await photo());
    }) as unknown as typeof fetch;

    await makeBlurFromUrl('https://cdn.test/products/a.png');

    expect(asked).toEqual(['https://cdn.test/products/a.png']);
  });
});
