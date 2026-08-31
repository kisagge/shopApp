# Shop — 커머스 웹/앱 (포트폴리오)

Next.js 모노레포로 만드는 쇼핑몰. 웹과 PC를 반응형으로 하나의 코드베이스에서 처리하고,
같은 앱을 Capacitor로 감싸 iOS/Android 스토어에 올리는 것을 목표로 한다.

## 구조

```
apps/
  web/         Next.js 16 (App Router) — 스토어프론트 + /api/* 백엔드 + 어드민
  mobile/      Capacitor 셸 (예정)
packages/
  ui/          디자인 시스템 — Tailwind v4 토큰 + 컴포넌트
  core/        도메인 순수 로직 — 금액·장바구니·배송비·주문 상태머신
  contract/    Zod 스키마 = API 요청/응답 계약 (서버·클라이언트 공유)
  config/      tsconfig 프리셋
tooling/       docker-compose (postgres + minio)
design/        디자인 캔버스 아트보드 소스
```

### 모바일을 이렇게 가져가는 이유

Capacitor는 Next.js의 서버 기능(RSC, Route Handler)을 기기 안에서 실행할 수 없다.
그래서 두 갈래가 있다 — ① 전부 정적 export 해서 번들하거나(RSC/SSR 포기),
② 배포된 웹을 네이티브 셸이 로드하고 네이티브 기능만 브릿지로 쓰거나.

**②를 택했다.** 코드가 100% 공유되고, 푸시·생체인증·공유 같은 것은
`packages/native` 파사드가 웹에서는 Web API 폴백으로, 앱에서는 Capacitor 플러그인으로
갈라져 동작한다. 앱 코드는 자기가 어디서 도는지 모른 채 쓴다.

## 시작하기

```bash
pnpm install
cp .env.example .env      # 값 채우기
pnpm db:up                # postgres + minio
pnpm dev
```

Node 24 LTS와 pnpm 11이 필요하다. `.nvmrc`와 `packageManager` 필드에 고정돼 있다.

## 테스트

세 계층으로 나눠 둔다.

| 계층 | 위치 | 무엇을 지키는가 |
|---|---|---|
| **UI · 디자인** | `packages/ui/test` | 컴포넌트 렌더링, axe 자동 접근성 검사, **디자인 토큰 명도대비 회귀** |
| **프론트 로직** | `apps/web/test/cart-store.test.ts`, `analytics-client.test.ts` | 장바구니 상태(수량 경계·선택·영속화), 이벤트 트래커(배치·세션 만료·동의 게이트) |
| **백 로직** | `packages/core/test`, `packages/contract/test`, `packages/db/test`, `apps/web/test/*-api.test.ts` | 금액 계산, 주문 상태 전이, 권한 정책, 이벤트 퍼널, 입력 검증, enum 정합성 |

```bash
pnpm test                 # 전체
pnpm --filter @shop/ui test
```

토큰 대비 테스트(`tokens.contrast.test.ts`)는 `theme.css`의 oklch 값을 직접 파싱해
WCAG 대비를 계산한다. 실제로 이 프로젝트에서 처음 잡았던 색 4개가 여기서 걸러졌다 —
`n-500`, `warning`, `success`, `info`. 색을 한 단계 바꾸면 테스트가 먼저 깨진다.

## 접근성

모든 컴포넌트는 시맨틱 HTML로 짠다. `div` 남발 대신 `header`/`nav`/`main`/`section`/
`article`/`dl`/`table`을 쓰고, 아이콘 전용 버튼에는 `aria-label`, 폼 에러는
`aria-invalid` + `aria-describedby` + `role="alert"`로 연결한다.
상태를 색으로만 전달하지 않고 항상 텍스트를 함께 둔다.
포커스 링은 제거하지 않고 `:focus-visible`로 노출한다.

## 배포 (Vercel)

`vercel.json`이 저장소 루트에 있다. Vercel 프로젝트를 만들 때:

- **Root Directory**: 저장소 루트 (`vercel.json`의 `buildCommand`가 `--filter=@shop/web`로 잡는다)
- **Environment Variables**: `.env.example`의 항목을 대시보드에 등록
- **Region**: `icn1` (서울)

주의 — `tooling/docker-compose.yml`의 Postgres는 로컬 개발용이다.
프로덕션에서는 서버리스 환경에 맞는 풀링을 지원하는 DB(Vercel Postgres, Neon, Supabase 등)를
써야 한다. 함수마다 커넥션을 새로 여는 구조라 일반 Postgres는 커넥션이 금방 고갈된다.

## CI

`.github/workflows/ci.yml` — main 브랜치 푸시와 PR에서 타입체크 → 테스트 → 빌드를 돌린다.
같은 브랜치에 연속 푸시하면 이전 실행을 취소한다(프라이빗 저장소는 분당 과금).

## 디자인

[디자인 캔버스](https://claude.ai/code/artifact/b894fd0c-8f71-484e-8c00-6530fc3e8561) —
디자인 시스템, 모바일 7화면, PC 4화면, 어드민 3화면.
`design/*.dc.html`이 아트보드 소스이고 `design/build.sh`로 다시 만든다.

브랜드명 **PLAIN**과 사업자 정보는 플레이스홀더다.

## 알아 둘 것

**TypeScript 는 7.0.2 가 아니라 6.0.3 에 고정돼 있다.** Next 16 의 `typedRoutes` 가
만드는 조건부 템플릿 리터럴 타입을 TS 7 이 잘못 판정해, 멀쩡한 `<Link href="/login">`
에도 에러를 낸다(같은 프로젝트가 TS 6.0.3 에서는 에러 0개). `next build` 의 자체
타입체크는 통과하고 `tsc --noEmit` 만 실패해서, CI 와 빌드가 서로 다른 답을 내는
상태가 된다. typedRoutes 를 끄는 대신 컴파일러를 내렸다. TS 7 이 고쳐지면 되돌린다.

## 아직 안 한 것

- `packages/native` — Capacitor 브릿지 파사드
- `apps/mobile` — Capacitor 셸
- 인증 (Better Auth)
- 결제 (Toss Payments 테스트 모드, `PaymentGateway` 인터페이스 + Toss/Mock 어댑터)
- 어드민 화면 구현
- Playwright E2E · 시각 회귀
