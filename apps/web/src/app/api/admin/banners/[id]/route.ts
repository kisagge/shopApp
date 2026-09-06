import { NextResponse } from 'next/server';
import { ForbiddenError, hasPermission } from '@shop/core';
import { updateBannerSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateBanner, deleteBanner, BannerError } from '~/lib/admin/manage-banner';
import { recordAudit } from '~/lib/audit';
import { revalidateBanners } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

async function fail(error: unknown): Promise<NextResponse | null> {
  if (error instanceof BannerError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ForbiddenError) {
    return await forbidden();
  }
  return null;
}

export async function PATCH(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = updateBannerSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await updateBanner(actor, id, parsed.data);
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.update', targetType: 'banner', targetId: id,
      before: { headline: before.headline, isActive: before.isActive, href: before.href },
      after: { headline: after.headline, isActive: after.isActive, href: after.href },
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    const response = await fail(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
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

  const { id } = await params;

  try {
    await deleteBanner(actor, id);
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.delete', targetType: 'banner', targetId: id, request,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = await fail(error);
    if (response) return response;
    throw error;
  }
}
