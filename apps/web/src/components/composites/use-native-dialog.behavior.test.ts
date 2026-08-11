import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RefObject } from 'react';
import type { useNativeDialog as UseNativeDialog } from './use-native-dialog';

type Effect = () => void | (() => void);
type EffectSlot = {
  cleanup: (() => void) | undefined;
  deps: readonly unknown[] | undefined;
};
type HookProps = Parameters<typeof UseNativeDialog>[0];

let activeHarness: HookHarness | null = null;

function setActiveHarness(harness: HookHarness | null) {
  activeHarness = harness;
}

vi.mock('react', () => ({
  useEffect(effect: Effect, deps?: readonly unknown[]) {
    if (!activeHarness) throw new Error('useEffect called outside hook harness');
    activeHarness.registerEffect(effect, deps);
  },
  useRef<T>(initialValue: T) {
    if (!activeHarness) throw new Error('useRef called outside hook harness');
    return activeHarness.useRef(initialValue);
  },
}));

class FakeElement {
  focusCalls = 0;

  focus() {
    this.focusCalls += 1;
    fakeDocument.activeElement = this;
  }
}

class FakeDialog extends FakeElement {
  open = false;
  showModalCalls = 0;
  closeCalls = 0;
  initialFocus: FakeElement | null = null;
  queuedCloseEvents: Array<() => void> = [];
  private listeners = new Map<string, Set<(event: Event) => void>>();

  showModal() {
    if (this.open) throw new Error('InvalidStateError: dialog is already open');
    this.open = true;
    this.showModalCalls += 1;
  }

  close() {
    if (!this.open) throw new Error('InvalidStateError: dialog is not open');
    this.open = false;
    this.closeCalls += 1;
    this.queuedCloseEvents.push(() => this.dispatch('close'));
  }

  externalClose() {
    this.open = false;
    this.dispatch('close');
  }

  cancel() {
    const event = new Event('cancel', { cancelable: true });
    this.dispatchEvent(event);
    return event;
  }

  flushNextCloseEvent() {
    const dispatch = this.queuedCloseEvents.shift();
    if (!dispatch) throw new Error('No queued close event');
    dispatch();
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  querySelector() {
    return this.initialFocus;
  }

  private dispatch(type: string) {
    this.dispatchEvent(new Event(type));
  }

  private dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }
}

const fakeDocument: { activeElement: FakeElement | null } = { activeElement: null };
const microtasks: Array<() => void> = [];

class HookHarness {
  private refs: Array<{ current: unknown }> = [];
  private effects: EffectSlot[] = [];
  private refIndex = 0;
  private effectIndex = 0;
  private pendingEffects: Array<{
    index: number;
    effect: Effect;
    deps: readonly unknown[] | undefined;
  }> = [];
  private dialogRef: RefObject<HTMLDialogElement | null> | null = null;

  constructor(
    private readonly hook: typeof UseNativeDialog,
    readonly dialog: FakeDialog,
  ) {}

  render(props: HookProps) {
    this.refIndex = 0;
    this.effectIndex = 0;
    this.pendingEffects = [];
    setActiveHarness(this);
    this.dialogRef = this.hook(props);
    setActiveHarness(null);
    const dialogRef = this.dialogRef;
    if (!dialogRef.current) {
      (dialogRef as { current: HTMLDialogElement | null }).current =
        this.dialog as unknown as HTMLDialogElement;
    }
    this.commitEffects();
  }

  useRef<T>(initialValue: T) {
    const index = this.refIndex++;
    const ref = this.refs[index] ?? { current: initialValue };
    this.refs[index] = ref;
    return ref as { current: T };
  }

  registerEffect(effect: Effect, deps?: readonly unknown[]) {
    const index = this.effectIndex++;
    const previous = this.effects[index];
    const changed =
      !previous ||
      !deps ||
      !previous.deps ||
      deps.length !== previous.deps.length ||
      deps.some((dependency, dependencyIndex) =>
        !Object.is(dependency, previous.deps?.[dependencyIndex]),
      );
    if (changed) this.pendingEffects.push({ index, effect, deps });
  }

  unmount() {
    for (const effect of this.effects) effect.cleanup?.();
    this.effects = [];
    if (this.dialogRef) (this.dialogRef as { current: HTMLDialogElement | null }).current = null;
  }

  private commitEffects() {
    for (const pending of this.pendingEffects) {
      this.effects[pending.index]?.cleanup?.();
      const cleanup = pending.effect();
      this.effects[pending.index] = {
        cleanup: typeof cleanup === 'function' ? cleanup : undefined,
        deps: pending.deps,
      };
    }
  }
}

let useNativeDialog: typeof UseNativeDialog;

beforeAll(async () => {
  ({ useNativeDialog } = await import('./use-native-dialog'));
});

beforeEach(() => {
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('queueMicrotask', (callback: () => void) => microtasks.push(callback));
  fakeDocument.activeElement = null;
  microtasks.length = 0;
});

afterEach(() => {
  activeHarness = null;
  vi.unstubAllGlobals();
});

function flushMicrotasks() {
  while (microtasks.length > 0) microtasks.shift()?.();
}

function setup(open = false, onOpenChange = vi.fn()) {
  const dialog = new FakeDialog();
  const harness = new HookHarness(useNativeDialog, dialog);
  harness.render({ open, onOpenChange });
  return { dialog, harness, onOpenChange };
}

describe('useNativeDialog behavior', () => {
  test('repeated controlled values avoid invalid native method calls', () => {
    const { dialog, harness, onOpenChange } = setup(false);

    harness.render({ open: false, onOpenChange });
    harness.render({ open: true, onOpenChange });
    harness.render({ open: true, onOpenChange });
    harness.render({ open: false, onOpenChange });
    harness.render({ open: false, onOpenChange });

    expect(dialog.showModalCalls).toBe(1);
    expect(dialog.closeCalls).toBe(1);
  });

  test('cancel prevents native default and requests one controlled close', () => {
    const { dialog, onOpenChange } = setup(true);

    const event = dialog.cancel();

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog.open).toBe(true);
  });

  test('external native close synchronizes controlled state and restores focus', () => {
    const origin = new FakeElement();
    origin.focus();
    const { dialog, onOpenChange } = setup(true);

    dialog.externalClose();

    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(origin.focusCalls).toBe(2);
  });

  test('programmatic close restores focus without recursive state request', () => {
    const origin = new FakeElement();
    origin.focus();
    const { dialog, harness, onOpenChange } = setup(true);

    harness.render({ open: false, onOpenChange });
    dialog.flushNextCloseEvent();

    expect(dialog.closeCalls).toBe(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(origin.focusCalls).toBe(2);
  });

  test('queued prior close cannot close or update a rapidly reopened cycle', () => {
    const firstOrigin = new FakeElement();
    const secondOrigin = new FakeElement();
    const initialFocus = new FakeElement();
    const onOpenChange = vi.fn();
    const dialog = new FakeDialog();
    dialog.initialFocus = initialFocus;
    const harness = new HookHarness(useNativeDialog, dialog);

    firstOrigin.focus();
    harness.render({ open: true, onOpenChange });
    flushMicrotasks();
    harness.render({ open: false, onOpenChange });
    secondOrigin.focus();
    harness.render({ open: true, onOpenChange });
    flushMicrotasks();
    dialog.flushNextCloseEvent();

    expect(dialog.open).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fakeDocument.activeElement).toBe(initialFocus);
    expect(firstOrigin.focusCalls).toBe(2);

    dialog.externalClose();
    expect(secondOrigin.focusCalls).toBe(2);
  });

  test('latest callback receives native events after callback update', () => {
    const staleCallback = vi.fn();
    const latestCallback = vi.fn();
    const { dialog, harness } = setup(true, staleCallback);

    harness.render({ open: true, onOpenChange: latestCallback });
    dialog.cancel();

    expect(staleCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledOnce();
    expect(latestCallback).toHaveBeenCalledWith(false);
  });

  test('queued initial focus work is safe after unmount', () => {
    const initialFocus = new FakeElement();
    const dialog = new FakeDialog();
    dialog.initialFocus = initialFocus;
    const harness = new HookHarness(useNativeDialog, dialog);

    harness.render({ open: true, onOpenChange: vi.fn() });
    harness.unmount();

    expect(() => flushMicrotasks()).not.toThrow();
    expect(initialFocus.focusCalls).toBe(0);
  });
});
