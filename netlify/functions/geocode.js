exports.handler = async (event) => {
  const q = String((event.queryStringParameters && event.queryStringParameters.q) || "").trim();
  if (!q) return json({ error: "Inserisci nome camping o localita" }, 400);
  try {
    const data = await findPlace(q);
    if (!data) return json({ error: "Camping o localita non trovati" }, 404);
    return json({ lat: Number(data.lat), lon: Number(data.lon), label: data.display_name, search: q });
  } catch (error) {
    return json({ error: "Geocodifica non disponibile" }, 502);
  }
};

async function findPlace(q) {
  const attempts = unique([
    q,
    "camping " + q,
    "campeggio " + q,
    q + " camping",
    q + " campeggio",
    q + " Italia",
    q + " Europe"
  ]);
  for (const term of attempts) {
    const data = await nominatim(term, true);
    const best = pickBest(data, q);
    if (best) return best;
  }
  for (const term of attempts) {
    const data = await nominatim(term, false);
    const best = pickBest(data, q);
    if (best) return best;
  }
  const osm = await overpassName(q);
  if (osm) return osm;
  return null;
}

async function nominatim(q, italyOnly) {
  const api = "https://nominatim.openstreetmap.org/search?format=json&limit=10&addressdetails=1&extratags=1" + (italyOnly ? "&countrycodes=it" : "") + "&q=" + encodeURIComponent(q);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const response = await fetch(api, {
    signal: controller.signal,
    headers: {
      accept: "application/json",
      "user-agent": "CamperMateItalia/1.0 (netlify)"
    }
  });
  clearTimeout(timer);
  if (!response.ok) throw new Error("Nominatim non disponibile");
  return response.json();
}

async function overpassName(q) {
  const safeName = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const query = `[out:json][timeout:18];area["ISO3166-1"="IT"][admin_level=2]->.it;(nwr(area.it)["tourism"~"camp_site|caravan_site"]["name"~"${safeName}",i];nwr(area.it)["name"~"${safeName}",i]["amenity"="parking"];);out center 1;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "CamperMateItalia/1.0"
    },
    body: "data=" + encodeURIComponent(query)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const first = data.elements && data.elements[0];
  if (!first) return null;
  const center = first.center || first;
  if (!center.lat || !center.lon) return null;
  const name = first.tags && (first.tags.name || first.tags.operator);
  return {
    lat: center.lat,
    lon: center.lon,
    display_name: name ? name + ", Italia" : q + ", Italia"
  };
}

function pickBest(items, q) {
  if (!Array.isArray(items) || !items.length) return null;
  const needle = normalize(q);
  const scored = items.map((item) => {
    const label = normalize(item.display_name || item.name || "");
    const type = normalize([item.class, item.type].filter(Boolean).join(" "));
    let score = 0;
    if (label.includes(needle)) score += 20;
    if (/camp|tourism|caravan|hotel|amenity/.test(type)) score += 12;
    if (/camping|campeggio|camp site|caravan/.test(label)) score += 8;
    if (normalize(item.extratags && item.extratags.tourism).includes("camp")) score += 12;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].item;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=900"
    },
    body: JSON.stringify(body)
  };
}
