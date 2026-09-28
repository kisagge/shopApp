import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAIL_TEMPLATE_KIND, MAIL_CONSENT } from '@shop/core';

/**
 * 마케팅 메일은 동의를 확인하고 보낸다.
 *
 * **왜 이 검사가 생겼는가.** 마이페이지에 마케팅 수신 스위치가 있고, 동의를 판단하는 함수도 있었는데
 * **부르는 곳이 하나도 없었다.** 꺼 둔 사람에게도 쿠폰·적립금 소멸 안내가 매일 그대로 나갔다. 만들어
 * 두고 안 쓴 것은 없는 것과 같고, 이 경우에는 손님이 스위치를 다시 믿지 않게 된다.
 *
 * 그래서 **보내는 자리**를 찾아 확인한다 — 마케팅 메일을 만드는 파일은 `mayMail` 을 지나야 한다.
 */
const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = walk(SRC).map((path) => ({
  rel: path.slice(SRC.length + 1),
  source: readFileSync(path, 'utf8'),
}));

const marketing = MAIL_TEMPLATE_KIND.filter((kind) => MAIL_CONSENT[kind] === 'marketing');

describe('마케팅 메일을 보내는 자리', () => {
  it('마케팅으로 분류된 메일이 실제로 있다 — 없으면 아래가 헛돈다', () => {
    expect(marketing.length).toBeGreaterThan(0);
  });

  it.each(marketing)('%s 를 보내는 곳은 동의를 확인한다', (kind) => {
    const senders = files.filter((f) => f.source.includes(`template: '${kind}'`));

    expect(senders.length, `${kind} 를 보내는 곳을 못 찾았다 — 검사가 헛돈다`).toBeGreaterThan(0);

    const unchecked = senders.filter((f) => !f.source.includes('mayMail(')).map((f) => f.rel);
    expect(
      unchecked,
      `동의를 안 보고 마케팅 메일을 보낸다:\n${unchecked.join('\n')}\n` +
        'core 의 mayMail(종류, 손님) 을 지나야 한다 — 거래 고지는 그 함수가 늘 통과시킨다.',
    ).toEqual([]);
  });
});
