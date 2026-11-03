import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * **네이티브 프로젝트가 가리키는 플러그인 경로가 실제로 있는지 본다.**
 *
 * Capacitor CLI 는 플러그인을 **pnpm 저장소의 상대 경로**로 적는다. 두 파일이 그렇고 둘 다
 * 스스로 "DO NOT EDIT/MODIFY" 라 적어 둔다:
 *
 *   - `ios/App/CapApp-SPM/Package.swift`
 *   - `android/capacitor.settings.gradle`
 *
 * 그 경로에는 **판이 박혀 있다** — `@capacitor+app@8.1.2_@capacitor+core@8.6.0` 처럼.
 * 그래서 플러그인이나 코어를 올리면 적어 둔 경로가 그대로 죽는다.
 *
 * **커밋된 두 파일이 죽은 경로를 가리키고 있었다.** iOS 는 여섯 중 다섯, 안드로이드는
 * 거기에 **Capacitor 런타임 자체**(`@capacitor+android@8.5.2`)까지 옛 경로였다. 그 체크아웃
 * 에서는 SPM 도 Gradle 도 해석에 실패한다 — 즉 네이티브 빌드가 안 된다. 고침은
 * `pnpm --filter @shop/mobile sync` 한 번이고, 그 한 번을 안 돌린 것이 전부였다.
 *
 * **아무 검사도 지지 않았다.** 게이트에 네이티브 단계가 없고, 사람이 열어 볼 일 없는
 * 생성물이라 눈으로도 안 걸린다. 올린 사람은 JS 쪽이 초록인 것을 보고 끝낸다.
 *
 * 여기서 보는 것은 **경로의 존재**다. 판을 글자로만 견주는 것보다 질기고(pnpm 이 경로 모양을
 * 바꿔도 따라간다) 실패 모양과 정확히 같다 — Gradle·SPM 이 못 찾는 것이 곧 이 검사가 지는
 * 것이다. 거기에 판 비교를 하나 더 얹는다(아래 까닭).
 */

const MOBILE = join(process.cwd(), '..', 'mobile');

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const manifest = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8')) as Manifest;
const declared: Record<string, string> = { ...manifest.dependencies, ...manifest.devDependencies };

interface Pointer {
  /** 어느 생성물이 가리키는가 */
  readonly from: string;
  readonly name: string;
  /** 생성물이 적어 둔 상대 경로 */
  readonly path: string;
  /** 그 경로를 푸는 기준 폴더 */
  readonly base: string;
}

/**
 * 두 생성물에서 지역 꾸러미 경로를 읽는다.
 *
 * 모양이 다르다 — Swift 는 `.package(name:path:)`, Gradle 은 `project(...).projectDir`.
 * 읽는 법이 깨지면 아래 검사들이 **빈 목록을 돌며 조용히 통과하므로** 수를 먼저 못 박는다.
 */
const GENERATED: readonly { readonly file: string; readonly base: string; readonly pattern: RegExp }[] = [
  {
    file: 'ios/App/CapApp-SPM/Package.swift',
    base: 'ios/App/CapApp-SPM',
    pattern: /\.package\(name: "([^"]+)", path: "([^"]+)"\)/g,
  },
  {
    file: 'android/capacitor.settings.gradle',
    base: 'android',
    pattern: /project\('([^']+)'\)\.projectDir = new File\('([^']+)'\)/g,
  },
];

function pointers(): Pointer[] {
  const out: Pointer[] = [];
  for (const { file, base, pattern } of GENERATED) {
    const source = readFileSync(join(MOBILE, file), 'utf8');
    for (const m of source.matchAll(pattern)) {
      out.push({ from: file, name: m[1]!, path: m[2]!, base });
    }
  }
  return out;
}

const POINTERS = pointers();

/**
 * pnpm 저장소 폴더 이름에서 **그 꾸러미와 판**을 읽는다.
 *
 * `@capacitor+app@8.1.2_@capacitor+core@8.6.0` → `@capacitor/app` 의 `8.1.2`.
 * 밑줄 뒤는 짝(peer) 정보라 버린다. 경로 끝이 `/android` 든 `/capacitor` 든 상관없다 —
 * 폴더 이름만 보므로 플랫폼마다 다른 하위 경로에 걸리지 않는다.
 */
function subjectOf(path: string): { name: string; version: string } | null {
  const dir = /\.pnpm\/([^/]+)\//.exec(path)?.[1];
  if (dir === undefined) return null;
  const subject = dir.split('_')[0]!;
  const at = subject.lastIndexOf('@');
  if (at <= 0) return null;
  return { name: subject.slice(0, at).replace('+', '/'), version: subject.slice(at + 1) };
}

describe('네이티브 생성물이 가리키는 플러그인', () => {
  it('두 생성물에서 경로를 실제로 읽었다 — 읽는 법이 바뀌면 여기서 진다', () => {
    expect(POINTERS.filter((p) => p.from.endsWith('Package.swift')).length).toBeGreaterThanOrEqual(5);
    expect(POINTERS.filter((p) => p.from.endsWith('.gradle')).length).toBeGreaterThanOrEqual(5);
  });

  it.each(POINTERS.map((p) => [`${p.from} → ${p.name}`, p] as const))(
    '%s 의 경로가 있다',
    (_label, p) => {
      expect(
        existsSync(normalize(join(MOBILE, p.base, p.path))),
        '없는 경로를 가리킨다 — 올린 뒤 `pnpm --filter @shop/mobile sync` 를 안 돌렸다. 네이티브 빌드가 안 된다',
      ).toBe(true);
    },
  );

  /**
   * 경로에 박힌 판이 선언한 판과 같은지도 본다.
   *
   * 경로 존재만 보면 **지우지 않은 옛 저장소 폴더**가 남아 있을 때 통과한다 — pnpm 은 쓰지
   * 않는 판을 바로 지우지 않는다. 그때도 빌드는 되지만 **옛 플러그인이 들어간다.**
   */
  it.each(POINTERS.map((p) => [`${p.from} → ${p.name}`, p] as const))(
    '%s 의 경로에 박힌 판이 선언한 판과 같다',
    (_label, p) => {
      const subject = subjectOf(p.path);

      expect(subject, `경로에서 꾸러미와 판을 못 읽었다: ${p.path}`).not.toBeNull();
      expect(declared[subject!.name], `${subject!.name} 가 apps/mobile/package.json 에 없다`).toBeTruthy();
      expect(
        subject!.version,
        `${subject!.name} — 선언은 ${declared[subject!.name]}, 경로는 ${subject!.version}`,
      ).toBe(declared[subject!.name]);
    },
  );

  /**
   * Capacitor 코어의 Swift 꾸러미 판.
   *
   * **한계를 적어 둔다.** 이 판을 무엇과 맞춰야 하는지는 `@capacitor/ios` 안에 적혀 있지
   * 않다(찾아봤다). 지금까지는 `@capacitor/ios` 의 판과 같은 값이었고, 커밋된 파일이
   * 8.5.2 를 가리킬 때 선언은 8.6.0 이었다 — 그 어긋남을 잡으려는 것이다. Capacitor 가 둘을
   * 떼어 놓는 날 이 검사가 지고, 그러면 **읽는 사람이 이 주석을 보고 판단한다.**
   */
  it('capacitor-swift-pm 핀이 선언한 @capacitor/ios 와 같다', () => {
    const swift = readFileSync(join(MOBILE, 'ios/App/CapApp-SPM/Package.swift'), 'utf8');
    const pinned = /capacitor-swift-pm\.git",\s*exact:\s*"([^"]+)"/.exec(swift)?.[1];

    expect(pinned, 'capacitor-swift-pm 핀을 못 읽었다 — 읽는 법을 고친다').toBeTruthy();
    expect(pinned).toBe(declared['@capacitor/ios']);
  });
});
