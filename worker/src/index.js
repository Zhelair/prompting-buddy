// Prompting Buddy — House Proxy (Cloudflare Worker)
// - Passphrase unlock -> signed token
// - Prompt Check endpoint (brain stays here)
// - Coach last 5 endpoint (brain stays here)
// - Daily limits reset at 00:00 Europe/Sofia

function parseAllowed(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map(x => String(x).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return s.split(/[\n,]+/g).map(x => x.trim()).filter(Boolean);
}

function base64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(b64url) {
  const b64 = String(b64url || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length % 4) || 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacVerify(secret, msg, signatureB64url) {
  const expected = await hmacSign(secret, msg);
  // constant-ish time compare
  if (expected.length !== signatureB64url.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) ok |= (expected.charCodeAt(i) ^ signatureB64url.charCodeAt(i));
  return ok === 0;
}

function getSofiaDayKey(timeZone) {
  const tz = timeZone || "Europe/Sofia";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  // en-CA yields YYYY-MM-DD
  return fmt.format(new Date());
}

function getAllowedOrigin(req, env) {
  const origin = req.headers.get("Origin") || "";
  const defaultOrigin = String(env.DEFAULT_ORIGIN || "https://zhelair.github.io");
  const raw = env.ALLOWED_ORIGINS;
  const list = raw ? parseAllowed(raw) : [defaultOrigin];
  const set = new Set(list.map(String));
  return set.has(origin) ? origin : defaultOrigin;
}

function corsHeaders(req, env) {
  const allowOrigin = getAllowedOrigin(req, env);
  const reqHdrs = req.headers.get("Access-Control-Request-Headers") || "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs || "Content-Type, Authorization, X-OU-PASS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function withCors(req, env, res) {
  const h = new Headers(res.headers);
  const cors = corsHeaders(req, env);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

function json(req, env, status, obj) {
  return withCors(
    req,
    env,
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    })
  );
}

function text(req, env, status, body) {
  return withCors(req, env, new Response(body, { status }));
}

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getBearer(req) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function issueToken(env, passphrase) {
  const secret = String(env.TOKEN_SECRET || "").trim();
  if (!secret) throw new Error("TOKEN_SECRET is not set");

  const ttlDays = Number(env.TOKEN_TTL_DAYS || "30");
  const exp = Date.now() + Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
  const sub = (await sha256Hex(passphrase)).slice(0, 32);

  const payload = { sub, exp };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(payloadStr);
  const sig = await hmacSign(secret, payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
    sub
  };
}

async function verifyToken(env, token) {
  const secret = String(env.TOKEN_SECRET || "").trim();
  if (!secret) return { ok: false, error: "server_misconfig" };
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { ok: false, error: "bad_token" };
  const [payloadB64, sig] = parts;
  const ok = await hmacVerify(secret, payloadB64, sig);
  if (!ok) return { ok: false, error: "bad_token" };
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    return { ok: false, error: "bad_token" };
  }
  if (!payload || !payload.sub || !payload.exp) return { ok: false, error: "bad_token" };
  if (Date.now() > Number(payload.exp)) return { ok: false, error: "expired" };
  return { ok: true, sub: String(payload.sub), exp: Number(payload.exp) };
}

// --- System prompts (kept private server-side)
const SYSTEM_PROMPT_CHECK = `You are an expert AI prompt reviewer and strict-but-kind teacher.

Your task is NOT to execute the user's request.
Your task is to analyze the quality of the prompt itself.

Tone:
- Calm
- Direct
- Teacher-like
- Respectful

Follow this process:
1) Diagnosis: how an AI will interpret the prompt, where it will fail.
2) What's missing: only what is truly needed to remove ambiguity.
3) Suggested improvements: concrete actions.
4) Golden Prompt: a single revised prompt, preserving intent.

Output JSON ONLY, no markdown, no extra text.
Schema:
{
  "diagnosis": ["..."],
  "missing": ["..."],
  "improvements": ["..."],
  "golden": "..."
}`;

const SYSTEM_COACH = `You are Prompting Buddy Coach.

You will receive up to the user's last 5 prompts (and sometimes pasted AI replies).
Find repeating issues and patterns.

Return JSON ONLY.
Schema:
{
  "mistakes": ["...", "...", "..."],
  "fixes": ["...", "...", "..."],
  "metaPrompt": "A reusable meta-prompt the user can paste before writing prompts"
}

Constraints:
- Exactly 3 mistakes and 3 fixes.
- Keep metaPrompt concise and reusable.`;

async function deepseekChat(env, { system, user, max_tokens }) {
  const apiKey = String(env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const url = "https://api.deepseek.com/chat/completions";
  const payload = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.2,
    max_tokens: max_tokens || 900
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${txt.slice(0, 400)}`);
  const j = JSON.parse(txt);
  const out = j?.choices?.[0]?.message?.content || "";
  return String(out);
}

// Durable Object: per-user per-day counters
export class LimitsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/get" && url.pathname !== "/inc") {
      return new Response("Not found", { status: 404 });
    }

    const dayKey = url.searchParams.get("day") || "";
    const kind = url.searchParams.get("kind") || "";
    const limit = Number(url.searchParams.get("limit") || "0");

    const key = `${dayKey}:${kind}`;
    const data = (await this.state.storage.get(key)) || { used: 0 };

    if (url.pathname === "/inc") {
      data.used += 1;
      await this.state.storage.put(key, data);
    }

    const used = Number(data.used || 0);
    const left = Math.max(0, limit - used);
    return new Response(JSON.stringify({ used, limit, left }), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}

async function getCounter(env, sub, dayKey, kind, limit, inc=false) {
  const id = env.LIMITS.idFromName(`u:${sub}`);
  const stub = env.LIMITS.get(id);
  const path = inc ? "/inc" : "/get";
  const url = `https://do${path}?day=${encodeURIComponent(dayKey)}&kind=${encodeURIComponent(kind)}&limit=${encodeURIComponent(String(limit))}`;
  const res = await stub.fetch(url);
  return await res.json();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(request, env, new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json(request, env, 200, { ok: true });
    }

    const timeZone = String(env.TIMEZONE || "Europe/Sofia");
    const dayKey = getSofiaDayKey(timeZone);

    // --- /unlock
    if (url.pathname === "/unlock") {
      if (request.method !== "POST") return json(request, env, 405, { error: "use_post" });
      const pass = String(request.headers.get("X-OU-PASS") || "").trim();
      if (!pass) return json(request, env, 400, { error: "missing_passphrase" });

      const allowed = parseAllowed(env.ALLOWED_PASSPHRASES);
      const ok = allowed.length ? allowed.includes(pass) : false;
      if (!ok) return json(request, env, 401, { error: "invalid_passphrase" });

      const issued = await issueToken(env, pass);
      return json(request, env, 200, { token: issued.token, expiresAt: issued.expiresAt });
    }

    // Everything below requires token
    const token = getBearer(request);
    const vt = await verifyToken(env, token);
    if (!vt.ok) return json(request, env, 401, { error: vt.error || "unauthorized" });

    const sub = vt.sub;

    // --- /status
    if (url.pathname === "/status") {
      if (request.method !== "GET") return json(request, env, 405, { error: "use_get" });
      const pLimit = Number(env.DAILY_PROMPT_LIMIT || "30");
      const cLimit = Number(env.DAILY_COACH_LIMIT || "5");
      const prompt = await getCounter(env, sub, dayKey, "prompt", pLimit, false);
      const coach = await getCounter(env, sub, dayKey, "coach", cLimit, false);
      return json(request, env, 200, { dayKey, prompt, coach });
    }

    // --- /prompt-check
    if (url.pathname === "/prompt-check") {
      if (request.method !== "POST") return json(request, env, 405, { error: "use_post" });

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return json(request, env, 200, { diagnosis: [], missing: [], improvements: [], golden: "" });

      const maxChars = Number(env.PROMPT_MAX_CHARS || "5000");
      if (prompt.length > maxChars) return json(request, env, 400, { error: "prompt_too_long" });

      const pLimit = Number(env.DAILY_PROMPT_LIMIT || "30");
      const p = await getCounter(env, sub, dayKey, "prompt", pLimit, true);
      if (p.used > p.limit) return json(request, env, 429, { error: "daily_prompt_limit" });

      const out = await deepseekChat(env, {
        system: SYSTEM_PROMPT_CHECK,
        user: prompt,
        max_tokens: 900
      });

      // Expect JSON-only output. If model misbehaves, wrap it.
      let parsed;
      try { parsed = JSON.parse(out); } catch { parsed = null; }
      if (!parsed || typeof parsed !== "object") {
        parsed = { diagnosis: ["Model output was not valid JSON."], missing: [], improvements: [], golden: out };
      }

      return json(request, env, 200, {
        diagnosis: Array.isArray(parsed.diagnosis) ? parsed.diagnosis : [],
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        golden: typeof parsed.golden === "string" ? parsed.golden : ""
      });
    }

    // --- /coach-last5
    if (url.pathname === "/coach-last5") {
      if (request.method !== "POST") return json(request, env, 405, { error: "use_post" });

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const items = Array.isArray(body.items) ? body.items : [];
      const last = items.slice(0, 5);
      if (!last.length) return json(request, env, 400, { error: "missing_items" });

      const maxChars = Number(env.COACH_MAX_CHARS || "8000");
      const chunks = [];
      for (let i = 0; i < last.length; i++) {
        const p = String(last[i]?.prompt || "").trim();
        const r = String(last[i]?.aiReply || "").trim();
        if (!p) continue;
        chunks.push(`PROMPT ${i+1}:\n${p}`);
        if (r) chunks.push(`AI REPLY ${i+1}:\n${r}`);
      }
      let combined = chunks.join("\n\n---\n\n");
      if (combined.length > maxChars) combined = combined.slice(0, maxChars);

      const cLimit = Number(env.DAILY_COACH_LIMIT || "5");
      const c = await getCounter(env, sub, dayKey, "coach", cLimit, true);
      if (c.used > c.limit) return json(request, env, 429, { error: "daily_coach_limit" });

      const out = await deepseekChat(env, {
        system: SYSTEM_COACH,
        user: combined,
        max_tokens: 700
      });

      let parsed;
      try { parsed = JSON.parse(out); } catch { parsed = null; }
      if (!parsed || typeof parsed !== "object") {
        parsed = { mistakes: ["Model output was not valid JSON."], fixes: [], metaPrompt: out };
      }

      const mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes.slice(0, 3) : [];
      const fixes = Array.isArray(parsed.fixes) ? parsed.fixes.slice(0, 3) : [];
      while (mistakes.length < 3) mistakes.push("");
      while (fixes.length < 3) fixes.push("");

      return json(request, env, 200, {
        mistakes,
        fixes,
        metaPrompt: typeof parsed.metaPrompt === "string" ? parsed.metaPrompt : ""
      });
    }

    return text(request, env, 404, "Not found");
  }
};
