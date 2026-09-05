import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **빌드가 DB 를 건드리지 않게 지킨다.**
 *
 * 이 저장소가 ISR 을 쓰지 않기로 한 근거가 "빌드는 DB 를 건드리지 않으므로
 * DB 장애가 배포를 막지 않는다" 였다. 그런데 sitemap 하나가 조용히 그 근거를
 * 깨고 있었다 — 가짜 주소로 빌드하면 정확히 거기서 죽었다.
 *
 * 화면(page.tsx)은 대부분 이미 동적이라 문제가 안 되지만, **메타데이터
 * 라우트는 기본이 정적**이다. sitemap · robots · opengraph-image 처럼
 * 파일 하나가 곧 주소인 자리에서 DB 를 읽으면 빌드가 DB 에 매인다.
 *
 * 눈으로 보고 넘어갈 수 있는 실수라 목록이 아니라 규칙으로 박아 둔다.
 */

const APP = join(process.cwd(), 'src', 'app');

/** 파일 하나가 곧 주소인 자리들 — 여기가 기본 정적이라 위험하다 */
const METADATA_ROUTES = ['sitemap.ts', 'robots.ts', 'opengraph-image.tsx', 'manifest.ts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (METADATA_ROUTES.includes(name)) out.push(full);
  }
  return out;
}

const files = walk(APP);

/** DB 에 닿는 길. 조회 계층을 거치든 곧바로 쓰든 결과는 같다. */
const READS_DB = /from '~\/lib\/(queries|admin)\/|from '@shop\/db'/;

describe('빌드가 DB 에 매이지 않는다', () => {
  it('메타데이터 라우트를 하나 이상 찾았다 — 못 찾으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s 가 DB 를 읽으면 동적이라고 밝힌다', (file) => {
    const source = readFileSync(file, 'utf8');
    if (!READS_DB.test(source)) return;

    expect(
      source,
      `${file} 이 DB 를 읽는다. force-dynamic 이 없으면 빌드 중에 DB 를 치고, ` +
        'DB 가 잠깐 흔들리는 동안 배포가 통째로 실패한다.',
    ).toContain("export const dynamic = 'force-dynamic'");
  });
});
