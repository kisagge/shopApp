import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 앱에서 맨 위에 붙는 것은 **상태바 자리를 비운다.**
 *
 * 웹뷰는 화면 맨 위(시계·배터리·카메라 구멍 밑)부터 그린다. 브라우저에서는 주소창이 가려 주던
 * 자리라 눈으로는 안 보이고, 앱을 기기에서 띄워야 겹친 것이 보인다. 운영 화면을 매장에서 떼어
 * 내면서 매장 머리의 safe-t 는 남고 운영 머리띠·서랍에서만 빠졌다 — 앱에서 확인하다 찾았다.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

const TOP_BARS: readonly { file: string; what: string; pattern: RegExp }[] = [
  { file: 'components/site-header.tsx', what: '매장 머리', pattern: /<header className="[^"]*\bsafe-t\b/ },
  { file: 'components/admin/admin-nav.tsx', what: '운영 머리띠', pattern: /className="safe-t sticky top-0/ },
  { file: 'components/admin/admin-nav.tsx', what: '운영 서랍', pattern: /env\(safe-area-inset-top/ },
];

describe('상태바 자리', () => {
  it.each(TOP_BARS)('$what 이 상태바 밑으로 들어가지 않는다', ({ file, pattern }) => {
    expect(read(file)).toMatch(pattern);
  });

  it('safe-t 가 실제로 상태바 높이만큼 민다', () => {
    const css = readFileSync(join(process.cwd(), '..', '..', 'packages/ui/src/styles/theme.css'), 'utf8');
    expect(css).toMatch(/\.safe-t\s*\{\s*padding-top:\s*env\(safe-area-inset-top/);
  });
});
