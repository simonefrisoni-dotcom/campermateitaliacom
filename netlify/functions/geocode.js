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
  const attempts = unique([q, "camping " + q, q + " camping", q + " campeggio"]);
  for (const term of attempts) {
    const data = await nominatim(term);
    const best = pickBest(data, q);
    if (best) return best;
  }
  return null;
}

async function nominatim(q) {
  const api = "https://nominatim.openstreetmap.org/search?format=json&limit=8&countrycodes=it&q=" + encodeURIComponent(q);
  const response = await fetch(api, {
    headers: {
      accept: "application/json",
      "user-agent": "CamperMateItalia/1.0 (netlify)"
    }
  });
  if (!response.ok) throw new Error("Nominatim non disponibile");
  return response.json();
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
