exports.handler = async (event) => {
  const q = String((event.queryStringParameters && event.queryStringParameters.q) || "").trim();
  if (!q) return json({ error: "Inserisci una localita" }, 400);
  const api = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=" + encodeURIComponent(q);
  try {
    const response = await fetch(api, {
      headers: {
        accept: "application/json",
        "user-agent": "CamperMateItalia/1.0 (netlify)"
      }
    });
    if (!response.ok) return json({ error: "Geocodifica non disponibile" }, 502);
    const data = await response.json();
    if (!Array.isArray(data) || !data[0]) return json({ error: "Localita non trovata" }, 404);
    return json({ lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name });
  } catch (error) {
    return json({ error: "Geocodifica non disponibile" }, 502);
  }
};

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
