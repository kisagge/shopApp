import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  verifyImageBytes, reviewImageObjectKey, ImageError,
  MAX_IMAGES_PER_REVIEW,
} from '@shop/core';
import { getStorage } from '~/lib/storage';

/**
 * 리뷰 사진 업로드.
 *
 * **별도의 공개 업로드 엔드포인트를 만들지 않았다.** 리뷰 작성 요청 안에서만
 * 올린다. 따로 두면 로그인만 하면 아무나 두드릴 수 있는 저장소 쓰기 창구가
 * 하나 생기고, 리뷰를 쓰지도 않으면서 파일만 쌓는 길이 열린다. 여기 묶어 두면
 * "산 물건에, 배송이 끝난 뒤, 한 번만" 이라는 리뷰 자격 검사가 그대로
 * 업로드의 자격 검사가 된다.
 */

export interface UploadedImage {
  readonly url: string;
  readonly key: string;
}

/**
 * 올리기 전에 전부 검사한다.
 *
 * 한 장이라도 규칙에 어긋나면 **아무것도 올리지 않는다.** 절반만 올라간 뒤
 * 거절하면 주인 없는 객체가 남고, 사용자는 무엇이 문제였는지도 모른 채
 * 다시 시도해 또 절반을 올린다.
 */
export async function uploadReviewImages(
  orderItemId: string,
  files: readonly { bytes: Uint8Array; declaredType: string }[],
): Promise<UploadedImage[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_IMAGES_PER_REVIEW) throw new ImageError('TOO_MANY_REVIEW_IMAGES');

  // 내용에서 알아낸 형식을 쓴다. 선언값을 그대로 믿으면 검사한 의미가 없다.
  const verified = files.map((file) => ({
    bytes: file.bytes,
    contentType: verifyImageBytes(file),
  }));

  const storage = getStorage();
  const done: UploadedImage[] = [];

  try {
    for (const file of verified) {
      const key = reviewImageObjectKey({
        orderItemId,
        contentType: file.contentType,
        // 파일 이름을 쓰지 않는다 — 경로 탈출과 덮어쓰기가 전부 거기서 나온다
        token: randomBytes(12).toString('base64url'),
      });
      const { url } = await storage.put({ key, body: file.bytes, contentType: file.contentType });
      done.push({ url, key });
    }
  } catch (error) {
    // 중간에 실패하면 이미 올린 것을 도로 지운다. 리뷰가 만들어지지 않을
    // 파일을 남겨 둘 이유가 없다.
    await discardReviewImages(done.map((d) => d.key));
    throw error;
  }

  return done;
}

/**
 * 올린 파일을 되돌린다.
 *
 * 실패해도 던지지 않는다. 이 함수를 부르는 자리는 이미 다른 오류를 처리하는
 * 중이고, 여기서 또 던지면 원래 오류가 묻힌다. 남은 객체는 눈에 보이는
 * 피해가 없다.
 */
export async function discardReviewImages(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const storage = getStorage();
  const results = await Promise.allSettled(keys.map((key) => storage.remove(key)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.error(`[review-images] 객체 ${failed}/${keys.length}건 삭제 실패 — 고아 객체 남음`);
  }
}
