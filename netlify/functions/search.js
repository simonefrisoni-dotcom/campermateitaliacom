exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const lat = Number(params.lat);
  const lon = Number(params.lon);
  const radiusKm = Math.min(Math.max(Number(params.radius) || 15, 1), 80);
  const limit = Math.min(Math.max(Number(params.limit) || 50, 20), 300);
  const kind = String(params.kind || "all");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "Coordinate mancanti" }, 400);
  const body = buildQuery(lat, lon, radiusKm * 1000, kind, limit);
  try {
    const data = await fetchOverpass(body);
    const results = (data.elements || []).map(toResult).filter(Boolean).slice(0, limit);
    return json({ results, source: "OpenStreetMap" });
  } catch (error) {
    return json({ error: "Ricerca camping momentaneamente lenta. Riprova con raggio 10 km o tra pochi secondi." }, 502);
  }
};

async function fetchOverpass(query) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter"
  ];
  let lastError = "Overpass non disponibile";
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "accept": "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "CamperMateItalia/1.0"
        },
        body: "data=" + encodeURIComponent(query)
      });
      clearTimeout(timer);
      const raw = await response.text();
      if (!response.ok) {
        lastError = raw || ("HTTP " + response.status);
        continue;
      }
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      clearTimeout(timer);
      lastError = error && error.message ? error.message : "Overpass non disponibile";
    }
  }
  throw new Error(lastError);
}

function buildQuery(lat, lon, radius, kind, limit) {
  const filters = [];
  if (kind === "all" || kind === "camp") filters.push(`nwr(around:${radius},${lat},${lon})["tourism"="camp_site"];`);
  if (kind === "all" || kind === "camper") filters.push(`nwr(around:${radius},${lat},${lon})["tourism"="caravan_site"];`);
  if (kind === "all" || kind === "services") filters.push(`nwr(around:${radius},${lat},${lon})["amenity"="sanitary_dump_station"];`);
  if (kind === "free") filters.push(`nwr(around:${radius},${lat},${lon})["fee"="no"];`);
  if (kind === "all") filters.push(`nwr(around:${radius},${lat},${lon})["amenity"="parking"]["fee"="no"];`);
  return `[out:json][timeout:25];(${filters.join("")});out center ${limit};`;
}

function toResult(el) {
  const tags = el.tags || {};
  const lat = el.lat || (el.center && el.center.lat);
  const lon = el.lon || (el.center && el.center.lon);
  if (!lat || !lon) return null;
  const kind = tags.tourism === "camp_site" ? "Campeggio" : tags.tourism === "caravan_site" ? "Area camper" : tags.amenity === "sanitary_dump_station" ? "Scarico camper" : tags.amenity === "parking" ? "Parcheggio" : "Sosta";
  const free = tags.fee === "no" || tags.charge === "0" || /free|gratis/i.test(String(tags.description || ""));
  const services = [
    tags.power_supply === "yes" ? "corrente" : "",
    tags.drinking_water === "yes" ? "acqua" : "",
    tags.sanitary_dump_station === "yes" ? "scarico" : "",
    tags.toilets === "yes" ? "wc" : ""
  ].filter(Boolean).join(", ");
  return {
    id: "osm-" + el.type + "-" + el.id,
    name: tags.name || tags.operator || kind,
    kind,
    free,
    lat: Number(lat),
    lon: Number(lon),
    place: tags.addr_city || tags.addr_town || tags.addr_village || tags.addr_province || "",
    notes: services || tags.description || tags.note || "",
    website: tags.website || tags["contact:website"] || tags.url || "",
    phone: tags.phone || tags["contact:phone"] || "",
    source: "OSM"
  };
}

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600"
    },
    body: JSON.stringify(body)
  };
}
