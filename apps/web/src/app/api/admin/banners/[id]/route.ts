import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { updateBannerSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateBanner, deleteBanner } from '~/lib/admin/manage-banner';
import { recordAudit } from '~/lib/audit';
import { revalidateBanners } from '~/lib/cache';
import { apiError, forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';


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

  const parsed = await readBody(request, updateBannerSchema);
  if (!parsed.ok) return parsed.response;

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
    return await apiError(error);
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
    return await apiError(error);
  }
}
