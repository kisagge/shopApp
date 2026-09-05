import { NextResponse } from 'next/server';
import { ForbiddenError, hasPermission } from '@shop/core';
import { createBannerSchema, reorderBannerSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createBanner, reorderBanners, BannerError } from '~/lib/admin/manage-banner';
import { recordAudit } from '~/lib/audit';
import { revalidateBanners } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';

function fail(error: unknown): NextResponse | null {
  if (error instanceof BannerError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'banner:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = createBannerSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const banner = await createBanner(actor, parsed.data);
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.create', targetType: 'banner', targetId: banner.id,
      after: { headline: banner.headline, isActive: banner.isActive }, request,
    });
    return NextResponse.json(banner, { status: 201 });
  } catch (error) {
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}

/** 순서 변경 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'banner:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = reorderBannerSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const banners = await reorderBanners(actor, parsed.data.orderedIds);
    revalidateBanners();
    await recordAudit({
      actor, action: 'banner.reorder', targetType: 'banner', targetId: 'all',
      after: { order: banners.map((b) => b.id) }, request,
    });
    return NextResponse.json({ banners });
  } catch (error) {
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}
