const store = new Map();
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

const fetch = fetchFn;


function cachedGet(key) {
  const it = store.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) {
    store.delete(key);
    return null;
  }
  return it.val;
}

function cachedSet(key, val, ttlMs) {
  store.set(key, { val, exp: Date.now() + ttlMs });
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store.entries()) if (now > v.exp) store.delete(k);
}, 60_000).unref?.();


async function geocodeSpain(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      countrycodes: "es",
      addressdetails: "1",
      limit: "1",
      email: "tesahealth.tfg@gmail.com",
    }).toString();

  const res = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "TesaHealth/1.0 (TFG; contact: tesahealth.tfg@gmail.com)",
      "Referer": "https://tesahealth.local",
    },
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data) || !data.length) return null;

  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    display: data[0].display_name,
  };
}


const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildHospitalsQuery(lat, lon, radiusMeters) {
  const banName =
    "(?i)centro de salud|centro medico|centro médico|cl[ií]nica|consultorio|ambulatorio|cruz roja|red cross|farmacia|odont";

  return `
    [out:json][timeout:25];
    (
      nwr(around:${radiusMeters},${lat},${lon})["amenity"="hospital"]["name"!~"${banName}"];
      nwr(around:${radiusMeters},${lat},${lon})["healthcare"="hospital"]["name"!~"${banName}"];
    );
    out center tags;
  `;
}


async function postOverpass(url, query) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 18_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "TesaHealth/1.0 (TFG; contact: tesahealth.tfg@gmail.com)",
      },
      body: "data=" + encodeURIComponent(query),
      signal: ctrl.signal,
    });

    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    const json = await res.json().catch(() => null);
    if (!json) throw new Error("BAD_JSON");
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function overpassHospitals(lat, lon, radiusMeters) {
  const query = buildHospitalsQuery(lat, lon, radiusMeters);

  let lastErr = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        const json = await postOverpass(ep, query);
        return Array.isArray(json.elements) ? json.elements : [];
      } catch (e) {
        lastErr = e;
        if (String(e.message) === "RATE_LIMIT") continue;
      }
    }
    await sleep(800 * Math.pow(2, attempt));
  }

  if (String(lastErr?.message) === "RATE_LIMIT") throw new Error("RATE_LIMIT");
  throw lastErr || new Error("OVERPASS_FAILED");
}


async function geocodeSpainCached(q) {
  const key = `geo:geocode:es:${String(q).trim().toLowerCase()}`;
  const cached = cachedGet(key);
  if (cached) return { ...cached, cached: true };

  const r = await geocodeSpain(q);
  if (!r) return null;

  cachedSet(key, r, 24 * 60 * 60 * 1000);
  return { ...r, cached: false };
}

async function hospitalsCached({ lat, lon, radiusKm }) {
  const rKm = Math.max(1, Math.min(200, Number(radiusKm || 10)));
  const radiusMeters = Math.round(rKm * 1000);

  const latR = Math.round(lat * 10000) / 10000;
  const lonR = Math.round(lon * 10000) / 10000;

  const key = `geo:hosp:lat=${latR}:lon=${lonR}:r=${radiusMeters}`;
  const cached = cachedGet(key);
  if (cached) return { elements: cached, cached: true, radiusKm: rKm };

  const elements = await overpassHospitals(lat, lon, radiusMeters);
  cachedSet(key, elements, 5 * 60 * 1000);

  return { elements, cached: false, radiusKm: rKm };
}

module.exports = {
  geocodeSpainCached,
  hospitalsCached,
};
