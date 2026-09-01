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
