/**
 * 마이그레이션 직전 DB 주소 확인.
 *
 * Prisma 는 주소가 비면 "Connection url is empty" 만 말한다. 어느 변수를
 * 어디에 넣어야 하는지는 알려 주지 않아서, 배포 로그만 보고는 원인을 좁힐 수
 * 없다. 여기서 한 번 걸러 **무엇을 어디에 넣어야 하는지** 적어 준다.
 *
 * prisma.config.ts 에서 던지지 않는 이유: `prisma generate` 는 DB 없이도
 * 돌아야 한다(CI 에는 DB 가 없다). 설정 파일에서 막으면 그것까지 깨진다.
 *
 * `pnpm --filter @shop/db exec` 로 부른다. pnpm 이 워크스페이스를 스스로 찾아
 * 이 패키지 디렉터리에서 실행하므로, **어느 경로에서 빌드가 시작되든 같은 곳을
 * 가리킨다.** 저장소 루트 기준 상대 경로로 쓰면 Vercel 의 Root Directory 설정에
 * 따라 파일을 못 찾는다(실제로 그렇게 깨졌다).
 *
 * .env 는 `--env-file-if-exists` 로 읽는다. Vercel 에는 없지만 그 플래그는
 * 파일이 없으면 조용히 넘어가므로 같은 명령이 양쪽에서 돈다.
 */
const CANDIDATES = ['DIRECT_DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL'];

const found = CANDIDATES.find((name) => process.env[name]);

if (!found) {
  console.error(`
✖ 마이그레이션에 쓸 DB 주소가 없습니다.

  다음 중 하나가 채워져 있어야 합니다 (앞의 것이 우선):
${CANDIDATES.map((n) => `    · ${n}`).join('\n')}

  Vercel 이라면 Settings → Environment Variables 에서
  **Production 환경에 체크돼 있는지** 확인하세요. Preview 에만 들어가 있으면
  운영 배포의 빌드에서는 보이지 않습니다.

  Neon 을 마켓플레이스로 붙였다면 "Connect to Project" 를 눌러야
  DATABASE_URL 과 DATABASE_URL_UNPOOLED 가 주입됩니다.
`);
  process.exit(1);
}

/**
 * 어느 DB 로 가는지 로그에 남긴다.
 * **자격증명은 지운다** — 빌드 로그는 팀원이 다 본다.
 */
function safeHost(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(형식을 알 수 없는 주소)';
  }
}

console.log(`✔ 마이그레이션 대상: ${safeHost(process.env[found])}  (${found})`);
