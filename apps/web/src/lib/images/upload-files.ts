import 'server-only';
import { randomBytes } from 'node:crypto';
import { verifyImageBytes, type ImageContentType } from '@shop/core';
import { getStorage } from '~/lib/storage';
import { prepareImage } from '~/lib/images/prepare';

export interface UploadedImage {
  readonly url: string;
  readonly key: string;
  /**
   * 사진이 도착하기 전 깔 자리표시. **바이트가 여기 있을 때 만든다** — 나중에 주소로 다시 받아 만들면 올린 것을 도로
   * 내려받는 일이다. 못 만들면 null.
   */
  readonly blurDataUrl: string | null;
}

export interface ImageFile {
  readonly bytes: Uint8Array;
  readonly declaredType: string;
}

/**
 * 손님이 올린 사진을 저장소에 올린다 — 리뷰 사진과 문의 사진이 같은 길을 쓴다.
 *
 * - **올리기 전에 전부 검사한다.** 한 장이라도 이미지가 아니면 아무것도 올리지 않는다. 절반만 올라간 뒤 거절하면 주인 없는
 *   객체가 남는다.
 * - **내용에서 알아낸 형식을 쓴다.** 선언값을 그대로 믿으면 검사한 의미가 없다.
 * - **찍은 자리 좌표를 지운다(prepareImage).** 휴대폰에서 바로 올린 파일에는 위치가 들어 있고, 주소는 공개 저장소에 있다.
 * - 키에는 파일 이름 대신 추측할 수 없는 토큰을 쓴다(경로 탈출·덮어쓰기·주소 짐작).
 * - 중간에 실패하면 이미 올린 것을 도로 지운다.
 */
export async function uploadImageFiles(
  files: readonly ImageFile[],
  keyFor: (contentType: ImageContentType, token: string) => string,
  tag: string,
): Promise<UploadedImage[]> {
  if (files.length === 0) return [];
  const verified = files.map((file) => ({ bytes: file.bytes, contentType: verifyImageBytes(file) }));

  const storage = getStorage();
  const done: UploadedImage[] = [];
  try {
    for (const file of verified) {
      const key = keyFor(file.contentType, randomBytes(12).toString('base64url'));
      const prepared = await prepareImage(file.bytes, file.contentType);
      const { url } = await storage.put({ key, body: prepared.bytes, contentType: file.contentType });
      done.push({ url, key, blurDataUrl: prepared.blurDataUrl });
    }
  } catch (error) {
    await discardImageKeys(done.map((d) => d.key), tag);
    throw error;
  }
  return done;
}

/**
 * 올린 파일을 되돌린다. **던지지 않는다** — 부르는 자리는 이미 다른 오류를 처리하는 중이고, 여기서 또 던지면 원래 오류가
 * 묻힌다. 남은 객체는 눈에 보이는 피해가 없어 로그로만 남긴다.
 */
export async function discardImageKeys(keys: readonly string[], tag: string): Promise<void> {
  if (keys.length === 0) return;
  const storage = getStorage();
  const results = await Promise.allSettled(keys.map((key) => storage.remove(key)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) console.error(`[${tag}] 객체 ${failed}/${keys.length}건 삭제 실패 — 고아 객체 남음`);
}
