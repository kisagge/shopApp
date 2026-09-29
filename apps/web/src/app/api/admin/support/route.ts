import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { supportPostSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createSupportPost } from '~/lib/admin/manage-support';
import { revalidateSupport } from '~/lib/cache';
import { forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'support:write')) {
    return await forbidden();
  }

  const parsed = await readBody(request, supportPostSchema);
  if (!parsed.ok) return parsed.response;

  const post = await createSupportPost(actor, parsed.data);
  revalidateSupport();
  return NextResponse.json({ post }, { status: 201 });
}
