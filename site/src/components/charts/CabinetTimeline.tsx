import { useMemo, useState } from 'react';

import { dayAfter, dayNumber } from '../../../../scripts/lib/dates.ts';
import { ChartFrame, type ChartDownload } from '../chart-frame/ChartFrame.tsx';
import { formatDate, formatNumber, type Source, type TimelinePoint } from '../../lib/data.ts';
import { translator, type Locale } from '../../i18n/index.ts';
import { niceTicks, scaleMaxOf } from '../../lib/scale.ts';
import './CabinetTimeline.css';

/**
 * How a country's government structure changed over time, as a step chart.
 *
 * Three decisions here are about honesty rather than looks:
 *
 *   1. **Steps, not a slope.** A count does not drift between decrees; it holds and then
 *      jumps on the day one takes effect. A sloped line would invent a gradual change that
 *      never happened.
 *   2. **The line breaks over an uncurated period.** Spain's history reaches back to 1996
 *      and forward from 2023 with a gap in between; drawing through it would assert a
 *      continuity nobody has checked. A gap is drawn as a gap and labelled.
 *   3. **Selecting a step lists its departments.** The interesting reshuffles are the ones
 *      that leave the total unchanged — April 2009 in Spain renamed three departments and
 *      moved the number not at all. A chart of the number alone hides exactly those, so the
 *      list is part of the chart rather than a detail elsewhere.
 *
 * One series at a time, so no legend: the title names what is plotted, and the two figures
 * are never drawn together — a department count and a seat count answer different
 * questions and sharing one axis would invite reading the gap as an error.
 */

export type TimelineMetric = 'ministries' | 'seats';

export interface CabinetTimelineProps {
  locale: Locale;
  points: TimelinePoint[];
  sources: Source[];
  /** Language of the official names, for the `lang` attribute on the department list. */
  primaryLang?: string;
  methodologyHref?: string;
  metrics?: TimelineMetric[];
  notes?: string[];
  /** Closes an open-ended final step, so the axis ends at a real date. */
  asOf: string;
}

const METRIC_CONFIG: Record<TimelineMetric, { titleKey: string; shortKey: string }> = {
  ministries: { titleKey: 'timeline.title.ministries', shortKey: 'metric.ministries.short' },
  seats: { titleKey: 'timeline.title.seats', shortKey: 'metric.seats.short' },
};

function valueOf(point: TimelinePoint, metric: TimelineMetric): number {
  return metric === 'ministries' ? point.ministries_count : point.cabinet_seats_count;
}

/** Plot geometry, in user units. The SVG scales; these stay fixed so the specs stay exact. */
const WIDTH = 720;
const HEIGHT = 250;
const PAD = { top: 14, right: 14, bottom: 30, left: 38 } as const;
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

interface Step {
  point: TimelinePoint;
  value: number;
  /** Inclusive start and end of the step, as day numbers. */
  from: number;
  to: number;
  /** Index of the contiguous run this step belongs to; a new run means the line breaks. */
  run: number;
}

export function CabinetTimeline({
  locale,
  points,
  sources,
  primaryLang,
  methodologyHref,
  metrics = ['ministries', 'seats'],
  notes,
  asOf,
}: CabinetTimelineProps) {
  const t = translator(locale);
  const [metric, setMetric] = useState<TimelineMetric>(metrics[0] ?? 'ministries');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ step: Step; x: number; y: number } | null>(null);

  const config = METRIC_CONFIG[metric];

  const ordered = useMemo(
    () => points.slice().sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  );

  /**
   * Steps in time order, grouped into runs. A run ends where the next step does not begin
   * the day after this one — that hole is a period nobody has curated, not a flat line.
   */
  const steps = useMemo<Step[]>(() => {
    let run = 0;
    return ordered.map((point, index) => {
      const previous = ordered[index - 1];
      if (previous && dayAfter(previous.until ?? asOf) !== point.date) run += 1;
      return {
        point,
        value: valueOf(point, metric),
        from: dayNumber(point.date),
        to: dayNumber(point.until ?? asOf),
        run,
      };
    });
  }, [ordered, metric, asOf]);

  const first = steps[0];
  const last = steps[steps.length - 1];

  const max = steps.reduce((acc, step) => Math.max(acc, step.value), 0);
  // Five intervals rather than the default four: cabinet sizes cluster in the teens and
  // twenties, and an axis labelled only 0/10/20/30 cannot separate 15 from 22.
  const ticks = niceTicks(max, 5);
  const scaleMax = scaleMaxOf(ticks, max);

  const spanFrom = first?.from ?? 0;
  const spanTo = Math.max(last?.to ?? 1, spanFrom + 1);
  const x = (day: number): number => PAD.left + ((day - spanFrom) / (spanTo - spanFrom)) * PLOT_W;
  const y = (value: number): number => PAD.top + PLOT_H - (value / scaleMax) * PLOT_H;

  const selected =
    steps.find((step) => step.point.date === selectedDate) ?? last ?? undefined;

  /**
   * Year ticks, thinned so labels never collide at any span.
   *
   * The year the series starts is always labelled, even when the thinning would skip it: an
   * axis whose first label is two years after the first data point leaves a reader unable to
   * date the beginning of the very series they are reading. A round tick landing within a
   * year of it is dropped instead, so the two never overprint.
   */
  const yearTicks = useMemo(() => {
    if (!first || !last) return [];
    const firstYear = Number(first.point.date.slice(0, 4));
    const lastYear = Number((last.point.until ?? asOf).slice(0, 4));
    const years = lastYear - firstYear;
    const every = years <= 8 ? 1 : years <= 16 ? 2 : years <= 40 ? 5 : 10;

    // The first label is anchored to where the data starts, not to 1 January of that year,
    // which for a term beginning in April would sit outside the plot.
    const out = [{ year: firstYear, day: first.from }];
    for (let year = Math.ceil(firstYear / every) * every; year <= lastYear; year += every) {
      if (year - firstYear >= 1) out.push({ year, day: dayNumber(`${year}-01-01`) });
    }
    return out;
  }, [first, last, asOf]);

  const gaps = useMemo(
    () =>
      steps.flatMap((step, index) => {
        const next = steps[index + 1];
        if (!next || next.run === step.run) return [];
        return [{ from: step.to, to: next.from, key: `${step.point.date}-${next.point.date}` }];
      }),
    [steps],
  );

  const hasEstimate = steps.some((step) => !step.point.reconstructed);

  const download: ChartDownload = {
    filename: `timeline-${metric}.csv`,
    rows: steps.map((step) => ({
      date: step.point.date,
      until: step.point.until ?? '',
      metric,
      value: step.value,
      ministries_count: step.point.ministries_count,
      cabinet_seats_count: step.point.cabinet_seats_count,
      cabinet_id: step.point.cabinet_id,
      complete: step.point.reconstructed,
      ministries: step.point.ministries.map((ministry) => ministry.name_original),
    })),
    columns: [
      'date',
      'until',
      'metric',
      'value',
      'ministries_count',
      'cabinet_seats_count',
      'cabinet_id',
      'complete',
      'ministries',
    ],
  };

  /** One path per run, so the stroke never spans a period without data. */
  const runPaths = useMemo(() => {
    const byRun = new Map<number, Step[]>();
    for (const step of steps) {
      const list = byRun.get(step.run);
      if (list) list.push(step);
      else byRun.set(step.run, [step]);
    }
    return [...byRun.entries()].map(([run, group]) => {
      const commands = group.flatMap((step, index) => {
        const startX = x(step.from);
        const endX = x(step.to);
        const atY = y(step.value);
        return index === 0
          ? [`M ${startX} ${atY}`, `L ${endX} ${atY}`]
          : [`L ${startX} ${atY}`, `L ${endX} ${atY}`];
      });
      return { run, d: commands.join(' '), dashed: group.some((step) => !step.point.reconstructed) };
    });
  }, [steps, scaleMax, spanFrom, spanTo]);

  const periodLabel = (step: Step): string =>
    step.point.until === null
      ? `${formatDate(step.point.date, locale)} — ${t('timeline.current')}`
      : `${formatDate(step.point.date, locale)} — ${formatDate(step.point.until, locale)}`;

  const chart = (
    <div className="ct">
      <svg
        className="ct-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t('timeline.plotLabel', {
          metric: t(config.titleKey),
          from: formatDate(first?.point.date ?? asOf, locale),
          to: formatDate(last?.point.until ?? asOf, locale),
        })}
      >
        <g aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="ct-grid"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className="ct-tick ct-tick-y" x={PAD.left - 8} y={y(tick)}>
                {formatNumber(tick, locale)}
              </text>
            </g>
          ))}

          {yearTicks.map((tick) => (
            <text key={tick.year} className="ct-tick ct-tick-x" x={x(tick.day)} y={HEIGHT - 10}>
              {tick.year}
            </text>
          ))}

          {/* An uncurated stretch is drawn as absence, with a label, never bridged. */}
          {gaps.map((gap) => (
            <g key={gap.key}>
              <rect
                className="ct-gap"
                x={x(gap.from)}
                y={PAD.top}
                width={Math.max(x(gap.to) - x(gap.from), 1)}
                height={PLOT_H}
              />
              <text className="ct-gap-label" x={(x(gap.from) + x(gap.to)) / 2} y={PAD.top + PLOT_H / 2}>
                {t('timeline.gap')}
              </text>
            </g>
          ))}

          <line
            className="ct-axis"
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
          />

          {runPaths.map((run) => (
            <path key={run.run} className={`ct-line${run.dashed ? ' is-estimate' : ''}`} d={run.d} />
          ))}

          {steps.map((step) => (
            <circle
              key={`marker-${step.point.date}`}
              className={`ct-marker${selected?.point.date === step.point.date ? ' is-selected' : ''}`}
              cx={x(step.from)}
              cy={y(step.value)}
              r={selected?.point.date === step.point.date ? 5.5 : 4}
            />
          ))}
        </g>

        {/* Hit areas span the full plot height, so a 2px line is not the target. */}
        {steps.map((step) => {
          const left = x(step.from);
          const width = Math.max(x(step.to) - left, 8);
          return (
            <rect
              key={`hit-${step.point.date}`}
              className="ct-hit"
              x={left}
              y={PAD.top}
              width={width}
              height={PLOT_H}
              tabIndex={0}
              role="button"
              aria-pressed={selected?.point.date === step.point.date}
              aria-label={`${periodLabel(step)}: ${formatNumber(step.value, locale)} ${t(config.shortKey)}`}
              onClick={() => setSelectedDate(step.point.date)}
              onMouseMove={(event) => setHovered({ step, x: event.clientX, y: event.clientY })}
              onMouseLeave={() => setHovered(null)}
              onFocus={(event) => {
                setSelectedDate(step.point.date);
                const rect = event.currentTarget.getBoundingClientRect();
                setHovered({ step, x: rect.left + rect.width / 2, y: rect.top });
              }}
              onBlur={() => setHovered(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedDate(step.point.date);
                }
              }}
            />
          );
        })}
      </svg>

      {hovered ? (
        <div className="ct-tooltip" style={{ left: `${hovered.x}px`, top: `${hovered.y}px` }} role="status">
          <p className="ct-tip-title">{periodLabel(hovered.step)}</p>
          <dl className="ct-tip-list">
            <dt>{t('table.ministries')}</dt>
            <dd>{formatNumber(hovered.step.point.ministries_count, locale)}</dd>
            <dt>{t('table.seats')}</dt>
            <dd>{formatNumber(hovered.step.point.cabinet_seats_count, locale)}</dd>
          </dl>
        </div>
      ) : null}

      {selected ? (
        <div className="ct-detail">
          <h4 className="ct-detail-head">
            {t('timeline.selected', { count: selected.point.ministries_count })}
            <span className="ct-detail-period">{periodLabel(selected)}</span>
          </h4>
          <ol className="ct-list">
            {selected.point.ministries.map((ministry) => {
              const reader = locale === 'es' ? ministry.name_es : ministry.name_en;
              return (
                <li key={ministry.id}>
                  <span lang={primaryLang}>{ministry.name_original}</span>
                  {reader !== ministry.name_original ? (
                    <span className="ct-gloss">{reader}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="ct-hint">{t('timeline.selectHint')}</p>
        </div>
      ) : null}
    </div>
  );

  const table = (
    <div className="scroll-x">
      <table className="ct-table">
        <thead>
          <tr>
            <th scope="col">{t('timeline.table.period')}</th>
            <th scope="col" className="ct-num">
              {t('table.ministries')}
            </th>
            <th scope="col" className="ct-num">
              {t('table.seats')}
            </th>
            <th scope="col">{t('timeline.table.departments')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.point.date}>
              <th scope="row">
                {periodLabel(step)}
                {step.point.reconstructed ? null : (
                  <span className="ct-flag">{t('timeline.incomplete')}</span>
                )}
              </th>
              <td className="ct-num">{formatNumber(step.point.ministries_count, locale)}</td>
              <td className="ct-num">{formatNumber(step.point.cabinet_seats_count, locale)}</td>
              <td lang={primaryLang}>
                {step.point.ministries.map((ministry) => ministry.name_original).join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const allNotes = [
    ...(notes ?? []),
    ...(gaps.length > 0 ? [t('timeline.gapNote')] : []),
    ...(hasEstimate ? [t('timeline.incompleteNote')] : []),
  ];

  return (
    <ChartFrame
      locale={locale}
      t={t}
      title={t(config.titleKey)}
      subtitle={t('timeline.subtitle', {
        count: steps.length,
        from: formatDate(first?.point.date ?? asOf, locale),
      })}
      views={[
        { id: 'chart', label: t('chart.view.chart'), content: chart },
        { id: 'table', label: t('chart.view.table'), content: table },
      ]}
      sources={sources}
      download={download}
      methodologyHref={methodologyHref}
      notes={allNotes.length > 0 ? allNotes : undefined}
      controls={
        metrics.length > 1 ? (
          <div className="ct-metrics" role="group" aria-label={t('table.value')}>
            {metrics.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`ct-metric${candidate === metric ? ' is-active' : ''}`}
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

export default CabinetTimeline;
