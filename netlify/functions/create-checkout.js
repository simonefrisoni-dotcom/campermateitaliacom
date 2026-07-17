exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Metodo non consentito" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = "https://www.campermateitalia.com";

  if (!secretKey || !priceId) {
    return json(503, { error: "Pagamento non ancora configurato: mancano le chiavi Stripe su Netlify" });
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", siteUrl + "/?plus=success");
  params.set("cancel_url", siteUrl + "/?plus=cancel");
  params.set("allow_promotion_codes", "true");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + secretKey,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await response.json();
  if (!response.ok) {
    return json(502, { error: data.error && data.error.message ? data.error.message : "Stripe non disponibile" });
  }

  return json(200, { url: data.url });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}
