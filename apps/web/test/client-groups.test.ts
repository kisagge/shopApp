import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DICTIONARIES, messageKeys } from '@shop/i18n/all';
import {
  clientMessageGroups, clientReachableFiles, SERVER_ONLY_GROUPS,
} from '../../../tooling/client-message-groups.mjs';
import { CLIENT_MESSAGE_GROUPS } from '~/lib/i18n/client-groups.generated';

/**
 * 브라우저로 내려보내는 사전의 범위.
 *
 * 서버는 사전 한 벌을 통째로 넘기고 있었는데, 그 안에 **화면 코드가 한 번도
 * 안 읽는 말**이 들어 있었다 — 메일 본문, 배치 알림, 결제 실패 코드 같은
 * 것들이다. 앱은 켤 때마다 문서를 통째로 받으므로 그 값을 매번 치른다.
 *
 * 목록은 소스에서 뽑아 파일로 적어 둔다(`pnpm i18n:groups`). 적어 둔 것은
 * **낡는다** — 화면 코드가 새 갈래를 쓰기 시작해도 파일은 그대로다. 그러면
 * 그 화면에 열쇠 이름이 그대로 뜬다. 여기서 다시 뽑아 견준다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

describe('브라우저로 내려보내는 사전 갈래', () => {
  const keys = messageKeys();

  it('찾는 것이 있다 — 못 훑으면 아래가 전부 헛돈다', () => {
    const { entries, files } = clientReachableFiles(ROOT);
    expect(entries.length, "'use client' 파일을 하나도 못 찾았다").toBeGreaterThan(50);
    expect(files.length, '값 import 를 따라가지 못했다').toBeGreaterThan(entries.length);
    expect(keys.length).toBeGreaterThan(500);
  });

  it('적어 둔 목록이 소스와 같다 — 다르면 pnpm i18n:groups', () => {
    const fresh = clientMessageGroups(ROOT, keys);
    expect([...CLIENT_MESSAGE_GROUPS].sort()).toEqual(fresh);
  });

  it('화면 코드가 따옴표로 부르는 열쇠는 전부 남는다', () => {
    const { files } = clientReachableFiles(ROOT);
    const source = files.map((f: string) => readFileSync(f, 'utf8')).join('\n');
    const quoted = new Set<string>();
    for (const m of source.matchAll(/'([^'\\\n]*)'|"([^"\n\\]*)"|`([^`\\\n$]*)`/g)) {
      const literal = m[1] ?? m[2] ?? m[3];
      if (literal) quoted.add(literal);
    }
    const kept = new Set(CLIENT_MESSAGE_GROUPS);
    const dropped = keys.filter(
      (k) =>
        quoted.has(k) &&
        !kept.has(k.slice(0, k.indexOf('.'))) &&
        // 서버가 이미 바꿔서 보내는 갈래는 빼고 본다 — 아래 검사가 그 전제를 지킨다
        !SERVER_ONLY_GROUPS.has(k.slice(0, k.indexOf('.'))),
    );

    expect(dropped, '화면이 부르는 열쇠가 잘려 나갔다').toEqual([]);
  });

  /**
   * **서버가 바꿔서 보내는 갈래는 브라우저로 따라가지 않는다.**
   *
   * `err.*` 는 도메인 오류의 문구다. 열쇠가 core·계약의 표에 적혀 있어서 화면 코드에서도 닿지만,
   * 값으로 쓰지는 않는다 — 번역은 응답을 만드는 서버가 하고 화면은 문장을 받는다. 그 전제가
   * 깨지는 순간(화면이 그 열쇠를 번역기에 넘기는 순간) 사람에게 `err.order.notFound` 가 그대로 보인다.
   */
  it('서버 전용 갈래를 화면이 번역하지 않는다', () => {
    const { files } = clientReachableFiles(ROOT);
    const offenders = files.filter((f: string) => {
      const source = readFileSync(f, 'utf8');
      return [...SERVER_ONLY_GROUPS].some((g) =>
        new RegExp(`\\bt\\(\\s*['"\`]${g}\\.`).test(source),
      );
    });

    expect(offenders, '이 갈래는 브라우저 사전에 없다 — 열쇠가 그대로 보인다').toEqual([]);
  });

  it('열쇠를 조립하는 두 자리의 갈래가 들어 있다', () => {
    // t.category(slug, …) 와 계약의 valid.* 는 부르는 쪽 소스에 갈래 이름이 없다
    expect(CLIENT_MESSAGE_GROUPS).toContain('category');
    expect(CLIENT_MESSAGE_GROUPS).toContain('valid');
  });

  it('실제로 덜 보낸다 — 아무것도 안 자르면 이 작업이 헛것이다', () => {
    const kept = new Set(CLIENT_MESSAGE_GROUPS);
    const sent = keys.filter((k) => kept.has(k.slice(0, k.indexOf('.'))));
    expect(sent.length, '자른 것이 없다').toBeLessThan(keys.length);

    const ko = DICTIONARIES.ko as Record<string, string>;
    const bytes = (ks: readonly string[]) =>
      JSON.stringify(Object.fromEntries(ks.map((k) => [k, ko[k]]))).length;
    // 재 보니 28,033자에서 22,839자로 줄었다. 여유를 두되 되돌아가면 걸린다.
    expect(bytes(sent)).toBeLessThan(bytes(keys) - 3_000);
  });
});
