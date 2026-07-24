interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * NPS MCP — US National Park Service (free key, generous limits)
 *
 * Underrated trip-planning surface: every park, alert, campground, and
 * activity in the system. Pairs with `nws` for weather/closures and
 * `usgs-volcano` / `usgs-earthquake` for hazards.
 *
 * API: https://www.nps.gov/subjects/developer/api-documentation.htm
 * Auth: X-Api-Key header (or ?api_key= query param). Register at
 *       https://www.nps.gov/subjects/developer/get-started.htm
 *
 * Tools:
 * - list_parks:        search/list parks
 * - get_park:          full record by parkCode (e.g., "yose", "grca")
 * - list_alerts:       current park alerts (closures, warnings)
 * - list_campgrounds:  campgrounds in a park or state
 * - list_things_to_do: activities (hikes, ranger programs, scenic drives)
 */


const BASE_URL = 'https://developer.nps.gov/api/v1';

// Visitor Use Statistics service — KEYLESS, separate from developer.nps.gov.
const VISITATION_BASE = 'https://irmaservices.nps.gov/v3/rest/stats';

// Forgiving park NAME → 4-letter unit code map (codes ARE the developer.nps.gov parkCodes).
const PARK_ALIASES: Record<string, string> = {
  yellowstone: 'YELL',
  'grand canyon': 'GRCA',
  'great smoky mountains': 'GRSM',
  'great smokies': 'GRSM',
  smokies: 'GRSM',
  yosemite: 'YOSE',
  zion: 'ZION',
  acadia: 'ACAD',
  'rocky mountain': 'ROMO',
  'grand teton': 'GRTE',
  glacier: 'GLAC',
  olympic: 'OLYM',
  'joshua tree': 'JOTR',
  arches: 'ARCH',
  bryce: 'BRCA',
  'bryce canyon': 'BRCA',
  'death valley': 'DEVA',
  everglades: 'EVER',
  sequoia: 'SEQU',
  denali: 'DENA',
  shenandoah: 'SHEN',
  badlands: 'BADL',
  'big bend': 'BIBE',
};

function resolveUnitCode(park: string): string {
  const raw = park.trim();
  // A bare 4-letter code (any case) passes straight through.
  if (/^[A-Za-z]{4}$/.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase().replace(/\bnational park\b/g, '').replace(/\bnp\b/g, '').replace(/\s+/g, ' ').trim();
  if (PARK_ALIASES[key]) return PARK_ALIASES[key];
  // Last-ditch: if after stripping it's a 4-letter token, use it.
  if (/^[A-Za-z]{4}$/.test(key)) return key.toUpperCase();
  throw new Error(
    `Could not resolve park "${park}" to a 4-letter NPS unit code. Pass a code directly (e.g., "YELL", "GRCA", "GRSM") or a known park name (yellowstone, grand canyon, great smoky mountains, yosemite, zion, acadia, ...).`,
  );
}

const tools: McpToolExport['tools'] = [
  {
    name: 'list_parks',
    description:
      'List or search NPS parks. Filter by free-text query, state code (2-letter, comma-separated), or parkCode list. Returns full name, description, designation, states, GPS, address, official URL.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search' },
        state: { type: 'string', description: '2-letter state code(s), comma-separated (e.g., "CA,NV")' },
        park_code: { type: 'string', description: 'Specific parkCode(s), comma-separated (e.g., "yose,grca")' },
        limit: { type: 'number', description: 'Results (1-500, default 25)' },
        start: { type: 'number', description: '0-based offset (default 0)' },
      },
      required: [],
    },
  },
  {
    name: 'get_park',
    description:
      'Fetch a single park by parkCode. Returns full description, designation, activities, topics, address, contacts, operating hours, entrance fees, and image gallery.',
    inputSchema: {
      type: 'object',
      properties: {
        park_code: { type: 'string', description: '4-letter NPS parkCode (e.g., "yose", "grca", "yell")' },
      },
      required: ['park_code'],
    },
  },
  {
    name: 'list_alerts',
    description:
      'Current park alerts — closures, road conditions, weather warnings, danger advisories. Filter by parkCode or state.',
    inputSchema: {
      type: 'object',
      properties: {
        park_code: { type: 'string', description: 'parkCode(s), comma-separated' },
        state: { type: 'string', description: '2-letter state code' },
        query: { type: 'string', description: 'Free-text alert search' },
        limit: { type: 'number', description: '1-500 (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'list_campgrounds',
    description:
      'Campgrounds inside a park or state. Returns name, description, RV/tent capacity, amenities, reservation info, GPS.',
    inputSchema: {
      type: 'object',
      properties: {
        park_code: { type: 'string', description: 'parkCode (optional)' },
        state: { type: 'string', description: '2-letter state code (optional)' },
        query: { type: 'string', description: 'Free-text query (optional)' },
        limit: { type: 'number', description: '1-500 (default 25)' },
      },
      required: [],
    },
  },
  {
    name: 'list_things_to_do',
    description:
      'Activities recommended by the park service — hikes, ranger programs, scenic drives, ranger-led activities. Filter by parkCode or state.',
    inputSchema: {
      type: 'object',
      properties: {
        park_code: { type: 'string', description: 'parkCode (optional)' },
        state: { type: 'string', description: '2-letter state code (optional)' },
        query: { type: 'string', description: 'Free-text query (optional)' },
        limit: { type: 'number', description: '1-500 (default 25)' },
      },
      required: [],
    },
  },
  {
    name: 'nps_visitation',
    description:
      'National park visitor statistics — how many people visited a park. Answers "how many people visited Yellowstone", "NPS visitation numbers", "annual visitors to Grand Canyon", "busiest national park", "park attendance by month". Monthly + annual recreation and total visitor counts from the NPS Visitor Use Statistics service (keyless). Pass a park name or 4-letter code (e.g., YELL, GRCA, GRSM) and a year, or system_total:true for the whole national park system. Example: {"park":"yellowstone","year":2023}.',
    inputSchema: {
      type: 'object',
      properties: {
        park: {
          type: 'string',
          description: 'Park name or 4-letter NPS unit code (e.g., "yellowstone", "grand canyon", "YELL", "GRCA", "GRSM"). Omit when system_total is true.',
        },
        year: { type: 'number', description: 'Calendar year (default: most recent complete year). Data lags ~6-12 months.' },
        start_year: { type: 'number', description: 'Optional range start year (inclusive).' },
        end_year: { type: 'number', description: 'Optional range end year (inclusive).' },
        system_total: { type: 'boolean', description: 'If true, return system-wide totals across all NPS units for the year instead of a single park.' },
      },
      required: [],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Visitor Use Statistics is keyless — handle before the developer.nps.gov key gate.
  if (name === 'nps_visitation') return npsVisitation(args);

  const apiKey = (args._apiKey as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      'NPS requires an API key (free). Contact the operator about platform credentials, or BYO via ?_apiKey=<key> after registering at https://www.nps.gov/subjects/developer/get-started.htm.',
    );
  }
  switch (name) {
    case 'list_parks':
      return listParks(apiKey, args);
    case 'get_park':
      return getPark(apiKey, reqStr(args, 'park_code', '"yose" (Yosemite) or "grca" (Grand Canyon)'));
    case 'list_alerts':
      return listAlerts(apiKey, args);
    case 'list_campgrounds':
      return listCampgrounds(apiKey, args);
    case 'list_things_to_do':
      return listThingsToDo(apiKey, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

async function npsFetch<T>(apiKey: string, path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}?${params}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) throw new Error('NPS: unauthorized — check the API key');
  if (res.status === 429) throw new Error('NPS: rate-limit (HTTP 429)');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`NPS error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface NpsPark {
  id?: string;
  parkCode?: string;
  fullName?: string;
  name?: string;
  designation?: string;
  description?: string;
  url?: string;
  states?: string;
  latitude?: string;
  longitude?: string;
  latLong?: string;
  weatherInfo?: string;
  directionsInfo?: string;
  addresses?: { line1?: string; city?: string; stateCode?: string; postalCode?: string }[];
  operatingHours?: { name?: string; description?: string }[];
  entranceFees?: { cost?: string; title?: string; description?: string }[];
  activities?: { id?: string; name?: string }[];
  topics?: { id?: string; name?: string }[];
  images?: { url?: string; altText?: string; title?: string; caption?: string }[];
}

function normalizePark(p: NpsPark, full = false) {
  const base: Record<string, unknown> = {
    park_code: p.parkCode ?? null,
    full_name: p.fullName ?? null,
    name: p.name ?? null,
    designation: p.designation ?? null,
    description: p.description ?? null,
    url: p.url ?? null,
    states: p.states ?? null,
    latitude: p.latitude ? Number(p.latitude) : null,
    longitude: p.longitude ? Number(p.longitude) : null,
  };
  if (full) {
    base.weather_info = p.weatherInfo ?? null;
    base.directions_info = p.directionsInfo ?? null;
    base.addresses = p.addresses ?? [];
    base.operating_hours = (p.operatingHours ?? []).map((h) => ({ name: h.name ?? null, description: h.description ?? null }));
    base.entrance_fees = (p.entranceFees ?? []).map((f) => ({ title: f.title ?? null, cost: f.cost ?? null, description: f.description ?? null }));
    base.activities = (p.activities ?? []).map((a) => a.name).filter(Boolean);
    base.topics = (p.topics ?? []).map((t) => t.name).filter(Boolean);
    base.images = (p.images ?? []).map((i) => ({ url: i.url ?? null, title: i.title ?? null, alt: i.altText ?? null }));
  }
  return base;
}

async function listParks(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    limit: String(Math.min(500, Math.max(1, (args.limit as number) ?? 25))),
    start: String((args.start as number) ?? 0),
  });
  if (args.query) params.set('q', String(args.query));
  if (args.state) params.set('stateCode', String(args.state).toUpperCase());
  if (args.park_code) params.set('parkCode', String(args.park_code).toLowerCase());

  const data = await npsFetch<{ total?: string; data?: NpsPark[] }>(apiKey, '/parks', params);
  return {
    total: Number(data.total ?? 0),
    returned: data.data?.length ?? 0,
    parks: (data.data ?? []).map((p) => normalizePark(p, false)),
  };
}

async function getPark(apiKey: string, parkCode: string) {
  const params = new URLSearchParams({ parkCode: parkCode.toLowerCase(), limit: '1' });
  const data = await npsFetch<{ data?: NpsPark[] }>(apiKey, '/parks', params);
  const p = data.data?.[0];
  if (!p) throw new Error(`NPS: no park with parkCode "${parkCode}"`);
  return normalizePark(p, true);
}

interface NpsAlert {
  id?: string;
  url?: string;
  title?: string;
  parkCode?: string;
  description?: string;
  category?: string;
  lastIndexedDate?: string;
}

async function listAlerts(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    limit: String(Math.min(500, Math.max(1, (args.limit as number) ?? 50))),
  });
  if (args.park_code) params.set('parkCode', String(args.park_code).toLowerCase());
  if (args.state) params.set('stateCode', String(args.state).toUpperCase());
  if (args.query) params.set('q', String(args.query));

  const data = await npsFetch<{ total?: string; data?: NpsAlert[] }>(apiKey, '/alerts', params);
  return {
    total: Number(data.total ?? 0),
    returned: data.data?.length ?? 0,
    alerts: (data.data ?? []).map((a) => ({
      id: a.id ?? null,
      park_code: a.parkCode ?? null,
      title: a.title ?? null,
      description: a.description ?? null,
      category: a.category ?? null,
      url: a.url ?? null,
      last_indexed: a.lastIndexedDate ?? null,
    })),
  };
}

interface NpsCampground {
  id?: string;
  url?: string;
  name?: string;
  parkCode?: string;
  description?: string;
  reservationInfo?: string;
  fees?: { cost?: string; title?: string }[];
  campsites?: {
    totalSites?: string;
    rvOnly?: string;
    tentOnly?: string;
    rvSites?: string;
    walkBoatTo?: string;
    group?: string;
    horse?: string;
    other?: string;
  };
  latitude?: string;
  longitude?: string;
  accessibility?: { wheelchairAccess?: string; cellPhoneInfo?: string };
}

async function listCampgrounds(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    limit: String(Math.min(500, Math.max(1, (args.limit as number) ?? 25))),
  });
  if (args.park_code) params.set('parkCode', String(args.park_code).toLowerCase());
  if (args.state) params.set('stateCode', String(args.state).toUpperCase());
  if (args.query) params.set('q', String(args.query));

  const data = await npsFetch<{ total?: string; data?: NpsCampground[] }>(apiKey, '/campgrounds', params);
  return {
    total: Number(data.total ?? 0),
    returned: data.data?.length ?? 0,
    campgrounds: (data.data ?? []).map((c) => ({
      id: c.id ?? null,
      park_code: c.parkCode ?? null,
      name: c.name ?? null,
      description: c.description ?? null,
      reservation_info: c.reservationInfo ?? null,
      fees: (c.fees ?? []).map((f) => ({ title: f.title ?? null, cost: f.cost ?? null })),
      total_sites: c.campsites?.totalSites ?? null,
      rv_sites: c.campsites?.rvSites ?? null,
      tent_only: c.campsites?.tentOnly ?? null,
      group_sites: c.campsites?.group ?? null,
      walk_or_boat_to: c.campsites?.walkBoatTo ?? null,
      wheelchair_access: c.accessibility?.wheelchairAccess ?? null,
      latitude: c.latitude ? Number(c.latitude) : null,
      longitude: c.longitude ? Number(c.longitude) : null,
      url: c.url ?? null,
    })),
  };
}

interface NpsThingToDo {
  id?: string;
  url?: string;
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  duration?: string;
  durationDescription?: string;
  location?: string;
  parkCode?: string;
  doFeesApply?: string;
  isReservationRequired?: string;
  activities?: { name?: string }[];
  topics?: { name?: string }[];
  arePetsPermitted?: string;
  accessibilityInformation?: string;
}

async function listThingsToDo(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    limit: String(Math.min(500, Math.max(1, (args.limit as number) ?? 25))),
  });
  if (args.park_code) params.set('parkCode', String(args.park_code).toLowerCase());
  if (args.state) params.set('stateCode', String(args.state).toUpperCase());
  if (args.query) params.set('q', String(args.query));

  const data = await npsFetch<{ total?: string; data?: NpsThingToDo[] }>(apiKey, '/thingstodo', params);
  return {
    total: Number(data.total ?? 0),
    returned: data.data?.length ?? 0,
    activities: (data.data ?? []).map((t) => ({
      id: t.id ?? null,
      park_code: t.parkCode ?? null,
      title: t.title ?? null,
      short_description: t.shortDescription ?? null,
      duration: t.durationDescription ?? t.duration ?? null,
      location: t.location ?? null,
      fees_apply: t.doFeesApply ?? null,
      reservation_required: t.isReservationRequired ?? null,
      pets_permitted: t.arePetsPermitted ?? null,
      activities: (t.activities ?? []).map((a) => a.name).filter(Boolean),
      topics: (t.topics ?? []).map((t2) => t2.name).filter(Boolean),
      url: t.url ?? null,
    })),
  };
}

interface MonthRow {
  month: number;
  recreation_visitors: number;
  non_recreation_visitors: number;
}

function parseVisitationXml(xml: string): { unitCode: string | null; unitName: string | null; rows: MonthRow[] } {
  const rows: MonthRow[] = [];
  let unitCode: string | null = null;
  let unitName: string | null = null;
  const blocks = xml.match(/<VisitationData>[\s\S]*?<\/VisitationData>/g) ?? [];
  for (const block of blocks) {
    const num = (tag: string): number => {
      const m = block.match(new RegExp(`<${tag}>([0-9-]+)</${tag}>`));
      return m ? Number(m[1]) : 0;
    };
    const str = (tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return m ? m[1] : null;
    };
    if (unitCode === null) unitCode = str('UnitCode');
    if (unitName === null) unitName = str('UnitName');
    rows.push({
      month: num('Month'),
      recreation_visitors: num('RecreationVisitors'),
      non_recreation_visitors: num('NonRecreationVisitors'),
    });
  }
  rows.sort((a, b) => a.month - b.month);
  return { unitCode, unitName, rows };
}

async function fetchVisitationXml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/xml' }, signal: ctrl.signal });
    if (res.status === 404) {
      throw new Error('NPS visitation: not found (HTTP 404) — check the park code; visitation data lags ~6-12 months, try an earlier year.');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`NPS visitation error: ${res.status} ${body.slice(0, 200)}`);
    }
    return await res.text();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('NPS visitation: request timed out after 8s.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const SOURCE = 'NPS Visitor Use Statistics (irmaservices.nps.gov), keyless';

async function npsVisitation(args: Record<string, unknown>) {
  const mostRecentComplete = new Date().getUTCFullYear() - 1;
  const systemTotal = args.system_total === true || (!args.park && args.system_total !== false);

  // Year resolution: explicit year, or start/end range, else most recent complete year.
  const startYear = args.start_year != null ? Number(args.start_year) : args.year != null ? Number(args.year) : mostRecentComplete;
  const endYear = args.end_year != null ? Number(args.end_year) : args.year != null ? Number(args.year) : startYear;

  if (systemTotal) {
    // System-wide: /stats/total/{year} per year (returns the same ArrayOfVisitationData XML).
    const years: unknown[] = [];
    let grandRec = 0;
    let grandTotal = 0;
    for (let y = startYear; y <= endYear; y++) {
      const xml = await fetchVisitationXml(`${VISITATION_BASE}/total/${y}`);
      const { rows } = parseVisitationXml(xml);
      if (!rows.length) {
        throw new Error(`NPS visitation: no system total for ${y} — data lags ~6-12 months, try an earlier year.`);
      }
      const annualRec = rows.reduce((s, r) => s + r.recreation_visitors, 0);
      const annualTotal = rows.reduce((s, r) => s + r.recreation_visitors + r.non_recreation_visitors, 0);
      grandRec += annualRec;
      grandTotal += annualTotal;
      years.push({ year: y, monthly: rows, annual_recreation_visitors: annualRec, annual_total_visitors: annualTotal });
    }
    return {
      scope: 'system_total',
      park_code: null,
      park_name: 'All NPS units (system-wide)',
      year: startYear === endYear ? startYear : undefined,
      years: startYear === endYear ? undefined : years.map((y) => (y as { year: number }).year),
      monthly: startYear === endYear ? (years[0] as { monthly: MonthRow[] }).monthly : undefined,
      per_year: startYear === endYear ? undefined : years,
      annual_recreation_visitors: grandRec,
      annual_total_visitors: grandTotal,
      source: SOURCE,
    };
  }

  const unitCode = resolveUnitCode(String(args.park ?? ''));
  const url =
    `${VISITATION_BASE}/visitation?unitCodes=${unitCode}` +
    `&startMonth=1&startYear=${startYear}&endMonth=12&endYear=${endYear}`;
  const xml = await fetchVisitationXml(url);
  const { unitName, rows } = parseVisitationXml(xml);
  if (!rows.length) {
    throw new Error(
      `NPS visitation: no data for "${unitCode}" ${startYear}${endYear !== startYear ? `-${endYear}` : ''} — check the park code; visitation data lags ~6-12 months, try an earlier year.`,
    );
  }
  const annualRec = rows.reduce((s, r) => s + r.recreation_visitors, 0);
  const annualTotal = rows.reduce((s, r) => s + r.recreation_visitors + r.non_recreation_visitors, 0);
  const single = startYear === endYear;
  return {
    scope: 'park',
    park_code: unitCode,
    park_name: unitName ?? null,
    year: single ? startYear : undefined,
    start_year: single ? undefined : startYear,
    end_year: single ? undefined : endYear,
    monthly: rows,
    annual_recreation_visitors: annualRec,
    annual_total_visitors: annualTotal,
    source: SOURCE,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
