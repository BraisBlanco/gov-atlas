/**
 * Eurostat GISCO -> site/src/geo/europe-paths.json
 *
 * Run by hand (`npm run build:geo`), not from `npm run build`. The output is committed,
 * so the site builds offline and a rebuild of the same commit draws the same coastlines.
 * Boundaries are not a dataset claim — they are the frame our claims are drawn on — so
 * they are vendored with their provenance rather than fetched at build time.
 *
 * Everything geographic happens here, at build time, and the component receives finished
 * SVG path strings. That is deliberate: no projection code, no topology library and no
 * 900 kB of world coordinates reach the browser, and the map renders identically with
 * JavaScript disabled.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { geoConicConformal, type GeoProjection } from 'd3-geo';

import { REPO_ROOT, rel } from './lib/paths.ts';
import { EU27 } from './lib/scope.ts';

/**
 * 1:60 million is the right generalisation for a ~720 px map of the whole continent:
 * finer data would be thrown away by the rounding below, and coarser would visibly
 * square off the Adriatic and the Aegean.
 */
const GISCO_URL =
  process.env.GOV_ATLAS_GISCO_URL ??
  'https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_60M_2024_4326.geojson';

/** GISCO's terms require this line wherever the geometry is displayed. */
const ATTRIBUTION = '© EuroGeographics, © UN-FAO, © Turkstat — administrative boundaries via Eurostat GISCO';

const OUT_FILE = path.join(REPO_ROOT, 'site', 'src', 'geo', 'europe-paths.json');

/**
 * The countries drawn, by GISCO `CNTR_ID`. Wider than our target scope on purpose: a
 * choropleth of only the covered countries is a shape nobody recognises, and the
 * uncovered ones are the honest part of a coverage map.
 */
const DRAWN = [
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL',
  'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD',
  'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM',
  'TR', 'UA', 'UK', 'VA', 'XK',
];

/** GISCO follows EU house style for two codes; the dataset keys on ISO 3166-1. */
const TO_ISO2: Record<string, string> = { EL: 'GR', UK: 'GB' };

/**
 * Geometry kept at all, in degrees. Generous on purpose — this window's job is only to
 * throw away land that would wreck the projection, not to compose the picture.
 *
 * Dropping the outermost regions — the Canaries, the Azores, the French overseas
 * départements — is a real editorial choice, because those are not "abroad": they are
 * part of the state whose ministries we count. The count is unaffected either way — a
 * country's shading reflects its whole central government, not the territory drawn — so
 * the map no longer carries a note about it; a silhouette is not the unit of analysis.
 */
const KEEP = { west: -28, east: 200, south: 31, north: 85 } as const;

/**
 * The window the frame is fitted to. Only countries inside it decide the scale, so
 * Siberia and Anatolia do not shrink Europe to make room for themselves.
 */
const FRAME = { west: -25, east: 41, south: 34, north: 71.5 } as const;

/**
 * Countries deliberately allowed to run off the edge.
 *
 * They belong on a map of Europe as context, but their far ends do not. Cutting them
 * geographically — at a meridian — draws a visible diagonal scar across the map, because
 * a meridian is not vertical in a conic projection. Cutting them in *projected* space
 * instead puts the cut exactly on the frame border, where a reader sees a map that
 * continues past the edge, which is the truth.
 */
const SPILL = new Set(['RU', 'TR']);

const SIZE = { width: 720, height: 660, pad: 6 } as const;

/** Below this a polygon is a smudge, so the country gets a locator dot instead. */
const MIN_AREA_PX = 26;

type Ring = [number, number][];

interface GeoJsonFeature {
  properties: Record<string, string>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

/**
 * Longitudes unwrapped to `[-30, 330)` before clipping.
 *
 * Without this, Russia's eastern tip sits at -170 and survives a west-of-45 clip, which
 * draws a sliver straight across the continent. Nothing else we render lives west of
 * -30, so the transform is a no-op for every other country.
 */
function unwrap(lon: number): number {
  return lon < -30 ? lon + 360 : lon;
}

/** Sutherland–Hodgman against one half-plane of a rectangle. */
function clipEdge(ring: Ring, inside: (p: [number, number]) => boolean, intersect: (a: [number, number], b: [number, number]) => [number, number]): Ring {
  const out: Ring = [];
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i] as [number, number];
    const previous = ring[(i + ring.length - 1) % ring.length] as [number, number];
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn) {
      if (!previousIn) out.push(intersect(previous, current));
      out.push(current);
    } else if (previousIn) {
      out.push(intersect(previous, current));
    }
  }
  return out;
}

/**
 * Clip a ring to an axis-aligned rectangle. Used twice: once in degrees to discard
 * distant territory, once in pixels to trim the spilling countries to the frame.
 */
function clipRing(ring: Ring, box: { west: number; east: number; south: number; north: number }): Ring {
  const lerpX = (a: [number, number], b: [number, number], x: number): [number, number] => [
    x,
    b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]),
  ];
  const lerpY = (a: [number, number], b: [number, number], y: number): [number, number] => [
    b[1] === a[1] ? a[0] : a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
    y,
  ];

  let out = ring;
  out = clipEdge(out, (p) => p[0] >= box.west, (a, b) => lerpX(a, b, box.west));
  if (out.length === 0) return out;
  out = clipEdge(out, (p) => p[0] <= box.east, (a, b) => lerpX(a, b, box.east));
  if (out.length === 0) return out;
  out = clipEdge(out, (p) => p[1] >= box.south, (a, b) => lerpY(a, b, box.south));
  if (out.length === 0) return out;
  return clipEdge(out, (p) => p[1] <= box.north, (a, b) => lerpY(a, b, box.north));
}

function ringsOf(feature: GeoJsonFeature): Ring[] {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);
  // Outer rings only. At this generalisation the holes are lakes and enclaves a few
  // pixels across, and keeping them would cost more than it shows.
  return polygons.flatMap((polygon) => (polygon[0] ? [polygon[0] as Ring] : []));
}

/** Shoelace area, in whatever units the ring is expressed in. */
function areaOf(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function centroidOf(ring: Ring): [number, number] {
  let x = 0;
  let y = 0;
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  if (area === 0) {
    const first = ring[0] as [number, number];
    return [first[0], first[1]];
  }
  return [x / (3 * area), y / (3 * area)];
}

const response = await fetch(GISCO_URL);
if (!response.ok) {
  console.error(`Could not fetch GISCO geometry: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const world = (await response.json()) as { features: GeoJsonFeature[] };

/** Clipped, unwrapped rings in degrees, per country. */
const clipped = new Map<string, { name: string; rings: Ring[] }>();

for (const id of DRAWN) {
  const feature = world.features.find((candidate) => candidate.properties.CNTR_ID === id);
  if (!feature) {
    console.warn(`  ! ${id} is not in the GISCO release; skipped`);
    continue;
  }
  const rings = ringsOf(feature)
    .map((ring) => clipRing(ring.map(([lon, lat]) => [unwrap(lon), lat] as [number, number]), KEEP))
    .filter((ring) => ring.length >= 3 && areaOf(ring) > 0);

  if (rings.length === 0) continue;
  clipped.set(TO_ISO2[id] ?? id, { name: feature.properties.NAME_ENGL ?? id, rings });
}

/**
 * Conic conformal on the two standard parallels Eurostat uses for continental maps.
 * A conformal projection is the right family here: a choropleth is read as "which
 * shape is this", and equal-area alternatives distort the shapes readers recognise.
 * Area distortion does not mislead, because area encodes nothing on this map — colour
 * does.
 */
const projection: GeoProjection = geoConicConformal().parallels([35, 65]).rotate([-10, 0]);

/**
 * The frame is fitted to Europe alone: the spilling countries are left out, and so are
 * stray rings whose centre falls outside the frame window — otherwise Madeira, 700 km
 * out in the Atlantic, would quietly set the map's southern edge.
 */
const framingRings = [...clipped.entries()].flatMap(([iso2, entry]) =>
  SPILL.has(iso2)
    ? []
    : entry.rings.filter((ring) => {
        const [lon, lat] = centroidOf(ring);
        return lon >= FRAME.west && lon <= FRAME.east && lat >= FRAME.south && lat <= FRAME.north;
      }),
);

projection.fitExtent(
  [
    [SIZE.pad, SIZE.pad],
    [SIZE.width - SIZE.pad, SIZE.height - SIZE.pad],
  ],
  {
    type: 'FeatureCollection',
    features: framingRings.map((ring) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring] },
    })),
  } as never,
);

const VIEW = { west: 0, east: SIZE.width, south: 0, north: SIZE.height } as const;

/** `M x,y L …Z` per ring, at one decimal — ~0.1 px, below anything a reader can see. */
function toPathString(rings: Ring[]): string {
  return rings
    .map(
      (ring) =>
        `M${ring
          .map(([x, y]) => `${round1(x)},${round1(y)}`)
          .join('L')}Z`,
    )
    .join('');
}

interface CountryShape {
  iso2: string;
  /** GISCO's English name, kept only as a build-time sanity check against our own data. */
  name_gisco: string;
  /** SVG path in the emitted viewBox, or null when the country is drawn as a dot. */
  d: string | null;
  /** Projected visual centre of the largest landmass: label anchor and dot position. */
  centroid: [number, number];
  /** Projected area of the largest ring, in px². Drives the locator-dot decision. */
  area_px: number;
  /** True when the country is too small to read as a polygon at this scale. */
  dot: boolean;
}

const countries: CountryShape[] = [];

for (const [iso2, entry] of [...clipped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const projectedRings = entry.rings
    .map((ring) => ring.map((point) => projection(point)).filter((point): point is [number, number] => point !== null))
    // The second clip, in pixels. Every cut edge now lies on the frame border.
    .map((ring) => (ring.length >= 3 ? clipRing(ring, VIEW) : ring))
    .filter((ring) => ring.length >= 3);

  const withArea = projectedRings
    .map((ring) => ({ ring, area: areaOf(ring) }))
    // Anything under half a pixel is a speck of noise, not an island.
    .filter(({ area }) => area >= 0.4)
    .sort((a, b) => b.area - a.area);

  if (withArea.length === 0) continue;

  const largest = withArea[0] as { ring: Ring; area: number };
  const dot = largest.area < MIN_AREA_PX;
  const centroid = centroidOf(largest.ring);

  countries.push({
    iso2,
    name_gisco: entry.name,
    d: dot ? null : toPathString(withArea.map(({ ring }) => ring)),
    centroid: [round1(centroid[0]), round1(centroid[1])],
    area_px: round1(largest.area),
    dot,
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const payload = {
  source: {
    publisher: 'Eurostat GISCO',
    dataset: 'CNTR_RG_60M_2024_4326 (countries, 1:60 million, EPSG:4326)',
    url: GISCO_URL,
    attribution: ATTRIBUTION,
  },
  projection: {
    name: 'd3.geoConicConformal',
    parallels: [35, 65],
    rotate: [-10, 0],
    keep: KEEP,
    frame: FRAME,
    spill: [...SPILL],
  },
  view_box: `0 0 ${SIZE.width} ${SIZE.height}`,
  width: SIZE.width,
  height: SIZE.height,
  /** Countries we set out to cover, so the map can distinguish "not yet" from "not in scope". */
  target_scope: EU27,
  countries,
};

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');

const dots = countries.filter((country) => country.dot);
console.log(`Wrote ${rel(OUT_FILE)}`);
console.log(`  ${countries.length} countries, ${dots.length} drawn as locator dots: ${dots.map((c) => c.iso2).join(', ')}`);
const missingTargets = EU27.filter((iso2) => !countries.some((country) => country.iso2 === iso2));
if (missingTargets.length > 0) {
  console.warn(`  ! target countries with no geometry: ${missingTargets.join(', ')}`);
}
