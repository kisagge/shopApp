import { INQUIRY_TOPIC, type InquiryTopic } from '@shop/core';
import type { MessageKey } from '@shop/i18n';

/**
 * 갈래 이름표.
 *
 * core 는 어떤 갈래가 있는지만 정하고 그것을 뭐라고 부를지는 화면이 정한다.
 * 표를 손으로 적는 대신 갈래 목록에서 만들므로, 갈래가 하나 늘면
 * **여기가 아니라 사전에서** 걸린다 — 열쇠가 없으면 컴파일되지 않는다.
 */
export const TOPIC_KEY = Object.fromEntries(
  INQUIRY_TOPIC.map((topic) => [topic, `topic.${topic}`]),
) as Record<InquiryTopic, MessageKey>;
