import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readS3Config, StorageError, type S3Config } from '~/lib/storage';

/**
 * S3 호환 저장소 어댑터 — 로컬 MinIO, 배포 시 S3 · R2.
 *
 * 설정을 **읽는** 쪽은 `storage-config.test.ts` 가 본다. 그 설정으로 **실제로 올리고 지우는** 이 조각은
 * 검사가 0개였다(`S3Storage` 라는 이름이 검사 어디에도 없었다).
 *
 * 여기서 틀리면 조용하다. 사진은 올라가고 화면에도 뜨는데,
 *
 * - **캐시 머리글이 빠지면** 같은 사진을 손님마다 매번 다시 받는다. 키에 임의 토큰이 들어 있어서 내용이
 *   바뀌면 키도 바뀌는데, 그 사실을 머리글로 말하지 않으면 그 설계가 헛돈다.
 * - **주소를 잘못 이어 붙이면** `//` 나 붙어 버린 주소가 DB 에 **그대로 저장된다.** 올릴 때는 아무 일도
 *   없고, 나중에 그 줄을 쓰는 화면에서만 사진이 깨진다. 설정이 끝 슬래시를 떼 주는 것과 **짝으로** 맞아야 한다.
 * - **오류를 싸지 않으면** SDK 오류가 그대로 올라가 500 이 된다. 저장소가 넘어진 것은 502 이고, 공통 응답이
 *   그 셈을 StorageError 에서 읽는다.
 */

const aws = vi.hoisted(() => ({
  send: vi.fn<(...a: any[]) => any>(),
  seen: { client: null as Record<string, unknown> | null, put: [] as any[], del: [] as any[] },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = aws.send;
    constructor(config: Record<string, unknown>) {
      aws.seen.client = config;
    }
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {
      aws.seen.put.push(input);
    }
  },
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {
      aws.seen.del.push(input);
    }
  },
}));

const { S3Storage } = await import('~/lib/storage/s3');

const CONFIG: S3Config = {
  endpoint: 'http://localhost:9000',
  region: 'ap-northeast-2',
  bucket: 'plain',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  publicBaseUrl: 'https://cdn.plain.test',
  forcePathStyle: true,
};

const store = (over: Partial<S3Config> = {}) => new S3Storage({ ...CONFIG, ...over });

const FILE = {
  key: 'products/abc123/front.webp',
  body: new Uint8Array([1, 2, 3]),
  contentType: 'image/webp',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  aws.seen = { client: null, put: [], del: [] };
  aws.send.mockResolvedValue({});
});

describe('클라이언트를 세울 때', () => {
  it('설정한 지역과 열쇠로 붙는다', () => {
    store();
    expect(aws.seen.client).toMatchObject({
      region: 'ap-northeast-2',
      forcePathStyle: true,
      credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
    });
  });

  it('엔드포인트가 있으면 그곳으로 — MinIO 는 이것이 있어야 한다', () => {
    store({ endpoint: 'http://localhost:9000' });
    expect(aws.seen.client).toMatchObject({ endpoint: 'http://localhost:9000' });
  });

  it('엔드포인트가 없으면 칸을 아예 넣지 않는다 — AWS 기본 엔드포인트를 쓴다', () => {
    /*
     * undefined 를 넘기면 SDK 가 "빈 엔드포인트" 로 읽을 수 있다. 칸이 없어야 SDK 가
     * 지역으로 기본 주소를 만든다.
     */
    store({ endpoint: undefined });
    expect(aws.seen.client).not.toHaveProperty('endpoint');
  });

  it('이름을 밝힌다 — 어느 어댑터가 붙었는지 로그에서 가린다', () => {
    expect(store().name).toBe('s3');
  });
});

describe('올리기', () => {
  it('받은 열쇠·바이트·형식을 그대로 넘긴다', async () => {
    await store().put(FILE);
    expect(aws.seen.put[0]).toMatchObject({
      Bucket: 'plain',
      Key: FILE.key,
      Body: FILE.body,
      ContentType: 'image/webp',
    });
  });

  it('오래 캐시해도 안전하다고 적는다', async () => {
    /*
     * 상품 사진의 키에는 임의 토큰이 들어가 **내용이 바뀌면 키도 바뀐다.** 그러니 영원히
     * 캐시해도 낡은 사진을 보는 일이 없다 — 그 사실을 머리글로 말하지 않으면 손님마다
     * 같은 사진을 매번 다시 받는다.
     */
    await store().put(FILE);
    expect(aws.seen.put[0].CacheControl).toBe('public, max-age=31536000, immutable');
  });

  it('공개 주소와 열쇠를 이어 붙여 돌려준다', async () => {
    const { url } = await store().put(FILE);
    expect(url).toBe('https://cdn.plain.test/products/abc123/front.webp');
  });

  it('설정이 끝 슬래시를 떼 주는 것과 짝이다', async () => {
    /*
     * 주소를 잇는 쪽은 슬래시를 하나 넣기만 한다 — **끝 슬래시를 떼는 일은 설정 쪽이 한다.**
     * 두 쪽 중 하나만 고치면 `https://cdn.plain.test//products/...` 가 DB 에 그대로 저장되고,
     * 올릴 때는 아무 일도 없다. 그래서 짝을 여기서 함께 본다.
     */
    // ProcessEnv 는 NODE_ENV 를 요구한다. 설정 읽기가 보는 것은 S3_* 뿐이다.
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      S3_BUCKET: 'plain',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_PUBLIC_BASE_URL: 'https://cdn.plain.test/',
    };
    const config = readS3Config(env);

    const { url } = await new S3Storage(config!).put(FILE);

    expect(url).toBe('https://cdn.plain.test/products/abc123/front.webp');
  });

  it('넘어지면 PUT_FAILED 로 싸서 던진다 — 502 다', async () => {
    aws.send.mockRejectedValue(new Error('connection reset'));

    const error = await store().put(FILE).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: 'PUT_FAILED', status: 502 });
  });

  it('무엇 때문에 넘어졌는지 함께 싣는다', async () => {
    aws.send.mockRejectedValue(new Error('connection reset'));
    await expect(store().put(FILE)).rejects.toThrow(/connection reset/);
  });

  it('오류가 아닌 것이 올라와도 말이 되게 적는다', async () => {
    // SDK 가 아닌 무엇이 문자열을 던질 수도 있다. 거기서 또 넘어지면 안 된다
    aws.send.mockRejectedValue('그냥 글자');
    await expect(store().put(FILE)).rejects.toThrow(/알 수 없는 오류/);
  });
});

describe('지우기', () => {
  it('그 통의 그 열쇠를 지운다', async () => {
    await store().remove(FILE.key);
    expect(aws.seen.del[0]).toEqual({ Bucket: 'plain', Key: FILE.key });
  });

  it('넘어지면 DELETE_FAILED 로 싸서 던진다 — 올리기와 다른 코드다', async () => {
    /*
     * 올리기와 지우기는 고치는 사람도 다시 할지도 다르다. 한 코드로 묶으면 로그에서
     * 어느 쪽이 안 되는지 가릴 수 없다.
     */
    aws.send.mockRejectedValue(new Error('no such key'));

    const error = await store().remove(FILE.key).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'DELETE_FAILED', status: 502 });
  });
});
