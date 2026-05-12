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
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
