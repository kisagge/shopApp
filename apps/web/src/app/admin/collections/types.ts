/** 기획전 편집 화면의 세 컴포넌트가 함께 쓰는 모양. */

export interface PickedProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly imageUrl: string | null;
  readonly onDisplay: boolean;
}

export interface CollectionItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly tone: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly status: string;
  readonly itemCount: number;
  readonly products: readonly PickedProduct[];
}
