/**
 * Class intervals for a sequential fill, kept as a pure module so the thresholds can be
 * tested without rendering a map.
 *
 * Equal intervals, not quantiles, and that is a judgement call worth stating: quantiles
 * would spread six countries evenly across the ramp and make a two-ministry difference
 * look like a chasm. Equal intervals keep the colour proportional to the number, which is
 * the only reading a choropleth of counts supports honestly. The cost is empty classes
 * while coverage is thin, and an empty class is visible in the legend rather than hidden.
 */

export interface Bin {
  /** Lowest value in the class. */
  min: number;
  /** Highest value in the class. Inclusive — the top class always contains the maximum. */
  max: number;
}

export interface BinScale {
  bins: Bin[];
  /** Index of the class a value falls in, clamped. -1 when there are no bins. */
  indexOf: (value: number) => number;
}

/**
 * Equal-interval classes over the observed range.
 *
 * `decimals: 0` switches to integer classes with integer edges, because "14–15" and
 * "16–17" is what a reader of a ministry count expects, not "14.0–15.5". With fewer
 * distinct values than classes requested, the class count drops rather than emitting
 * empty slivers between integers.
 */
export function equalIntervalBins(
  values: readonly number[],
  { maxBins = 5, decimals = 0 }: { maxBins?: number; decimals?: number } = {},
): BinScale {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return { bins: [], indexOf: () => -1 };
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);

  if (min === max) {
    const bins = [{ min, max }];
    return { bins, indexOf: () => 0 };
  }

  const bins: Bin[] = [];

  if (decimals === 0) {
    const low = Math.floor(min);
    const high = Math.ceil(max);
    // Integer slots, so a range of 14..23 is ten slots and never nine-and-a-bit.
    const slots = high - low + 1;
    const count = Math.min(maxBins, slots);
    const width = Math.ceil(slots / count);
    for (let index = 0; index < count; index += 1) {
      const start = low + index * width;
      if (start > high) break;
      bins.push({ min: start, max: Math.min(start + width - 1, low + count * width - 1) });
    }
  } else {
    const step = 10 ** -decimals;
    const width = Math.ceil((max - min) / maxBins / step) * step;
    for (let index = 0; index < maxBins; index += 1) {
      const start = round(min + index * width, decimals);
      if (index > 0 && start > max) break;
      bins.push({ min: start, max: round(min + (index + 1) * width, decimals) });
    }
  }

  // Equal widths over a rounded span can leave a class entirely above the data — a legend
  // entry for "24-26 ministries" when nobody has more than 22 invites the reader to look
  // for a country that is not there. Drop those; never drop one that holds a value.
  while (bins.length > 1 && (bins[bins.length - 1] as Bin).min > max) bins.pop();

  const last = bins[bins.length - 1];
  if (last && last.max < max) last.max = max;

  return {
    bins,
    indexOf: (value: number) => {
      if (!Number.isFinite(value)) return -1;
      for (let index = 0; index < bins.length; index += 1) {
        const bin = bins[index] as Bin;
        if (value <= bin.max) return index;
      }
      return bins.length - 1;
    },
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Ramp steps for a class count.
 *
 * The five steps are validated against both surfaces (see ChoroplethEurope.css); with
 * fewer classes we take a spread subset of the same steps rather than inventing
 * intermediate colours, so no fill is ever a value nobody checked.
 */
export function rampStepsFor(count: number): number[] {
  switch (count) {
    case 0:
      return [];
    case 1:
      return [3];
    case 2:
      return [1, 5];
    case 3:
      return [1, 3, 5];
    case 4:
      return [1, 2, 4, 5];
    default:
      return [1, 2, 3, 4, 5];
  }
}
