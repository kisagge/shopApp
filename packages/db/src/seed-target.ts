/**
 * 시드가 어느 DB 에 쓰는지 밝히고, 원격이면 한 번 더 묻는다.
 *
 * **마이그레이션에는 이미 있고 시드에는 없었다.** `db:deploy` 는 대상 호스트를
 * 찍어 주는데(check-db-url.mjs), 시드는 "시드 시작" 하고 곧바로 쓴다. 어디에
 * 썼는지는 다 쓴 뒤에도 알 수 없다.
 *
 * 시드를 원격에 돌리는 것 자체는 정상이다 — 매대를 채우려면 그래야 한다.
 * 다만 **실수로 그러는 것과 그러려고 하는 것은 다르다.** 셸에 주소를 하나
 * 남겨 두었다가 다른 명령을 돌리면 그 사이에 아무 경고도 없다.
 *
 * 그래서 원격이면 한 번 더 묻는다. 물음은 환경변수 하나다 — 대화형으로
 * 만들면 CI 에서 멈춘다.
 */

/** 자격증명은 지운다. 로그는 남고, 남은 것은 누군가 본다. */
function safeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(형식을 알 수 없는 주소)';
  }
}

/**
 * 내 기계인가.
 *
 * IPv6 는 `hostname` 이 대괄호째 온다(`[::1]`). 그대로 비교하면 안 맞는데,
 * 검사가 없었으면 못 봤을 자리다 — IPv6 로 붙는 로컬 DB 가 원격으로 취급돼
 * 승인을 요구받는다.
 *
 * **모르는 형식은 원격으로 본다.** 모를 때 느슨한 쪽으로 기울면 관문이
 * 있으나 마나다.
 */
export function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export const SEED_REMOTE_FLAG = 'SEED_REMOTE';

/**
 * 쓰기 전에 부른다. 대상을 찍고, 원격이면 승인이 없을 때 던진다.
 *
 * @param label 무엇을 시드하는지 — 로그에 그대로 나간다
 */
export function assertSeedTarget(label: string): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL 이 설정되지 않았습니다. .env 를 확인하세요.');
  }

  const where = safeHost(url);

  if (isLocalDatabase(url)) {
    console.log(`▸ ${label} 대상: ${where}`);
    return;
  }

  if (process.env[SEED_REMOTE_FLAG] !== 'yes') {
    throw new Error(
      [
        `${label} 대상이 내 기계가 아닙니다: ${where}`,
        '',
        '원격에 시드하려는 것이 맞으면 대놓고 켭니다:',
        `  ${SEED_REMOTE_FLAG}=yes DATABASE_URL="..." pnpm --filter … run seed`,
        '',
        '셸에 주소를 남겨 둔 채 다른 명령을 돌리는 실수를 막기 위한 것입니다.',
      ].join('\n'),
    );
  }

  console.log(`▸ ${label} 대상: ${where}  (원격 — ${SEED_REMOTE_FLAG}=yes 로 승인됨)`);
}
