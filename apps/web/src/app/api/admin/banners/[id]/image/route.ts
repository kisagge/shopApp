import { NextResponse } from 'next/server';
import { MAX_IMAGE_BYTES, hasPermission } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { setBannerImage } from '~/lib/admin/manage-banner';
import { recordAudit } from '~/lib/audit';
import { revalidateBanners } from '~/lib/cache';
import { apiError, fileRequired, forbidden, imageTooLarge, invalidForm, unauthorized } from '~/lib/api/respond';

/** 배너 배경 이미지 교체 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'banner:write')) {
    return await forbidden();
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return await invalidForm();
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return await fileRequired();
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return await imageTooLarge();
  }

  const alt = form.get('alt');
  const { id } = await params;

  try {
    const banner = await setBannerImage(
      actor,
      id,
      { bytes: new Uint8Array(await file.arrayBuffer()), declaredType: file.type },
      typeof alt === 'string' ? alt : '',
    );
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.image', targetType: 'banner', targetId: id,
      after: { imageAlt: banner.imageAlt }, request,
    });
    return NextResponse.json(banner);
  } catch (error) {
    return await apiError(error);
  }
}
