import { describe, expect, it } from 'vitest';

import { equalIntervalBins, rampStepsFor } from './bins.ts';

describe('equalIntervalBins', () => {
  it('has no bins for no data', () => {
    const scale = equalIntervalBins([]);
    expect(scale.bins).toEqual([]);
    expect(scale.indexOf(3)).toBe(-1);
  });

  it('collapses to one bin when every value is the same', () => {
    const scale = equalIntervalBins([17, 17, 17]);
    expect(scale.bins).toEqual([{ min: 17, max: 17 }]);
    expect(scale.indexOf(17)).toBe(0);
  });

  it('cuts an integer range into contiguous integer classes', () => {
    const scale = equalIntervalBins([14, 15, 17, 20, 22, 23]);
    expect(scale.bins).toEqual([
      { min: 14, max: 15 },
      { min: 16, max: 17 },
      { min: 18, max: 19 },
      { min: 20, max: 21 },
      { min: 22, max: 23 },
    ]);
    expect(scale.indexOf(14)).toBe(0);
    expect(scale.indexOf(17)).toBe(1);
    expect(scale.indexOf(23)).toBe(4);
  });

  it('never leaves a gap between one class and the next', () => {
    const scale = equalIntervalBins([3, 4, 5, 6, 7, 8, 9, 26]);
    for (let index = 1; index < scale.bins.length; index += 1) {
      const previous = scale.bins[index - 1]!;
      expect(scale.bins[index]!.min).toBe(previous.max + 1);
    }
  });

  it('uses fewer classes than asked when the range is narrower', () => {
    const scale = equalIntervalBins([4, 5, 6]);
    expect(scale.bins).toEqual([
      { min: 4, max: 4 },
      { min: 5, max: 5 },
      { min: 6, max: 6 },
    ]);
  });

  /**
   * The top class must contain the maximum. Rounding the last edge *down* is the
   * tempting bug: it leaves the largest country outside every class, which on a map
   * reads as "no data" for the very value the map is about.
   */
  it('always contains the maximum in the top class', () => {
    for (const values of [[1, 9], [0, 7], [12, 13, 41], [2, 2, 2, 33]]) {
      const scale = equalIntervalBins(values);
      const max = Math.max(...values);
      const top = scale.bins[scale.bins.length - 1]!;
      expect(top.max).toBeGreaterThanOrEqual(max);
      expect(scale.indexOf(max)).toBe(scale.bins.length - 1);
    }
  });

  /**
   * The real six-country spread (12…22) is what surfaced this: equal widths of 3 over a
   * span of 11 produce a fifth class starting at 24, above every observed value.
   */
  it('never emits a class that sits entirely above the data', () => {
    const scale = equalIntervalBins([12, 12, 15, 16, 19, 22]);
    expect(scale.bins).toEqual([
      { min: 12, max: 14 },
      { min: 15, max: 17 },
      { min: 18, max: 20 },
      { min: 21, max: 23 },
    ]);
    for (const bin of scale.bins) expect(bin.min).toBeLessThanOrEqual(22);
  });

  it('bins fractional metrics at the requested precision', () => {
    const scale = equalIntervalBins([0.31, 0.45, 0.72, 1.02], { decimals: 2 });
    expect(scale.bins.length).toBeGreaterThan(1);
    expect(scale.bins[0]!.min).toBeCloseTo(0.31, 5);
    expect(scale.bins[scale.bins.length - 1]!.max).toBeGreaterThanOrEqual(1.02);
    expect(scale.indexOf(1.02)).toBe(scale.bins.length - 1);
  });

  it('clamps values outside the observed range', () => {
    const scale = equalIntervalBins([10, 20]);
    expect(scale.indexOf(-5)).toBe(0);
    expect(scale.indexOf(999)).toBe(scale.bins.length - 1);
  });
});

describe('rampStepsFor', () => {
  it('returns one step per class, in ascending order, from the validated five', () => {
    for (let count = 0; count <= 5; count += 1) {
      const steps = rampStepsFor(count);
      expect(steps).toHaveLength(count);
      expect([...steps].sort((a, b) => a - b)).toEqual(steps);
      for (const step of steps) expect(step).toBeGreaterThanOrEqual(1);
      for (const step of steps) expect(step).toBeLessThanOrEqual(5);
    }
  });

  it('keeps the darkest step for the top class whenever there is more than one', () => {
    for (let count = 2; count <= 5; count += 1) {
      expect(rampStepsFor(count).at(-1)).toBe(5);
      expect(rampStepsFor(count).at(0)).toBe(1);
    }
  });
});
