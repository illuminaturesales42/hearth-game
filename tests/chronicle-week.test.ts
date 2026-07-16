import { describe, expect, it } from 'vitest';
import { composeWeek } from '../src/core/chronicle';
import type { ChronicleEntry } from '../src/core/types';

const entry = (day: string, streak: number, stage = 2): ChronicleEntry => ({ day, text: 'a day', stage, streak });

describe('weekly reflection digest', () => {
  it('needs at least two days before it reflects', () => {
    expect(composeWeek([])).toBeNull();
    expect(composeWeek([entry('2026-07-14', 1)])).toBeNull();
  });

  it('is deterministic and counts up to the last seven days', () => {
    const days = Array.from({ length: 9 }, (_, i) => entry(`2026-07-${String(20 - i).padStart(2, '0')}`, 9 - i, 3));
    const a = composeWeek(days);
    const b = composeWeek(days);
    expect(a).toEqual(b);
    expect(a?.days).toBe(7); // capped at a week even with more entries
    expect(a?.title).toBe('Your week in Emberhollow');
    expect(a?.text).toContain('7 of them');
  });

  it('celebrates a kept streak when one is present in the window', () => {
    const d = [entry('2026-07-14', 5), entry('2026-07-13', 4)];
    expect(composeWeek(d)?.text).toContain('5 days');
  });
});
