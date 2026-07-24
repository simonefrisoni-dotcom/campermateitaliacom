const SUPABASE_URL = process.env.SUPABASE_URL || "https://pjdfsixyldqodqwymnot.supabase.co";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_mUzoePPUqbVQqMtOR9BQGw_X50QXruR";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ error: "Metodo non valido." }, 405);
  try {
    const action = new URLSearchParams(event.queryStringParameters || {}).get("action") || "";
    const body = parseBody(event.body);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return json({ error: "Inserisci email e password." }, 400);
    if (password.length < 6) return json({ error: "La password deve avere almeno 6 caratteri." }, 400);

    if (action === "register") {
      if (!SERVICE_KEY) return json({ error: "Registrazione server non configurata." }, 500);
      await createConfirmedUser(email, password, body.name || "");
      const session = await passwordLogin(email, password);
      return json(session);
    }

    if (action === "login") {
      const session = await passwordLogin(email, password);
      return json(session);
    }

    return json({ error: "Azione non valida." }, 400);
  } catch (error) {
    return json({ error: friendlyError(error.message || "Accesso non riuscito.") }, error.status || 400);
  }
};

async function createConfirmedUser(email, password, name) {
  const response = await fetch(SUPABASE_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: "Bearer " + SERVICE_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: String(name || "") },
      app_metadata: { plan: "free", access: "free" }
    })
  });
  const data = await readJson(response);
  if (!response.ok) throw supabaseError(data, response.status);
  return data;
}

async function passwordLogin(email, password) {
  const response = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      authorization: "Bearer " + ANON_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const data = await readJson(response);
  if (!response.ok) throw supabaseError(data, response.status);
  return data;
}

async function readJson(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return { error: raw || "Risposta non valida." };
  }
}

function supabaseError(data, status) {
  const err = new Error(data.msg || data.message || data.error_description || data.error || "Errore Supabase");
  err.status = status;
  return err;
}

function friendlyError(message) {
  if (/already|exists|registered|duplicate/i.test(message)) return "Questa email e gia registrata: premi Accedi.";
  if (/invalid login|invalid credentials/i.test(message)) return "Email o password non corrette.";
  return message;
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
