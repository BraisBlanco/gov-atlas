import { describe, expect, it } from 'vitest';

import { niceTicks, scaleMaxOf } from './scale.ts';

describe('niceTicks', () => {
  /**
   * The regression this file exists for: with 22 as the maximum, an earlier version stopped
   * the axis at 20, so Spain's bar ran past the last gridline and past the end of the scale.
   * A bar wider than its own axis overstates the value it encodes.
   */
  it('never ends below the largest value', () => {
    for (let max = 1; max <= 500; max += 1) {
      const ticks = niceTicks(max);
      expect(ticks[ticks.length - 1], `max=${max}`).toBeGreaterThanOrEqual(max);
    }
  });

  it('covers 22 up to 30 in steps of 10', () => {
    expect(niceTicks(22)).toEqual([0, 10, 20, 30]);
  });

  it('starts at zero, because a truncated bar axis distorts every comparison', () => {
    expect(niceTicks(37)[0]).toBe(0);
    expect(niceTicks(0.44)[0]).toBe(0);
  });

  it('uses evenly spaced round steps', () => {
    const ticks = niceTicks(37);
    const steps = ticks.slice(1).map((tick, index) => tick - (ticks[index] as number));
    expect(new Set(steps.map((step) => step.toFixed(6))).size).toBe(1);
  });

  it('handles fractional maxima', () => {
    const ticks = niceTicks(0.44);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0.44);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('degrades safely on empty or invalid input', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(-5)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
  });
});

describe('scaleMaxOf', () => {
  it('never returns a scale smaller than the data', () => {
    expect(scaleMaxOf([0, 10, 20], 22)).toBe(22);
    expect(scaleMaxOf([0, 10, 20, 30], 22)).toBe(30);
  });

  it('never returns zero, so a width calculation cannot divide by it', () => {
    expect(scaleMaxOf([0], 0)).toBeGreaterThan(0);
  });
});
