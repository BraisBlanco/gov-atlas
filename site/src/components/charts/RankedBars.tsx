import { useState, type CSSProperties } from 'react';

import { formatNumber } from '../../lib/data.ts';
import { flagEmoji } from '../../lib/flag.ts';
import { METRIC_CONFIG, type Metric, type MetricRow } from '../../lib/metric.ts';
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
 *
 * The plot and nothing else: `CountryComparison` owns the frame, the metric toggle, the
 * table and the citations, and hands the rows down already ranked so the bars, the table and
 * the CSV cannot disagree about the order.
 */

export interface RankedBarsProps {
  locale: Locale;
  /** Ranked by `rankedRows`; drawn in the order given. */
  rows: MetricRow[];
  metric: Metric;
}

export function RankedBars({ locale, rows, metric }: RankedBarsProps) {
  const t = translator(locale);
  const [hovered, setHovered] = useState<{ row: MetricRow; x: number; y: number } | null>(null);

  const config = METRIC_CONFIG[metric];

  const max = rows.reduce((acc, row) => Math.max(acc, row.value), 0);
  const ticks = niceTicks(max);
  const scaleMax = scaleMaxOf(ticks, max);

  return (
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
                  {/* Anchored to the bar's own tip, whatever its length — the track reserves
                      the room for it, so the value never lands on a neighbour or on air. */}
                  <span className="rb-value" style={{ left: `${pct}%` } as CSSProperties}>
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
}

export default RankedBars;
