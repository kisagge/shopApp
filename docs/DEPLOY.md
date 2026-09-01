# Vercel 배포

프론트와 백이 한 프로젝트라 **별도 백엔드 서버가 필요 없다.** API 라우트 24개,
서버 렌더링 화면, Better Auth 핸들러, Prisma 쿼리, 토스 승인 호출이 전부
Vercel 서버리스 함수로 돈다.

다만 **Postgres 와 오브젝트 스토리지는 따로 마련해야 한다.** 지금은 로컬 Docker 다.

---

## 1. 관리형 Postgres

Neon · Supabase · Vercel Postgres 중 아무거나. 리전은 `icn1`(서울)에 맞춘다 —
`vercel.json` 이 그 리전을 쓰므로 다른 대륙에 두면 쿼리마다 왕복 지연이 붙는다.

**주소가 두 개 필요하다.**

| 환경변수 | 무엇 | 왜 |
|---|---|---|
| `DATABASE_URL` | 풀러를 거친 주소 | 서버리스는 함수 인스턴스마다 커넥션을 연다. 직접 붙으면 금방 고갈된다 |
| `DIRECT_DATABASE_URL` | 풀러를 거치지 않은 주소 | 트랜잭션 모드 풀러는 DDL 과 어드바이저리 락을 제대로 다루지 못해 마이그레이션이 중간에 멈춘다 |

Neon 은 `-pooler` 가 붙은 호스트가 풀링 주소이고, Supabase 는 6543 포트가 풀러,
5432 가 직결이다.

**Neon 을 Vercel 마켓플레이스로 붙였다면 `DIRECT_DATABASE_URL` 을 따로 넣지 않아도 된다.**
Neon 이 직결 주소를 `DATABASE_URL_UNPOOLED` 로 자동 주입하고, `prisma.config.ts` 가
그 이름도 함께 읽는다. 비밀번호가 든 URL 을 손으로 옮겨 적지 않는 편이 안전하다.

## 2. 오브젝트 스토리지

S3 · Cloudflare R2 · Vercel Blob 중 아무거나. **`products/` 접두사를 익명 읽기로
열어 둔다** — 이미지는 브라우저가 직접 가져간다. 우리 함수로 프록시하면 요청마다
함수가 깨어나고 실행 시간을 이미지 전송에 쓴다.

로컬 MinIO 정책은 `apps/web/scripts/setup-bucket.mjs` 에 있다. 같은 정책을 옮기면 된다.

## 3. 환경변수

Vercel 프로젝트 설정 → Environment Variables. **시크릿 세 개는 직접 만들어 넣는다.**

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # EVENT_IP_SALT
openssl rand -base64 32   # CRON_SECRET
```

| 변수 | 값 | 비워 두면 |
|---|---|---|
| `DATABASE_URL` | 풀링 주소 | 앱이 뜨지 않는다 |
| `DIRECT_DATABASE_URL` | 직결 주소 (Neon 통합이면 불필요) | 마이그레이션이 풀러를 타서 멈출 수 있다 |
| `BETTER_AUTH_SECRET` | 랜덤 32바이트 | 세션 서명이 안 된다 |
| `BETTER_AUTH_URL` | `https://<운영 도메인>` | 프리뷰는 `VERCEL_URL` 로 자동 해결. **운영에는 넣는다** |
| `NEXT_PUBLIC_APP_URL` | `https://<운영 도메인>` | Capacitor 셸이 붙을 주소 |
| `EVENT_IP_SALT` | 랜덤 32바이트 | 이벤트 IP 해시가 고정 솔트로 약해진다 |
| `CRON_SECRET` | 랜덤 32바이트 | **배치 라우트가 503 으로 거절한다** (열어 두지 않는다) |
| `S3_*` | 스토리지 값 6개 | 이미지 업로드가 503 으로 거절한다 |
| `TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 토스 키 | Mock 게이트웨이로 돈다 (배포는 성공한다) |

`BETTER_AUTH_URL` 은 **Production 환경에만** 넣는다. Preview 에 운영 도메인을 넣으면
프리뷰 배포의 Origin 과 어긋나 로그인이 통째로 막힌다 — 비워 두면 각 배포가
자기 `VERCEL_URL` 을 쓴다.

## 4. 배포

GitHub 저장소를 Vercel 에 연결하면 `vercel.json` 을 그대로 읽는다.

**Root Directory 는 `apps/web` 이다.** Vercel 은 그 디렉터리의 `package.json` 에서
`next` 를 찾아 프레임워크를 감지한다. 저장소 루트로 두면
"No Next.js version detected" 로 죽는다.

그래서 **`vercel.json` 도 `apps/web/` 에 있다.** Vercel 은 Root Directory 기준으로
이 파일을 읽는다.

```
installCommand  pnpm install --frozen-lockfile
buildCommand    check-db-url && prisma migrate deploy && turbo run build --filter=@shop/web
```

`outputDirectory` 는 두지 않는다. framework 프리셋이 Root Directory 아래의
`.next` 를 찾는다. 명시하면 `apps/web` 기준으로 한 번 더 풀려 어긋난다.

빌드 명령의 세 단계는 모두 `pnpm --filter` 를 거친다. pnpm 이 워크스페이스를
스스로 찾으므로 **실행 위치에 매이지 않는다.** 저장소 루트 기준 상대 경로를
쓰면 Root Directory 설정에 따라 파일을 못 찾는다.

빌드 첫 단계가 DB 주소를 확인한다. 비어 있으면 어느 변수를 어디에 넣어야 하는지
적어 주고 멈춘다 — Prisma 는 "Connection url is empty" 만 말해서 로그만으로는
원인을 좁힐 수 없다.

**마이그레이션이 빌드 안에서 돈다.** 실패하면 배포도 안 되므로, 스키마와 코드가
어긋난 채로 뜨는 일이 없다. 첫 배포에서 `0_init` 이 전체 스키마를 만든다.

빌드 후 시드가 필요하면 로컬에서 운영 DB 를 가리켜 돌린다:

```bash
DATABASE_URL="<운영 풀링 주소>" pnpm db:seed
```

## 5. 크론

`vercel.json` 에 두 개가 정의돼 있다.

| 경로 | 주기 | 하는 일 |
|---|---|---|
| `/api/cron/settlements` | 매달 1일 KST 05:00 | 앞 달 정산 확정 |
| `/api/cron/reconcile-points` | 매일 KST 03:00 | 포인트 잔액을 원장에 맞춤 |

Vercel 은 `CRON_SECRET` 이 설정돼 있으면 `Authorization: Bearer` 로 보낸다.
두 라우트 모두 그 값을 확인하고, **시크릿이 없으면 열어 두지 않고 503 으로 막는다.**

플랜에 따라 크론 개수와 주기에 제한이 있으니 확인할 것.

## 6. 배포 후 확인

```bash
curl https://<도메인>/api/health
curl -o /dev/null -w '%{http_code}\n' https://<도메인>/api/cron/settlements   # 401 이어야 정상
```

- 로그인 → 마이페이지가 열리는가 (Origin 설정 확인)
- 상품 이미지가 보이는가 (스토리지 공개 정책 확인)
- 어드민 → 배너에서 문구를 바꿔 홈에 반영되는가

---

## 로컬 개발

```bash
pnpm db:up          # Postgres + MinIO
pnpm db:deploy      # 마이그레이션 적용
pnpm storage:setup  # 버킷 생성 + 공개 정책
pnpm db:seed
pnpm storage:seed   # 상품 플레이스홀더 이미지
pnpm banners:seed
pnpm dev
```

스키마를 바꿀 때:

```bash
pnpm db:migrate     # 마이그레이션 생성 + 적용 + 클라이언트 재생성
```

`pnpm db:push` 는 이력을 남기지 않으므로 **버릴 실험에만** 쓴다.
그리고 스키마를 바꾼 뒤에는 **dev 서버를 재시작해야 한다** — 실행 중인 서버는
예전 Prisma 클라이언트를 물고 있다.
