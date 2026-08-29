export interface QueuedInputEvent {
  column: number;
  type: 'down' | 'up';
  timestamp: number;
}

export class LowLatencyInputManager {
  private keyMap = new Map<string, number>();
  private inputQueue: QueuedInputEvent[] = [];
  private keyState: boolean[];
  private attached = false;

  private readonly onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const col = this.keyMap.get(e.code);
    if (col === undefined) return;
    e.preventDefault();
    this.keyState[col] = true;
    this.inputQueue.push({ column: col, type: 'down', timestamp: performance.now() });
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    const col = this.keyMap.get(e.code);
    if (col === undefined) return;
    e.preventDefault();
    this.keyState[col] = false;
    this.inputQueue.push({ column: col, type: 'up', timestamp: performance.now() });
  };

  constructor(keyCount: number, customBinds: string[]) {
    this.keyState = new Array(keyCount).fill(false);
    customBinds.forEach((code, idx) => this.keyMap.set(code, idx));
  }

  public attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.onDown, { capture: true, passive: false });
    window.addEventListener('keyup', this.onUp, { capture: true, passive: false });
    this.attached = true;
  }

  public detach(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.onDown, true);
    window.removeEventListener('keyup', this.onUp, true);
    this.attached = false;
    this.inputQueue = [];
  }

  public drainEvents(): QueuedInputEvent[] {
    const events = this.inputQueue;
    this.inputQueue = [];
    return events;
  }

  public isColumnPressed(column: number): boolean {
    return this.keyState[column] === true;
  }

  public get pressed(): boolean[] {
    return this.keyState;
  }
}
