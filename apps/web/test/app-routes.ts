import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 주소를 파일 자리로 옮긴다.
 *
 * **검사들이 `src/app/cart/page.tsx` 처럼 경로를 손으로 들고 있었다.** 매장
 * 화면을 `(shop)` 그룹으로 묶는 순간 스물여섯 개가 한꺼번에 깨졌다 — 주소는
 * 하나도 안 바뀌었는데도. 그룹 폴더는 **주소에 안 들어가므로**, 주소로 파일을
 * 찾을 때도 없는 것처럼 지나쳐야 한다.
 *
 * 여기 기대 두면 다음에 그룹을 또 만들어도 검사가 안 샌다.
 */

export const APP = join(process.cwd(), 'src', 'app');

const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** 이 폴더 바로 아래에서 그 이름의 칸을 찾는다. 못 찾으면 `(group)` 안을 본다. */
function descend(dir: string, segment: string): string | null {
  const direct = join(dir, segment);
  if (isDir(direct)) return direct;

  for (const name of readdirSync(dir)) {
    if (!name.startsWith('(')) continue;
    const child = join(dir, name);
    if (!isDir(child)) continue;
    const found = descend(child, segment);
    if (found) return found;
  }
  return null;
}

/**
 * 주소(`/product/[slug]`)에 해당하는 폴더.
 *
 * 못 찾으면 던진다 — 조용히 null 을 주면 부르는 검사가 "없으니 통과" 로
 * 넘어가는 자리가 생긴다.
 */
export function appDir(route: string): string {
  let dir = APP;
  for (const segment of route.split('/').filter(Boolean)) {
    const next = descend(dir, segment);
    if (!next) throw new Error(`주소에 해당하는 폴더가 없다: ${route} (${segment} 에서 막혔다)`);
    dir = next;
  }
  return dir;
}

/**
 * 주소 안의 파일 하나. 기본은 화면 파일이다.
 *
 * 파일도 그룹 안에 있을 수 있다 — 홈(`/`)이 그렇다. 주소로는 더 내려갈 데가
 * 없는데 `page.tsx` 는 `(shop)` 안에 있다.
 */
export function appFile(route: string, file = 'page.tsx'): string {
  const dir = appDir(route);
  const here = join(dir, file);
  if (existsSync(here)) return here;

  for (const name of readdirSync(dir)) {
    if (!name.startsWith('(')) continue;
    const child = join(dir, name);
    if (!isDir(child)) continue;
    const inGroup = join(child, file);
    if (existsSync(inGroup)) return inGroup;
  }
  throw new Error(`주소 ${route} 아래에 ${file} 이 없다`);
}
