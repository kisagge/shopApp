import { NextResponse } from 'next/server';
import { enforceRateLimit } from '~/lib/rate-limit';
import { createReviewSchema } from '@shop/contract';
import { ImageError, MAX_IMAGE_BYTES, MAX_IMAGES_PER_REVIEW } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { createReview, assertCanReview, ReviewError } from '~/lib/reviews/write-review';
import { uploadReviewImages, discardReviewImages } from '~/lib/reviews/images';
import { revalidateReviews } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 사진이 있으면 multipart, 없으면 JSON 으로 온다.
 *
 * 사진 때문에 기존 JSON 경로를 없애지 않았다. 사진 없는 리뷰가 대부분이고,
 * 그쪽까지 multipart 로 바꾸면 이유 없이 무거워진다.
 */
async function readBody(request: Request): Promise<{
  fields: unknown;
  files: { bytes: Uint8Array; declaredType: string }[];
}> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data')) {
    return { fields: await request.json(), files: [] };
  }

  const form = await request.formData();
  const raw = form.get('data');
  const fields: unknown = typeof raw === 'string' ? JSON.parse(raw) : {};

  const files: { bytes: Uint8Array; declaredType: string }[] = [];
  for (const entry of form.getAll('images')) {
    if (typeof entry === 'string') continue;
    /**
     * 읽기 **전에** 크기를 본다.
     *
     * arrayBuffer() 를 먼저 부르면 그 순간 파일 전체가 메모리에 올라간다.
     * 5MB 제한을 두고도 500MB 를 받아 낸 뒤에 거절하면 막은 것이 아니다.
     */
    if (entry.size > MAX_IMAGE_BYTES) throw new ImageError('TOO_LARGE');
    files.push({
      bytes: new Uint8Array(await entry.arrayBuffer()),
      declaredType: entry.type,
    });
    // 같은 이유로 개수도 다 읽기 전에 끊는다
    if (files.length > MAX_IMAGES_PER_REVIEW) throw new ImageError('TOO_MANY_REVIEW_IMAGES');
  }

  return { fields, files };
}

/** 리뷰 작성. 산 사람만, 배송이 끝난 뒤, 주문 항목당 하나. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  // 로그인 필수 창구라 사용자 id 로 센다
  const limited = await enforceRateLimit('review', request, user.id);
  if (limited) return limited;

  let body: unknown;
  let files: { bytes: Uint8Array; declaredType: string }[];
  try {
    const read = await readBody(request);
    body = read.fields;
    files = read.files;
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
    return await invalidJson();
  }

  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  /**
   * 자격을 먼저 보고, 그다음에 올린다.
   *
   * 순서가 반대면 리뷰를 쓸 수 없는 사람의 파일이 저장소에 남는다.
   * createReview 가 같은 검사를 다시 하지만, 업로드 전에 한 번 걸러야
   * 남의 주문 id 를 넣어 파일만 올리는 길이 막힌다.
   */
  let uploaded: { url: string; key: string }[] = [];
  try {
    if (files.length > 0) {
      await assertCanReview(user.id, parsed.data.orderItemId);
      uploaded = await uploadReviewImages(parsed.data.orderItemId, files);
    }

    const review = await createReview(user.id, parsed.data, uploaded);
    // 별점과 리뷰 수가 목록에도 나온다
    revalidateReviews();
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    // 리뷰가 만들어지지 않았으면 올린 사진도 되돌린다
    if (uploaded.length > 0) await discardReviewImages(uploaded.map((u) => u.key));

    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
    if (error instanceof ReviewError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    // 유니크 제약이 동시 요청을 막은 경우
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { code: 'ALREADY_REVIEWED', message: '이미 리뷰를 쓴 주문입니다' },
        { status: 409 },
      );
    }
    throw error;
  }
}
