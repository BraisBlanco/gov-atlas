import { useCallback, useId, useState, type ReactNode } from 'react';

import { toCsv } from '../../../../scripts/lib/csv.ts';
import type { Source } from '../../lib/data.ts';
import { formatDate } from '../../lib/data.ts';
import type { Locale, Translate } from '../../i18n/index.ts';
import './ChartFrame.css';

/**
 * The shell every chart wears.
 *
 * It exists to make three things structural rather than optional:
 *
 *   1. **The sources travel with the chart.** `sources` are the actual citations behind the
 *      numbers drawn, quote included — not a fixed "Source: our dataset" line. A figure a
 *      reader cannot trace back is the failure mode this whole project is built against.
 *   2. **A table view always exists.** Three categorical slots sit below 3:1 contrast on the
 *      light surface, so the palette's relief rule requires visible labels or a table. The
 *      table also carries every value a chart labels selectively, so nothing is gated behind
 *      hover.
 *   3. **The download is the chart.** The CSV is generated from the same rows the chart drew,
 *      so it cannot disagree with what is on screen.
 */

export interface ChartView {
  id: string;
  label: string;
  content: ReactNode;
}

export interface ChartDownload {
  filename: string;
  /** Rows exactly as drawn. Serialised on click so the CSV cannot drift from the chart. */
  rows: readonly Record<string, unknown>[];
  columns: readonly string[];
}

export interface ChartFrameProps {
  locale: Locale;
  t: Translate;
  title: string;
  subtitle?: string;
  views: ChartView[];
  sources: Source[];
  download?: ChartDownload;
  /** Caveats specific to this chart — the country-level ones live on the country page. */
  notes?: string[];
  methodologyHref?: string;
  /** Controls placed in one row above the plot, per the interaction spec. */
  controls?: ReactNode;
}

const TIER_KEY: Record<number, string> = {
  1: 'chart.source.tier1',
  2: 'chart.source.tier2',
  3: 'chart.source.tier3',
};

function SourceEntry({ source, locale, t }: { source: Source; locale: Locale; t: Translate }) {
  return (
    <li className="cf-source">
      <span className={`cf-tier cf-tier-${source.tier}`}>
        {t(TIER_KEY[source.tier] ?? 'chart.source.tier3')}
      </span>
      <div className="cf-source-body">
        <p className="cf-source-line">
          <a href={source.url} rel="noreferrer noopener" target="_blank">
            {source.title}
          </a>
          {' — '}
          <span className="cf-source-publisher">{source.publisher}</span>
        </p>
        <blockquote className="cf-quote">{source.quote}</blockquote>
        <p className="cf-source-meta">
          {t('chart.source.accessed')} {formatDate(source.accessed, locale)}
          {source.archive_url ? (
            <>
              {' · '}
              <a href={source.archive_url} rel="noreferrer noopener" target="_blank">
                {t('chart.source.archived')}
              </a>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export function ChartFrame({
  locale,
  t,
  title,
  subtitle,
  views,
  sources,
  download,
  notes,
  methodologyHref,
  controls,
}: ChartFrameProps) {
  const [activeView, setActiveView] = useState(views[0]?.id ?? '');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const panelId = useId();

  const handleDownload = useCallback(() => {
    if (!download) return;
    const csv = toCsv(download.rows as Record<string, unknown>[], download.columns as string[]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = download.filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [download]);

  const current = views.find((view) => view.id === activeView) ?? views[0];

  return (
    <figure className="cf viz-root">
      <figcaption className="cf-head">
        <h3 className="cf-title">{title}</h3>
        {subtitle ? <p className="cf-subtitle">{subtitle}</p> : null}
      </figcaption>

      {views.length > 1 ? (
        <div className="cf-tabs" role="tablist" aria-label={title}>
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${view.id}`}
              aria-selected={view.id === current?.id}
              aria-controls={`${panelId}-panel`}
              className={`cf-tab${view.id === current?.id ? ' is-active' : ''}`}
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
      ) : null}

      {controls ? <div className="cf-controls">{controls}</div> : null}

      <div
        className="cf-panel"
        id={`${panelId}-panel`}
        role={views.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={current ? `${panelId}-tab-${current.id}` : undefined}
      >
        {current?.content}
      </div>

      {notes && notes.length > 0 ? (
        <div className="cf-notes">
          {notes.map((note) => (
            <p key={note}>
              <span className="cf-note-label">{t('chart.note')}</span> {note}
            </p>
          ))}
        </div>
      ) : null}

      <div className="cf-foot">
        <div className="cf-foot-actions">
          <button
            type="button"
            className="cf-link-button"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((open) => !open)}
          >
            {`${sourcesOpen ? t('chart.sources.hide') : t('chart.sources.show')} (${sources.length})`}
          </button>
          {download ? (
            <button type="button" className="cf-link-button" onClick={handleDownload}>
              {t('chart.download')}
            </button>
          ) : null}
          {methodologyHref ? (
            <a className="cf-link-button" href={methodologyHref}>
              {t('chart.methodology')}
            </a>
          ) : null}
        </div>

        {sourcesOpen ? (
          <ul className="cf-sources">
            {sources.map((source) => (
              <SourceEntry key={`${source.id}-${source.url}`} source={source} locale={locale} t={t} />
            ))}
          </ul>
        ) : null}
      </div>
    </figure>
  );
}

export default ChartFrame;
