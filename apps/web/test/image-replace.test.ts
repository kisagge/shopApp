import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ImageError } from '@shop/core';

/**
 * 사진 한 장을 갈아 끼우는 순서.
 *
 * **네 자리가 같은 순서를 각자 적고 있었다** — 상품 사진·브랜드 로고·배너·기획전.
 * 그중 배너와 기획전은 **가운데가 실패했을 때 되돌리지 않았다**: 올리기는 끝났는데
 * 적기가 넘어지면 아무도 가리키지 않는 파일이 저장소에 남는다. 순서가 한 곳에 모였으니
 * 여기서 한 번 확인한다 — 네 화면이 같은 답을 받는다.
 */

const { replaceImage } = await import('~/lib/images/upload-files');
const { setStorage } = await import('~/lib/storage');

/** 진짜 사진. 만들어 낸 헤더로는 다듬기가 되지 않는다. */
const png = async (): Promise<{ bytes: Uint8Array; declaredType: string }> => ({
  bytes: new Uint8Array(
    await sharp({ create: { width: 40, height: 40, channels: 3, background: '#888' } })
      .png()
      .toBuffer(),
  ),
  declaredType: 'image/png',
});

/** 저장소에 올라간 키 — 되돌릴 때 그 키를 지우는지 보려면 손에 들고 있어야 한다 */
const putKeys: string[] = [];
const put = vi.fn(async ({ key }: { key: string }) => {
  putKeys.push(key);
  return { url: `https://cdn.test/${key}` };
});
const remove = vi.fn(async () => {});

/** 어느 화면이 부르든 같은 모양 — 키는 부르는 쪽이 정한다 */
const keyFor = (contentType: string, token: string) =>
  `banners/b-1/${token}.${contentType === 'image/png' ? 'png' : 'jpg'}`;

beforeEach(() => {
  vi.clearAllMocks();
  putKeys.length = 0;
  setStorage({ name: 'fake', put, remove });
});

describe('갈아 끼우기', () => {
  it('올린 것을 적어 주고, 적은 값을 그대로 돌려준다', async () => {
    const written = await replaceImage({
      file: await png(),
      keyFor,
      tag: 'banners',
      previousKey: null,
      write: async ({ url, key, blurDataUrl }) => ({ url, key, blurDataUrl }),
    });

    expect(put).toHaveBeenCalledTimes(1);
    expect(written.key).toMatch(/^banners\/b-1\/.+\.png$/);
    expect(written.url).toBe(`https://cdn.test/${written.key}`);
    // 사진이 도착하기 전 깔 자리표시도 같은 한 번에 만든다
    expect(written.blurDataUrl).toBeTruthy();
  });

  it('옛 파일은 **적은 뒤에** 지운다 — 먼저 지우면 적기가 실패했을 때 깨진 사진이 남는다', async () => {
    const order: string[] = [];
    remove.mockImplementation(async () => { order.push('remove'); });

    await replaceImage({
      file: await png(),
      keyFor,
      tag: 'banners',
      previousKey: 'banners/b-1/old.png',
      write: async () => { order.push('write'); return null; },
    });

    expect(order).toEqual(['write', 'remove']);
    expect(remove).toHaveBeenCalledWith('banners/b-1/old.png');
  });

  it('적기가 실패하면 방금 올린 것을 지우고, 옛 파일은 건드리지 않는다', async () => {
    // 배너와 기획전에 없던 되돌리기다 — 적기가 넘어지면 주인 없는 파일이 남았다
    await expect(
      replaceImage({
        file: await png(),
        keyFor,
        tag: 'banners',
        previousKey: 'banners/b-1/old.png',
        write: async () => { throw new Error('db down'); },
      }),
    ).rejects.toThrow('db down');

    expect(putKeys, '올리기까지는 끝났어야 되돌릴 것이 있다').toHaveLength(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(putKeys[0]);
    expect(remove).not.toHaveBeenCalledWith('banners/b-1/old.png');
  });

  it('처음 올리는 것이면 지울 옛것이 없다', async () => {
    await replaceImage({
      file: await png(), keyFor, tag: 'product-image', previousKey: null,
      write: async () => null,
    });

    expect(remove).not.toHaveBeenCalled();
  });

  it('이미지가 아니면 저장소를 건드리지도 않는다', async () => {
    const write = vi.fn();

    await expect(
      replaceImage({
        file: { bytes: new Uint8Array([1, 2, 3]), declaredType: 'image/png' },
        keyFor, tag: 'banners', previousKey: null, write,
      }),
    ).rejects.toBeInstanceOf(ImageError);

    expect(put).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('지우기가 실패해도 갈아 끼운 것은 그대로다 — 남은 파일은 눈에 보이는 피해가 없다', async () => {
    remove.mockRejectedValue(new Error('저장소가 안 열린다'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const written = await replaceImage({
      file: await png(), keyFor, tag: 'banners', previousKey: 'banners/b-1/old.png',
      write: async ({ url }) => url,
    });

    expect(written).toMatch(/^https:\/\/cdn\.test\//);
    expect(error, '조용히 삼키면 고아 파일이 쌓이는 것을 아무도 모른다').toHaveBeenCalled();
  });
});

/**
 * 저장소로 가는 문은 하나다.
 *
 * 네 화면이 각자 `getStorage()` 를 열어 올리고 지우던 때에는, 되돌리기가 있는 곳과
 * 없는 곳이 갈렸다. 다섯 번째 화면이 또 자기 문을 내면 같은 일이 반복된다.
 */
const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.ts') || name.endsWith('.tsx') ? [full] : [];
  });
}

/** 저장소를 손에 쥐어도 되는 곳 — 어댑터 자신과, 올리기·되돌리기를 맡은 한 파일 */
const DOORKEEPERS = ['lib/storage/index.ts', 'lib/images/upload-files.ts'];

describe('저장소를 여는 곳', () => {
  it('올리고 지우는 길은 upload-files 하나다', () => {
    const offenders = walk(SRC)
      .map((path) => ({ path: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') }))
      .filter((f) => !DOORKEEPERS.includes(f.path))
      .filter((f) => /getStorage\(\)/.test(f.source))
      .map((f) => f.path);

    expect(
      offenders,
      `저장소를 직접 열었다:\n${offenders.join('\n')}\n` +
        'uploadImageFiles / replaceImage / discardImageKeys 를 쓰면 된다 — ' +
        '되돌리기와 로그가 그쪽에만 있다.',
    ).toEqual([]);
  });
});
