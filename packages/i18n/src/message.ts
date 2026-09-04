import type { Locale } from './locale';
import { LOCALE_TAG } from './locale';
import { formatNumber } from './format';

/**
 * 한 조각의 말.
 *
 * 대부분은 문자열 하나면 된다. **개수에 따라 모양이 바뀌는 말만** 객체로
 * 적는다 — 영어의 `1 item` / `2 items` 같은 것이다. 한국어와 일본어에는
 * 그런 변화가 없으므로 두 칸을 같게 적게 되는데, 그래도 칸을 지운 것보다
 * 낫다: 사전 세 벌의 모양이 같아야 빠뜨린 것이 컴파일에서 걸린다.
 */
export type Message = string | { readonly one: string; readonly other: string };

export type Vars = Readonly<Record<string, string | number>>;

const pluralRules = new Map<Locale, Intl.PluralRules>();

function selectForm(locale: Locale, message: Message, count: number | undefined): string {
  if (typeof message === 'string') return message;
  if (count === undefined) {
    // 복수형이 있는 말에 개수를 안 넘긴 것은 부르는 쪽의 실수다.
    // 여기서 터뜨리면 화면이 통째로 죽으므로, 많은 쪽을 쓴다.
    return message.other;
  }
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_TAG[locale]);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) === 'one' ? message.one : message.other;
}

/**
 * `{이름}` 자리에 값을 넣는다.
 *
 * 값이 없는 자리는 **그대로 둔다.** 빈 문자열로 지우면 "님, 안녕하세요" 처럼
 * 말이 되는 문장이 나와 버려서, 번역이 빠진 것을 아무도 눈치채지 못한다.
 *
 * **숫자는 그 나라 방식으로 끊어 넣는다.** 부르는 쪽이 미리 서식을 입혀
 * 넘기면 `{count}` 가 문자열이 되어 복수형 판정이 망가진다 — 영어에서
 * "1 items" 가 나오는 길이 그것이다. 숫자는 숫자로 받고 서식은 여기서
 * 입힌다.
 */
function interpolate(locale: Locale, text: string, vars: Vars | undefined): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? formatNumber(locale, value) : value;
  });
}

export function formatMessage(locale: Locale, message: Message, vars?: Vars): string {
  const count = typeof vars?.['count'] === 'number' ? vars['count'] : undefined;
  return interpolate(locale, selectForm(locale, message, count), vars);
}
