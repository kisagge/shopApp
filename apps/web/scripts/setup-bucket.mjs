/**
 * 로컬 MinIO 버킷 준비.
 *
 * tooling/ 이 아니라 여기 있는 이유: ESM 은 파일 위치를 기준으로 패키지를
 * 찾는다. @aws-sdk/client-s3 는 이 앱의 의존성이라 루트에서는 해석되지 않는다.
 *
 * 상품 이미지는 브라우저가 직접 가져간다 — 우리 함수로 프록시하면 요청마다
 * 함수가 깨어난다. 그래서 products/ 아래를 익명 읽기로 열어 둔다.
 * **읽기만** 열고 쓰기는 자격증명이 있어야 한다.
 */
import {
  S3Client, CreateBucketCommand, PutBucketPolicyCommand, HeadBucketCommand,
} from '@aws-sdk/client-s3';

// 환경변수는 node --env-file 로 넣는다. 루트에 dotenv 를 새로 들이는 것보다
// 런타임 기능을 쓰는 편이 의존성이 하나 적다.

const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`버킷 ${bucket} 이미 있음`);
} catch {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`버킷 ${bucket} 생성`);
}

/**
 * products/ 를 익명 읽기로 연다.
 *
 * **Cloudflare R2 는 S3 의 버킷 정책 API 를 지원하지 않는다.** 공개 설정은
 * 대시보드(Settings → Public Development URL 또는 커스텀 도메인)에서 한다.
 * 여기서 실패해도 나머지는 정상이므로 멈추지 않고 안내만 남긴다.
 */
try {
  await client.send(new PutBucketPolicyCommand({
    Bucket: bucket,
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadProducts',
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/products/*`],
      }],
    }),
  }));
  console.log('products/ 익명 읽기 허용');
} catch (error) {
  console.warn(`
⚠ 버킷 정책을 설정하지 못했습니다: ${error.name ?? error}

  Cloudflare R2 라면 정상입니다 — 정책 API 를 지원하지 않습니다.
  대시보드에서 공개 접근을 켜세요:
    R2 → 버킷 → Settings → Public Development URL 활성화
    (또는 커스텀 도메인 연결)

  그 주소를 S3_PUBLIC_BASE_URL 에 넣으면 됩니다.
  이미지는 브라우저가 그 주소로 직접 가져갑니다.
`);
}
