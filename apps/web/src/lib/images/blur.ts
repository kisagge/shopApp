import sharp from 'sharp';
import { BLUR_WIDTH, BLUR_QUALITY, toBlurDataUrl } from '@shop/core';

/**
 * 올라온 사진에서 자리표시 그림을 만든다.
 *
 * **절대 던지지 않는다.** 자리표시는 있으면 좋은 것이지 업로드의 조건이
 * 아니다 — 여기서 던지면 사진이 멀쩡한데도 등록이 실패하고, 운영자는
 * 왜 안 되는지 알 수 없다. 못 만들면 없이 간다(톤 블록이 깔린다).
 *
 * 정책(너비·품질·상한)은 core 에 있다. 여기 있는 것은 그것을 실행하는
 * 일뿐이다 — 이 파일만 sharp 를 안다.
 *
 * **`server-only` 를 붙이지 않았다.** 이 모듈은 앱의 업로드 경로와 채워 넣는
 * 스크립트가 함께 쓰는데, 그 표시는 tsx 아래에서 그대로 던져서 스크립트가
 * 같은 코드를 쓸 수 없게 만든다. 대신 **같은 것을 검사가 지킨다** —
 * 이것을 가져오는 파일 중에 클라이언트 모듈이 있으면 진다. 표시를 빼되
 * 지키는 것을 빼지는 않는다.
 */
export async function makeBlur(bytes: Uint8Array): Promise<string | null> {
  try {
    const small = await sharp(bytes)
      .resize(BLUR_WIDTH, null, { fit: 'inside' })
      .webp({ quality: BLUR_QUALITY })
      .toBuffer();
    return toBlurDataUrl(small.toString('base64'));
  } catch {
    return null;
  }
}

/** 주소로만 아는 사진에서. 채워 넣는 스크립트가 쓴다. */
export async function makeBlurFromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await makeBlur(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}
