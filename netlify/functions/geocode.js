exports.handler = async (event) => {
  const q = (event.queryStringParameters && event.queryStringParameters.q) || "";

  if (!q.trim()) {
    return json(400, { error: "Inserisci una zona da cercare" });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "CamperMate Netlify app"
      }
    });

    if (!response.ok) {
      return json(502, { error: "Geocodifica non disponibile ora" });
    }

    const data = await response.json();
    if (!data[0]) {
      return json(404, { error: "Zona non trovata" });
    }

    return json(200, {
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      label: data[0].display_name
    });
  } catch (error) {
    return json(500, { error: "Ricerca zona non riuscita" });
  }
};

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
