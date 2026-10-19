import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { supportPostSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateSupportPost, deleteSupportPost } from '~/lib/admin/manage-support';
import { getAdminSupportPost } from '~/lib/queries/support';
import { revalidateSupport } from '~/lib/cache';
import { forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

type Params = { params: Promise<{ id: string }> };

async function guard(request: Request): Promise<NextResponse | null> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  if (!hasPermission(actor, 'support:write')) {
    return await forbidden();
  }
  return null;
}

const NOT_FOUND = NextResponse.json(
  { code: 'NOT_FOUND', message: '글을 찾을 수 없습니다.' },
  { status: 404 },
);

/**
 * 고칠 글 한 건.
 *
 * **목록이 본문을 안 들고 오기 때문에 이 창구가 있다.** 글마다 서식 나무를 화면으로
 * 내려보내면 응답이 글 수만큼 자라는데, 본문이 필요한 때는 고칠 한 건뿐이다.
 */
export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const denied = await guard(request);
  if (denied) return denied;
  const actor = (await getActor(request.headers))!;

  const { id } = await params;
  const post = await getAdminSupportPost(actor, id);
  if (!post) return NOT_FOUND;

  return NextResponse.json({ post });
}

export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const denied = await guard(request);
  if (denied) return denied;
  const actor = (await getActor(request.headers))!;

  const parsed = await readBody(request, supportPostSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const post = await updateSupportPost(actor, id, parsed.data);
  if (!post) return NOT_FOUND;

  revalidateSupport();
  return NextResponse.json({ post });
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const denied = await guard(request);
  if (denied) return denied;
  const actor = (await getActor(request.headers))!;

  const { id } = await params;
  if (!(await deleteSupportPost(actor, id))) return NOT_FOUND;

  revalidateSupport();
  return NextResponse.json({ ok: true });
}
