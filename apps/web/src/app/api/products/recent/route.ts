import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getProductsBySlugs } from '~/lib/queries/products';
import { MAX_RECENT } from '~/stores/recently-viewed';

/**
 * 최근 본 상품의 지금 모습.
 *
 * 브라우저는 slug 만 들고 있다. 이름과 가격은 **매번 서버에 다시 묻는다** —
 * 기기에 적어 두면 할인이 끝난 뒤에도 할인가가 남는다.
 *
 * 로그인을 요구하지 않는다. 최근 본 상품은 로그인 전에 더 쓸모 있다.
 */

/** slug 로 쓸 수 있는 모양. 이보다 넉넉하게 받을 이유가 없다. */
const SLUG = /^[a-z0-9-]{1,80}$/;

export async function GET(request: Request): Promise<NextResponse> {
  /*
   * 제한을 **본문을 읽기 전에** 건다. 뒤에 두면 막으려던 요청이 이미 일을
   * 다 하고 나서 429 를 받는다 — 앞서 다른 창구에서 그렇게 만들어 두었다가
   * 고친 적이 있다.
   */
  const user = await getSessionUser(request.headers);
  const limited = await enforceRateLimit('catalog', request, user?.id ?? null);
  if (limited) return limited;

  const raw = new URL(request.url).searchParams.get('slugs') ?? '';
  const slugs = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => SLUG.test(s))
    // 들고 있는 개수만큼만 본다. 주소로 얼마든지 길게 보낼 수 있는 값이다.
    .slice(0, MAX_RECENT);

  if (slugs.length === 0) return NextResponse.json({ products: [] });

  return NextResponse.json({ products: await getProductsBySlugs(slugs) });
}
