import 'server-only';
import { reviewImageObjectKey, ImageError, MAX_IMAGES_PER_REVIEW } from '@shop/core';
import { discardImageKeys, uploadImageFiles, type ImageFile, type UploadedImage } from '~/lib/images/upload-files';

export type { UploadedImage };

/**
 * 리뷰 사진 업로드.
 *
 * **별도의 공개 업로드 엔드포인트를 만들지 않았다.** 리뷰 작성 요청 안에서만 올린다. 따로 두면 로그인만 하면 아무나 두드릴
 * 수 있는 저장소 쓰기 창구가 하나 생기고, 리뷰를 쓰지도 않으면서 파일만 쌓는 길이 열린다. 여기 묶어 두면 "산 물건에, 배송이
 * 끝난 뒤, 한 번만" 이라는 리뷰 자격 검사가 그대로 업로드의 자격 검사가 된다. 검사·좌표 제거·되돌리기는 uploadImageFiles.
 */
export async function uploadReviewImages(orderItemId: string, files: readonly ImageFile[]): Promise<UploadedImage[]> {
  if (files.length > MAX_IMAGES_PER_REVIEW) throw new ImageError('TOO_MANY_REVIEW_IMAGES');
  return uploadImageFiles(files, (contentType, token) => reviewImageObjectKey({ orderItemId, contentType, token }), 'review-images');
}

export async function discardReviewImages(keys: readonly string[]): Promise<void> {
  await discardImageKeys(keys, 'review-images');
}
