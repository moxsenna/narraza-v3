type FactListSource = {
  readonly id: string;
  readonly canonStatus: string;
};

export type FactListItemViewModel = {
  readonly id: string;
  readonly label: string;
  readonly canonStatus: string;
};

export function toFactListItemViewModel(
  fact: FactListSource,
  position: number,
): FactListItemViewModel {
  return {
    id: fact.id,
    label: `Fakta cerita ${position + 1}`,
    canonStatus: fact.canonStatus,
  };
}
