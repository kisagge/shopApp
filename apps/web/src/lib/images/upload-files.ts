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
 * 사진 한 장을 갈아 끼운다 — 올리고, 적고, 옛것을 지운다.
 *
 * **순서가 요점이다.** 네 자리(상품 사진·브랜드 로고·배너·기획전)가 같은 순서를 각자 적고
 * 있었고, 그중 둘은 **가운데가 실패했을 때 되돌리지 않았다** — 적기가 넘어지면 아무도
 * 가리키지 않는 파일이 저장소에 남는다.
 *
 * 1. **올린다.** 검사·다듬기(위치 정보 제거)·키 만들기는 uploadImageFiles 가 한다.
 * 2. **적는다.** 적기가 실패하면 방금 올린 것을 지운다.
 * 3. **옛것을 지운다.** 적은 뒤에 지운다 — 먼저 지우면 적기가 실패했을 때 화면에 깨진
 *    사진이 남는다. 옛 키를 모르면(주소만 적혀 있던 시절의 줄) 지우지 않는다. 우리가
 *    올린 것인지 알 수 없다.
 */
export async function replaceImage<T>(input: {
  readonly file: ImageFile;
  readonly keyFor: (contentType: ImageContentType, token: string) => string;
  /** 로그에 찍히는 꼬리표. '[banners]' 처럼 어느 화면의 일인지 알아볼 수 있게 */
  readonly tag: string;
  /** 지금 걸려 있는 파일의 키. 처음 올리는 것이면 null */
  readonly previousKey: string | null;
  /** 올린 것을 어디에 적는가. 여기서 던지면 올린 파일을 도로 지운다. */
  readonly write: (uploaded: UploadedImage) => Promise<T>;
}): Promise<T> {
  const [uploaded] = await uploadImageFiles([input.file], input.keyFor, input.tag);
  const image = uploaded!;

  let written: T;
  try {
    written = await input.write(image);
  } catch (error) {
    await discardImageKeys([image.key], input.tag);
    throw error;
  }

  if (input.previousKey && input.previousKey !== image.key) {
    await discardImageKeys([input.previousKey], input.tag);
  }

  return written;
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
