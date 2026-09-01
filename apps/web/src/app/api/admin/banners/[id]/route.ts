import { NextResponse } from 'next/server';
import { ForbiddenError, hasPermission } from '@shop/core';
import { updateBannerSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateBanner, deleteBanner, BannerError } from '~/lib/admin/manage-banner';
import { recordAudit } from '~/lib/audit';

function fail(error: unknown): NextResponse | null {
  if (error instanceof BannerError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const parsed = updateBannerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'VALIDATION_FAILED',
        message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const { before, after } = await updateBanner(actor, id, parsed.data);
    await recordAudit({
      actor, action: 'banner.update', targetType: 'banner', targetId: id,
      before: { headline: before.headline, isActive: before.isActive, href: before.href },
      after: { headline: after.headline, isActive: after.isActive, href: after.href },
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    const response = fail(error);
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
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'banner:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await deleteBanner(actor, id);
    await recordAudit({
      actor, action: 'banner.delete', targetType: 'banner', targetId: id, request,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}
