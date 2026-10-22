/** A box that opens holding words opens with the caret after them: Chrome's focus() leaves it where they begin. */
export function focusAtEnd(box: { focus: () => void; value: string; setSelectionRange: (from: number, to: number) => void } | null) {
  if (!box) return;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}
