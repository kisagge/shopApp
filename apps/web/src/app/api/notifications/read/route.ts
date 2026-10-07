import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { prisma } from '@shop/db';
import { CONSOLE_NEWS_KIND, CONSOLE_NOTIFICATION_KIND, CUSTOMER_NOTIFICATION_KIND } from '@shop/core';
import { markNotificationsReadSchema } from '@shop/contract';
import { unauthorized, invalidJson } from '~/lib/api/respond';
import { validationFailed } from '~/lib/i18n/validation';

/**
 * 알림을 읽음으로.
 *
 * **POST 다.** 목록 화면을 열기만 해도 지워지게 하려면 GET 이 값을 바꿔야
 * 하는데, 그러면 브라우저가 미리 받아 두는 것만으로 뱃지가 사라진다.
 *
 * **줄을 고를 수 있다.** 운영 알림함은 할 일 목록이라 **열었다는 것이 처리했다는 뜻이 아니다** —
 * 사람이 끝낸 줄을 골라 닫는다. 매장 알림함은 소식을 전하는 자리라 화면이 뜬 뒤 한 번 부른다
 * (그때는 `ids` 가 없다 — 그 알림함 전체다).
 *
 * **줄을 고르지 않고 운영 알림함을 부르면 소식만 읽는다.** 그 알림함에는 할 일과 소식이 섞여 있다
 * (core CONSOLE_TODO_KIND). 소식(검수 결과·정산)은 아무도 "닫을" 일이 아니라서 그대로 두면 영영 안
 * 읽음으로 쌓이고 — 보존 규칙은 읽은 것만 지운다 — 뱃지는 다시 아무도 보지 않는 숫자가 된다. 할 일은
 * 남긴다: 그것을 닫는 것은 사람이 누르거나 코드가 끝낸 일을 닫아 줄 때다(markNoticesDone).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  /*
   * **어느 알림함을 열었는지 받는다.** 없으면 매장이다.
   *
   * 한동안 이 창구는 알림 종류를 가리지 않았다. 알림함이 하나일 때는 그게
   * 맞았는데, 운영 알림함이 생기자 **매장 알림함을 한 번 여는 것만으로 운영
   * 알림까지 읽음이 됐다** — 가맹점이 매장에 들렀다 가면 재고 부족 뱃지가
   * 아무 말 없이 사라진다. 읽지도 않은 것을 읽었다고 적는 셈이다.
   */
  const box = new URL(request.url).searchParams.get('box') === 'console' ? 'console' : 'customer';

  /*
   * **본문은 없어도 된다.** 매장 알림함은 아무것도 보내지 않고 그 알림함 전체를 뜻한다 — 빈 본문에
   * 400 을 주면 새 코드가 배포된 사이에 열려 있던 화면의 뱃지가 영영 안 지워진다.
   */
  const raw = await request.text();
  let ids: readonly string[] | undefined;
  if (raw.trim().length > 0) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return await invalidJson();
    }
    const parsed = markNotificationsReadSchema.safeParse(body);
    if (!parsed.success) return await validationFailed(parsed.error);
    ids = parsed.data.ids;
  }
  // 고르긴 했는데 빈 목록이면 할 일이 없다 — 조건 없는 updateMany 로 번지면 안 된다
  if (ids !== undefined && ids.length === 0) return NextResponse.json({ marked: 0 });

  const kinds =
    box === 'customer'
      ? [...CUSTOMER_NOTIFICATION_KIND]
      // 고른 줄이면 할 일도 닫는다(사람이 끝냈다고 누른 것이다). 안 골랐으면 소식만
      : ids
        ? [...CONSOLE_NOTIFICATION_KIND]
        : [...CONSOLE_NEWS_KIND];

  const { count } = await prisma.notification.updateMany({
    where: {
      // 남의 알림함은 건드릴 수 없다. id 를 받아도 이 조건은 그대로 걸린다
      userId: user.id,
      // 이미 읽은 것은 건드리지 않는다 — 읽은 시각이 뒤로 밀리면 안 된다
      readAt: null,
      // 고른 줄이라도 이 알림함의 종류여야 한다 — 남의 알림함 뱃지를 여기서 지울 수는 없다
      kind: { in: kinds },
      ...(ids ? { id: { in: [...ids] } } : {}),
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ marked: count });
}
