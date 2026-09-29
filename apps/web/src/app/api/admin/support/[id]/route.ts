import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { supportPostSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateSupportPost, deleteSupportPost } from '~/lib/admin/manage-support';
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
