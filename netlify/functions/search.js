exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const lat = Number(params.lat);
  const lon = Number(params.lon);
  const radiusKm = Math.min(Math.max(Number(params.radius) || 15, 1), 80);
  const limit = Math.min(Math.max(Number(params.limit) || 50, 20), 300);
  const kind = String(params.kind || "all");
  const name = String(params.name || params.q || "").trim();
  const knownOnly = knownResultsForName(name);
  if (knownOnly.length && (kind === "all" || kind === "camp")) {
    return json({ results: knownOnly.slice(0, limit), source: "Sito ufficiale" });
  }
  if (String(params.nationwide || "") === "1" && name) {
    return searchItalyByName(name, kind, limit);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "Coordinate mancanti" }, 400);
  const body = buildQuery(lat, lon, radiusKm * 1000, kind, limit);
  try {
    const data = await fetchOverpass(body);
    const results = sortByName(addKnownResults((data.elements || []).map(toResult).filter(Boolean), name), name).slice(0, limit);
    return json({ results, source: "OpenStreetMap" });
  } catch (error) {
    return json({ error: "Ricerca camping momentaneamente lenta. Riprova con raggio 10 km o tra pochi secondi." }, 502);
  }
};

async function searchItalyByName(name, kind, limit) {
  const body = buildItalyNameQuery(name, kind, limit);
  try {
    const data = await fetchOverpass(body);
    const results = sortByName(addKnownResults((data.elements || []).map(toResult).filter(Boolean), name), name)
      .filter((item) => scoreName(item, normalize(name)) > 0)
      .slice(0, limit);
    return json({ results, source: "OpenStreetMap Italia" });
  } catch (error) {
    return json({ error: "Ricerca nazionale momentaneamente lenta. Riprova tra pochi secondi." }, 502);
  }
}

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

function addKnownResults(results, name) {
  const known = knownResultsForName(name);
  if (!known.length) return results;
  const ids = new Set(results.map((item) => item.id));
  return known.filter((item) => !ids.has(item.id)).concat(results);
}

function knownResultsForName(name) {
  const needle = normalize(name);
  if (!needle) return [];
  const known = [];
  if (["andalo camping life", "camping life andalo", "camping life park", "camping andalo life", "andalo life camping"].some((label) => needle.includes(label) || label.includes(needle))) {
    known.push({
      id: "known-andalo-camping-life",
      name: "Camping Life Park - Andalo Life",
      kind: "Campeggio",
      free: false,
      lat: 46.169573,
      lon: 11.004831,
      place: "Andalo",
      notes: "Camping ufficiale Andalo Life, Viale del Parco 1",
      website: "https://www.andalo.life/it/camping",
      phone: "+39 0461 585776",
      source: "Sito ufficiale"
    });
  }
  return known;
}

function sortByName(results, name) {
  const needle = normalize(name);
  if (!needle) return results;
  return results.sort((a, b) => scoreName(b, needle) - scoreName(a, needle));
}

function scoreName(result, needle) {
  const haystack = normalize([result.name, result.place, result.kind, result.notes].join(" "));
  if (!haystack) return 0;
  if (haystack === needle) return 100;
  if (haystack.includes(needle)) return 60;
  return needle.split(" ").filter((part) => part && haystack.includes(part)).length * 10;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function buildItalyNameQuery(name, kind, limit) {
  const token = bestSearchToken(name);
  const filters = [];
  const nameFilter = `["name"~"${token}",i]`;
  const operatorFilter = `["operator"~"${token}",i]`;
  if (kind === "all" || kind === "camp") {
    filters.push(`nwr(area.it)["tourism"="camp_site"]${nameFilter};`);
    filters.push(`nwr(area.it)["tourism"="camp_site"]${operatorFilter};`);
  }
  if (kind === "all" || kind === "camper") {
    filters.push(`nwr(area.it)["tourism"="caravan_site"]${nameFilter};`);
    filters.push(`nwr(area.it)["tourism"="caravan_site"]${operatorFilter};`);
  }
  if (kind === "all" || kind === "services") filters.push(`nwr(area.it)["amenity"="sanitary_dump_station"]${nameFilter};`);
  if (kind === "free") {
    filters.push(`nwr(area.it)["amenity"="parking"]["fee"="no"]${nameFilter};`);
    filters.push(`nwr(area.it)["tourism"="caravan_site"]["fee"="no"]${nameFilter};`);
  }
  return `[out:json][timeout:25];area["ISO3166-1"="IT"][admin_level=2]->.it;(${filters.join("")});out center ${Math.min(Math.max(limit * 3, 60), 500)};`;
}

function bestSearchToken(name) {
  const stop = new Set(["camping", "campeggio", "area", "sosta", "camper", "agricampeggio", "italia", "life", "park"]);
  const parts = normalize(name).split(" ").filter((part) => part.length > 2 && !stop.has(part));
  const best = (parts.sort((a, b) => b.length - a.length)[0] || normalize(name).split(" ")[0] || "").slice(0, 40);
  return best.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
