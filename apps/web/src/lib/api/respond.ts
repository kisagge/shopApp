import 'server-only';
import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import type { MessageKey, Translator, Vars } from '@shop/i18n';
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

/**
 * 도메인 오류를 응답으로 옮긴다.
 *
 * **같은 말미를 열다섯 곳이 적고 있었다** — 자기 도메인 오류를 `{ code, message }` 와
 * 그 오류가 아는 상태로 내보내고, 권한 오류는 403 으로 돌리고, 나머지는 다시 던진다.
 * 도메인 오류 클래스가 서른아홉인데 전부 같은 모양(`code`·`message`·`status`)이라,
 * 새 오류를 하나 더할 때마다 그것을 던지는 라우트도 함께 고쳐야 했다.
 *
 * **모르는 고장은 다시 던진다.** 삼켜서 400 으로 내보내면 진짜 버그가 "잘못된 요청"
 * 으로 둔갑하고, 그러면 아무도 그것을 고치지 않는다.
 *
 * 모양으로 알아본다(instanceof 가 아니라). 클래스 서른아홉 개를 여기서 알면 이 파일이
 * 모든 도메인을 import 해야 하고, 그건 방향이 거꾸로다. 상태 코드가 숫자로 붙어 있는
 * Error 만 도메인 오류로 본다 — Prisma 오류는 `code` 는 있어도 `status` 가 없다.
 */
export async function apiError(error: unknown): Promise<NextResponse> {
  // 무엇이 모자란지는 말하지 않는다(forbidden 의 주석) — 도메인 메시지를 그대로 내보내지 않는 이유다
  if (error instanceof ForbiddenError) return await forbidden();

  const domain = asDomainError(error);
  if (!domain) throw error;

  return NextResponse.json(
    {
      code: domain.code,
      message: localize(await getT(), domain.message, domain.vars),
      // 어느 칸이 틀렸는지 아는 오류는 그것까지 넘긴다 — 폼이 그 칸에 표시한다
      ...(domain.fields ? { fields: domain.fields } : {}),
    },
    { status: domain.status },
  );
}

/**
 * 도메인 오류의 문구를 이 요청의 말로 바꾼다.
 *
 * **문구 자리에 사전 열쇠를 적는다.** 계약의 Zod 문구(`valid.*`)와 같은 방식이다 — 오류를 던지는 자리는
 * 요청의 언어를 모르고(배치도 웹훅도 같은 함수를 부른다), 번역은 응답을 만드는 이 자리에서 한다.
 *
 * **열쇠가 아니면 그대로 내보낸다.** 운영 화면의 문구는 한국어로 두기로 했고(forbidden 의 주석), 아직
 * 옮기지 않은 자리도 오늘 하던 대로 동작해야 한다 — 한 번에 다 옮기지 않아도 화면이 깨지지 않는다.
 */
function localize(t: Translator, message: string, vars: Vars | undefined): string {
  if (!t.has(message)) return message;
  return t(message as MessageKey, vars && translateVars(t, vars));
}

/**
 * 끼워 넣을 값도 열쇠일 수 있다.
 *
 * "이미 {status}된 주문입니다" 의 `status` 는 주문 상태 이름이라 그것 자체가 번역거리다. 문구와 같은
 * 규칙으로 본다 — 열쇠면 바꾸고, 아니면(상품명·옵션명처럼 DB 에서 온 글) 그대로 넣는다.
 */
function translateVars(t: Translator, vars: Vars): Vars {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(vars)) {
    out[name] = typeof value === 'string' && t.has(value) ? t(value as MessageKey) : value;
  }
  return out;
}

interface DomainError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly fields?: Readonly<Record<string, string>>;
  /** 문구에 끼워 넣을 값. 문구가 열쇠일 때만 쓰인다 */
  readonly vars?: Vars;
}

function asDomainError(error: unknown): DomainError | null {
  if (!(error instanceof Error)) return null;

  const e = error as unknown as Partial<DomainError>;
  return typeof e.code === 'string' && typeof e.status === 'number'
    ? {
        code: e.code,
        message: error.message,
        status: e.status,
        ...(e.fields && Object.keys(e.fields).length > 0 ? { fields: e.fields } : {}),
        ...(e.vars ? { vars: e.vars } : {}),
      }
    : null;
}
