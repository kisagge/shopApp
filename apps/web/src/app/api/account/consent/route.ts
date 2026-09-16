import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@shop/db';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

const consentSchema = z.object({ marketing: z.boolean() });

/**
 * 마케팅 정보 수신 동의를 켜고 끈다.
 *
 * **철회할 길이 없으면 동의가 아니다.** 가입 화면에서 받은 선택 동의를 마이페이지에서 되돌릴 수 있어야 하고, 창구가
 * 하나면 켜는 길과 끄는 길이 갈라지지 않는다.
 *
 * 필수 동의(이용약관·개인정보 수집)는 여기서 다루지 않는다. 가입한 사람은 이미 동의한 사람이고, 그 시각은 가입 훅이
 * 남긴다 — 여기서 끌 수 있게 만들면 "동의를 끈 회원" 이라는 있을 수 없는 상태가 생긴다.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('write', request, user.id);
  if (limited) return limited;

  const parsed = consentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const marketingAgreedAt = parsed.data.marketing ? new Date() : null;
  await prisma.user.update({ where: { id: user.id }, data: { marketingAgreedAt } });

  return NextResponse.json({ marketing: marketingAgreedAt !== null });
}
