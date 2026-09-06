import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 자리표시 그림을 만드는 모듈이 브라우저로 새지 않게 지킨다.
 *
 * 그 모듈은 sharp 를 쓴다 — 네이티브 모듈이라 클라이언트 번들에 들어가면
 * 빌드가 깨지고, 깨지지 않더라도 들어갈 이유가 없는 무게다.
 *
 * 보통은 `server-only` 한 줄로 지키는데 **거기에는 붙일 수 없었다.** 앱의
 * 업로드 경로와 채워 넣는 스크립트가 같은 코드를 쓰는데, 그 표시는 tsx
 * 아래에서 그대로 던진다. 표시를 뺐으니 지키는 것을 여기서 대신한다.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('자리표시 그림 모듈의 경계', () => {
  it('클라이언트 모듈은 이것을 가져오지 않는다', () => {
    const offenders = walk(SRC).filter((file) => {
      const source = readFileSync(file, 'utf8');
      if (!/from '[^']*lib\/images\/blur'/.test(source)) return false;
      // 'use client' 는 파일 맨 앞에만 뜻이 있다
      return /^\s*['"]use client['"]/.test(source);
    });

    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('실제로 가져다 쓰는 곳이 있다 — 검사가 헛돌지 않게', () => {
    const users = walk(SRC).filter((file) =>
      /from '[^']*lib\/images\/blur'/.test(readFileSync(file, 'utf8')),
    );
    expect(users.length).toBeGreaterThan(0);
  });
});
