import sharp, { type Sharp } from 'sharp';
import {
  MAX_IMAGE_EDGE, IMAGE_QUALITY, BLUR_WIDTH, BLUR_QUALITY, toBlurDataUrl,
  type ImageContentType,
} from '@shop/core';

/**
 * 저장하기 전에 사진을 다듬는다.
 *
 * 한 번 열어서 두 가지를 만든다 — 저장할 사진과 자리표시. 따로 만들면 같은
 * 사진을 두 번 푼다.
 *
 * 하는 일이 셋이다.
 *
 * **너무 크면 줄인다.** 상한이 5MB 라 4000×6000 짜리 휴대폰 사진이 그대로
 * 들어온다. 긴 변 2400 이면 1.9MB 가 206KB 가 된다.
 *
 * **곁들여 온 정보를 떼어 낸다.** 휴대폰 사진에는 **찍은 자리의 좌표**가
 * 들어 있다. 지금은 올린 바이트를 그대로 저장하고 리뷰 사진은 원본 주소를
 * 새 탭으로 여는데, 그러면 후기를 쓴 사람의 집이 어디인지가 그 파일 하나로
 * 나간다. 다시 그려서 저장하면 함께 떨어진다.
 *
 * **방향을 먼저 세운다.** 휴대폰 사진은 가로로 찍은 것을 세로 정보로 표시해
 * 두는 일이 흔한데, 그 정보를 떼어 내기 전에 실제로 돌려 놓지 않으면
 * **사진이 옆으로 누워 저장된다.** 떼어 내는 순간 돌릴 근거가 사라진다.
 *
 * **못 열면 받은 그대로 둔다.** 사진 자체는 멀쩡한데 우리 도구가 못 여는
 * 경우가 있고, 그때 등록을 막으면 올린 사람은 왜 안 되는지 알 수 없다.
 * 이때는 다듬어지지 않은 채로 저장된다는 뜻이라 로그를 남긴다.
 */
export interface PreparedImage {
  readonly bytes: Uint8Array;
  readonly blurDataUrl: string | null;
  /** 다듬어졌는가. 실패해서 원본 그대로면 false 다. */
  readonly normalized: boolean;
}

function encode(pipeline: Sharp, contentType: ImageContentType): Sharp {
  switch (contentType) {
    case 'image/png':
      // 무손실이다. 품질을 주는 대신 압축만 세게 건다.
      return pipeline.png({ compressionLevel: 9 });
    case 'image/webp':
      return pipeline.webp({ quality: IMAGE_QUALITY });
    case 'image/avif':
      return pipeline.avif({ quality: IMAGE_QUALITY });
    default:
      return pipeline.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true });
  }
}

export async function prepareImage(
  bytes: Uint8Array,
  contentType: ImageContentType,
): Promise<PreparedImage> {
  try {
    const source = sharp(bytes)
      // EXIF 를 떼어 내기 전에 실제로 돌려 놓는다
      .rotate()
      // 작은 사진을 늘리지 않는다. 늘리면 용량만 늘고 선명해지지 않는다.
      .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true });

    const [normalizedBytes, small] = await Promise.all([
      encode(source.clone(), contentType).toBuffer(),
      source
        .clone()
        .resize(BLUR_WIDTH, null, { fit: 'inside' })
        .webp({ quality: BLUR_QUALITY })
        .toBuffer(),
    ]);

    return {
      bytes: new Uint8Array(normalizedBytes),
      blurDataUrl: toBlurDataUrl(small.toString('base64')),
      normalized: true,
    };
  } catch (error) {
    console.error('[image] 다듬지 못해 원본 그대로 저장한다', { contentType }, error);
    return { bytes, blurDataUrl: null, normalized: false };
  }
}
