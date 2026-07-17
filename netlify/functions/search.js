exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const lat = Number(params.lat);
  const lon = Number(params.lon);
  const radiusKm = clamp(Number(params.radius) || 25, 1, 80);
  const kind = params.kind || "all";
  const limit = clamp(Number(params.limit) || 50, 20, 120);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json(400, { error: "Coordinate non valide" });
  }

  try {
    const radius = radiusKm * 1000;
    let results = [];

    if (kind === "all") {
      for (const currentKind of ["camp", "camper"] ) {
        try {
          results = results.concat(await overpassKind(lat, lon, radius, currentKind, limit));
        } catch (_error) {}
      }
      const seen = new Set();
      results = results.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    } else {
      results = await overpassKind(lat, lon, radius, kind, limit);
    }

    return json(200, { results: results.slice(0, limit) });
  } catch (error) {
    return json(500, { error: "Ricerca camping non disponibile ora" });
  }
};

async function overpassKind(lat, lon, radius, kind, limit) {
  const query = overpassQuery(lat, lon, radius, kind, limit);
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter"
  ];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "CamperMate Netlify app"
        },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error("Overpass " + response.status);
      const data = await response.json();
      return (data.elements || []).map(toResult).filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Overpass unavailable");
}

function overpassQuery(lat, lon, radius, kind, limit) {
  const filters = {
    camp: '["tourism"="camp_site"]',
    camper: '["tourism"="caravan_site"]',
    services: '["amenity"="sanitary_dump_station"]',
    free: '["fee"="no"]'
  };
  const filter = filters[kind] || filters.camp;
  return "[out:json][timeout:6];(node(around:" + radius + "," + lat + "," + lon + ")" + filter + ";way(around:" + radius + "," + lat + "," + lon + ")" + filter + ";relation(around:" + radius + "," + lat + "," + lon + ")" + filter + ";);out center " + limit + ";";
}

function toResult(element) {
  const tags = element.tags || {};
  const lat = element.lat || (element.center && element.center.lat);
  const lon = element.lon || (element.center && element.center.lon);

  if (!lat || !lon) return null;

  const kind =
    tags.tourism === "camp_site"
      ? "Campeggio"
      : tags.tourism === "caravan_site"
        ? "Area camper"
        : tags.amenity === "sanitary_dump_station"
          ? "Scarico camper"
          : tags.amenity === "parking"
            ? "Parcheggio"
            : "Sosta";

  const services = [
    tags.power_supply === "yes" ? "corrente" : "",
    tags.drinking_water === "yes" ? "acqua" : "",
    tags.sanitary_dump_station === "yes" ? "scarico" : "",
    tags.toilets === "yes" ? "wc" : ""
  ].filter(Boolean).join(", ");

  return {
    id: "osm-" + element.type + "-" + element.id,
    name: tags.name || tags.operator || kind,
    kind,
    free: tags.fee === "no" || tags.charge === "0" || /free|gratis/i.test(String(tags.description || "")),
    lat: Number(lat),
    lon: Number(lon),
    place: tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || tags["addr:province"] || "",
    notes: services || tags.description || tags.note || "",
    website: tags.website || tags["contact:website"] || tags.url || "",
    phone: tags.phone || tags["contact:phone"] || "",
    source: "OSM"
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    },
    body: JSON.stringify(body)
  };
}
