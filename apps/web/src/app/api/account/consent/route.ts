import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@shop/db';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

/**
 * 둘 다 선택 동의이고 각각 따로 켜고 끈다 — 한 번에 하나만 보내도 되고 함께 보내도 된다.
 * 아무것도 안 보내면 바꿀 것이 없으므로 막는다(빈 요청으로 저장을 부르지 않는다).
 */
const consentSchema = z
  .object({ marketing: z.boolean().optional(), analytics: z.boolean().optional() })
  .refine((v) => v.marketing !== undefined || v.analytics !== undefined, {
    message: 'valid.required',
  });

/**
 * 선택 동의를 켜고 끈다 — 마케팅 정보 수신과 이용 기록 수집.
 *
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

  /*
   * **이용 기록 동의는 계정에 남는다.** 예전에는 이 값을 쓰는 곳이 탈퇴 처리뿐이라, 화면의 토글은 이 브라우저의
   * localStorage 만 건드렸다. 기기나 브라우저를 바꾸면 껐던 추적이 조용히 되살아났고, 수집 창구가 존중하는
   * DENIED 는 영영 만들어지지 않았다 — 마케팅 동의는 진작 계정에 저장하고 있어 일관성도 어긋났다.
   *
   * null(아직 고른 적 없음)과 DENIED 는 다르다. 여기서는 사람이 직접 고른 것이므로 둘 중 하나로 적는다.
   */
  const data = {
    ...(parsed.data.marketing === undefined
      ? {}
      : { marketingAgreedAt: parsed.data.marketing ? new Date() : null }),
    ...(parsed.data.analytics === undefined
      ? {}
      : { analyticsConsent: parsed.data.analytics ? ('GRANTED' as const) : ('DENIED' as const) }),
  };
  const after = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { marketingAgreedAt: true, analyticsConsent: true },
  });

  return NextResponse.json({
    marketing: after.marketingAgreedAt !== null,
    analytics: after.analyticsConsent !== 'DENIED',
  });
}
