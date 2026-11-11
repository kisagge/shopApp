import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * **기다림의 상한을 검사의 상한에 맞춘다.**
 *
 * `waitFor` 의 기본값은 1초인데 검사 자체는 5초를 받는다. 그래서 부하가
 * 걸리면 검사에는 아직 4초가 남아 있는데 기다림만 먼저 포기하고, "요소를
 * 못 찾았다" 로 진다 — 코드가 틀려서가 아니라 기계가 느려서다. 실제로
 * password-reset-form 이 CI 에서 그렇게 졌다.
 *
 * 기다림은 조건이 참이 되면 곧바로 끝나므로, 상한을 늘려도 통과하는 검사가
 * 느려지지 않는다. 늘어나는 것은 **정말 실패하는 검사가 지기까지의 시간**
 * 뿐이다. 5초(검사 상한)보다 조금 낮게 두어, 지더라도 "무엇을 못 찾았는지"
 * 가 찍히게 한다 — 검사 상한에 먼저 걸리면 그 내용이 안 나온다.
 */
configure({ asyncUtilTimeout: 15_000 });

/**
 * **blob: 주소를 만드는 두 함수가 jsdom 에 없다.** 사진 미리보기를 그리는 조각들이 그것을 부른다.
 *
 * 전에는 검사 파일마다 전역에 직접 대입하고 되돌리지 않았다. 그래서 **먼저 돈 파일의 흉내를 뒤 파일이
 * 물려받아** 스스로는 아무 준비도 안 한 파일까지 통과했다 — `review-write-form` 이 그랬다. 의존성을
 * 올려 파일 순서가 바뀌자 그 파일만 졌고, 올린 꾸러미 중 어느 것도 원인이 아니었다.
 *
 * 그러니 환경의 빈 구멍은 환경에서 메운다. 여기서 한 번 덧붙이면 순서와 무관해진다.
 *
 * **URL 자체를 바꿔 끼우면 안 된다** — next/image 가 `new URL(...)` 로 주소를 푸는데, 흉내 낸 객체는
 * 생성자가 아니어서 사진이 있는 자리가 통째로 터진다(그렇게 한 번 당한 기록이 review-fields 에 있다).
 * 없는 두 함수만 덧붙인다.
 *
 * 특정한 값이 필요한 검사는 자기 파일에서 다시 덮어쓴다(support-ask-photos 가 파일 이름을 싣는다).
 */
URL.createObjectURL = () => 'blob:x';
URL.revokeObjectURL = () => {};

/**
 * **글자의 자리를 재는 두 함수가 `Range` 에 없다.** jsdom 은 `Element` 쪽에만 두었다.
 *
 * ProseMirror(편집기)는 글자 사이에 커서를 놓으려고 범위를 만들어 재는데, 그 함수가
 * 없으면 `target.getClientRects is not a function` 으로 **핸들러가 통째로 끊긴다** —
 * 단추를 눌렀는데 아무 일도 안 일어난 것처럼 보이고, 검사는 "요소가 안 닫혔다" 같은
 * 엉뚱한 말로 진다. 그 자리를 찾는 데 한참 걸린다.
 *
 * 재는 값은 **영이다.** jsdom 은 배치를 하지 않으므로 어떤 수를 꾸며 내도 거짓이고,
 * 자리를 쓰는 쪽(툴팁 위치 같은 것)은 애초에 여기서 검사할 수 없다. 빈 목록이 아니라
 * 영 크기 사각형 하나를 주는 까닭은, 비어 있으면 "잴 자리가 없다" 는 다른 길로 가는
 * 쪽이 있기 때문이다.
 *
 * **DOM 이 있을 때만 손댄다.** 이 파일은 `node` 환경으로 도는 검사에도 함께 실리고,
 * 거기에는 `Range` 가 아예 없다 — 조건 없이 적었더니 `Range is not defined` 로
 * **263개 묶음이 한꺼번에 졌다**(jsdom 파일만 돌려 보고는 몰랐고 문지기가 잡았다).
 * 위의 `URL` 둘이 조건 없이 적혀 있는 것은 그쪽은 node 에도 있기 때문이다.
 */
if (typeof Range !== 'undefined') {
  const zeroRect = (): DOMRect => new DOMRect(0, 0, 0, 0);
  Range.prototype.getBoundingClientRect = zeroRect;
  Range.prototype.getClientRects = function getClientRects(): DOMRectList {
    const rects = [zeroRect()];
    return {
      length: rects.length,
      item: (i: number) => rects[i] ?? null,
      [Symbol.iterator]: () => rects[Symbol.iterator](),
      0: rects[0],
    } as unknown as DOMRectList;
  };
}

// 이게 없으면 컴포넌트가 마운트된 채로 다음 테스트에 넘어가고,
// 다음 테스트가 스토어나 목을 바꾸는 순간 남아 있던 컴포넌트가 다시 렌더돼
// 엉뚱한 곳에서 터진다. 실제로 겪었다.
afterEach(cleanup);
