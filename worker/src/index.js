var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var LimitsDO = class {
  static {
    __name(this, "LimitsDO");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("use_post", { status: 405 });
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const key = String(body.key || "").trim();
    const limit = Number(body.limit || 0);
    const incr = Boolean(body.incr);
    if (!key) return jsonRaw(400, { error: "missing_key" });
    if (!Number.isFinite(limit) || limit < 0) return jsonRaw(400, { error: "bad_limit" });
    const used = await this.state.storage.get(key) || 0;
    const next = incr ? used + 1 : used;
    if (incr) await this.state.storage.put(key, next);
    return jsonRaw(200, { used: next, limit });
  }
};
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return corsPreflight(request, env);
    if (url.pathname === "/" && request.method === "GET") {
      return corsJson(request, env, 200, {
        ok: true,
        service: "prompting-buddy-house",
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (url.pathname === "/unlock") {
      const passphrase = request.headers.get("x-ou-pass");
      if (!passphrase || !passphrase.trim()) {
        return new Response(JSON.stringify({ error: "missing_passphrase" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request, env) }
        });
      }
      const allowedPasses = (env.ALLOWED_PASSPHRASES || "").split(",").map((p) => p.trim()).filter(Boolean);
      if (!allowedPasses.includes(passphrase.trim())) {
        return new Response(JSON.stringify({ error: "invalid_passphrase" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request, env) }
        });
      }
      if (request.method !== "POST") return corsJson(request, env, 405, { error: "use_post" });
      const origin = request.headers.get("Origin") || "";
      if (!originAllowed(origin, env)) return corsJson(request, env, 403, { error: "origin_not_allowed" });
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      if (!passphrase) return corsJson(request, env, 400, { error: "missing_passphrase" });
      const allowed = getAllowedPassphrases(env);
      if (!allowed.length || !allowed.includes(passphrase)) {
        return corsJson(request, env, 401, { error: "invalid_passphrase" });
      }
      const device = (request.headers.get('x-ou-device') || request.headers.get('user-agent') || '').trim();
      const sub = await sha256Hex(passphrase.trim() + '|' + device);
      const ttlDays = Number(env.TOKEN_TTL_DAYS || 30);
      const exp = Date.now() + Math.max(1, ttlDays) * 24 * 60 * 60 * 1e3;
      const token = await signToken({ sub, exp }, env.TOKEN_SECRET || "");
      return corsJson(request, env, 200, { token, exp });
    }
    if (url.pathname === "/prompt-check" || url.pathname === "/coach-last5" || url.pathname === "/status" || url.pathname === "/limits") {
      const tok = getBearerToken(request);
      if (!tok) return corsJson(request, env, 401, { error: "missing_token" });
      const payload = await verifyToken(tok, env.TOKEN_SECRET || "");
      if (!payload?.sub) return corsJson(request, env, 401, { error: "bad_token" });
      if (payload.exp && Date.now() > Number(payload.exp)) return corsJson(request, env, 401, { error: "token_expired" });
      const sub = String(payload.sub);
      const tz = String(env.TIMEZONE || "Europe/Sofia");
      const dayKey = dayKeyForTz(tz);
      if (url.pathname === "/status" || url.pathname === "/limits") {
        if (request.method !== "GET") return corsJson(request, env, 405, { error: "use_get" });
        const pLimit = Number(env.DAILY_PROMPT_LIMIT || 30);
        const cLimit = Number(env.DAILY_COACH_LIMIT || 5);
        const pc = await getCounter(env, sub, dayKey, "prompt", pLimit, false);
        const cc = await getCounter(env, sub, dayKey, "coach", cLimit, false);
        const promptLeft = Math.max(0, pc.limit - pc.used);
        const coachLeft = Math.max(0, cc.limit - cc.used);
        return corsJson(request, env, 200, {
          prompt: { used: pc.used, limit: pc.limit, left: promptLeft },
          coach: { used: cc.used, limit: cc.limit, left: coachLeft },
          dayKey
        });
      }
      if (url.pathname === "/prompt-check") {
        if (request.method !== "POST") return corsJson(request, env, 405, { error: "use_post" });
        let body = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return corsJson(request, env, 400, { error: "missing_prompt" });
        const lensRaw = String(body.lens || body.mode || body.reasoningLens || "").trim().toLowerCase();
        const lens = lensRaw === "thinker" || lensRaw === "philosopher" ? "thinker" : lensRaw === "creator" || lensRaw === "director" ? "creator" : "auditor";
        const systemPrompt = lens === "thinker" ? SYSTEM_PROMPT_CHECK_THINKER : lens === "creator" ? SYSTEM_PROMPT_CHECK_CREATOR : SYSTEM_PROMPT_CHECK_AUDITOR;
        const maxChars = Number(env.PROMPT_MAX_CHARS || 2e4);
        const clipped = prompt.length > maxChars ? prompt.slice(0, maxChars) : prompt;
        const pLimit = Number(env.DAILY_PROMPT_LIMIT || 30);
        const pc = await getCounter(env, sub, dayKey, "prompt", pLimit, true);
        if (pc.used > pc.limit) return corsJson(request, env, 429, { error: "daily_prompt_limit" });
        const out = await deepseekChat(env, {
          system: systemPrompt,
          user: clipped,
          max_tokens: 800
        });
        const parsed = normalizePromptCheckPayload(parseJsonFromText(out) || out);
        return corsJson(request, env, 200, parsed);
      }
      if (url.pathname === "/coach-last5") {
        if (request.method !== "POST") return corsJson(request, env, 405, { error: "use_post" });
        let body = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const items = Array.isArray(body.items) ? body.items : [];
        const last = items.slice(0, 5);
        if (!last.length) return corsJson(request, env, 400, { error: "missing_items" });
        const maxChars = Number(env.COACH_MAX_CHARS || 2e4);
        const chunks = [];
        for (let i = 0; i < last.length; i++) {
          const p = String(last[i]?.prompt || "").trim();
          const r = String(last[i]?.aiReply || "").trim();
          if (!p) continue;
          chunks.push(`PROMPT ${i + 1}:
${p}`);
          if (r) chunks.push(`AI REPLY ${i + 1}:
${r}`);
        }
        let combined = chunks.join("\n\n---\n\n");
        if (combined.length > maxChars) combined = combined.slice(0, maxChars);
        const cLimit = Number(env.DAILY_COACH_LIMIT || 5);
        const cc = await getCounter(env, sub, dayKey, "coach", cLimit, true);
        if (cc.used > cc.limit) return corsJson(request, env, 429, { error: "daily_coach_limit" });
        const out = await deepseekChat(env, {
          system: SYSTEM_COACH,
          user: combined,
          max_tokens: 700
        });
        const parsedObj = parseJsonFromText(out);
        let parsed = parsedObj && typeof parsedObj === "object" ? parsedObj : null;
        if (parsed && typeof parsed.metaPrompt === "string") {
          const inner = parseJsonFromText(parsed.metaPrompt);
          if (inner && typeof inner === "object") parsed = { ...parsed, ...inner };
        }
        if (!parsed) parsed = { mistakes: ["Model output was not valid JSON."], fixes: [], metaPrompt: out };
        const mistakesRaw = parsed.mistakes ?? parsed.errors ?? parsed.problem ?? parsed.notes;
        const fixesRaw = parsed.fixes ?? parsed.suggestions ?? parsed.improvements;
        const mistakes = Array.isArray(mistakesRaw) ? mistakesRaw.map((x) => String(x)).filter(Boolean).slice(0, 3) : [];
        const fixes = Array.isArray(fixesRaw) ? fixesRaw.map((x) => String(x)).filter(Boolean).slice(0, 3) : [];
        const metaPrompt = String(parsed.metaPrompt ?? parsed.meta ?? "").trim();
        return corsJson(request, env, 200, { mistakes, fixes, metaPrompt });
      }
    }
    return corsText(request, env, 404, "Not found");
  }
};
var SYSTEM_PROMPT_CHECK_AUDITOR = `You are an expert AI prompt reviewer and strict-but-kind teacher.

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

Return ONLY valid JSON, no markdown, no code fences, no extra text.

Hard rules:
The value of "golden" must NOT contain "{" or "}" characters.
Output only JSON. No extra text.
No markdown, no backticks, no code fences.
"diagnosis" must contain 1–3 short items (each under 250 characters).
"missing" must contain 1–3 short items (each under 250 characters).
"improvements" must contain 1–3 short items (each under 250 characters).
"golden" must be under 1200 characters.
Keep output concise. Do not exceed necessary length.
If "golden" contains "{" or "}" then you MUST output FORMAT_ERROR instead of any other content.
If you are about to include "{" or "}" anywhere in "golden", STOP and output FORMAT_ERROR JSON only.

Use EXACTLY these keys and no others:
"diagnosis": array of strings
"missing": array of strings
"improvements": array of strings
"golden": string

Do NOT put JSON inside any field.
"golden" must be plain text only. It must NOT contain JSON, braces that start an object, or the words "diagnosis", "missing", "improvements" as labels.

If you break any rule, output exactly:
{"diagnosis":["FORMAT_ERROR"],"missing":[],"improvements":[],"golden":"FORMAT_ERROR"}
Schema:
{
  "diagnosis": ["..."],
  "missing": ["..."],
  "improvements": ["..."],
  "golden": "..."
}`;
var SYSTEM_PROMPT_CHECK_THINKER = `You are an expert AI prompt reviewer using the "Thinker" reasoning lens.

Your task is NOT to execute the user's request.
Your task is to analyze the quality of the prompt itself and make it think better.

Tone:
- Calm
- Curious
- Clear, not fluffy

Follow this process:
1) Diagnosis: how an AI will interpret the prompt and what assumptions it will make.
2) What's missing: only what truly changes the outcome (decision criteria, constraints, context).
3) Suggested improvements: concrete actions, including 1-2 alternative framings if helpful.
4) Golden Prompt: a single revised prompt that encourages exploration (options, tradeoffs, criteria) while preserving intent.

Return ONLY valid JSON, no markdown, no code fences, no extra text.
Hard rules:
The value of "golden" must NOT contain "{" or "}" characters.
Output only JSON. No extra text.
No markdown, no backticks, no code fences.
"diagnosis" must contain 1–3 short items (each under 250 characters).
"missing" must contain 1–3 short items (each under 250 characters).
"improvements" must contain 1–3 short items (each under 250 characters).
"golden" must be under 1200 characters.
Keep output concise. Do not exceed necessary length.
If "golden" contains "{" or "}" then you MUST output FORMAT_ERROR instead of any other content.
If you are about to include "{" or "}" anywhere in "golden", STOP and output FORMAT_ERROR JSON only.

Use EXACTLY these keys and no others:
"diagnosis": array of strings
"missing": array of strings
"improvements": array of strings
"golden": string

Do NOT put JSON inside any field.
"golden" must be plain text only. It must NOT contain JSON, braces that start an object, or the words "diagnosis", "missing", "improvements" as labels.

If you break any rule, output exactly:
{"diagnosis":["FORMAT_ERROR"],"missing":[],"improvements":[],"golden":"FORMAT_ERROR"}
Schema:
{
  "diagnosis": ["..."],
  "missing": ["..."],
  "improvements": ["..."],
  "golden": "..."
}`;
var SYSTEM_PROMPT_CHECK_CREATOR = `You are an expert AI prompt reviewer using the "Creator" reasoning lens.

Your task is NOT to execute the user's request.
Your task is to analyze the quality of the prompt itself and make it create better.

Tone:
- Direct
- Creative, but practical
- Respectful

Follow this process:
1) Diagnosis: how an AI will interpret the prompt (tone, audience, style) and where it will get generic.
2) What's missing: audience, tone, format, constraints, references, examples (only what matters).
3) Suggested improvements: concrete actions to make output vivid and on-brand (structure, beats, style notes).
4) Golden Prompt: a single revised prompt that adds creative direction (audience, tone, style constraints) while preserving intent.

Return ONLY valid JSON, no markdown, no code fences, no extra text.
Hard rules:
The value of "golden" must NOT contain "{" or "}" characters.
Output only JSON. No extra text.
No markdown, no backticks, no code fences.
"diagnosis" must contain 1–3 short items (each under 250 characters).
"missing" must contain 1–3 short items (each under 250 characters).
"improvements" must contain 1–3 short items (each under 250 characters).
"golden" must be under 1200 characters.
Keep output concise. Do not exceed necessary length.
If "golden" contains "{" or "}" then you MUST output FORMAT_ERROR instead of any other content.
If you are about to include "{" or "}" anywhere in "golden", STOP and output FORMAT_ERROR JSON only.

Use EXACTLY these keys and no others:
"diagnosis": array of strings
"missing": array of strings
"improvements": array of strings
"golden": string

Do NOT put JSON inside any field.
"golden" must be plain text only. It must NOT contain JSON, braces that start an object, or the words "diagnosis", "missing", "improvements" as labels.

If you break any rule, output exactly:
{"diagnosis":["FORMAT_ERROR"],"missing":[],"improvements":[],"golden":"FORMAT_ERROR"}
Schema:
{
  "diagnosis": ["..."],
  "missing": ["..."],
  "improvements": ["..."],
  "golden": "..."
}`;
var SYSTEM_COACH = `You are Prompting Buddy Coach.
You will be given up to 5 prior prompt-check runs (prompts and optional pasted AI replies).

Return ONLY valid JSON (no markdown, no code fences, no extra text).
Schema:
{
  "mistakes": ["..."],
  "fixes": ["..."],
  "metaPrompt": "A reusable prompt template the user can copy"
}
Rules:
- Provide up to 3 mistakes and up to 3 fixes (short bullets; each under ~90 chars).
- metaPrompt must be plain text (no markdown fences).
- Do not include any other keys.`;
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = originAllowed(origin, env) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-ou-pass",
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function corsPreflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}
__name(corsPreflight, "corsPreflight");
function corsJson(request, env, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
__name(corsJson, "corsJson");
function corsText(request, env, status, txt) {
  return new Response(String(txt), {
    status,
    headers: { ...corsHeaders(request, env), "Content-Type": "text/plain; charset=utf-8" }
  });
}
__name(corsText, "corsText");
function jsonRaw(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
__name(jsonRaw, "jsonRaw");
function originAllowed(origin, env) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || env.DEFAULT_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  return list.includes(origin);
}
__name(originAllowed, "originAllowed");
function getAllowedPassphrases(env) {
  const raw = String(env.ALLOWED_PASSPHRASES || "").trim();
  if (!raw) return [];
  return raw.split(/[,\n\r]+/g).map((s) => s.trim()).filter(Boolean);
}
__name(getAllowedPassphrases, "getAllowedPassphrases");
async function getSubFromRequest(request) {
  const hinted = request.headers.get("X-Client-Id");
  const ua = request.headers.get("User-Agent") || "";
  const base = String(hinted || ua || "anon");
  return await sha256Hex(base);
}
__name(getSubFromRequest, "getSubFromRequest");
function getBearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
__name(getBearerToken, "getBearerToken");
function dayKeyForTz(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}
__name(dayKeyForTz, "dayKeyForTz");
async function getCounter(env, sub, dayKey, kind, limit, incr) {
  if (!env.LIMITS) return { used: incr ? 1 : 0, limit };
  const id = env.LIMITS.idFromName(sub);
  const stub = env.LIMITS.get(id);
  const key = `${dayKey}:${kind}`;
  const res = await stub.fetch("https://do/counter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, limit, incr })
  });
  const j = await res.json();
  return { used: Number(j.used || 0), limit: Number(j.limit || limit) };
}
__name(getCounter, "getCounter");
async function deepseekChat(env, { system, user, max_tokens }) {
  const apiKey = String(env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) throw new Error("missing_deepseek_api_key");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.2,
      max_tokens: max_tokens || 800
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `deepseek_http_${res.status}`);
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content;
  return String(txt || "").trim();
}
__name(deepseekChat, "deepseekChat");
function parseJsonFromText(txt) {
  if (!txt) return null;
  const s = String(txt).trim();
  const noFence = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const clean = /* @__PURE__ */ __name((str) => {
    let t = String(str || "").trim();
    t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    t = t.replace(/,\s*([}\]])/g, "$1");
    return t;
  }, "clean");
  try {
    return JSON.parse(clean(noFence));
  } catch {
  }
  const a = noFence.indexOf("{");
  const b = noFence.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) {
    const slice = noFence.slice(a, b + 1);
    try {
      return JSON.parse(clean(slice));
    } catch {
    }
  }
  const m = noFence.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(clean(m[0]));
  } catch {
    return null;
  }
}
__name(parseJsonFromText, "parseJsonFromText");
function normalizePromptCheckPayload(maybe) {
  const unwrap = /* @__PURE__ */ __name((x) => {
    if (x && typeof x === "object" && x.result && typeof x.result === "object") return x.result;
    return x;
  }, "unwrap");
  let obj = unwrap(maybe);
  if (typeof obj === "string") obj = parseJsonFromText(obj) || { golden: obj };
  if (!obj || typeof obj !== "object") obj = {};
  const toList = /* @__PURE__ */ __name((v) => {
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
  }, "toList");
  return {
    diagnosis: toList(obj.diagnosis || obj.mistakes || obj.notes),
    missing: toList(obj.missing),
    improvements: toList(obj.improvements || obj.fixes || obj.suggestions),
    golden: String(obj.golden || obj.goldenPrompt || obj.prompt || "").trim()
  };
}
__name(normalizePromptCheckPayload, "normalizePromptCheckPayload");
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function hmacSha256(secret, msg) {
  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const bytes = Array.from(new Uint8Array(sig));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacSha256, "hmacSha256");
async function signToken(payload, secret) {
  if (!secret || secret.length < 16) throw new Error("token_secret_too_short");
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const sig = await hmacSha256(secret, b64);
  return `${b64}.${sig}`;
}
__name(signToken, "signToken");
async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expected = await hmacSha256(secret, b64);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
__name(verifyToken, "verifyToken");
function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
export {
  LimitsDO,
  index_default as default
};
//# sourceMappingURL=index.js.map