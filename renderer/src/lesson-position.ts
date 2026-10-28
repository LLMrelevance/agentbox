type Position = { left: number; top: number };

export function lessonPosition(previous: Position | null, next: Position | null): Position | null {
  return previous?.left === next?.left && previous?.top === next?.top ? previous : next;
}
