import 'server-only';
import { inquiryImageObjectKey, ImageError, MAX_IMAGES_PER_INQUIRY } from '@shop/core';
import { discardImageKeys, uploadImageFiles, type ImageFile, type UploadedImage } from '~/lib/images/upload-files';

/**
 * 1:1 문의 사진 업로드 — 문의 작성 요청 안에서만(리뷰 사진과 같은 이유로 따로 올리는 창구를 두지 않는다). 문의 작성의
 * 로그인·요청 제한이 그대로 업로드의 문턱이 된다. 검사·좌표 제거·되돌리기는 uploadImageFiles.
 */
export async function uploadInquiryImages(authorId: string, files: readonly ImageFile[]): Promise<UploadedImage[]> {
  if (files.length > MAX_IMAGES_PER_INQUIRY) throw new ImageError('TOO_MANY_INQUIRY_IMAGES');
  return uploadImageFiles(files, (contentType, token) => inquiryImageObjectKey({ authorId, contentType, token }), 'inquiry-images');
}

export async function discardInquiryImages(keys: readonly string[]): Promise<void> {
  await discardImageKeys(keys, 'inquiry-images');
}
