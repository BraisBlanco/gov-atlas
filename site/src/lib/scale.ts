/**
 * Axis scaling, kept as a pure module so it can be tested without rendering a chart.
 */

/**
 * Ticks on round numbers, covering `max`.
 *
 * The last tick is always at or above the largest value. Rounding the axis *down* to a
 * pretty number is the tempting bug — it looks tidier and lets a bar run past the end of its
 * own scale, which misstates the value the bar encodes. `scale.test.ts` pins this.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];

  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((multiple) => multiple * magnitude)
      .find((candidate) => candidate >= rawStep) ?? magnitude * 10;

  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let index = 0; index * step <= niceMax + step / 1000; index += 1) {
    ticks.push(Number((index * step).toFixed(6)));
  }
  return ticks;
}

/** The value the plot's full width represents. Never below `max`. */
export function scaleMaxOf(ticks: readonly number[], max: number): number {
  return Math.max(ticks[ticks.length - 1] ?? 0, max, Number.EPSILON);
}
