export type OutlineEntityType = 'roadmap' | 'arc' | 'chapter' | 'beat';

function assertNever(value: never): never {
  throw new Error(`Unexpected outline entity type: ${String(value)}`);
}

export function outlineEntityLabel(type: OutlineEntityType): string {
  switch (type) {
    case 'roadmap':
      return 'Roadmap Cerita';
    case 'arc':
      return 'Bagian Cerita';
    case 'chapter':
      return 'Bab';
    case 'beat':
      return 'Adegan';
    default:
      return assertNever(type);
  }
}
