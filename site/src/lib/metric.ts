import { countryName, type CountrySummary } from './data.ts';
import type { Locale } from '../i18n/index.ts';

/**
 * The two figures the home page compares, and the vocabulary for saying which one a view
 * is showing.
 *
 * Shared rather than restated per chart, because the map, the bars and the table are three
 * encodings of one choice. Each chart used to carry its own copy of this table and its own
 * `valueOf`, which is precisely how a view ends up labelling cabinet seats as ministries —
 * the two are different numbers and the project's claim rests on never conflating them.
 */

export type Metric = 'ministries' | 'seats';

export interface MetricConfig {
  /** The figure across countries: the frame's title, whichever view is showing. */
  titleKey: string;
  /** Short form, for the toggle and the map legend. */
  shortKey: string;
  /** What a single value is a count of. */
  unitKey: string;
  decimals: number;
}

export const METRIC_CONFIG: Record<Metric, MetricConfig> = {
  ministries: {
    titleKey: 'metric.title.ministries',
    shortKey: 'metric.ministries.short',
    unitKey: 'table.ministries',
    decimals: 0,
  },
  seats: {
    titleKey: 'metric.title.seats',
    shortKey: 'metric.seats.short',
    unitKey: 'table.seats',
    decimals: 0,
  },
};

export function valueOf(summary: CountrySummary, metric: Metric): number {
  switch (metric) {
    case 'ministries':
      return summary.ministries_count;
    case 'seats':
      return summary.cabinet_seats_count;
  }
}

export interface MetricRow {
  iso2: string;
  label: string;
  value: number;
  summary: CountrySummary;
}

/**
 * Descending by value, ties broken by name in the reader's locale.
 *
 * One ordering, computed once and handed to the bars, the table and the CSV, so a reader
 * who switches view or downloads the data cannot be shown two different rankings of the
 * same numbers.
 */
export function rankedRows(
  summaries: CountrySummary[],
  metric: Metric,
  locale: Locale,
): MetricRow[] {
  return summaries
    .map((summary) => ({
      iso2: summary.iso2,
      label: countryName(summary, locale),
      value: valueOf(summary, metric),
      summary,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
