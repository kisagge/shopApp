import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 운영 조회를 **폴더에서 모은다.**
 *
 * 파일 이름을 적어 두면 새로 만든 모듈이 목록 밖에 있어 조용히 빠진다 — 이 훑기를 쓰는 검사들이 막으려는 실수와
 * 정확히 같은 모양의 실수다.
 *
 * **두 폴더를 본다.** 운영 조회가 `queries/admin` 에 다 있는 줄 알았는데, 감사 로그·문의 대기줄·리뷰 관리·고객센터
 * 글은 `queries/` 바로 아래에 손님 조회와 섞여 있다(손님 쪽과 같은 표를 읽기 때문이다).
 *
 * 소스를 글자로 읽는다 — 함수를 불러 보는 것으로는 "관문을 **부르는지**" 를 알 수 없고, 부르게 하려면 조회마다
 * DB 를 흉내 내야 한다. 여기서 보는 것은 돌아가는 모습이 아니라 **쓰여 있는 약속**이다.
 */

const DIRS = ['src/lib/queries/admin', 'src/lib/queries'] as const;

/** Actor 를 받는 조회 하나 — 이름과, 그 뒤에 이어지는 본문 앞머리 */
export interface ActorQuery {
  readonly name: string;
  readonly body: string;
}

/** 운영 조회 폴더의 소스 전체를 이어 붙인 것 */
export function queriesSource(): string {
  return DIRS.flatMap((dir) => {
    const at = join(process.cwd(), dir);
    return readdirSync(at, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => readFileSync(join(at, e.name), 'utf8'));
  }).join('\n');
}

/**
 * `Actor` 를 받는 조회들.
 *
 * 본문은 앞 800자만 본다. 관문은 함수의 첫 줄에 있고, 더 길게 잡으면 **다음 함수의 관문**까지 들어와 빠뜨린 것을
 * 통과시킨다.
 */
export function actorQueries(src = queriesSource()): ActorQuery[] {
  const found: ActorQuery[] = [];
  for (const m of src.matchAll(/export async function (\w+)\s*\(([\s\S]*?)\)[^{]*\{/g)) {
    const [, name, args] = m;
    if (!args?.includes('Actor')) continue;
    const at = (m.index ?? 0) + m[0].length;
    found.push({ name: name!, body: src.slice(at, at + 800) });
  }
  return found;
}
