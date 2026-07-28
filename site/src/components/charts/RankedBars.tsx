import { useMemo, useState, type CSSProperties } from 'react';

import { ChartFrame, type ChartDownload } from '../chart-frame/ChartFrame.tsx';
import { countryName, formatDate, formatNumber, type CountrySummary, type Source } from '../../lib/data.ts';
import { flagEmoji } from '../../lib/flag.ts';
import { translator, type Locale } from '../../i18n/index.ts';
import { niceTicks, scaleMaxOf } from '../../lib/scale.ts';
import './RankedBars.css';

/**
 * Ranked horizontal bars — the reference chart.
 *
 * Hand-rolled HTML rather than a plotting library, deliberately: the mark specs (a 24px cap,
 * a 4px rounded data-end square at the baseline, a 2px surface gap between neighbours,
 * labels that move outside a bar when they would not fit inside it) are exact, and they are
 * easier to hold exactly in CSS than to coax out of a library's defaults. Charts that need
 * real projections or dense grids — the choropleth, the heatmap — should reach for
 * Observable Plot instead; this is not a house style, it is the right tool for one bar chart.
 *
 * One series, so no legend: the title says what is plotted, and a one-swatch legend box
 * would only restate it.
 */

export type Metric = 'ministries' | 'seats';

export interface RankedBarsProps {
  locale: Locale;
  summaries: CountrySummary[];
  sources: Source[];
  methodologyHref?: string;
  /** Metrics offered in the control row, in order. The first is the initial view. */
  metrics?: Metric[];
  notes?: string[];
  /** The date the data describes, so the subtitle dates the chart rather than sloganeering. */
  asOf?: string;
  /**
   * Locale-prefixed base of the country pages, e.g. `/es/countries`. Omit to leave the
   * labels as plain text. A string, not a builder function: island props are serialised
   * to JSON for hydration, and Astro drops a function prop silently.
   */
  countryPathBase?: string;
}

interface Row {
  iso2: string;
  label: string;
  value: number;
  summary: CountrySummary;
}

const METRIC_CONFIG: Record<Metric, { titleKey: string; shortKey: string; decimals: number }> = {
  ministries: { titleKey: 'metric.ministries', shortKey: 'metric.ministries.short', decimals: 0 },
  seats: { titleKey: 'metric.seats', shortKey: 'metric.seats.short', decimals: 0 },
};

function valueOf(summary: CountrySummary, metric: Metric): number {
  switch (metric) {
    case 'ministries':
      return summary.ministries_count;
    case 'seats':
      return summary.cabinet_seats_count;
  }
}

export function RankedBars({
  locale,
  summaries,
  sources,
  methodologyHref,
  metrics = ['ministries', 'seats'],
  notes,
  asOf,
  countryPathBase,
}: RankedBarsProps) {
  const t = translator(locale);
  const hrefFor = (iso2: string): string | undefined =>
    countryPathBase ? `${countryPathBase}/${iso2}` : undefined;
  const [metric, setMetric] = useState<Metric>(metrics[0] ?? 'ministries');
  const [hovered, setHovered] = useState<{ row: Row; x: number; y: number } | null>(null);

  const config = METRIC_CONFIG[metric];

  const rows = useMemo<Row[]>(
    () =>
      summaries
        .map((summary) => ({
          iso2: summary.iso2,
          label: countryName(summary, locale),
          value: valueOf(summary, metric),
          summary,
        }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    [summaries, metric, locale],
  );

  const max = rows.reduce((acc, row) => Math.max(acc, row.value), 0);
  const ticks = niceTicks(max);
  const scaleMax = scaleMaxOf(ticks, max);

  const download: ChartDownload = {
    filename: `ministries-${metric}.csv`,
    rows: rows.map((row) => ({
      iso2: row.iso2,
      country: row.label,
      metric,
      value: row.value,
      ministries_count: row.summary.ministries_count,
      cabinet_seats_count: row.summary.cabinet_seats_count,
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
      'ministries_count',
      'cabinet_seats_count',
      'population',
      'population_year',
      'source_grade',
      'cabinet_id',
    ],
  };

  const chart = (
    <div className="rb">
      <div className="rb-plot" role="img" aria-label={t(config.titleKey)}>
        <div className="rb-gridlines" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="rb-gridline" style={{ left: `${(tick / scaleMax) * 100}%` }} />
          ))}
        </div>

        <ul className="rb-rows">
          {rows.map((row) => {
            const pct = (row.value / scaleMax) * 100;
            // A short bar cannot hold its own label, so the label steps outside it. The
            // threshold is a proxy for measuring: values here are 1-5 characters wide.
            const labelInside = pct > 82;
            const formatted = formatNumber(row.value, locale, config.decimals);

            return (
              <li
                key={row.iso2}
                className="rb-row"
                tabIndex={0}
                onMouseMove={(event) => setHovered({ row, x: event.clientX, y: event.clientY })}
                onMouseLeave={() => setHovered(null)}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setHovered({ row, x: rect.left + rect.width / 2, y: rect.top });
                }}
                onBlur={() => setHovered(null)}
              >
                <span className="rb-label">
                  {/* Decorative, as on the country cards: the name is right there, so a
                      screen reader hears the country once rather than "flag, Spain, Spain". */}
                  <span className="rb-flag" aria-hidden="true">
                    {flagEmoji(row.iso2)}
                  </span>
                  {row.label}
                </span>
                <span className="rb-track">
                  <span className="rb-bar" style={{ width: `${pct}%` } as CSSProperties} />
                  <span
                    className={`rb-value${labelInside ? ' is-inside' : ''}`}
                    style={labelInside ? undefined : { left: `${pct}%` }}
                  >
                    {formatted}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="rb-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="rb-tick" style={{ left: `${(tick / scaleMax) * 100}%` }}>
              {formatNumber(tick, locale, config.decimals)}
            </span>
          ))}
        </div>
      </div>

      {hovered ? (
        <div
          className="rb-tooltip"
          style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }}
          role="status"
        >
          <p className="rb-tip-title">
            <span className="rb-flag" aria-hidden="true">
              {flagEmoji(hovered.row.iso2)}
            </span>
            {hovered.row.label}
          </p>
          <dl className="rb-tip-list">
            <dt>{t('table.ministries')}</dt>
            <dd>{formatNumber(hovered.row.summary.ministries_count, locale)}</dd>
            <dt>{t('table.seats')}</dt>
            <dd>{formatNumber(hovered.row.summary.cabinet_seats_count, locale)}</dd>
            <dt>{t('quality.grade')}</dt>
            <dd>{hovered.row.summary.quality.grade}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );

  const table = (
    <div className="scroll-x">
      <table className="rb-table">
        <thead>
          <tr>
            <th scope="col">{t('table.country')}</th>
            <th scope="col" className="rb-num">
              {t('table.ministries')}
            </th>
            <th scope="col" className="rb-num">
              {t('table.seats')}
            </th>
            <th scope="col" className="rb-num">
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
              <td className="rb-num">{formatNumber(row.summary.ministries_count, locale)}</td>
              <td className="rb-num">{formatNumber(row.summary.cabinet_seats_count, locale)}</td>
              <td className="rb-num">{formatNumber(row.summary.excluded_count, locale)}</td>
              <td>
                {row.summary.quality.grade}
                <span className="rb-grade-note">
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
        { id: 'chart', label: t('chart.view.chart'), content: chart },
        { id: 'table', label: t('chart.view.table'), content: table },
      ]}
      sources={sources}
      download={download}
      methodologyHref={methodologyHref}
      notes={notes}
      controls={
        metrics.length > 1 ? (
          <div className="rb-metrics" role="group" aria-label={t('table.value')}>
            {metrics.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`rb-metric${candidate === metric ? ' is-active' : ''}`}
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

export default RankedBars;
