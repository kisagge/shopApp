import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { supportPostSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateSupportPost, deleteSupportPost } from '~/lib/admin/manage-support';
import { revalidateSupport } from '~/lib/cache';

type Params = { params: Promise<{ id: string }> };

async function guard(request: Request): Promise<NextResponse | null> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(actor, 'support:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = supportPostSchema.safeParse(body);
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
