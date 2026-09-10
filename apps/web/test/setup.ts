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

// 이게 없으면 컴포넌트가 마운트된 채로 다음 테스트에 넘어가고,
// 다음 테스트가 스토어나 목을 바꾸는 순간 남아 있던 컴포넌트가 다시 렌더돼
// 엉뚱한 곳에서 터진다. 실제로 겪었다.
afterEach(cleanup);
