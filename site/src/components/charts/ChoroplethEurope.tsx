import { useId, useMemo, useState } from 'react';

import { ChartFrame, type ChartDownload } from '../chart-frame/ChartFrame.tsx';
import {
  countryName,
  formatDate,
  formatNumber,
  type CountrySummary,
  type Source,
} from '../../lib/data.ts';
import { equalIntervalBins, rampStepsFor, type Bin } from '../../lib/bins.ts';
import { flagEmoji } from '../../lib/flag.ts';
import { translator, type Locale } from '../../i18n/index.ts';
import geo from '../../geo/europe-paths.json';
import './ChoroplethEurope.css';

/**
 * Europe, shaded by how many ministries each government has.
 *
 * The projection, the clipping and the path generation all happened at build time in
 * `scripts/build-geo.ts`, so what arrives here is a list of finished SVG paths. The map
 * therefore renders as static HTML — a reader with JavaScript off sees the shading and,
 * through each shape's `<title>`, the number behind it.
 *
 * Three fill states, not two, because coverage is part of what this project reports:
 * a country we have curated carries a value, a country we set out to curate and have not
 * is explicitly empty, and everything else is context. Collapsing the middle state into
 * "no data" would quietly present an unfinished dataset as a finished one.
 */

export type MapMetric = 'ministries' | 'seats';

export interface ChoroplethEuropeProps {
  locale: Locale;
  summaries: CountrySummary[];
  sources: Source[];
  methodologyHref?: string;
  /** Metrics offered in the control row, in order. The first is the initial view. */
  metrics?: MapMetric[];
  notes?: string[];
  asOf?: string;
  /**
   * Locale-prefixed base of the country pages, e.g. `/es/countries`. When given, every
   * shaded country becomes a link to `<base>/<ISO2>` — the map stops being the end of the
   * enquiry and becomes the way into it. Omit to render plain, unclickable marks.
   *
   * A string rather than the `(iso2) => string` builder this obviously wants to be:
   * island props are serialised to JSON for hydration, and a function does not survive the
   * crossing. Astro drops it silently, so the map renders with no links and no error.
   */
  countryPathBase?: string;
}

const METRIC_CONFIG: Record<MapMetric, { titleKey: string; shortKey: string; unitKey: string; decimals: number }> = {
  ministries: {
    titleKey: 'map.title.ministries',
    shortKey: 'metric.ministries.short',
    unitKey: 'table.ministries',
    decimals: 0,
  },
  seats: {
    titleKey: 'map.title.seats',
    shortKey: 'metric.seats.short',
    unitKey: 'table.seats',
    decimals: 0,
  },
};

function valueOf(summary: CountrySummary, metric: MapMetric): number {
  switch (metric) {
    case 'ministries':
      return summary.ministries_count;
    case 'seats':
      return summary.cabinet_seats_count;
  }
}

type Shape = (typeof geo.countries)[number];

/** The v1 ambition, carried in the geometry file so the map can report against it. */
const IN_SCOPE = new Set<string>(geo.target_scope);

interface Hover {
  iso2: string;
  /** Null for a country in scope that has no data yet. */
  summary: CountrySummary | null;
  x: number;
  y: number;
}

/** Inclusive integer classes read as "14–15"; a class one value wide reads as "14". */
function binLabel(bin: Bin, locale: Locale, decimals: number): string {
  const from = formatNumber(bin.min, locale, decimals);
  const to = formatNumber(bin.max, locale, decimals);
  return from === to ? from : `${from}–${to}`;
}

export function ChoroplethEurope({
  locale,
  summaries,
  sources,
  methodologyHref,
  metrics = ['ministries', 'seats'],
  notes,
  asOf,
  countryPathBase,
}: ChoroplethEuropeProps) {
  const t = translator(locale);
  const hrefFor = (iso2: string): string | undefined =>
    countryPathBase ? `${countryPathBase}/${iso2}` : undefined;
  const [metric, setMetric] = useState<MapMetric>(metrics[0] ?? 'ministries');
  const [hovered, setHovered] = useState<Hover | null>(null);

  const config = METRIC_CONFIG[metric];
  const byIso = useMemo(
    () => new Map(summaries.map((summary) => [summary.iso2, summary])),
    [summaries],
  );

  const scale = useMemo(
    () =>
      equalIntervalBins(
        summaries.map((summary) => valueOf(summary, metric)),
        { decimals: config.decimals },
      ),
    [summaries, metric, config.decimals],
  );

  const rampSteps = rampStepsFor(scale.bins.length);
  // React's useId contains colons, which are legal in an attribute but need quoting inside
  // a CSS url(). Stripping them means one id that works in both places.
  const hatchId = `ce-hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const hatchPaint = `url(#${hatchId})`;

  /** Drawing order is the stacking order in SVG: context first, data last. */
  const layers = useMemo(() => {
    const context: Shape[] = [];
    const empty: Shape[] = [];
    const data: Shape[] = [];
    for (const shape of geo.countries) {
      if (byIso.has(shape.iso2)) data.push(shape);
      else if (IN_SCOPE.has(shape.iso2)) empty.push(shape);
      else context.push(shape);
    }
    return { context, empty, data };
  }, [byIso]);

  const rows = useMemo(
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

  const download: ChartDownload = {
    filename: `ministries-map-${metric}.csv`,
    rows: rows.map((row) => ({
      iso2: row.iso2,
      country: row.label,
      metric,
      value: row.value,
      class_from: scale.bins[scale.indexOf(row.value)]?.min ?? '',
      class_to: scale.bins[scale.indexOf(row.value)]?.max ?? '',
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
      'class_from',
      'class_to',
      'ministries_count',
      'cabinet_seats_count',
      'population',
      'population_year',
      'source_grade',
      'cabinet_id',
    ],
  };

  const fillFor = (value: number): string => {
    const index = scale.indexOf(value);
    const step = rampSteps[index] ?? rampSteps[rampSteps.length - 1] ?? 3;
    return `var(--ce-bin-${step})`;
  };

  const move = (iso2: string, summary: CountrySummary | null) => (event: { clientX: number; clientY: number }) =>
    setHovered({ iso2, summary, x: event.clientX, y: event.clientY });

  // Attached to the SVG <a> when a country page exists and to a bare <g> when it does not,
  // so the element type differs; `Element` is all the readout needs.
  const focus = (iso2: string, summary: CountrySummary | null) => (event: { currentTarget: Element }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHovered({ iso2, summary, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  const hoveredShape = hovered ? geo.countries.find((shape) => shape.iso2 === hovered.iso2) : undefined;

  const map = (
    <div className="ce">
      <svg
        className="ce-map"
        viewBox={geo.view_box}
        role="img"
        aria-label={t(config.titleKey)}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          {/*
            Texture, not a fourth shade of blue: "we have not curated this yet" is a
            different kind of statement from "this government has few ministries", and a
            hatch says so in a channel colour is not using. It also survives greyscale
            printing and forced-colours mode.
          */}
          <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" className="ce-hatch-line" />
          </pattern>
        </defs>

        {/* Out of scope: land that gives the shaded countries their outline, nothing more. */}
        <g className="ce-layer-context" aria-hidden="true">
          {layers.context.map((shape) =>
            shape.d ? <path key={shape.iso2} d={shape.d} className="ce-shape is-context" /> : null,
          )}
        </g>

        {/* In scope, not curated yet. Hatched, so "empty" cannot be mistaken for "few". */}
        <g className="ce-layer-empty">
          {layers.empty.map((shape) => (
            <g
              key={shape.iso2}
              onMouseMove={move(shape.iso2, null)}
              onMouseLeave={() => setHovered(null)}
            >
              {shape.d ? (
                <path d={shape.d} className="ce-shape is-empty" fill={hatchPaint} />
              ) : (
                <circle
                  cx={shape.centroid[0]}
                  cy={shape.centroid[1]}
                  r={4}
                  className="ce-shape is-empty"
                  fill={hatchPaint}
                />
              )}
              {shape.dot ? (
                <circle cx={shape.centroid[0]} cy={shape.centroid[1]} r={9} className="ce-hit" />
              ) : null}
              <title>{`${shape.iso2} — ${t('empty.noData')}`}</title>
            </g>
          ))}
        </g>

        {/*
          When a country page exists, each shape is an SVG <a> rather than a bare group:
          the link is the affordance, so the map works with the keyboard, with the mouse,
          and — because the geometry is server-rendered — before the island hydrates. The
          focusable element is the <a> itself; the inner <g> only carries the paint and the
          pointer handlers.
        */}
        <g className="ce-layer-data">
          {layers.data.map((shape) => {
            const summary = byIso.get(shape.iso2) as CountrySummary;
            const value = valueOf(summary, metric);
            const label = countryName(summary, locale);
            const readout = `${label}: ${formatNumber(value, locale, config.decimals)} ${t(config.unitKey)}`;
            const href = hrefFor(shape.iso2);

            const marks = (
              <g
                className="ce-country"
                style={{ fill: fillFor(value) }}
                onMouseMove={move(shape.iso2, summary)}
                onMouseLeave={() => setHovered(null)}
              >
                {shape.d ? (
                  <path d={shape.d} className="ce-shape is-data" />
                ) : (
                  <circle cx={shape.centroid[0]} cy={shape.centroid[1]} r={5} className="ce-shape is-data" />
                )}
                {shape.dot ? (
                  <circle cx={shape.centroid[0]} cy={shape.centroid[1]} r={9} className="ce-hit" />
                ) : null}
                {/* Keeps the number reachable on hover before hydration, and in print. */}
                <title>{readout}</title>
              </g>
            );

            return href ? (
              <a
                key={shape.iso2}
                className="ce-link"
                href={href}
                aria-label={`${readout}. ${t('country.viewMinistries')}`}
                onFocus={focus(shape.iso2, summary)}
                onBlur={() => setHovered(null)}
              >
                {marks}
              </a>
            ) : (
              <g
                key={shape.iso2}
                tabIndex={0}
                role="img"
                aria-label={readout}
                onFocus={focus(shape.iso2, summary)}
                onBlur={() => setHovered(null)}
              >
                {marks}
              </g>
            );
          })}
        </g>

        {/*
          SVG has no z-index, so the hovered shape is drawn a second time on top: that is
          what lets its ring sit above its neighbours instead of under them.
        */}
        {hoveredShape ? (
          <g className="ce-layer-lift" aria-hidden="true" pointerEvents="none">
            {/* The copy repeats the original's fill exactly — a lift must not restate the
                value. Uncovered countries keep their hatch. */}
            {/*
              The paint goes in `style`, not in a `fill` attribute. A CSS variable does not
              resolve in an attribute at all, and any CSS rule outranks a presentation
              attribute — either mistake paints the lifted country solid black.
            */}
            {hoveredShape.d ? (
              <path
                d={hoveredShape.d}
                className="ce-shape is-lifted"
                style={{ fill: hovered?.summary ? fillFor(valueOf(hovered.summary, metric)) : hatchPaint }}
              />
            ) : (
              <circle
                cx={hoveredShape.centroid[0]}
                cy={hoveredShape.centroid[1]}
                r={hovered?.summary ? 5 : 4}
                className="ce-shape is-lifted"
                style={{ fill: hovered?.summary ? fillFor(valueOf(hovered.summary, metric)) : hatchPaint }}
              />
            )}
          </g>
        ) : null}
      </svg>

      {/* A magnitude encoded only in colour needs its key on the page, not on hover. */}
      <div className="ce-legend">
        <p className="ce-legend-title">{t(config.shortKey)}</p>
        <ul className="ce-ramp">
          {scale.bins.map((bin, index) => (
            <li key={`${bin.min}-${bin.max}`} className="ce-ramp-item">
              <span
                className="ce-swatch"
                style={{ background: `var(--ce-bin-${rampSteps[index] ?? 3})` }}
                aria-hidden="true"
              />
              <span className="ce-ramp-label">{binLabel(bin, locale, config.decimals)}</span>
            </li>
          ))}
        </ul>
        <ul className="ce-keys">
          <li>
            <span className="ce-swatch is-empty-key" aria-hidden="true" />
            {t('map.legend.notCovered', { count: layers.empty.length })}
          </li>
          <li>
            <span className="ce-swatch is-context-key" aria-hidden="true" />
            {t('map.legend.outOfScope')}
          </li>
        </ul>
      </div>

      {hovered ? (
        <div className="ce-tooltip" style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }} role="status">
          {hovered.summary ? (
            <>
              <p className="ce-tip-value">
                <strong>{formatNumber(valueOf(hovered.summary, metric), locale, config.decimals)}</strong>{' '}
                <span className="ce-tip-unit">{t(config.unitKey)}</span>
              </p>
              <p className="ce-tip-title">
                {/* Decorative, as everywhere else: the name says the same thing. */}
                <span className="ce-flag" aria-hidden="true">
                  {flagEmoji(hovered.iso2)}
                </span>
                {countryName(hovered.summary, locale)}
              </p>
              <dl className="ce-tip-list">
                <dt>{t('table.ministries')}</dt>
                <dd>{formatNumber(hovered.summary.ministries_count, locale)}</dd>
                <dt>{t('table.seats')}</dt>
                <dd>{formatNumber(hovered.summary.cabinet_seats_count, locale)}</dd>
                <dt>{t('quality.grade')}</dt>
                <dd>{hovered.summary.quality.grade}</dd>
              </dl>
              {countryPathBase ? <p className="ce-tip-hint">{t('country.viewMinistries')}</p> : null}
            </>
          ) : (
            <>
              <p className="ce-tip-title">{hovered.iso2}</p>
              <p className="ce-tip-empty">{t('empty.noData')}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  const table = (
    <div className="scroll-x">
      <table className="ce-table">
        <thead>
          <tr>
            <th scope="col">{t('table.country')}</th>
            <th scope="col" className="ce-num">
              {t('table.ministries')}
            </th>
            <th scope="col" className="ce-num">
              {t('table.seats')}
            </th>
            <th scope="col">{t('map.table.class')}</th>
            <th scope="col">{t('table.grade')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bin = scale.bins[scale.indexOf(row.value)];
            return (
              <tr key={row.iso2}>
                <th scope="row">
                  {hrefFor(row.iso2) ? <a href={hrefFor(row.iso2)}>{row.label}</a> : row.label}
                </th>
                <td className="ce-num">{formatNumber(row.summary.ministries_count, locale)}</td>
                <td className="ce-num">{formatNumber(row.summary.cabinet_seats_count, locale)}</td>
                <td>{bin ? binLabel(bin, locale, config.decimals) : '—'}</td>
                <td>{row.summary.quality.grade}</td>
              </tr>
            );
          })}
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
        { id: 'map', label: t('chart.view.map'), content: map },
        { id: 'table', label: t('chart.view.table'), content: table },
      ]}
      sources={sources}
      download={download}
      methodologyHref={methodologyHref}
      notes={notes}
      controls={
        metrics.length > 1 ? (
          <div className="ce-metrics" role="group" aria-label={t('table.value')}>
            {metrics.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`ce-metric${candidate === metric ? ' is-active' : ''}`}
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

export default ChoroplethEurope;
