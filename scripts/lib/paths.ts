import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const TAXONOMY_DIR = path.join(DATA_DIR, 'taxonomy');
export const COUNTRIES_DIR = path.join(DATA_DIR, 'countries');
export const CABINETS_DIR = path.join(DATA_DIR, 'cabinets');

export const SITE_DIR = path.join(REPO_ROOT, 'site');
/** Build output consumed by the Astro site and offered as public downloads. */
export const SITE_DATA_DIR = path.join(SITE_DIR, 'public', 'data');
export const DOCS_DIR = path.join(REPO_ROOT, 'docs');

/** Repo-relative path, for error messages that stay readable in CI logs. */
export function rel(absolute: string): string {
  return path.relative(REPO_ROOT, absolute) || '.';
}
