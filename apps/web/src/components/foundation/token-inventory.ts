export type TokenCategory = Readonly<{
  category:
    | 'color-foundation'
    | 'color-semantic'
    | 'typography'
    | 'spacing'
    | 'container'
    | 'radius'
    | 'elevation'
    | 'motion'
    | 'breakpoint'
    | 'z-index'
    | 'focus'
    | 'disabled';
  names: readonly string[];
}>;

export const TOKEN_CATEGORIES = [
  {
    category: 'color-foundation',
    names: [
      'brand-50',
      'brand-100',
      'brand-200',
      'brand-300',
      'brand-400',
      'brand-500',
      'brand-600',
      'brand-700',
      'brand-800',
      'brand-900',
      'ink-950',
      'ink-800',
      'ink-700',
      'ink-500',
      'ink-300',
      'line-200',
      'line-100',
      'surface',
      'canvas',
      'surface-soft',
      'success-700',
      'success-50',
      'warning-700',
      'warning-50',
      'danger-700',
      'danger-50',
      'info-700',
      'info-50',
      'amber-500',
      'plum-600',
    ],
  },
  {
    category: 'color-semantic',
    names: [
      'brand-soft',
      'brand-strong',
      'brand-ink',
      'text-primary',
      'text-secondary',
      'text-muted',
      'border-default',
      'border-active',
      'action-primary',
      'action-primary-hover',
      'action-primary-active',
      'status-success',
      'status-success-soft',
      'status-warning',
      'status-warning-soft',
      'status-danger',
      'status-danger-soft',
      'status-info',
      'status-info-soft',
    ],
  },
  { category: 'typography', names: ['sans', 'serif'] },
  {
    category: 'spacing',
    names: [
      'space-1',
      'space-2',
      'space-3',
      'space-4',
      'space-5',
      'space-6',
      'space-8',
      'space-10',
      'space-12',
      'space-16',
      'space-20',
      'space-24',
    ],
  },
  { category: 'container', names: ['marketing', 'product', 'form', 'prose', 'panel'] },
  { category: 'radius', names: ['sm', 'md', 'lg', 'xl', 'pill'] },
  { category: 'elevation', names: ['sm', 'md', 'lg'] },
  { category: 'motion', names: ['micro', 'panel', 'modal', 'ease-in', 'ease-out'] },
  { category: 'breakpoint', names: ['sm', 'md', 'lg', 'xl', '2xl'] },
  { category: 'z-index', names: ['header', 'overlay', 'dialog'] },
  { category: 'focus', names: ['ring-color', 'ring-width', 'ring-offset'] },
  { category: 'disabled', names: ['opacity'] },
] as const satisfies readonly TokenCategory[];
