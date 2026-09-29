import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { createBannerSchema, reorderBannerSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createBanner, reorderBanners } from '~/lib/admin/manage-banner';
import { recordAudit } from '~/lib/audit';
import { revalidateBanners } from '~/lib/cache';
import { apiError, forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';


export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'banner:write')) {
    return await forbidden();
  }

  const parsed = await readBody(request, createBannerSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const banner = await createBanner(actor, parsed.data);
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.create', targetType: 'banner', targetId: banner.id,
      after: { headline: banner.headline, isActive: banner.isActive }, request,
    });
    return NextResponse.json(banner, { status: 201 });
  } catch (error) {
    return await apiError(error);
  }
}

/** 순서 변경 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'banner:write')) {
    return await forbidden();
  }

  const parsed = await readBody(request, reorderBannerSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const banners = await reorderBanners(actor, parsed.data.orderedIds);
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.reorder', targetType: 'banner', targetId: 'all',
      after: { order: banners.map((b) => b.id) }, request,
    });
    return NextResponse.json({ banners });
  } catch (error) {
    return await apiError(error);
  }
}
