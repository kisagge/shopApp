import 'server-only';
import { NextResponse } from 'next/server';
import type { MessageKey } from '@shop/i18n';
import { getT } from '~/lib/i18n/server';

/**
 * 라우트가 돌려주는 공통 오류 응답.
 *
 * **같은 것을 여든아홉 번 손으로 쓰고 있었다** — 401 을 마흔여덟 곳, 403 을
 * 열다섯 곳, 본문 파싱 실패를 스물여섯 곳에서. 그리고 그 문구가 전부
 * 한국어로 박혀 있었다: 일본어로 요청해도 "로그인이 필요합니다." 가 나갔고,
 * 화면들은 그 message 를 그대로 보여 준다.
 *
 * 검증 실패(validationFailed)를 한 곳으로 모았던 것과 같은 이유다 —
 * **번역은 응답을 만드는 서버가 한다.** 화면으로 열쇠를 내려보내면 스무 곳
 * 넘는 폼이 저마다 번역할 줄 알아야 하고, 하나만 빠뜨리면 사용자에게 열쇠가
 * 그대로 보인다.
 *
 * 어드민 전용 문구("기획전을 찾을 수 없습니다" 같은 것)는 그대로 둔다.
 * 운영진이 쓰는 화면은 한국어라고 정해 두었고, 그 결정은 여기서 바꿀 일이
 * 아니다.
 */
async function fail(status: number, code: string, key: MessageKey): Promise<NextResponse> {
  return NextResponse.json({ code, message: (await getT())(key) }, { status });
}

/** 로그인하지 않았다 */
export const unauthorized = (): Promise<NextResponse> =>
  fail(401, 'UNAUTHORIZED', 'api.unauthorized');

/**
 * 권한이 없다.
 *
 * 무엇이 모자란지는 **말하지 않는다.** "정산 지급 권한이 필요합니다" 는
 * 권한 이름을 알려 주는 셈이고, 그건 우리가 무엇을 어떻게 나눠 두었는지를
 * 밖에서 세어 볼 수 있게 한다.
 */
export const forbidden = (): Promise<NextResponse> => fail(403, 'FORBIDDEN', 'api.forbidden');

/** 본문이 JSON 이 아니다 */
export const invalidJson = (): Promise<NextResponse> =>
  fail(400, 'INVALID_JSON', 'api.invalidJson');

/** multipart 본문을 읽지 못했다 */
export const invalidForm = (): Promise<NextResponse> =>
  fail(400, 'INVALID_FORM', 'api.invalidForm');

/** 본문이 상한을 넘었다 */
export const tooLarge = (): Promise<NextResponse> =>
  fail(413, 'PAYLOAD_TOO_LARGE', 'api.tooLarge');

/** 파일을 고르지 않았다 */
export const fileRequired = (): Promise<NextResponse> =>
  fail(400, 'FILE_REQUIRED', 'api.fileRequired');

/** 이미지가 상한을 넘었다 */
export const imageTooLarge = (): Promise<NextResponse> =>
  fail(400, 'TOO_LARGE', 'api.imageTooLarge');
