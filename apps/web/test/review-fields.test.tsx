// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SIZE_FIT, RATING_MAX, MAX_IMAGES_PER_REVIEW, MAX_IMAGE_BYTES } from '@shop/core';
import {
  BodyFields, ContentField, PhotoField, RatingField, SizeFitField,
} from '~/components/review-fields';

/**
 * 후기의 칸들 — **쓰기와 고치기가 함께 쓰는 자리.**
 *
 * 320줄인데 전용 검사가 없었다. 고치는 폼 검사가 지나가며 밟기는 했지만, 칸 자체의 약속은 아무도
 * 못 박지 않았다 — 별점이 라디오인지, 상한이 core 의 수를 보는지, 사진 상한이 **이미 올라간 것과
 * 함께** 세는지.
 *
 * 마지막이 특히 조용하다: 따로 세면 "다섯 장까지" 가 어느 쪽 얘기인지 알 수 없고, 고치는 사람은
 * 다섯 장을 더 올릴 수 있다고 믿는다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * blob: 주소를 만드는 두 함수가 jsdom 에 없다. **URL 자체를 바꿔 끼우면 안 된다** — next/image 가
   * `new URL(...)` 로 주소를 푸는데, 흉내 낸 객체는 생성자가 아니어서 사진이 있는 자리가 통째로 터진다
   * (여기서 한 번 당했다). 없는 두 함수만 덧붙인다.
   */
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

/**
 * **별점은 라디오다.** 별 모양 단추로 만들면 키보드로 못 고르고, 낭독기는 "★" 를 읽을 말이 없다.
 */
describe('별점', () => {
  it('core 가 정한 수만큼 있다', () => {
    render(<RatingField value={0} onChange={() => {}} />);

    expect(screen.getAllByRole('radio')).toHaveLength(RATING_MAX);
  });

  it('별마다 몇 점인지 글자로 읽힌다 — 별 모양은 낭독기에서 숨긴다', () => {
    render(<RatingField value={0} onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: '3점' })).toBeDefined();
  });

  it('고른 점수만 눌려 있다', () => {
    render(<RatingField value={4} onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: '4점' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '3점' })).not.toBeChecked();
  });

  it('누르면 그 점수를 알린다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RatingField value={0} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: '5점' }));

    expect(onChange).toHaveBeenCalledWith(5);
  });

  /** 필수 칸임을 색(*)만으로 말하면 색을 못 보는 사람에게는 표시가 없는 것과 같다 */
  it('필수라는 것을 글자로도 말한다', () => {
    render(<RatingField value={0} onChange={() => {}} />);

    expect(screen.getByRole('group', { name: /필수/ })).toBeDefined();
  });

  /** 한 폼에 별점이 둘일 수 있다(쓰기·고치기가 한 화면에 있을 때) — 이름이 같으면 서로 지운다 */
  it('이름을 받아 쓸 수 있다', () => {
    render(<RatingField value={0} onChange={() => {}} name="editRating" />);

    expect(screen.getAllByRole<HTMLInputElement>('radio')[0]!.name).toBe('editRating');
  });
});

describe('후기 본문', () => {
  it('지금 몇 자인지 센다 — 열 자가 기준이다', () => {
    render(<ContentField value="두껍고 따뜻" onChange={() => {}} />);

    expect(screen.getByText('6')).toBeDefined();
    expect(screen.getByText(/10자 이상/)).toBeDefined();
  });

  /** 공백으로 채운 글은 후기가 아니다 — 보내는 쪽과 같은 셈을 보여 준다 */
  it('앞뒤 공백은 세지 않는다', () => {
    render(<ContentField value="   여섯 자   " onChange={() => {}} />);

    // '여섯 자' = 네 글자(가운데 공백 포함)
    expect(screen.getByText('4')).toBeDefined();
  });

  it('적으면 그대로 알린다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ContentField value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), '좋');

    expect(onChange).toHaveBeenCalledWith('좋');
  });

  it('필수라는 것을 글자로도 말한다', () => {
    render(<ContentField value="" onChange={() => {}} />);

    expect(screen.getByLabelText(/필수/)).toBeDefined();
  });
});

/**
 * **사진 한도는 후기 한 건의 사진 수다.** 이미 올라간 것과 새로 고른 것을 함께 센다 — 따로 세면
 * "다섯 장까지" 가 어느 쪽 얘기인지 알 수 없다.
 */
describe('사진', () => {
  const file = (name: string, size = 1_000) => {
    const f = new File(['x'], name, { type: 'image/webp' });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  const photo = (id: string) => ({ id, url: `/i/${id}.webp`, blurDataUrl: null });

  it('한도를 core 의 수로 적는다 — 글자로 박아 두면 바꿀 때 이 줄만 거짓이 된다', () => {
    render(<PhotoField files={[]} onFiles={() => {}} onError={() => {}} />);

    expect(screen.getByText(new RegExp(`최대 ${MAX_IMAGES_PER_REVIEW}장`))).toBeDefined();
  });

  it('고른 사진마다 미리보기와 빼는 단추를 둔다', () => {
    render(<PhotoField files={[file('a.webp')]} onFiles={() => {}} onError={() => {}} />);

    expect(screen.getByAltText('고른 사진 1')).toBeDefined();
    expect(screen.getByRole('button', { name: '고른 사진 1 빼기' })).toBeDefined();
  });

  it('빼면 그 장만 빠진 목록을 알린다', async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(<PhotoField files={[file('a.webp'), file('b.webp')]} onFiles={onFiles} onError={() => {}} />);

    await user.click(screen.getByRole('button', { name: '고른 사진 1 빼기' }));

    expect(onFiles.mock.calls[0]![0]).toHaveLength(1);
    expect((onFiles.mock.calls[0]![0] as File[])[0]!.name).toBe('b.webp');
  });

  it('한도를 넘기면 까닭을 말하고 받지 않는다', async () => {
    const onError = vi.fn();
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(<PhotoField files={[]} onFiles={onFiles} onError={onError} />);

    await user.upload(
      screen.getByLabelText(/사진/),
      Array.from({ length: MAX_IMAGES_PER_REVIEW + 1 }, (_, i) => file(`p${i}.webp`)),
    );

    expect(onError).toHaveBeenCalledWith(`사진은 ${MAX_IMAGES_PER_REVIEW}장까지 올릴 수 있습니다.`);
    expect(onFiles).not.toHaveBeenCalled();
  });

  /** 이것이 조용히 틀리던 자리다 — 이미 올라간 넷에 둘을 더하면 여섯이다 */
  it('이미 올라간 사진과 함께 센다', async () => {
    const onError = vi.fn();
    const onFiles = vi.fn();
    const user = userEvent.setup();
    const existing = Array.from({ length: MAX_IMAGES_PER_REVIEW - 1 }, (_, i) => photo(`e${i}`));
    render(<PhotoField files={[]} existing={existing} onFiles={onFiles} onError={onError} />);

    // 올라간 사진이 있으면 "사진" 이 여러 곳에 붙는다(남기기 체크박스) — 올리는 칸을 이름으로 집는다
    await user.upload(screen.getByLabelText('사진 더 올리기 (선택)'), [file('a.webp'), file('b.webp')]);

    expect(onError).toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('너무 큰 사진은 올리기 전에 막는다 — 올려 보고 거절당하면 시간만 쓴다', async () => {
    const onError = vi.fn();
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(<PhotoField files={[]} onFiles={onFiles} onError={onError} />);

    await user.upload(screen.getByLabelText(/사진/), file('big.webp', MAX_IMAGE_BYTES + 1));

    expect(onError).toHaveBeenCalledWith('사진 한 장은 5MB 를 넘을 수 없습니다.');
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('받아들였으면 앞서 띄운 까닭을 거둔다', async () => {
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<PhotoField files={[]} onFiles={() => {}} onError={onError} />);

    await user.upload(screen.getByLabelText(/사진/), file('a.webp'));

    expect(onError).toHaveBeenCalledWith(null);
  });

  /**
   * 고칠 때는 이미 올라간 사진과 새로 고른 사진이 **한 자리에** 있어야 한다. 남길지 말지는
   * 체크박스로 받는다 — 지우는 단추로 두면 잘못 눌렀을 때 되돌릴 길이 저장 취소밖에 없다.
   */
  it('올라간 사진은 남길지 고르는 체크박스가 된다', () => {
    render(
      <PhotoField files={[]} existing={[photo('e1'), photo('e2')]} onFiles={() => {}} onError={() => {}} />,
    );

    expect(screen.getByRole('checkbox', { name: '사진 1 남기기' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '사진 2 남기기' })).toBeChecked();
  });

  it('올라간 사진이 있으면 "더 올리기" 라고 말한다', () => {
    render(<PhotoField files={[]} existing={[photo('e1')]} onFiles={() => {}} onError={() => {}} />);

    expect(screen.getByLabelText('사진 더 올리기 (선택)')).toBeDefined();
  });

  it('올라간 사진이 없으면 그냥 "사진" 이다', () => {
    render(<PhotoField files={[]} onFiles={() => {}} onError={() => {}} />);

    expect(screen.getByLabelText('사진 (선택)')).toBeDefined();
  });
});

describe('사이즈 감상', () => {
  it.each([...SIZE_FIT])('%s 를 고를 수 있다', (fit) => {
    render(<SizeFitField value="" onChange={() => {}} />);

    expect(screen.getAllByRole('radio')).toHaveLength(SIZE_FIT.length);
    expect(fit).toBeTruthy();
  });

  it('사람의 말로 적는다', () => {
    render(<SizeFitField value="" onChange={() => {}} />);

    for (const label of ['작아요', '정사이즈', '커요']) {
      expect(screen.getByRole('radio', { name: label })).toBeDefined();
    }
  });

  it('고른 것만 눌려 있다', () => {
    render(<SizeFitField value="TRUE" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: '정사이즈' })).toBeChecked();
  });

  /** 선택 사항이다 — 아무것도 안 고른 채로 둘 수 있어야 한다 */
  it('안 고른 채로 둘 수 있다', () => {
    render(<SizeFitField value="" onChange={() => {}} />);

    expect(screen.getAllByRole<HTMLInputElement>('radio').some((r) => r.checked)).toBe(false);
  });
});

describe('체형', () => {
  it('키와 몸무게를 각각 받는다', () => {
    render(<BodyFields height="" weight="" onHeight={() => {}} onWeight={() => {}} />);

    expect(screen.getByLabelText('키 (cm)')).toBeDefined();
    expect(screen.getByLabelText('몸무게 (kg)')).toBeDefined();
  });

  /** 사람이 있을 수 없는 값을 적으면 서버가 거절한다 — 그 전에 칸이 막는다 */
  it('있을 수 있는 범위를 칸이 들고 있다', () => {
    render(<BodyFields height="" weight="" onHeight={() => {}} onWeight={() => {}} />);

    const height = screen.getByLabelText<HTMLInputElement>('키 (cm)');
    const weight = screen.getByLabelText<HTMLInputElement>('몸무게 (kg)');
    expect([height.min, height.max]).toEqual(['100', '250']);
    expect([weight.min, weight.max]).toEqual(['20', '300']);
  });

  it('숫자 자판을 띄운다 — 폰에서 글자 자판이 뜨면 적기 어렵다', () => {
    render(<BodyFields height="" weight="" onHeight={() => {}} onWeight={() => {}} />);

    expect(screen.getByLabelText('키 (cm)').getAttribute('inputMode')).toBe('numeric');
  });

  it('적으면 그대로 알린다', async () => {
    const onHeight = vi.fn();
    const user = userEvent.setup();
    render(<BodyFields height="" weight="" onHeight={onHeight} onWeight={() => {}} />);

    await user.type(screen.getByLabelText('키 (cm)'), '7');

    expect(onHeight).toHaveBeenCalledWith('7');
  });

  it('선택 사항이라고 적는다', () => {
    render(<BodyFields height="" weight="" onHeight={() => {}} onWeight={() => {}} />);

    expect(screen.getByRole('group', { name: /선택/ })).toBeDefined();
  });
});
