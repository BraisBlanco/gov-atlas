import { describe, expect, it } from 'vitest';

import { dayAfter, dayBefore, dayNumber, onOrBefore } from '../lib/dates.ts';

/**
 * Date arithmetic is the one place a timeline can be wrong by a day without looking wrong.
 * Month ends, leap years and year boundaries are pinned here so a step never lands on the
 * day before the decree that caused it.
 */

describe('dayAfter', () => {
  it('crosses a month end', () => {
    expect(dayAfter('2010-10-20')).toBe('2010-10-21');
    expect(dayAfter('2009-04-30')).toBe('2009-05-01');
  });

  it('crosses a year end', () => {
    expect(dayAfter('2011-12-31')).toBe('2012-01-01');
  });

  it('handles a leap day and the year that lacks one', () => {
    expect(dayAfter('2024-02-28')).toBe('2024-02-29');
    expect(dayAfter('2024-02-29')).toBe('2024-03-01');
    expect(dayAfter('2023-02-28')).toBe('2023-03-01');
    // 1900 is not a leap year; 2000 is. The rule most hand-rolled date maths gets wrong.
    expect(dayAfter('1900-02-28')).toBe('1900-03-01');
    expect(dayAfter('2000-02-28')).toBe('2000-02-29');
  });
});

describe('dayBefore', () => {
  it('crosses a month and year start', () => {
    expect(dayBefore('2009-04-07')).toBe('2009-04-06');
    expect(dayBefore('2020-01-01')).toBe('2019-12-31');
    expect(dayBefore('2024-03-01')).toBe('2024-02-29');
  });

  it('round-trips with dayAfter', () => {
    for (const date of ['1996-05-06', '2000-04-28', '2008-04-14', '2023-12-29']) {
      expect(dayBefore(dayAfter(date))).toBe(date);
    }
  });
});

describe('dayNumber', () => {
  it('is zero at the epoch and increases by one per day', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
  });

  it('measures elapsed days, so equal spans get equal width', () => {
    // The whole point of a linear time axis: a 29-day span and a 28-day span differ.
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-01')).toBe(29);
    expect(dayNumber('2023-03-01') - dayNumber('2023-02-01')).toBe(28);
  });

  it('spans the Spanish series without drift', () => {
    // 1996-05-06 to 2023-12-29, checked against an independent count of days.
    expect(dayNumber('2023-12-29') - dayNumber('1996-05-06')).toBe(10_098);
  });
});

describe('onOrBefore', () => {
  it('is inclusive at both ends of a validity window', () => {
    expect(onOrBefore('2009-04-07', '2009-04-07')).toBe(true);
    expect(onOrBefore('2009-04-06', '2009-04-07')).toBe(true);
    expect(onOrBefore('2009-04-08', '2009-04-07')).toBe(false);
  });
});
