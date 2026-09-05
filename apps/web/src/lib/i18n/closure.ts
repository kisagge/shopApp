import { CLOSURE_BLOCK, type ClosureBlock } from '@shop/core';
import type { MessageKey } from '@shop/i18n';

/**
 * 탈퇴를 막는 이유의 사전 열쇠.
 *
 * core 는 무엇이 막는지만 정하고 그것을 어떻게 말할지는 화면이 정한다.
 */
export const CLOSURE_BLOCK_KEY = Object.fromEntries(
  CLOSURE_BLOCK.map((b) => [b, `closureBlock.${b}`]),
) as Record<ClosureBlock, MessageKey>;
