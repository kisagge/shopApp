# PLAIN — 커머스 웹/앱 (포트폴리오)

Next.js 모노레포로 만든 쇼핑몰. **하나의 코드베이스**가 반응형 웹으로 돌고,
같은 것을 Capacitor 셸로 감싸 iOS/Android 앱이 된다. 안드로이드 실기기에
설치해 확인한 상태다.

한국어·영어·일본어로 나가고, 손님 화면부터 가맹점·운영진 화면과 정산·배치까지
한 저장소 안에 있다.

브랜드명 **PLAIN**과 사업자 정보는 플레이스홀더다. 사업자등록번호가 선수로
필요한 기능(실결제 정산, 본인인증 등)은 처음부터 범위에서 뺐다.

## 만든 것

**손님** — 카테고리·검색(자동완성, 트라이그램 색인으로 부분 일치)·필터(가격대 프리셋, 색·사이즈 패싯)·
상품 상세·리뷰(사진·사이즈핏)·상품 비교·장바구니·주문/결제(Toss 테스트 모드)·
주문 조회·취소·반품·찜·재입고 알림·최근 본 상품·쿠폰·포인트·문의·알림·회원 탈퇴

**가맹점** — 입점 신청·상품 등록과 검수 요청·재고·주문 처리·문의 답변·정산 확인
(자기 것만 보이도록 조회마다 범위를 건다)

**운영진** — 대시보드(순매출·전환 퍼널·트래픽)·주문·상품 검수·배너·기획전·쿠폰·
회원·권한·정산 확정과 지급·리뷰 신고 처리·문의·감사 로그

**배치** — 구매확정 자동 처리 · 포인트 만료 · 포인트 원장 정합성 검증 ·
재고 홀드 해제 · 이벤트 롤업 · 정산 마감

**앱** — 스플래시 · 네이티브 공유 · 딥링크 · 뒤로가기 두 번 종료 ·
세션 토큰(Bearer) 보관 · 구글 네이티브 로그인

## 구조

```
apps/
  web/         Next.js 16 (App Router) — 스토어프론트 + /api/* 백엔드 + 어드민
  mobile/      Capacitor 8 셸 — 배포된 웹을 띄우고 네이티브 기능만 브릿지로 쓴다
packages/
  core/        도메인 순수 로직 — 금액·장바구니·배송비·주문 상태머신·권한·매출 인식
  contract/    Zod 스키마 = API 요청/응답 계약 (서버·클라이언트 공유)
  db/          Prisma 스키마·클라이언트·시드
  auth/        Better Auth 설정과 세션 읽기
  i18n/        한국어·영어·일본어 사전과 서식
  mail/        메일 어댑터
  native/      Capacitor 파사드 — npm 의존성 0, window.Capacitor 를 직접 본다
  ui/          디자인 시스템 — Tailwind v4 토큰 + 컴포넌트
  config/      tsconfig 프리셋
tooling/       docker-compose (postgres + minio) · 로컬 CI 스크립트
docs/          배포 절차
design/        디자인 캔버스 아트보드 소스
```

Next 16.3.3 · React 19.2.8 · TypeScript 6.0.3 · Prisma 7 · Zod 4 ·
Tailwind 4 · Zustand 5 · Capacitor 8 · Node 24 · pnpm 11

## 이렇게 정한 것들

### 모바일을 원격 셸로

Capacitor 는 Next.js 의 서버 기능(RSC, Route Handler)을 기기 안에서 실행할 수
없다. 그래서 두 갈래가 있다 — ① 전부 정적 export 해서 번들하거나(RSC/SSR 포기),
② 배포된 웹을 네이티브 셸이 로드하고 네이티브 기능만 브릿지로 쓰거나.

**②를 택했다.** 코드가 100% 공유되고, 공유·딥링크·스플래시 같은 것은
`packages/native` 파사드가 웹에서는 Web API 폴백으로, 앱에서는 Capacitor
플러그인으로 갈라져 동작한다. 화면 코드는 자기가 어디서 도는지 모른 채 쓴다.

그 파사드는 **npm 의존성이 0 이다.** `@capacitor/*` 를 웹 번들에 넣으면
브라우저에서 쓰지도 않을 코드를 받게 되므로, `window.Capacitor.Plugins.*` 를
직접 본다.

### 정책은 core 에, 계약은 contract 에, 실행은 앱에

무엇이 규칙인지(`packages/core`)와 무엇이 오가는지(`packages/contract`)를
실행에서 떼어 놓았다. 배송비·할인·주문 상태 전이·권한·매출 인식은 I/O 가 없는
순수 함수라 빠르게 검사할 수 있고, 화면과 API 가 같은 답을 본다.

### 규칙을 기억이 아니라 검사로 지킨다

이 저장소에서 가장 많이 쓴 방법이다. **목록을 손으로 들고 있으면 반드시 샌다.**
그래서 목록을 파일 시스템이나 코드에서 만들고, 빼려면 이유를 적게 한다.
그리고 **고친 것을 되돌려서 검사가 실제로 지는지 확인한 뒤에** 커밋한다.

실제로 잡힌 것들:

| 검사 | 잡은 것 |
|---|---|
| `rate-limit-coverage` | 요청 제한 목록 밖에 라우트 18개가 있었고 **그중 주문 생성**이 있었다 |
| `a11y-coverage` | 손으로 적은 훑기 목록이 화면 10장을 놓쳤고 **그중 결제 화면**이 있었다 |
| `validation-message-coverage` | 스키마 40개가 제약을 어기면 Zod 의 **영어 기본 문구**로 답하고 있었다 |
| `client-dictionary` | 한국어 화면 하나가 **영어·일본어 사전까지** 내려받고 있었다(gzip 24KB) |
| `cron-coverage` | 배치가 vercel.json 에 등록됐는지 — 등록을 빼먹으면 조용히 안 돈다 |
| `dead-exports` | 부르는 곳이 없는 export |
| `e2e-coverage` | Playwright 프로젝트에 안 잡혀 **한 번도 안 도는** 스펙 파일 |
| `layout` | 좁은 화면에서 글자가 상자를 넘치거나 본문이 가로로 스크롤되는 것 |

### 숫자는 재고 나서 말한다

성능·용량은 추측하지 않고 실제로 잰다. 예를 들어 사전을 코드가 아니라 데이터로
내려보내는 변경은 홈 화면 전송량을 **gzip 294.6KB → 271.4KB** 로 줄였다
(스크립트 −36.7KB, HTML +13.5KB — 첫 방문이 이기고 하드 리로드가 지는 트레이드를
알고 택했다).

## 시작하기

```bash
pnpm install
cp .env.example .env      # 값 채우기
pnpm db:up                # postgres + minio (docker)
pnpm db:deploy            # 마이그레이션 적용
pnpm storage:setup        # 이미지 버킷 생성 + 공개 정책
pnpm db:seed              # 상품·사용자
pnpm storage:seed         # 상품 플레이스홀더 이미지
pnpm banners:seed         # 홈 배너
pnpm dev
```

Node 24 LTS 와 pnpm 11 이 필요하다. `.nvmrc` 와 `packageManager` 필드에 고정돼 있다.

시드 계정은 모두 비밀번호 `plain1234!` 다. **비밀이 아니다** — 로컬과 E2E 에서만
쓰이고 `packages/auth/src/seed-fixtures.ts` 에 그대로 적혀 있다.

| 계정 | 역할 |
|---|---|
| `demo@plain.test` | 고객 |
| `contact@moor.test` | 가맹점 (무어) |
| `admin@plain.test` | 관리자 |
| `super@plain.test` | 슈퍼관리자 |

### 앱으로 돌려 보기

```bash
pnpm mobile:sync                       # 웹 셸 자산 동기화
CAP_SERVER_URL=http://<내 IP>:3000 pnpm mobile:android
```

안드로이드 빌드에는 **Android Studio 가 들고 있는 JDK** 가 필요하다. Capacitor 8 은
Java 21 을 겨냥하는데 보통 설치돼 있는 JDK 는 17 까지다 —
`/Applications/Android Studio.app/Contents/jbr/Contents/Home` 을 `JAVA_HOME` 으로 준다.

딥링크를 실제로 검증하려면 `ANDROID_CERT_SHA256` 과 `APPLE_TEAM_ID` 를 채우고
Xcode 에서 Associated Domains 를 켜야 한다. 자세한 것은 `apps/mobile/README.md`.

### 스키마를 바꿀 때

```bash
pnpm db:migrate           # 마이그레이션 생성 + 적용 + 클라이언트 재생성
```

`pnpm db:push` 는 이력을 남기지 않으므로 **버릴 실험에만** 쓴다.
그리고 스키마를 바꾼 뒤에는 **dev 서버를 재시작해야 한다** — 실행 중인 서버는
예전 Prisma 클라이언트를 물고 있어서 `Unknown argument` 같은 오류가 난다.
(두 번 당했다.)

## 테스트

세 계층으로 나눠 둔다.

| 계층 | 위치 | 무엇을 지키는가 |
|---|---|---|
| **UI · 디자인** | `packages/ui/test`, `apps/web/test/*.test.tsx`, `e2e/layout*.spec.ts` | 컴포넌트 렌더링, axe 자동 접근성 검사, **디자인 토큰 명도대비 회귀**, **좁은 화면에서 자리가 무너지는지** |
| **프론트 로직** | `apps/web/test/*-store.test.ts`, `analytics-client.test.ts` | 장바구니 상태(수량 경계·선택·영속화), 비교함, 이벤트 트래커(배치·세션 만료·동의 게이트) |
| **백 로직** | `packages/*/test`, `apps/web/test/*-api.test.ts` | 금액 계산, 주문 상태 전이, 매출 인식, 권한 정책, 이벤트 퍼널, 입력 검증, enum 정합성 |

```
core 736 · web 1,978 · contract 209 · ui 101 · auth 38 · i18n 37 · db 28 · native 22 · mail 7
e2e 430 (Playwright, 33 파일)
```

```bash
pnpm test                 # 단위 전체
pnpm --filter @shop/ui test
pnpm ci:local             # CI 와 같은 조건 — 버릴 DB 를 새로 만들고 캐시를 지운 뒤 e2e 까지
```

**`pnpm ci:local` 이 최종 신호다.** 캐시가 남아 있으면 지나가는 것들이 있어서,
`.next` 와 `.turbo` 를 지우고 throwaway DB 로 처음부터 돌린다.

토큰 대비 테스트(`tokens.contrast.test.ts`)는 `theme.css` 의 oklch 값을 직접 파싱해
WCAG 대비를 계산한다. 실제로 이 프로젝트에서 처음 잡았던 색 4개가 여기서 걸러졌다 —
`n-500`, `warning`, `success`, `info`. 색을 한 단계 바꾸면 테스트가 먼저 깨진다.

## 접근성

모든 컴포넌트는 시맨틱 HTML 로 짠다. `div` 남발 대신 `header`/`nav`/`main`/`section`/
`article`/`dl`/`table` 을 쓰고, 아이콘 전용 버튼에는 `aria-label`, 폼 에러는
`aria-invalid` + `aria-describedby` + `role="alert"` 로 연결한다.
**상태를 색·모양으로만 전달하지 않고** 항상 글자를 함께 둔다 — 상품 비교표에서
가장 나은 값을 굵게 칠할 때 낭독기용 문구를 함께 넣는 식이다.
포커스 링은 제거하지 않고 `:focus-visible` 로 노출한다.

손님·회원·운영진 화면을 axe 로 훑고(`e2e/a11y-*.spec.ts`), 훑기가 화면을 빠뜨리지
않는지는 `a11y-coverage` 가 파일 시스템과 대조해 지킨다.

## 배포

Vercel. 프론트와 백이 한 프로젝트라 별도 백엔드 서버가 필요 없고,
API 라우트와 서버 렌더링이 전부 서버리스 함수로 돈다.

- **Root Directory**: 저장소 루트 (`vercel.json` 의 `buildCommand` 가 `--filter=@shop/web` 로 잡는다)
- **Environment Variables**: `.env.example` 의 항목을 대시보드에 등록
- **Region**: `icn1` (서울)

Postgres 와 오브젝트 스토리지는 따로 마련해야 한다. 절차와 환경변수,
"무엇을 비워 두면 무엇이 조용히 꺼지는지" 는 [docs/DEPLOY.md](docs/DEPLOY.md) 에 있다.

주의 — `tooling/docker-compose.yml` 의 Postgres 는 로컬 개발용이다.
프로덕션에서는 서버리스에 맞는 풀링을 지원하는 DB(Vercel Postgres, Neon, Supabase 등)를
써야 한다. 함수마다 커넥션을 새로 여는 구조라 일반 Postgres 는 커넥션이 금방 고갈된다.

## CI

`.github/workflows/ci.yml` — main 브랜치 푸시와 PR 에서
의존성 권고 → 린트 → 타입체크 → 테스트 → 빌드 → E2E 를 한 잡에서 돌린다.
같은 브랜치에 연속 푸시하면 이전 실행을 취소한다(프라이빗 저장소는 분당 과금).

로컬에서 같은 것을 보려면 `pnpm ci:local` 이다.

## 디자인

[디자인 캔버스](https://claude.ai/code/artifact/b894fd0c-8f71-484e-8c00-6530fc3e8561) —
디자인 시스템, 모바일 7화면, PC 4화면, 어드민 3화면.
`design/*.dc.html` 이 아트보드 소스이고 `design/build.sh` 로 다시 만든다.

## 알아 둘 것

**TypeScript 는 7.0.2 가 아니라 6.0.3 에 고정돼 있다.** Next 16 의 `typedRoutes` 가
만드는 조건부 템플릿 리터럴 타입을 TS 7 이 잘못 판정해, 멀쩡한 `<Link href="/login">`
에도 에러를 낸다(같은 프로젝트가 TS 6.0.3 에서는 에러 0개). `next build` 의 자체
타입체크는 통과하고 `tsc --noEmit` 만 실패해서, CI 와 빌드가 서로 다른 답을 내는
상태가 된다. typedRoutes 를 끄는 대신 컴파일러를 내렸다. TS 7 이 고쳐지면 되돌린다.

## 아직 안 한 것

- **비회원 주문** — 지금은 주문이 회원에 묶여 있다(`Order.userId` 필수). 넣으려면
  로그인할 수 없는 회원 행을 두거나 FK 를 끊어야 하는데, 뒤엣것은 포인트·메일·리뷰 등
  돈이 걸린 코드 51곳을 함께 손봐야 한다.
- **푸시 알림** — APNs/FCM 인증서가 필요해서 뺐다.
- **앱의 키보드·상태바** — 웹뷰에서 입력칸이 키보드에 가리는지, 상태바 아이콘이
  밝은 헤더 위에서 읽히는지는 실기기로 봐야 확인된다.
