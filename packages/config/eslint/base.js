import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * 공용 ESLint 설정.
 *
 * **TypeScript 가 이미 잡는 것은 다시 잡지 않는다.** 이 저장소는 strict 에
 * noUncheckedIndexedAccess·exactOptionalPropertyTypes 까지 켜 두었으므로
 * 타입으로 걸리는 규칙을 린터에 또 넣으면 같은 오류를 두 번 보게 될 뿐이다.
 *
 * 여기 남긴 것은 tsc 가 못 보는 것들이다.
 * - 처리하지 않은 Promise (no-floating-promises)
 * - 조건문에 Promise 를 넣는 실수 (no-misused-promises)
 * - 쓰지 않는 변수·import
 * 나머지는 각 패키지 설정에서 화면 관련 규칙을 얹는다.
 */
export const baseConfig = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/src/generated/**', // Prisma 가 만든 코드는 우리가 고치지 않는다
      '**/node_modules/**',
      '**/*.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        /**
         * 타입 정보를 쓰는 규칙(no-floating-promises 등)에 필요하다.
         *
         * 아래 파일들은 어느 tsconfig 의 include 에도 없어 그대로 두면 파싱
         * 오류가 난다. 타입 없이라도 검사하도록 기본 프로젝트를 허용한다.
         *
         * **와일드카드로 적지 않는다.** `*.config.ts` 로 두면 tsconfig 에
         * 이미 포함된 prisma.config.ts 까지 걸려 "양쪽에 다 있다" 는 오류가 난다.
         */
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts', 'next.config.ts'],
        },
        tsconfigRootDir: process.cwd(),
      },
      globals: { ...globals.node },
    },
    rules: {
      /**
       * 밑줄로 시작하는 인자는 "일부러 안 쓴다" 는 표시다.
       * 이벤트 핸들러나 콜백에서 앞 인자만 필요할 때 쓴다.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      /**
       * 이 저장소는 any 를 피하지만 목(mock)에서는 필요하다.
       * 테스트 설정에서 따로 풀어 준다.
       */
      '@typescript-eslint/no-explicit-any': 'warn',

      /**
       * 타입 단언은 필요할 때가 있고, 필요한 자리마다 주석이 붙어 있다.
       * 규칙으로 막기보다 리뷰에서 볼 일이다.
       */
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      /**
       * JSX 속성에 async 함수를 바로 넘기는 것은 허용한다.
       *
       * 규칙의 취지는 "반환된 Promise 를 아무도 안 본다" 는 것인데, JSX
       * 이벤트 핸들러에서는 **어차피 아무도 못 본다.** React 는 핸들러의
       * 반환값을 기다리지 않고, 이 규칙을 켜 둔 상태의 회피책인
       * `onClick={() => void f()}` 도 정확히 똑같이 방치한다 — 표기만
       * 늘어날 뿐 처리되는 것은 없다.
       *
       * 그래서 껍데기를 걷어내고 `onClick={f}` 로 쓴다. 대신 **문장 자리의
       * no-floating-promises 는 그대로 둔다** — 거기서는 실제로 처리할 수
       * 있고, 실제로 결함을 잡아냈다.
       *
       * 핸들러 안의 실패는 핸들러가 직접 처리하는 것이 규칙이다.
       */
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      /** 템플릿 문자열에 숫자를 넣는 것은 흔하고 안전하다 */
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true },
      ],
    },
  },

  /**
   * 테스트는 규칙을 조금 푼다.
   *
   * 목은 Prisma·fetch 대역이라 인자 타입을 열어 두어야 mock.calls 를 꺼내
   * 검증할 수 있다. 프로덕션 코드가 아니므로 any 를 막을 이유가 없다.
   */
  {
    files: ['**/test/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',

      /**
       * 목은 비동기 인터페이스를 대신한다. PaymentGateway.confirm 처럼
       * Promise 를 돌려주기로 한 자리의 대역이라 안에서 await 할 것이 없어도
       * async 여야 한다. async 를 떼면 규칙은 조용해지지만 목이
       * 실제 인터페이스와 다른 것을 흉내내게 된다 — 그쪽이 더 나쁘다.
       */
      '@typescript-eslint/require-await': 'off',
    },
  },

  /** 스크립트는 개발용이라 콘솔 출력이 목적이다 */
  {
    files: ['**/scripts/**/*.ts', '**/src/seed*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
