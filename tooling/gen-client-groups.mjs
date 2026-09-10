/**
 * 브라우저로 내려보낼 사전 갈래 목록을 다시 만든다.
 *
 *   pnpm i18n:groups
 *
 * 규칙은 tooling/client-message-groups.mjs 에 있고, 결과가 낡으면
 * apps/web/test/client-groups.test.ts 가 CI 에서 막는다.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { clientMessageGroups } from './client-message-groups.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'apps/web/src/lib/i18n/client-groups.generated.ts');

/** 사전 파일에서 열쇠 이름만 뽑는다 — 빌드된 패키지에 기대지 않는다 */
function keysFromSource() {
  const ko = readFileSync(join(ROOT, 'packages/i18n/src/messages/ko.ts'), 'utf8');
  return [...ko.matchAll(/^\s*'([a-zA-Z][\w.]*)':/gm)].map((m) => m[1]);
}

const groups = clientMessageGroups(ROOT, keysFromSource());

const body = `/**
 * **자동 생성 파일이다. 손으로 고치지 않는다** — \`pnpm i18n:groups\`.
 *
 * 브라우저로 내려보낼 사전의 갈래. 규칙과 이유는
 * tooling/client-message-groups.mjs 에 적었다.
 */
export const CLIENT_MESSAGE_GROUPS: readonly string[] = [
${groups.map((g) => `  '${g}',`).join('\n')}
];
`;
writeFileSync(OUT, body, 'utf8');
console.log(`갈래 ${groups.length}개를 ${OUT.replace(`${ROOT}/`, '')} 에 적었다`);
