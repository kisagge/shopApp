-- 오류 기록. 지문 하나에 행 하나를 두고 횟수와 처음·마지막 시각을 센다.
-- 한 건마다 남기면 표가 금방 커지고, 정작 보고 싶은 것("몇 번 났는가")은 매번 세어야 한다.
CREATE TABLE "error_groups" (
  "fingerprint" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "routePath" TEXT NOT NULL,
  "routeType" TEXT NOT NULL,
  "method" TEXT,
  "path" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,

  CONSTRAINT "error_groups_pkey" PRIMARY KEY ("fingerprint")
);

-- 처리 안 된 것부터, 최근 것부터 본다
CREATE INDEX "error_groups_resolvedAt_lastSeenAt_idx" ON "error_groups"("resolvedAt", "lastSeenAt");

ALTER TABLE "error_groups"
  ADD CONSTRAINT "error_groups_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
