import { useMemo, useState } from 'react';

import { ChartFrame, type ChartDownload } from '../chart-frame/ChartFrame.tsx';
import ChoroplethEurope from './ChoroplethEurope.tsx';
import RankedBars from './RankedBars.tsx';
import { formatDate, formatNumber, type CountrySummary, type Source } from '../../lib/data.ts';
import { equalIntervalBins } from '../../lib/bins.ts';
import { METRIC_CONFIG, rankedRows, type Metric } from '../../lib/metric.ts';
import { translator, type Locale } from '../../i18n/index.ts';
import './CountryComparison.css';

/**
 * One figure — a count per country — offered as a map, as ranked bars and as a table.
 *
 * The three used to be two separate frames stacked down the page, each with its own metric
 * toggle, its own citations, its own CSV and its own copy of very nearly the same table. The
 * repetition was the smaller problem. The two toggles were independent, so a reader could
 * leave the map on cabinet seats and the bars on ministries and have two sections of the
 * same page showing different numbers under titles that each read perfectly plausibly —
 * which is the one confusion this project cannot afford, the two figures being different
 * counts of different things.
 *
 * So the metric is state here and nowhere else, and it names the frame: whichever view is
 * showing, the title says which number it is. Tabs do cost something — you can no longer
 * see the map and the ranking at once — and that is the trade accepted, because both encode
 * the same values and the table carries the ordering explicitly.
 *
 * Geography is the first view because browsing precedes ranking: a reader arrives looking
 * for a country, not for a league position.
 */

export interface CountryComparisonProps {
  locale: Locale;
  summaries: CountrySummary[];
  sources: Source[];
  methodologyHref?: string;
  /** Metrics offered in the control row, in order. The first is the initial one. */
  metrics?: Metric[];
  notes?: string[];
  /** The date the data describes, so the subtitle dates the figure rather than sloganeering. */
  asOf?: string;
  /**
   * Locale-prefixed base of the country pages, e.g. `/es/countries`. Omit to render plain
   * marks and plain labels. A string, not a builder function: island props are serialised
   * to JSON for hydration, and Astro drops a function prop silently.
   */
  countryPathBase?: string;
}

export function CountryComparison({
  locale,
  summaries,
  sources,
  methodologyHref,
  metrics = ['ministries', 'seats'],
  notes,
  asOf,
  countryPathBase,
}: CountryComparisonProps) {
  const t = translator(locale);
  const hrefFor = (iso2: string): string | undefined =>
    countryPathBase ? `${countryPathBase}/${iso2}` : undefined;
  const [metric, setMetric] = useState<Metric>(metrics[0] ?? 'ministries');

  const config = METRIC_CONFIG[metric];
  const rows = useMemo(() => rankedRows(summaries, metric, locale), [summaries, metric, locale]);

  // Computed here rather than inside the map, because the classes are a property of the
  // data and the metric, not of the SVG: the CSV reports them too, and a reader
  // reconstructing the shading from the download must get the same edges the legend shows.
  const scale = useMemo(
    () => equalIntervalBins(rows.map((row) => row.value), { decimals: config.decimals }),
    [rows, config.decimals],
  );

  const download: ChartDownload = {
    filename: `ministries-${metric}.csv`,
    rows: rows.map((row) => ({
      iso2: row.iso2,
      country: row.label,
      metric,
      value: row.value,
      class_from: scale.bins[scale.indexOf(row.value)]?.min ?? '',
      class_to: scale.bins[scale.indexOf(row.value)]?.max ?? '',
      ministries_count: row.summary.ministries_count,
      cabinet_seats_count: row.summary.cabinet_seats_count,
      excluded_count: row.summary.excluded_count,
      population: row.summary.population.value,
      population_year: row.summary.population.year,
      source_grade: row.summary.quality.grade,
      cabinet_id: row.summary.cabinet_id,
    })),
    columns: [
      'iso2',
      'country',
      'metric',
      'value',
      'class_from',
      'class_to',
      'ministries_count',
      'cabinet_seats_count',
      'excluded_count',
      'population',
      'population_year',
      'source_grade',
      'cabinet_id',
    ],
  };

  /*
   * Both counts in every row, whichever metric is selected, because the table is the
   * accessible reading of the chart and the point most easily lost in a single ranked
   * column is that these are two numbers. The map's shading class is not a column: it means
   * nothing to a reader who arrived from the bars, and it stays in the CSV for anyone
   * rebuilding the ramp.
   */
  const table = (
    <div className="scroll-x">
      <table className="cc-table">
        <thead>
          <tr>
            <th scope="col">{t('table.country')}</th>
            <th scope="col" className="cc-num">
              {t('table.ministries')}
            </th>
            <th scope="col" className="cc-num">
              {t('table.seats')}
            </th>
            <th scope="col" className="cc-num">
              {t('table.excluded')}
            </th>
            <th scope="col">{t('table.grade')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.iso2}>
              <th scope="row">
                {hrefFor(row.iso2) ? <a href={hrefFor(row.iso2)}>{row.label}</a> : row.label}
              </th>
              <td className="cc-num">{formatNumber(row.summary.ministries_count, locale)}</td>
              <td className="cc-num">{formatNumber(row.summary.cabinet_seats_count, locale)}</td>
              <td className="cc-num">{formatNumber(row.summary.excluded_count, locale)}</td>
              <td>
                {row.summary.quality.grade}
                <span className="cc-grade-note">
                  {' '}
                  {t(`quality.${row.summary.quality.grade.toLowerCase()}`)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      locale={locale}
      t={t}
      title={t(config.titleKey)}
      subtitle={asOf ? t('chart.asOf', { date: formatDate(asOf, locale) }) : undefined}
      views={[
        {
          id: 'map',
          label: t('chart.view.map'),
          content: (
            <ChoroplethEurope
              locale={locale}
              summaries={summaries}
              metric={metric}
              scale={scale}
              countryPathBase={countryPathBase}
            />
          ),
        },
        {
          id: 'chart',
          label: t('chart.view.chart'),
          content: <RankedBars locale={locale} rows={rows} metric={metric} />,
        },
        { id: 'table', label: t('chart.view.table'), content: table },
      ]}
      sources={sources}
      download={download}
      methodologyHref={methodologyHref}
      notes={notes}
      controls={
        metrics.length > 1 ? (
          <div className="cc-metrics" role="group" aria-label={t('table.value')}>
            {metrics.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`cc-metric${candidate === metric ? ' is-active' : ''}`}
                aria-pressed={candidate === metric}
                onClick={() => setMetric(candidate)}
              >
                {t(METRIC_CONFIG[candidate].shortKey)}
              </button>
            ))}
          </div>
        ) : null
      }
    />
  );
}

export default CountryComparison;
