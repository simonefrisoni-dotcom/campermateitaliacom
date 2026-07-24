const SUPABASE_URL = process.env.SUPABASE_URL || "https://pjdfsixyldqodqwymnot.supabase.co";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_mUzoePPUqbVQqMtOR9BQGw_X50QXruR";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "simonefrisoni@hotmail.com,martinamantovani81@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

exports.handler = async (event) => {
  try {
    if (!SERVICE_KEY) return json({ error: "Chiave admin Supabase mancante su Netlify." }, 500);
    const token = getBearer(event.headers.authorization || event.headers.Authorization || "");
    if (!token) return json({ error: "Accesso richiesto." }, 401);

    const currentUser = await supabase("/auth/v1/user", { token });
    const email = String(currentUser.email || "").toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return json({ error: "Non sei amministratore." }, 403);

    const action = new URLSearchParams(event.queryStringParameters || {}).get("action") || "list";
    if (action === "list") return listUsers(event);
    if (action === "set-premium" || action === "set-free") return setPremium(event);
    return json({ error: "Azione admin non valida." }, 400);
  } catch (error) {
    return json({ error: error.message || "Errore admin." }, error.status || 500);
  }
};

async function listUsers(event) {
  const body = parseBody(event.body);
  const q = String(body.q || "").trim().toLowerCase();
  const data = await supabase("/auth/v1/admin/users?page=1&per_page=200", { service: true });
  const users = (data.users || [])
    .filter((user) => !q || String(user.email || "").toLowerCase().includes(q))
    .map(cleanUser);
  return json({ users });
}

async function setPremium(event) {
  const body = parseBody(event.body);
  if (!body.userId) return json({ error: "Utente mancante." }, 400);
  const user = await supabase("/auth/v1/admin/users/" + encodeURIComponent(body.userId), { service: true });
  const appMetadata = Object.assign({}, user.app_metadata || {});
  if (body.unlocked) {
    appMetadata.plan = "premium";
    appMetadata.access = "premium";
  } else {
    appMetadata.plan = "free";
    appMetadata.access = "free";
  }
  const updated = await supabase("/auth/v1/admin/users/" + encodeURIComponent(body.userId), {
    method: "PUT",
    service: true,
    body: { app_metadata: appMetadata }
  });
  return json({ user: cleanUser(updated) });
}

async function supabase(path, options = {}) {
  const headers = {
    apikey: options.service ? SERVICE_KEY : ANON_KEY,
    authorization: options.service ? "Bearer " + SERVICE_KEY : "Bearer " + options.token,
    "content-type": "application/json"
  };
  const response = await fetch(SUPABASE_URL + path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    const err = new Error(data.msg || data.message || data.error_description || data.error || "Errore Supabase");
    err.status = response.status;
    throw err;
  }
  return data;
}

function cleanUser(user) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.app_metadata || {}
  };
}

function getBearer(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function parseBody(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch (error) {
    return {};
  }
}

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}
