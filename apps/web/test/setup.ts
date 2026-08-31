import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 이게 없으면 컴포넌트가 마운트된 채로 다음 테스트에 넘어가고,
// 다음 테스트가 스토어나 목을 바꾸는 순간 남아 있던 컴포넌트가 다시 렌더돼
// 엉뚱한 곳에서 터진다. 실제로 겪었다.
afterEach(cleanup);
