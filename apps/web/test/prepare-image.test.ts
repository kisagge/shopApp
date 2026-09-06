import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAX_IMAGE_EDGE, isBlurDataUrl } from '@shop/core';
import { prepareImage } from '~/lib/images/prepare';

/**
 * 저장하기 전에 사진을 다듬는가.
 *
 * 상한이 5MB 라 휴대폰 사진이 그대로 들어온다. 예전에는 **받은 바이트를
 * 그대로** 저장소에 넣었다 — 크기도, 곁들여 온 정보도 손대지 않았다.
 */

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 140, g: 60, b: 50 } } });

const jpeg = async (width: number, height: number): Promise<Uint8Array> =>
  new Uint8Array(await photo(width, height).jpeg().toBuffer());

const meta = (bytes: Uint8Array) => sharp(bytes).metadata();

describe('너무 큰 사진은 줄인다', () => {
  it('긴 변이 상한을 넘으면 상한에 맞춘다', async () => {
    const { bytes } = await prepareImage(await jpeg(4032, 3024), 'image/jpeg');

    const m = await meta(bytes);
    expect(m.width).toBe(MAX_IMAGE_EDGE);
    // 비율은 그대로다. 잘라 내지 않는다 — 무엇을 버릴지는 우리가 정할 일이 아니다.
    expect(m.height).toBe(Math.round((MAX_IMAGE_EDGE * 3024) / 4032));
  });

  it('세로가 긴 사진은 세로를 기준으로 맞춘다', async () => {
    const { bytes } = await prepareImage(await jpeg(3000, 4000), 'image/jpeg');

    const m = await meta(bytes);
    expect(m.height).toBe(MAX_IMAGE_EDGE);
    expect(m.width).toBeLessThan(MAX_IMAGE_EDGE);
  });

  /** 늘리면 용량만 늘고 선명해지지 않는다 */
  it('작은 사진은 늘리지 않는다', async () => {
    const { bytes } = await prepareImage(await jpeg(600, 400), 'image/jpeg');

    const m = await meta(bytes);
    expect(m.width).toBe(600);
    expect(m.height).toBe(400);
  });

  it('실제로 가벼워진다', async () => {
    const big = await jpeg(4032, 3024);
    const { bytes } = await prepareImage(big, 'image/jpeg');

    expect(bytes.byteLength).toBeLessThan(big.byteLength);
  });
});

describe('곁들여 온 정보를 떼어 낸다', () => {
  /**
   * **휴대폰 사진에는 찍은 자리의 좌표가 들어 있다.** 리뷰 사진은 원본 주소를
   * 새 탭으로 여는 구조라, 떼어 내지 않으면 후기를 쓴 사람의 집이 어디인지가
   * 그 파일 하나로 나간다.
   */
  it('EXIF 를 남기지 않는다', async () => {
    const withExif = new Uint8Array(
      await photo(800, 600)
        .withExif({ IFD0: { Copyright: 'someone', Software: 'Phone 1.0' } })
        .jpeg()
        .toBuffer(),
    );
    // 먼저 원본에 실제로 들어 있는지 확인한다 — 없으면 이 검사가 헛돈다
    expect((await meta(withExif)).exif).toBeDefined();

    const { bytes } = await prepareImage(withExif, 'image/jpeg');

    expect((await meta(bytes)).exif).toBeUndefined();
  });

  /**
   * **떼어 내기 전에 돌려 놓아야 한다.** 휴대폰은 가로로 찍은 것을 세로
   * 정보로 표시해 두는 일이 흔한데, 그 정보를 지우면 돌릴 근거가 사라진다 —
   * 사진이 옆으로 누운 채 저장된다.
   */
  it('방향 정보를 먼저 적용하고 지운다', async () => {
    // orientation 6 = 시계 방향 90도로 돌려서 보여 달라는 뜻.
    // withExif 로는 이 값이 박히지 않는다(읽어 보면 1 이다) — 확인하고 고쳤다.
    const sideways = new Uint8Array(
      await photo(1000, 500).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
    );
    expect((await meta(sideways)).orientation).toBe(6);

    const { bytes } = await prepareImage(sideways, 'image/jpeg');

    const m = await meta(bytes);
    // 돌려 놓았으므로 가로세로가 바뀌어 있어야 한다
    expect(m.width).toBe(500);
    expect(m.height).toBe(1000);
    // 그리고 돌릴 근거는 지워져 있다 — 두 번 돌지 않는다
    expect(m.orientation).toBeUndefined();
  });
});

describe('형식과 자리표시', () => {
  it.each([
    ['image/jpeg', 'jpeg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ] as const)('%s 는 그대로 %s 로 저장한다', async (contentType, format) => {
    const source = new Uint8Array(
      await photo(500, 500)[format === 'jpeg' ? 'jpeg' : format]().toBuffer(),
    );

    const { bytes } = await prepareImage(source, contentType);

    expect((await meta(bytes)).format).toBe(format);
  });

  it('같은 한 번에 자리표시도 만든다 — 사진을 두 번 풀지 않는다', async () => {
    const { blurDataUrl } = await prepareImage(await jpeg(2000, 1500), 'image/jpeg');
    expect(isBlurDataUrl(blurDataUrl)).toBe(true);
  });
});

describe('못 열면 받은 그대로 둔다', () => {
  /**
   * 사진 자체는 멀쩡한데 우리 도구가 못 여는 경우가 있다. 그때 등록을 막으면
   * 올린 사람은 왜 안 되는지 알 수 없다.
   */
  it('던지지 않고 원본을 돌려준다', async () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array(24).fill(0)]);

    const result = await prepareImage(broken, 'image/jpeg');

    expect(result.bytes).toBe(broken);
    expect(result.normalized).toBe(false);
    expect(result.blurDataUrl).toBeNull();
  });
});
