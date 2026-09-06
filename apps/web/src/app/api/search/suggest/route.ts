import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getSearchSuggestions } from '~/lib/queries/catalog/suggest';

/**
 * 검색 자동완성.
 *
 * 글자마다 부르는 창구라 **가볍게 유지한다.** 로그인을 요구하지 않고,
 * 카탈로그에서만 만들며, 캐시를 거친다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // 제한을 일을 시작하기 전에 건다
  const user = await getSessionUser(request.headers);
  const limited = await enforceRateLimit('catalog', request, user?.id ?? null);
  if (limited) return limited;

  const q = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json({ suggestions: await getSearchSuggestions(q) });
}
