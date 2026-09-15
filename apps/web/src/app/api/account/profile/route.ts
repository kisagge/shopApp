import { NextResponse } from 'next/server';
import { updateProfileSchema } from '@shop/contract';
import { normalizePhone } from '@shop/core';
import { auth } from '@shop/auth';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

/**
 * 회원정보 수정 — 이름·연락처.
 *
 * **계약으로 먼저 본다.** 칸마다 우리 말로 된 문구가 나가야 화면이 그 칸을 가리킨다.
 *
 * 저장은 인증 라이브러리의 사용자 수정을 **서버에서 불러** 한다. DB 를 직접 고치면 세션 쿠키 캐시(5분)에 옛 이름이
 * 남아 머리에 한동안 옛 이름이 뜬다 — 라이브러리를 거치면 새 값으로 쿠키를 다시 구워 준다. 그 쿠키를 그대로 옮긴다.
 * 사용자 수정 훅(assertProfileUpdate)이 같은 규칙으로 한 번 더 막는다.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('write', request, user.id);
  if (limited) return limited;

  const parsed = updateProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const phone = parsed.data.phone === '' ? null : normalizePhone(parsed.data.phone);
  const updated = await auth.api.updateUser({
    headers: request.headers,
    body: { name: parsed.data.name, phone },
    asResponse: true,
  });
  if (!updated.ok) {
    return NextResponse.json({ code: 'PROFILE_NOT_SAVED', message: '회원정보를 저장하지 못했습니다.' }, { status: updated.status });
  }

  const response = NextResponse.json({ name: parsed.data.name, phone });
  for (const cookie of updated.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
