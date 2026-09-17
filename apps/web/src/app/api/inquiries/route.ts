import { NextResponse } from 'next/server';
import { createInquirySchema } from '@shop/contract';
import { ImageError, MAX_IMAGES_PER_INQUIRY } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { createInquiry, InquiryError } from '~/lib/inquiry/write';
import { notifyInquiryReceived } from '~/lib/notifications/console-work';
import { discardInquiryImages, uploadInquiryImages } from '~/lib/inquiry/images';
import { readJsonWithImages } from '~/lib/images/read-body';
import type { UploadedImage } from '~/lib/images/upload-files';
import { StorageError } from '~/lib/storage';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 문의 작성 — 상품 문의와 1:1 문의.
 *
 * **구매 이력을 보지 않는다.** 사기 전에 묻는 자리라는 것이 리뷰와 다른 점이다. 로그인만 요구한다 — 익명으로 열면 누구에게
 * 답해야 하는지 알 수 없고, 답이 왔는지 알려 줄 수도 없다.
 *
 * 1:1 문의는 사진을 함께 보낼 수 있다(multipart). **문의 규칙을 먼저 보고 올린다** — 상품 문의에 사진을 붙인 요청은 올리기
 * 전에 거절해 저장소에 남는 파일이 없게 한다. 문의를 못 만들면 올린 사진을 되돌린다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  // 본문을 읽기 전에 센다 — 뒤에 두면 형식이 틀린 요청이 세어지지 않는다
  const limited = await enforceRateLimit('inquiry', request, user.id);
  if (limited) return limited;

  let body: unknown;
  let files: Awaited<ReturnType<typeof readJsonWithImages>>['files'];
  try {
    ({ fields: body, files } = await readJsonWithImages(request, { max: MAX_IMAGES_PER_INQUIRY, tooMany: 'TOO_MANY_INQUIRY_IMAGES' }));
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
    return await invalidJson();
  }

  const parsed = createInquirySchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }
  if (files.length > 0 && parsed.data.productId != null) {
    const error = new InquiryError('IMAGES_SUPPORT_ONLY', 400);
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }

  let uploaded: UploadedImage[] = [];
  try {
    uploaded = await uploadInquiryImages(user.id, files);
    const created = await createInquiry(user.id, parsed.data, uploaded);
    // 답할 사람에게 알린다 — 목록을 열어 보기 전까지 아무도 몰랐다
    await notifyInquiryReceived(created.id);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (uploaded.length > 0) await discardInquiryImages(uploaded.map((u) => u.key));
    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
    if (error instanceof StorageError) {
      return NextResponse.json({ code: error.code, message: '사진을 올리지 못했습니다. 사진 없이 다시 보내 주세요.' }, { status: 503 });
    }
    if (error instanceof InquiryError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
