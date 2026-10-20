// Schedule: Superhuman's snooze picker without the NLP. Presets you arrow
// through, or a time typed in words ("one week", "fri 3pm", "tomorrow at
// noon", read by ../when-words.ts) with a live preview of exactly when the
// item comes due.
//
// An inbox reminder: the existing thread returns without running an agent.

import { useMemo } from 'react';
import type { WorkItem } from '../types';
import { dayAndTime, parseWhen } from '../format';
import { scheduleSubtitle } from '../list-rules';
import { SchedulePicker } from './SchedulePicker';
import { laterPresets, type LaterPreset } from '../later-times';

const presets = laterPresets;

const fmt = (ts: number) => dayAndTime(ts).toUpperCase();

export function Snooze({ item, count = 1, onPick, onNow, onClose }: {
  item: WorkItem;
  count?: number;
  onPick: (ts: number, label: string) => void;
  // Present when the target is already snoozed: "Now" wakes it instead of
  // re-timing it, and sits first so S then Enter is the way back to the inbox.
  onNow?: () => void;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const base: Array<LaterPreset & { now?: boolean }> = presets();
    // "Now" only exists when the target is already scheduled: waking it is not
    // re-timing it, and it sits first so S then Enter is the way back.
    return onNow ? [{ label: 'Now (back to inbox)', ts: 0, now: true }, ...base] : base;
  }, [onNow]);

  return (
    <SchedulePicker<number>
      title="Later"
      subtitle={scheduleSubtitle(item, count)}
      placeholder="Try: 30m, 3h, 8am, tomorrow, next week"
      hintWhenRefused="try 3h, 8am, tomorrow"
      options={options.map((option) => ({
        label: option.label,
        value: option.ts,
        hint: option.now ? '' : fmt(option.ts),
      }))}
      parse={(text) => {
        const when = parseWhen(text);
        return when ? { value: when.ts, label: when.label } : null;
      }}
      previewOf={(ts) => fmt(ts)}
      onChoose={(ts, label) => {
        // 0 is the "Now (back to inbox)" row: waking is not re-timing.
        if (ts === 0 && onNow) onNow();
        else onPick(ts, label);
      }}
      onClose={onClose}
    />
  );
}
