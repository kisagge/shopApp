import type { Locale } from './locale';
import { ko, type Dictionary, type MessageKey } from './messages/ko';
import { en } from './messages/en';
import { ja } from './messages/ja';
import { translatorFor, type Translator } from './translate';

/**
 * 사전 세 벌을 다 들고 있는 진입점.
 *
 * **브라우저로 가는 코드는 여기를 import 하지 않는다.** 서버는 요청 하나에
 * 어느 말이 올지 미리 모르고, 메일은 받는 사람마다 말이 다르므로 셋이 다
 * 필요하다. 화면은 그렇지 않다 — 이미 정해진 말 하나만 쓴다.
 * 이 경계가 지켜지는지는 `test/bundle-split.test.ts` 가 본다.
 */
export const DICTIONARIES: Record<Locale, Dictionary> = { ko, en, ja };

export function createTranslator(locale: Locale): Translator {
  return translatorFor(locale, DICTIONARIES[locale]);
}

/** 사전에 그 열쇠가 있는지. 테스트와 도구용. */
export function messageKeys(): readonly MessageKey[] {
  return Object.keys(ko) as MessageKey[];
}
