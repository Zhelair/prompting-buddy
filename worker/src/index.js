// Prompting Buddy — House Proxy (Cloudflare Worker)
// Keeps your provider API key + Buddy logic private.
//
// Required secrets:
//  - DEEPSEEK_API_KEY
//  - ALLOWED_PASSPHRASES (comma or newline-separated)
//  - TOKEN_SECRET (32+ chars)
//
// Optional vars/secrets:
//  - ALLOWED_ORIGINS (comma-separated)
//  - DEFAULT_ORIGIN (fallback)
//  - TIMEZONE (default Europe/Sofia)
//  - DAILY_PROMPT_LIMIT (default 30)
//  - DAILY_COACH_LIMIT (default 5)
//  - PROMPT_MAX_CHARS (default 5000)
//  - COACH_MAX_CHARS (default 8000)
//  - TOKEN_TTL_DAYS (default 30)
//
// Expected binding:
//  - env.LIMITS (Durable Object namespace: LimitsDO)

export class LimitsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST') return new Response('use_post', { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const key = String(body.key || '').trim();
    const limit = Number(body.limit || 0);
    const incr = Boolean(body.incr);

    if (!key) return jsonRaw(400, { error: 'missing_key' });
    if (!Number.isFinite(limit) || limit < 0) return jsonRaw(400, { error: 'bad_limit' });

    const used = (await this.state.storage.get(key)) || 0;
    const next = incr ? (used + 1) : used;
    if (incr) await this.state.storage.put(key, next);

    return jsonRaw(200, { used: next, limit });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') return corsPreflight(request, env);

    // Health
    if (url.pathname === '/' && request.method === 'GET') {
      return corsJson(request, env, 200, {
        ok: true,
        service: 'prompting-buddy-house',
        time: new Date().toISOString()
      });
    }

    // --- /unlock
    if (url.pathname === '/unlock') {
      if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

      const origin = request.headers.get('Origin') || '';
      if (!originAllowed(origin, env)) return corsJson(request, env, 403, { error: 'origin_not_allowed' });

      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const passphrase = String(body.passphrase || '').trim();
      if (!passphrase) return corsJson(request, env, 400, { error: 'missing_passphrase' });

      const allowed = getAllowedPassphrases(env);
      if (!allowed.length || !allowed.includes(passphrase)) {
        return corsJson(request, env, 401, { error: 'invalid_passphrase' });
      }

      const sub = await getSubFromRequest(request);
      const ttlDays = Number(env.TOKEN_TTL_DAYS || 30);
      const exp = Date.now() + Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
      const token = await signToken({ sub, exp }, env.TOKEN_SECRET || '');

      return corsJson(request, env, 200, { token, exp });
    }

    // Premium endpoints require token
    if (url.pathname === '/prompt-check' || url.pathname === '/coach-last5') {
      const tok = getBearerToken(request);
      if (!tok) return corsJson(request, env, 401, { error: 'missing_token' });

      const payload = await verifyToken(tok, env.TOKEN_SECRET || '');
      if (!payload?.sub) return corsJson(request, env, 401, { error: 'bad_token' });
      if (payload.exp && Date.now() > Number(payload.exp)) return corsJson(request, env, 401, { error: 'token_expired' });

      const sub = String(payload.sub);
      const tz = String(env.TIMEZONE || 'Europe/Sofia');
      const dayKey = dayKeyForTz(tz);

      // --- /prompt-check
      if (url.pathname === '/prompt-check') {
        if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

        let body = {};
        try { body = await request.json(); } catch { body = {}; }
        const prompt = String(body.prompt || '').trim();
        if (!prompt) return corsJson(request, env, 400, { error: 'missing_prompt' });

        const maxChars = Number(env.PROMPT_MAX_CHARS || 5000);
        const clipped = prompt.length > maxChars ? prompt.slice(0, maxChars) : prompt;

        const pLimit = Number(env.DAILY_PROMPT_LIMIT || 30);
        const pc = await getCounter(env, sub, dayKey, 'prompt', pLimit, true);
        if (pc.used > pc.limit) return corsJson(request, env, 429, { error: 'daily_prompt_limit' });

        const out = await deepseekChat(env, {
          system: SYSTEM_PROMPT_CHECK,
          user: clipped,
          max_tokens: 800
        });

        const parsed = normalizePromptCheckPayload(parseJsonFromText(out) || out);
        return corsJson(request, env, 200, parsed);
      }

      // --- /coach-last5
      if (url.pathname === '/coach-last5') {
        if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

        let body = {};
        try { body = await request.json(); } catch { body = {}; }
        const items = Array.isArray(body.items) ? body.items : [];
        const last = items.slice(0, 5);
        if (!last.length) return corsJson(request, env, 400, { error: 'missing_items' });

        const maxChars = Number(env.COACH_MAX_CHARS || 8000);
        const chunks = [];
        for (let i = 0; i < last.length; i++) {
          const p = String(last[i]?.prompt || '').trim();
          const r = String(last[i]?.aiReply || '').trim();
          if (!p) continue;
          chunks.push(`PROMPT ${i + 1}:\n${p}`);
          if (r) chunks.push(`AI REPLY ${i + 1}:\n${r}`);
        }
        let combined = chunks.join('\n\n---\n\n');
        if (combined.length > maxChars) combined = combined.slice(0, maxChars);

        const cLimit = Number(env.DAILY_COACH_LIMIT || 5);
        const cc = await getCounter(env, sub, dayKey, 'coach', cLimit, true);
        if (cc.used > cc.limit) return corsJson(request, env, 429, { error: 'daily_coach_limit' });

        const out = await deepseekChat(env, {
          system: SYSTEM_COACH,
          user: combined,
          max_tokens: 700
        });

        // IMPORTANT: parse JSON even if the model wraps it in code fences or adds text.
        const parsedObj = parseJsonFromText(out);
        let parsed = parsedObj && typeof parsedObj === 'object' ? parsedObj : null;
        if (!parsed) {
          parsed = { mistakes: ['Model output was not valid JSON.'], fixes: [], metaPrompt: out };
        }

        const mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes.slice(0, 3) : [];
        const fixes = Array.isArray(parsed.fixes) ? parsed.fixes.slice(0, 3) : [];
        while (mistakes.length < 3) mistakes.push('');
        while (fixes.length < 3) fixes.push('');

        return corsJson(request, env, 200, {
          mistakes,
          fixes,
          metaPrompt: typeof parsed.metaPrompt === 'string' ? parsed.metaPrompt : ''
        });
      }
    }

    return corsText(request, env, 404, 'Not found');
  }
};

// ----------------------------
// System prompts
// ----------------------------

const SYSTEM_PROMPT_CHECK = `You are Prompting Buddy. Your job is to REVIEW a user's prompt (not to execute it).
Return ONLY valid JSON, no markdown, no code fences.
Schema:
{
  "diagnosis": ["..."],
  "missing": ["..."],
  "improvements": ["..."],
  "golden": "..."
}
Rules:
- Keep diagnosis/missing/improvements concise bullets.
- Golden prompt should be a rewritten version that adds missing details and structure.
- Never add extra keys.`;

const SYSTEM_COACH = `You are Prompting Buddy Coach. You will analyze the last 5 prompt-check runs.
Return ONLY valid JSON, no markdown, no code fences.
Schema:
{
  "mistakes": ["...", "...", "..."],
  "fixes": ["...", "...", "..."],
  "metaPrompt": "A reusable prompt template the user can copy"
}
Rules:
- EXACTLY 3 mistakes and 3 fixes (strings). If unsure, use empty string "".
- metaPrompt must be plain text (no markdown fences).
- Do not include any other keys or commentary.`;

// ----------------------------
// Helpers
// ----------------------------

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = originAllowed(origin, env) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin'
  };
}

function corsPreflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function corsJson(request, env, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function corsText(request, env, status, txt) {
  return new Response(String(txt), {
    status,
    headers: { ...corsHeaders(request, env), 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function jsonRaw(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function originAllowed(origin, env) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || env.DEFAULT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return true; // permissive if not configured
  return list.includes(origin);
}

function getAllowedPassphrases(env) {
  const raw = String(env.ALLOWED_PASSPHRASES || '').trim();
  if (!raw) return [];
  // allow commas OR newlines (user sometimes pastes multi-line)
  return raw
    .split(/[,\n\r]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

async function getSubFromRequest(request) {
  // We purposely avoid IP-based identity; just create a stable-ish fingerprint per browser.
  // Caller can send X-Client-Id; otherwise fall back to a hash of user-agent.
  const hinted = request.headers.get('X-Client-Id');
  const ua = request.headers.get('User-Agent') || '';
  const base = String(hinted || ua || 'anon');
  return await sha256Hex(base);
}

function getBearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function dayKeyForTz(timeZone) {
  // YYYY-MM-DD in given TZ
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value || '1970';
  const m = parts.find(p => p.type === 'month')?.value || '01';
  const d = parts.find(p => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

async function getCounter(env, sub, dayKey, kind, limit, incr) {
  if (!env.LIMITS) return { used: incr ? 1 : 0, limit };
  const id = env.LIMITS.idFromName(sub);
  const stub = env.LIMITS.get(id);
  const key = `${dayKey}:${kind}`;
  const res = await stub.fetch('https://do/counter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, limit, incr })
  });
  const j = await res.json();
  return { used: Number(j.used || 0), limit: Number(j.limit || limit) };
}

async function deepseekChat(env, { system, user, max_tokens }) {
  const apiKey = String(env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing_deepseek_api_key');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      max_tokens: max_tokens || 800
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `deepseek_http_${res.status}`);
  }

  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content;
  return String(txt || '').trim();
}

function parseJsonFromText(txt) {
  if (!txt) return null;
  const s = String(txt).trim();

  // Strip a single pair of ``` fences if present
  const noFence = s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Try direct JSON
  try { return JSON.parse(noFence); } catch {}

  // Try first {...} block
  const m = noFence.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function normalizePromptCheckPayload(maybe) {
  const unwrap = (x) => {
    if (x && typeof x === 'object' && x.result && typeof x.result === 'object') return x.result;
    return x;
  };
  let obj = unwrap(maybe);
  if (typeof obj === 'string') obj = parseJsonFromText(obj) || { golden: obj };
  if (!obj || typeof obj !== 'object') obj = {};

  const toList = (v) => {
    if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return [];
  };

  return {
    diagnosis: toList(obj.diagnosis || obj.mistakes || obj.notes),
    missing: toList(obj.missing),
    improvements: toList(obj.improvements || obj.fixes || obj.suggestions),
    golden: String(obj.golden || obj.goldenPrompt || obj.prompt || '').trim()
  };
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret, msg) {
  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  const bytes = Array.from(new Uint8Array(sig));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signToken(payload, secret) {
  if (!secret || secret.length < 16) throw new Error('token_secret_too_short');
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const sig = await hmacSha256(secret, b64);
  return `${b64}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
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

function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}
