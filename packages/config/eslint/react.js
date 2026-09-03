import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * 화면이 있는 패키지용.
 *
 * 두 묶음이 핵심이고, 둘 다 **타입으로는 절대 못 잡는 것**이다.
 *
 * - react-hooks: 의존성 배열 누락과 조건부 훅 호출. 이 저장소에서 이미
 *   무한 렌더링을 한 번 겪었다(useCartStore 셀렉터가 매번 새 배열을 만들었다).
 * - jsx-a11y: 라벨 없는 입력, 대체 텍스트 없는 이미지 같은 것.
 *   이 프로젝트는 접근성을 요구사항으로 두었으므로 사람 눈에만 맡기지 않는다.
 */
export const reactConfig = [
  ...baseConfig,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      /**
       * 자동 포커스는 화면을 읽고 있던 사람의 위치를 빼앗는다.
       * 정말 필요한 자리가 있다면 그때 주석과 함께 예외를 둔다.
       */
      'jsx-a11y/no-autofocus': 'error',

      /**
       * 화면에 보이는 라벨과 접근 이름이 어긋나면, 음성으로 조작하는 사람이
       * "보이는 대로" 말했을 때 그 버튼이 눌리지 않는다.
       */
      'jsx-a11y/label-has-associated-control': [
        'error',
        { assert: 'either' },
      ],
    },
  },
];
