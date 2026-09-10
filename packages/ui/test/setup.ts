import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/** 기다림의 상한을 검사의 상한에 맞춘다 — apps/web/test/setup.ts 에 이유를 적었다 */
configure({ asyncUtilTimeout: 15_000 });

afterEach(cleanup);
