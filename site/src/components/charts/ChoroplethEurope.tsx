import { useId, useMemo, useRef, useState } from 'react';

import { countryName, formatNumber, type CountrySummary } from '../../lib/data.ts';
import { rampStepsFor, type Bin, type BinScale } from '../../lib/bins.ts';
import { flagEmoji } from '../../lib/flag.ts';
import { METRIC_CONFIG, valueOf, type Metric } from '../../lib/metric.ts';
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
 *
 * A finger reads before it travels. There is no hover on a phone, so a shaded country that
 * is only a link hands the reader its country page and never its number; the first tap
 * therefore opens the reading and the second one follows the link. See `tap`.
 *
 * The marks and their legend, and nothing else: the frame, the metric toggle, the table
 * and the citations belong to `CountryComparison`, which shows this map and the ranked bars
 * as two views of one figure. Both are driven by the `metric` and `scale` it passes in, so
 * there is no second copy of either to fall out of step with the view beside it.
 */

export interface ChoroplethEuropeProps {
  locale: Locale;
  summaries: CountrySummary[];
  metric: Metric;
  /** The class intervals the fills and the legend share, computed once by the frame. */
  scale: BinScale;
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

type Shape = (typeof geo.countries)[number];

/** The v1 ambition, carried in the geometry file so the map can report against it. */
const IN_SCOPE = new Set<string>(geo.target_scope);

interface Readout {
  iso2: string;
  /** Null for a country in scope that has no data yet. */
  summary: CountrySummary | null;
  /**
   * Viewport coordinates to float the card at, or null to dock it under the map. A cursor
   * and a focus ring both have a place to point from; a finger does not — see `press`.
   */
  at: { x: number; y: number } | null;
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
  metric,
  scale,
  countryPathBase,
}: ChoroplethEuropeProps) {
  const t = translator(locale);
  const hrefFor = (iso2: string): string | undefined =>
    countryPathBase ? `${countryPathBase}/${iso2}` : undefined;
  const [readout, setReadout] = useState<Readout | null>(null);

  /**
   * A tap fires the whole synthetic mouse sequence — mouseover, mousemove, click — so the
   * events themselves cannot tell a finger from a cursor. The pointer type can, and it is
   * the only thing that can, so every handler below is written against pointer events and
   * remembers which device is driving. Whatever moved last wins, which is what a hybrid
   * laptop needs: touch the screen once and hover still works when the hand goes back to
   * the trackpad.
   */
  const device = useRef<string>('mouse');
  const isFinger = () => device.current === 'touch' || device.current === 'pen';

  const config = METRIC_CONFIG[metric];
  const byIso = useMemo(
    () => new Map(summaries.map((summary) => [summary.iso2, summary])),
    [summaries],
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

  const fillFor = (value: number): string => {
    const index = scale.indexOf(value);
    const step = rampSteps[index] ?? rampSteps[rampSteps.length - 1] ?? 3;
    return `var(--ce-bin-${step})`;
  };

  type Move = { pointerType: string; clientX: number; clientY: number };
  const move = (iso2: string, summary: CountrySummary | null) => (event: Move) => {
    device.current = event.pointerType;
    // A finger gets the docked readout `tap` opens, so the synthetic move a tap emits on
    // its way to the click must not float a card at the touch point first.
    if (event.pointerType !== 'mouse') return;
    setReadout({ iso2, summary, at: { x: event.clientX, y: event.clientY } });
  };

  /**
   * A cursor leaving a shape has finished with it. A finger has not: it has nowhere to
   * rest, so a tap would open the readout and the lift-off would close it again. A docked
   * readout stays until another country is tapped or the reader dismisses it.
   */
  const leave = () => {
    if (!isFinger()) setReadout(null);
  };

  // Attached to the SVG <a> when a country page exists and to a bare <g> when it does not,
  // so the element type differs; `Element` is all the readout needs.
  const focus = (iso2: string, summary: CountrySummary | null) => (event: { currentTarget: Element }) => {
    if (isFinger()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setReadout({ iso2, summary, at: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
  };

  /** Records the device and nothing else: changing state here would pre-empt `tap` below. */
  const press = (event: { pointerType: string }) => {
    device.current = event.pointerType;
  };

  /**
   * The first tap on a country is a request to read it, not to leave the page. With no
   * hover to precede the click, following the link straight away means the number the map
   * exists to encode is the one thing a phone reader never sees. So a finger's first tap
   * opens that country's readout and the second one follows the link; the readout says so.
   * A cursor is untouched — by the time it clicks it has already hovered the country, so
   * the number is on screen and the click is unambiguously a request for the page.
   *
   * The decision lives in the click handler alone, because a tap's `pointerdown` lands a
   * whole turn earlier: opening the readout there would leave this handler looking at the
   * country it just selected and waving the same tap straight through to the link.
   */
  const tap = (iso2: string, summary: CountrySummary | null) => (event: { preventDefault: () => void }) => {
    if (!isFinger() || readout?.iso2 === iso2) return;
    event.preventDefault();
    setReadout({ iso2, summary, at: null });
  };

  const liftedShape = readout ? geo.countries.find((shape) => shape.iso2 === readout.iso2) : undefined;

  /**
   * One reading, drawn the same whether it floats at a cursor or docks under the map — the
   * same numbers in the same order, so the two are not two different cards. Only the
   * closing line differs, because what the reader does next differs: a cursor clicks, a
   * finger taps the country again.
   */
  const card = (entry: Readout) =>
    entry.summary ? (
      <>
        <p className="ce-tip-value">
          <strong>{formatNumber(valueOf(entry.summary, metric), locale, config.decimals)}</strong>{' '}
          <span className="ce-tip-unit">{t(config.unitKey)}</span>
        </p>
        <p className="ce-tip-title">
          {/* Decorative, as everywhere else: the name says the same thing. */}
          <span className="ce-flag" aria-hidden="true">
            {flagEmoji(entry.iso2)}
          </span>
          {countryName(entry.summary, locale)}
        </p>
        <dl className="ce-tip-list">
          <dt>{t('table.ministries')}</dt>
          <dd>{formatNumber(entry.summary.ministries_count, locale)}</dd>
          <dt>{t('table.seats')}</dt>
          <dd>{formatNumber(entry.summary.cabinet_seats_count, locale)}</dd>
          <dt>{t('quality.grade')}</dt>
          <dd>{entry.summary.quality.grade}</dd>
        </dl>
        {countryPathBase ? (
          <p className="ce-tip-hint">{entry.at ? t('country.viewMinistries') : t('map.tapAgain')}</p>
        ) : null}
      </>
    ) : (
      <>
        <p className="ce-tip-title">{entry.iso2}</p>
        <p className="ce-tip-empty">{t('empty.noData')}</p>
      </>
    );

  return (
    <div className="ce">
      <svg
        className="ce-map"
        viewBox={geo.view_box}
        role="img"
        aria-label={t(config.titleKey)}
        onPointerLeave={leave}
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
              onPointerMove={move(shape.iso2, null)}
              onPointerLeave={leave}
              onPointerDown={press}
              onClick={tap(shape.iso2, null)}
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
            const reading = `${label}: ${formatNumber(value, locale, config.decimals)} ${t(config.unitKey)}`;
            const href = hrefFor(shape.iso2);

            const marks = (
              <g
                className="ce-country"
                style={{ fill: fillFor(value) }}
                onPointerMove={move(shape.iso2, summary)}
                onPointerLeave={leave}
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
                <title>{reading}</title>
              </g>
            );

            return href ? (
              <a
                key={shape.iso2}
                className="ce-link"
                href={href}
                aria-label={`${reading}. ${t('country.viewMinistries')}`}
                onFocus={focus(shape.iso2, summary)}
                onBlur={leave}
                onPointerDown={press}
                onClick={tap(shape.iso2, summary)}
              >
                {marks}
              </a>
            ) : (
              <g
                key={shape.iso2}
                tabIndex={0}
                role="img"
                aria-label={reading}
                onFocus={focus(shape.iso2, summary)}
                onBlur={leave}
                onPointerDown={press}
                onClick={tap(shape.iso2, summary)}
              >
                {marks}
              </g>
            );
          })}
        </g>

        {/*
          SVG has no z-index, so the country being read is drawn a second time on top: that
          is what lets its ring sit above its neighbours instead of under them. It is also
          what tells a phone reader which shape their finger just landed on, the readout
          itself being nowhere near it.
        */}
        {liftedShape ? (
          <g className="ce-layer-lift" aria-hidden="true" pointerEvents="none">
            {/* The copy repeats the original's fill exactly — a lift must not restate the
                value. Uncovered countries keep their hatch. */}
            {/*
              The paint goes in `style`, not in a `fill` attribute. A CSS variable does not
              resolve in an attribute at all, and any CSS rule outranks a presentation
              attribute — either mistake paints the lifted country solid black.
            */}
            {liftedShape.d ? (
              <path
                d={liftedShape.d}
                className="ce-shape is-lifted"
                style={{ fill: readout?.summary ? fillFor(valueOf(readout.summary, metric)) : hatchPaint }}
              />
            ) : (
              <circle
                cx={liftedShape.centroid[0]}
                cy={liftedShape.centroid[1]}
                r={readout?.summary ? 5 : 4}
                className="ce-shape is-lifted"
                style={{ fill: readout?.summary ? fillFor(valueOf(readout.summary, metric)) : hatchPaint }}
              />
            )}
          </g>
        ) : null}
      </svg>

      {/*
        Where a tap's reading goes. Docked under the map rather than floated at the touch
        point, because a card at the finger is under the finger that asked for it, and one
        anchored to a country near the right edge of a phone runs off the screen entirely.
      */}
      {readout && !readout.at ? (
        <div className="ce-readout">
          <div role="status">{card(readout)}</div>
          <button
            type="button"
            className="ce-readout-close"
            onClick={() => setReadout(null)}
            aria-label={t('map.readoutClose')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}

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
          {/* Only worth a key while something is actually hatched; with every in-scope
              country covered the row would explain a paint the map never uses. */}
          {layers.empty.length > 0 ? (
            <li>
              <span className="ce-swatch is-empty-key" aria-hidden="true" />
              {t('map.legend.notCovered', { count: layers.empty.length })}
            </li>
          ) : null}
          <li>
            <span className="ce-swatch is-context-key" aria-hidden="true" />
            {t('map.legend.outOfScope')}
          </li>
        </ul>
      </div>

      {readout?.at ? (
        <div
          className="ce-tooltip"
          style={{ left: `${readout.at.x}px`, top: `${readout.at.y}px` }}
          role="status"
        >
          {card(readout)}
        </div>
      ) : null}
    </div>
  );
}

export default ChoroplethEurope;
