// Prompting Buddy — House Proxy (Cloudflare Worker)
// Keeps your provider API key + Buddy logic private.
//
// ─── REQUIRED SECRETS (set in Cloudflare dashboard → Workers → Settings → Variables) ───
//   DEEPSEEK_API_KEY        — your DeepSeek API key
//   TOKEN_SECRET            — 32+ random chars, used to sign JWTs
//   RESEND_API_KEY          — from resend.com (free tier: 3000 emails/month)
//
// ─── OPTIONAL VARS (wrangler.toml [vars] or dashboard) ───────────────────────────────
//   DEFAULT_ORIGIN          — e.g. https://zhelair.github.io
//   ALLOWED_ORIGINS         — comma-separated list of allowed origins
//   TIMEZONE                — default: Europe/Sofia
//   PROMPT_MAX_CHARS        — default: 5000
//   COACH_MAX_CHARS         — default: 8000
//   TOKEN_TTL_DAYS          — default: 60
//   EMAIL_FROM              — sender address, e.g. buddy@yourdomain.com
//   ADMIN_PASSPHRASES       — comma/newline-separated, bypass all limits (your personal codes)
//
// ─── REQUIRED BINDINGS ────────────────────────────────────────────────────────────────
//   LIMITS  — Durable Object namespace (class: LimitsDO)  — tracks daily usage counters
//   USERS   — KV namespace — stores email→passphrase and passphrase→user record
//
// ─── TIER LIMITS ──────────────────────────────────────────────────────────────────────
//   free:  5 Buddy/day, 0 Coach/day
//   basic: 20 Buddy/day, 3 Coach/day   (~€3/month)
//   pro:   30 Buddy/day, 5 Coach/day + own API key = unlimited  (~€6/month)
//   admin: unlimited (your personal passphrases, from ADMIN_PASSPHRASES secret)
//
// ─── HOW TIERS WORK ───────────────────────────────────────────────────────────────────
//   1. User visits your landing page, enters email → POST /request-access?tier=free
//   2. Worker checks KV: has this email been used?
//   3. If not → generates unique passphrase → stores in KV → sends email via Resend
//   4. User enters passphrase in app → POST /unlock → gets JWT with tier encoded
//   5. JWT is used for all subsequent requests; limits enforced per tier
//
//   For paid tiers: your payment webhook (LemonSqueezy/Stripe) calls
//   POST /request-access with tier=basic or tier=pro and the customer email.
//   Worker sends them their passphrase automatically.
//
// ─── ENDPOINTS ────────────────────────────────────────────────────────────────────────
//   GET  /                  — health check
//   POST /request-access    — email → generate passphrase → send email
//   POST /unlock            — passphrase → JWT
//   GET  /status            — read daily usage (requires JWT)
//   POST /prompt-check      — run Buddy (requires JWT)
//   POST /coach-last5       — run Coach (requires JWT)
//   POST /admin/grant       — manually grant/upgrade a user (requires ADMIN_SECRET header)

// ─────────────────────────────────────────────────────────────────────────────────────
// Tier configuration — single source of truth
// ─────────────────────────────────────────────────────────────────────────────────────

const TIER_LIMITS = {
  free:  { prompt: 5,   coach: 0  },
  basic: { prompt: 20,  coach: 3  },
  pro:   { prompt: 30,  coach: 5  },
  admin: { prompt: 999, coach: 99 },
};

const TIER_NAMES = {
  free:  'Free',
  basic: 'Basic',
  pro:   'Pro',
  admin: 'Admin',
};

// ─────────────────────────────────────────────────────────────────────────────────────
// Durable Object — daily usage counters (unchanged from original, still works)
// ─────────────────────────────────────────────────────────────────────────────────────

export class LimitsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== 'POST') return new Response('use_post', { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const key    = String(body.key   || '').trim();
    const limit  = Number(body.limit || 0);
    const incr   = Boolean(body.incr);

    if (!key) return jsonRaw(400, { error: 'missing_key' });
    if (!Number.isFinite(limit) || limit < 0) return jsonRaw(400, { error: 'bad_limit' });

    const used = (await this.state.storage.get(key)) || 0;
    const next = incr ? (used + 1) : used;
    if (incr) await this.state.storage.put(key, next);

    return jsonRaw(200, { used: next, limit });
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Main worker
// ─────────────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') return corsPreflight(request, env);

    // ── Health ────────────────────────────────────────────────────────────────────
    if (url.pathname === '/' && request.method === 'GET') {
      return corsJson(request, env, 200, {
        ok: true,
        service: 'prompting-buddy-house',
        time: new Date().toISOString()
      });
    }

    // ── POST /request-access ──────────────────────────────────────────────────────
    // Body: { email: string, tier?: 'free'|'basic'|'pro', webhookSecret?: string }
    // For paid tiers, caller must include webhookSecret matching env.WEBHOOK_SECRET
    if (url.pathname === '/request-access') {
      if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

      const origin = request.headers.get('Origin') || '';
      // Allow webhook calls from payment providers (no browser origin)
      if (origin && !originAllowed(origin, env)) {
        return corsJson(request, env, 403, { error: 'origin_not_allowed' });
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return corsJson(request, env, 400, { error: 'invalid_email' });
      }

      const tierRaw = String(body.tier || 'free').trim().toLowerCase();
      const tier = TIER_LIMITS[tierRaw] ? tierRaw : 'free';

      // Paid tiers require webhook secret to prevent abuse
      if (tier === 'basic' || tier === 'pro') {
        const webhookSecret = String(body.webhookSecret || request.headers.get('X-Webhook-Secret') || '').trim();
        const expectedSecret = String(env.WEBHOOK_SECRET || '').trim();
        if (!expectedSecret || webhookSecret !== expectedSecret) {
          return corsJson(request, env, 403, { error: 'invalid_webhook_secret' });
        }
      }

      if (!env.USERS) {
        return corsJson(request, env, 500, { error: 'kv_not_configured' });
      }

      // Check if email already has a passphrase
      const existingPassphrase = await env.USERS.get(`email:${email}`);

      if (existingPassphrase) {
        // Email already registered — look up their current tier
        const existingRecord = await env.USERS.get(`pass:${existingPassphrase}`);
        const record = existingRecord ? JSON.parse(existingRecord) : null;
        const existingTier = record?.tier || 'free';

        // If upgrading, update their tier and re-send passphrase
        if (tierRank(tier) > tierRank(existingTier)) {
          const updatedRecord = { ...record, tier, updatedAt: Date.now() };
          await env.USERS.put(`pass:${existingPassphrase}`, JSON.stringify(updatedRecord));
          await sendAccessEmail(env, email, existingPassphrase, tier, true);
          return corsJson(request, env, 200, { ok: true, action: 'upgraded', tier });
        }

        // Same or lower tier — just resend their existing passphrase
        await sendAccessEmail(env, email, existingPassphrase, existingTier, false);
        return corsJson(request, env, 200, { ok: true, action: 'resent', tier: existingTier });
      }

      // New user — generate unique passphrase
      const passphrase = await generatePassphrase();
      const record = {
        email,
        tier,
        passphrase,
        createdAt: Date.now(),
      };

      // Store both directions: email→passphrase and passphrase→record
      await env.USERS.put(`email:${email}`, passphrase);
      await env.USERS.put(`pass:${passphrase}`, JSON.stringify(record));

      // Send welcome email
      await sendAccessEmail(env, email, passphrase, tier, false);

      return corsJson(request, env, 200, { ok: true, action: 'created', tier });
    }

    // ── POST /unlock ──────────────────────────────────────────────────────────────
    // Body: { passphrase: string }
    // Returns: { token, exp, expiresAt, tier, tierName, limits }
    if (url.pathname === '/unlock') {
      if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

      const origin = request.headers.get('Origin') || '';
      if (!originAllowed(origin, env)) return corsJson(request, env, 403, { error: 'origin_not_allowed' });

      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      const passphrase = String(
        body.passphrase ||
        request.headers.get('X-OU-PASS') ||
        request.headers.get('x-ou-pass') ||
        ''
      ).trim();
      if (!passphrase) return corsJson(request, env, 400, { error: 'missing_passphrase' });

      // Check admin passphrases first (env secret, comma/newline separated)
      const adminPhrases = String(env.ADMIN_PASSPHRASES || '').split(/[,\n\r]+/).map(s => s.trim()).filter(Boolean);
      let tier = null;

      if (adminPhrases.includes(passphrase)) {
        tier = 'admin';
      } else if (env.USERS) {
        // Look up in KV
        const recordRaw = await env.USERS.get(`pass:${passphrase}`);
        if (recordRaw) {
          const record = JSON.parse(recordRaw);
          tier = record?.tier || 'free';
        }
      }

      if (!tier) {
        return corsJson(request, env, 401, { error: 'invalid_passphrase' });
      }

      const sub = await sha256Hex(passphrase);
      const ttlDays = Number(env.TOKEN_TTL_DAYS || 60);
      const exp = Date.now() + Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
      const token = await signToken({ sub, exp, tier }, env.TOKEN_SECRET || '');

      const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

      return corsJson(request, env, 200, {
        token,
        exp,
        expiresAt: new Date(exp).toISOString(),
        tier,
        tierName: TIER_NAMES[tier] || tier,
        limits
      });
    }

    // ── POST /admin/grant ─────────────────────────────────────────────────────────
    // Manually create or upgrade a user. Requires X-Admin-Secret header.
    // Body: { email: string, tier: string }
    if (url.pathname === '/admin/grant') {
      if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

      const adminSecret = request.headers.get('X-Admin-Secret') || '';
      const expectedAdmin = String(env.ADMIN_SECRET || '').trim();
      if (!expectedAdmin || adminSecret !== expectedAdmin) {
        return corsJson(request, env, 403, { error: 'forbidden' });
      }

      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      const email = String(body.email || '').trim().toLowerCase();
      const tier  = String(body.tier  || 'free').trim().toLowerCase();

      if (!email || !email.includes('@')) return corsJson(request, env, 400, { error: 'invalid_email' });
      if (!TIER_LIMITS[tier]) return corsJson(request, env, 400, { error: 'invalid_tier' });
      if (!env.USERS) return corsJson(request, env, 500, { error: 'kv_not_configured' });

      const existingPassphrase = await env.USERS.get(`email:${email}`);
      let passphrase = existingPassphrase;

      if (existingPassphrase) {
        // Update tier
        const existingRecord = await env.USERS.get(`pass:${existingPassphrase}`);
        const record = existingRecord ? JSON.parse(existingRecord) : {};
        await env.USERS.put(`pass:${existingPassphrase}`, JSON.stringify({ ...record, tier, updatedAt: Date.now() }));
      } else {
        // New user
        passphrase = await generatePassphrase();
        const record = { email, tier, passphrase, createdAt: Date.now() };
        await env.USERS.put(`email:${email}`, passphrase);
        await env.USERS.put(`pass:${passphrase}`, JSON.stringify(record));
      }

      await sendAccessEmail(env, email, passphrase, tier, !!existingPassphrase);
      return corsJson(request, env, 200, { ok: true, email, tier, passphrase });
    }

    // ── Protected endpoints — require valid JWT ────────────────────────────────────
    if (['/prompt-check', '/coach-last5', '/status', '/limits'].includes(url.pathname)) {
      const tok = getBearerToken(request);
      if (!tok) return corsJson(request, env, 401, { error: 'missing_token' });

      const payload = await verifyToken(tok, env.TOKEN_SECRET || '');
      if (!payload?.sub) return corsJson(request, env, 401, { error: 'bad_token' });
      if (payload.exp && Date.now() > Number(payload.exp)) {
        return corsJson(request, env, 401, { error: 'token_expired' });
      }

      const sub  = String(payload.sub);
      const tier = String(payload.tier || 'free');
      const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
      const tz     = String(env.TIMEZONE || 'Europe/Sofia');
      const dayKey = dayKeyForTz(tz);

      // ── GET /status or /limits ────────────────────────────────────────────────
      if (url.pathname === '/status' || url.pathname === '/limits') {
        if (request.method !== 'GET') return corsJson(request, env, 405, { error: 'use_get' });

        const pc = await getCounter(env, sub, dayKey, 'prompt', limits.prompt, false);
        const cc = await getCounter(env, sub, dayKey, 'coach',  limits.coach,  false);

        return corsJson(request, env, 200, {
          tier,
          tierName: TIER_NAMES[tier] || tier,
          prompt: { used: pc.used, limit: pc.limit, left: Math.max(0, pc.limit - pc.used) },
          coach:  { used: cc.used, limit: cc.limit, left: Math.max(0, cc.limit - cc.used) },
          dayKey
        });
      }

      // ── POST /prompt-check ────────────────────────────────────────────────────
      if (url.pathname === '/prompt-check') {
        if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

        let body = {};
        try { body = await request.json(); } catch { body = {}; }

        const prompt = String(body.prompt || '').trim();
        if (!prompt) return corsJson(request, env, 400, { error: 'missing_prompt' });

        const lensRaw = String(body.lens || body.mode || body.reasoningLens || '').trim().toLowerCase();
        const lens = lensRaw === 'thinker' ? 'thinker' : lensRaw === 'creator' ? 'creator' : 'auditor';
        const systemPrompt = lens === 'thinker' ? SYSTEM_PROMPT_CHECK_THINKER
                           : lens === 'creator'  ? SYSTEM_PROMPT_CHECK_CREATOR
                           : SYSTEM_PROMPT_CHECK_AUDITOR;

        const maxChars = Number(env.PROMPT_MAX_CHARS || 5000);
        const clipped = prompt.length > maxChars ? prompt.slice(0, maxChars) : prompt;

        // Pro users can supply their own API key — unlimited if so
        const userApiKey = tier === 'pro' ? String(body.userApiKey || '').trim() : '';
        const usingOwnKey = !!userApiKey;

        if (!usingOwnKey) {
          // Check and increment daily counter
          const pc = await getCounter(env, sub, dayKey, 'prompt', limits.prompt, true);
          if (pc.used > pc.limit) {
            return corsJson(request, env, 429, {
              error: 'daily_prompt_limit',
              tier,
              limit: pc.limit,
              used: pc.used,
              resetsAt: nextResetTime(tz)
            });
          }
        }

        const out = await deepseekChat(env, {
          system: systemPrompt,
          user: clipped,
          max_tokens: 800,
          userApiKey
        });

        const parsed = normalizePromptCheckPayload(parseJsonFromText(out) || out);
        return corsJson(request, env, 200, { ...parsed, tier, usingOwnKey });
      }

      // ── POST /coach-last5 ─────────────────────────────────────────────────────
      if (url.pathname === '/coach-last5') {
        if (request.method !== 'POST') return corsJson(request, env, 405, { error: 'use_post' });

        // Free tier has no Coach access
        if (limits.coach === 0) {
          return corsJson(request, env, 403, {
            error: 'coach_not_available',
            tier,
            message: 'Coach is not available on the Free plan. Upgrade to Basic or Pro.'
          });
        }

        let body = {};
        try { body = await request.json(); } catch { body = {}; }

        const items = Array.isArray(body.items) ? body.items : [];
        const last  = items.slice(0, 5);
        if (!last.length) return corsJson(request, env, 400, { error: 'missing_items' });

        // Previous coaching profile (stored client-side, sent back each run)
        const previousProfile = String(body.previousProfile || '').trim().slice(0, 500);

        const maxChars = Number(env.COACH_MAX_CHARS || 8000);
        const chunks = [];

        // Inject previous profile at the top so the model sees it first
        if (previousProfile) {
          chunks.push(`PREVIOUS COACHING PROFILE (from last session):\n${previousProfile}`);
        }

        for (let i = 0; i < last.length; i++) {
          const p = String(last[i]?.prompt  || '').trim();
          const r = String(last[i]?.aiReply || '').trim();
          if (!p) continue;
          chunks.push(`PROMPT ${i + 1}:\n${p}`);
          if (r) chunks.push(`AI REPLY ${i + 1}:\n${r}`);
        }

        let combined = chunks.join('\n\n---\n\n');
        if (combined.length > maxChars) combined = combined.slice(0, maxChars);

        // Pro users can supply their own API key
        const userApiKey = tier === 'pro' ? String(body.userApiKey || '').trim() : '';
        const usingOwnKey = !!userApiKey;

        if (!usingOwnKey) {
          const cc = await getCounter(env, sub, dayKey, 'coach', limits.coach, true);
          if (cc.used > cc.limit) {
            return corsJson(request, env, 429, {
              error: 'daily_coach_limit',
              tier,
              limit: cc.limit,
              used: cc.used,
              resetsAt: nextResetTime(tz)
            });
          }
        }

        const out = await deepseekChat(env, {
          system: SYSTEM_COACH,
          user: combined,
          max_tokens: 800,
          userApiKey
        });

        const parsedObj = parseJsonFromText(out);
        let parsed = parsedObj && typeof parsedObj === 'object' ? parsedObj : null;

        if (parsed && typeof parsed.metaPrompt === 'string') {
          const inner = parseJsonFromText(parsed.metaPrompt);
          if (inner && typeof inner === 'object') parsed = { ...parsed, ...inner };
        }

        if (!parsed) parsed = { mistakes: ['Model output was not valid JSON.'], fixes: [], metaPrompt: out, profile: '' };

        const mistakesRaw = parsed.mistakes ?? parsed.errors  ?? parsed.problem ?? parsed.notes;
        const fixesRaw    = parsed.fixes    ?? parsed.suggestions ?? parsed.improvements;
        const mistakes    = Array.isArray(mistakesRaw) ? mistakesRaw.map(x => String(x)).filter(Boolean).slice(0, 3) : [];
        const fixes       = Array.isArray(fixesRaw)    ? fixesRaw.map(x    => String(x)).filter(Boolean).slice(0, 3) : [];
        const metaPrompt  = String(parsed.metaPrompt ?? parsed.meta ?? '').trim();
        // New: profile summary returned and stored client-side for next run
        const profile     = String(parsed.profile ?? '').trim();

        return corsJson(request, env, 200, { mistakes, fixes, metaPrompt, profile, tier, usingOwnKey });
      }
    }

    return corsText(request, env, 404, 'Not found');
  }
};

// ─────────────────────────────────────────────────────────────────────────────────────
// System prompts (unchanged from original — they work well)
// ─────────────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_CHECK_AUDITOR = `You are an expert AI prompt reviewer and strict-but-kind teacher.

Your task is NOT to execute the user's request.
Your task is to analyze the quality of the prompt itself.

Tone: Calm, Direct, Teacher-like, Respectful.

Follow this process:
1) Diagnosis: how an AI will interpret the prompt, where it will fail.
2) What's missing: only what is truly needed to remove ambiguity.
3) Suggested improvements: concrete actions.
4) Golden Prompt: a single revised prompt, preserving intent.

Return ONLY valid JSON, no markdown, no code fences, no extra text.
Hard rules:
- "golden" must NOT contain "{" or "}" characters.
- "diagnosis" must contain 1–3 short items (each under 250 characters).
- "missing" must contain 1–3 short items (each under 250 characters).
- "improvements" must contain 1–3 short items (each under 250 characters).
- "golden" must be under 1200 characters, plain text only.
- If you break any rule, output exactly: {"diagnosis":["FORMAT_ERROR"],"missing":[],"improvements":[],"golden":"FORMAT_ERROR"}

Use EXACTLY these keys:
{"diagnosis": ["..."], "missing": ["..."], "improvements": ["..."], "golden": "..."}`;

const SYSTEM_PROMPT_CHECK_THINKER = `You are an expert AI prompt reviewer using the "Thinker" reasoning lens.

Your task is NOT to execute the user's request.
Your task is to analyze the quality of the prompt itself and make it think better.

Tone: Calm, Curious, Clear (not fluffy).

Follow this process:
1) Diagnosis: how an AI will interpret the prompt and what assumptions it will make.
2) What's missing: only what truly changes the outcome (decision criteria, constraints, context).
3) Suggested improvements: concrete actions, including 1–2 alternative framings if helpful.
4) Golden Prompt: a single revised prompt that encourages exploration (options, tradeoffs, criteria) while preserving intent.

Return ONLY valid JSON, no markdown, no code fences, no extra text.
Hard rules:
- "golden" must NOT contain "{" or "}" characters.
- "diagnosis" must contain 1–3 short items (each under 250 characters).
- "missing" must contain 1–3 short items (each under 250 characters).
- "improvements" must contain 1–3 short items (each under 250 characters).
- "golden" must be under 1200 characters, plain text only.
- If you break any rule, output exactly: {"diagnosis":["FORMAT_ERROR"],"missing":[],"improvements":[],"golden":"FORMAT_ERROR"}

Use EXACTLY these keys:
{"diagnosis": ["..."], "missing": ["..."], "improvements": ["..."], "golden": "..."}`;

const SYSTEM_PROMPT_CHECK_CREATOR = `You are an expert AI prompt reviewer using the "Creator" reasoning lens.

Your task is NOT to execute the user's request.
Your task is to analyze the quality of the prompt itself and make it create better.

Tone: Direct, Creative but practical, Respectful.

Follow this process:
1) Diagnosis: how an AI will interpret the prompt (tone, audience, style) and where it will get generic.
2) What's missing: audience, tone, format, constraints, references, examples (only what matters).
3) Suggested improvements: concrete actions to make output vivid and on-brand.
4) Golden Prompt: a single revised prompt that adds creative direction while preserving intent.

Return ONLY valid JSON, no markdown, no code fences, no extra text.
Hard rules:
- "golden" must NOT contain "{" or "}" characters.
- "diagnosis" must contain 1–3 short items (each under 250 characters).
- "missing" must contain 1–3 short items (each under 250 characters).
- "improvements" must contain 1–3 short items (each under 250 characters).
- "golden" must be under 1200 characters, plain text only.
- If you break any rule, output exactly: {"diagnosis":["FORMAT_ERROR"],"missing":[],"improvements":[],"golden":"FORMAT_ERROR"}

Use EXACTLY these keys:
{"diagnosis": ["..."], "missing": ["..."], "improvements": ["..."], "golden": "..."}`;

const SYSTEM_COACH = `You are Prompting Buddy Coach — a personal prompt-writing trainer.

You will receive up to 5 prior prompt-check runs. You may also receive a PREVIOUS COACHING PROFILE showing patterns identified in earlier sessions.

Your job:
1. Identify the user's RECURRING weaknesses across these prompts (not just one-off issues).
2. If a previous profile exists, note whether the user has improved on past weaknesses.
3. Provide concrete fixes the user can apply immediately.
4. Generate a reusable meta-prompt template they can adapt.
5. Write a short profile summary (2–3 sentences) capturing this user's persistent patterns — this will be shown to you next session so you can track progress.

Return ONLY valid JSON. No markdown, no code fences, no extra text.
Schema:
{
  "mistakes": ["...", "...", "..."],
  "fixes": ["...", "...", "..."],
  "metaPrompt": "A reusable prompt template the user can copy and adapt",
  "profile": "2–3 sentence summary of this user's recurring prompt-writing patterns and improvement areas"
}
Rules:
- mistakes: up to 3 items, each under 90 characters, focused on PATTERNS not single instances.
- fixes: up to 3 items, each under 90 characters, actionable and specific.
- metaPrompt: plain text, no markdown fences, no JSON inside it.
- profile: plain text, 2–3 sentences max. If this is the first session, write it fresh. If a previous profile was given, update it to reflect new findings and whether the user has improved.
- Do not include any other keys.`;

// ─────────────────────────────────────────────────────────────────────────────────────
// Email sending via Resend
// ─────────────────────────────────────────────────────────────────────────────────────

async function sendAccessEmail(env, email, passphrase, tier, isUpgrade) {
  const resendKey = String(env.RESEND_API_KEY || '').trim();
  if (!resendKey) {
    console.warn('RESEND_API_KEY not set — skipping email send');
    return;
  }

  const fromEmail = String(env.EMAIL_FROM || 'buddy@promptingbuddy.com').trim();
  const tierName  = TIER_NAMES[tier] || tier;
  const limits    = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const appUrl    = String(env.DEFAULT_ORIGIN || 'https://zhelair.github.io').trim();

  const subject = isUpgrade
    ? `Your Prompting Buddy has been upgraded to ${tierName}!`
    : `Your Prompting Buddy passphrase — ${tierName} plan`;

  const coachLine = limits.coach > 0
    ? `✅ Coach: ${limits.coach} run${limits.coach > 1 ? 's' : ''}/day`
    : `❌ Coach: not included (upgrade to Basic or Pro)`;

  const html = `
<div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #333;">
  <h2 style="color: #c0845a;">🧠 Prompting Buddy — ${tierName} Plan</h2>
  ${isUpgrade ? `<p>Your account has been upgraded to <strong>${tierName}</strong>. Your passphrase stays the same — just unlock again to get your new limits.</p>` : `<p>Welcome! Here is your passphrase to access Prompting Buddy.</p>`}

  <div style="background: #f9f5f0; border: 1px solid #e0d5c8; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
    <p style="margin: 0 0 8px; font-size: 13px; color: #888;">YOUR PASSPHRASE</p>
    <p style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #333;">${passphrase}</p>
  </div>

  <p><strong>Your ${tierName} plan includes:</strong></p>
  <ul>
    <li>✅ Buddy checks: ${limits.prompt}/day</li>
    <li>${coachLine}</li>
    ${tier === 'pro' ? '<li>✅ Use your own API key for unlimited checks</li>' : ''}
  </ul>

  <p>
    <a href="${appUrl}" style="background: #c0845a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
      Open Prompting Buddy →
    </a>
  </p>

  <p style="font-size: 12px; color: #999; margin-top: 32px;">
    Keep this passphrase safe — it's your access key. If you lose it, reply to this email and we'll resend it.
  </p>
</div>`;

  const text = `Prompting Buddy — ${tierName} Plan\n\nYour passphrase: ${passphrase}\n\nBuddy checks: ${limits.prompt}/day\nCoach runs: ${limits.coach}/day\n\nOpen the app: ${appUrl}\n\nKeep this passphrase safe.`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject,
      html,
      text
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('Resend error:', res.status, t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Passphrase generator — 3 random words from a wordlist
// ─────────────────────────────────────────────────────────────────────────────────────

const WORDLIST = [
  'amber','brave','cedar','delta','ember','fable','grace','haven','ivory','jade',
  'karma','lunar','maple','noble','ocean','pearl','quest','raven','solar','tiger',
  'umbra','vivid','willow','xenon','yield','zeal','atlas','blaze','crisp','drift',
  'echo','frost','gleam','helix','iris','jewel','knack','lumen','mirth','nexus',
  'opal','prism','quill','realm','spark','thorn','ultra','vapor','woven','xylem',
  'yarn','zenith','arch','bolt','calm','dawn','epic','flux','glow','haze','icon',
  'jest','keen','lake','muse','nova','orb','pike','rain','sage','tide','urge',
  'vale','wake','axis','bond','core','dusk','ease','fold','gust','hope','idea',
  'jump','kite','lore','maze','node','oath','path','quote','rose','salt','tune',
  'unit','veil','wave','xray','zone','acorn','berry','cliff','dove','elder'
];

async function generatePassphrase() {
  const words = [];
  const arr = new Uint32Array(3);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 3; i++) {
    words.push(WORDLIST[arr[i] % WORDLIST.length]);
  }
  // Add 3-digit suffix for uniqueness
  const suffix = new Uint32Array(1);
  crypto.getRandomValues(suffix);
  const num = (suffix[0] % 900) + 100; // 100–999
  return `${words[0]}-${words[1]}-${words[2]}-${num}`;
  // Example: "amber-solar-prism-472"
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────────────

function tierRank(tier) {
  return { free: 0, basic: 1, pro: 2, admin: 3 }[tier] ?? 0;
}

function nextResetTime(tz) {
  // Returns ISO string of next midnight in the given timezone
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  // Next midnight in UTC terms (approximate)
  return new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
}

function corsHeaders(request, env) {
  const origin     = request.headers.get('Origin') || '';
  const allowOrigin = originAllowed(origin, env) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-OU-PASS,X-OU-DEVICE,X-Client-Id,X-Webhook-Secret,X-Admin-Secret',
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
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
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
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function originAllowed(origin, env) {
  if (!origin) return true; // allow server-side / webhook calls
  const list = String(env.ALLOWED_ORIGINS || env.DEFAULT_ORIGIN || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return true;
  return list.includes(origin);
}

function getBearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function dayKeyForTz(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value  || '1970';
  const m = parts.find(p => p.type === 'month')?.value || '01';
  const d = parts.find(p => p.type === 'day')?.value   || '01';
  return `${y}-${m}-${d}`;
}

async function getCounter(env, sub, dayKey, kind, limit, incr) {
  if (!env.LIMITS) return { used: incr ? 1 : 0, limit };
  const id   = env.LIMITS.idFromName(sub);
  const stub = env.LIMITS.get(id);
  const key  = `${dayKey}:${kind}`;
  const res  = await stub.fetch('https://do/counter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, limit, incr })
  });
  const j = await res.json();
  return { used: Number(j.used || 0), limit: Number(j.limit || limit) };
}

async function deepseekChat(env, { system, user, max_tokens, userApiKey }) {
  const apiKey = userApiKey || String(env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) throw new Error('missing_api_key');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system',  content: system },
        { role: 'user',    content: user   }
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
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

function parseJsonFromText(txt) {
  if (!txt) return null;
  const s = String(txt).trim();
  const noFence = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const clean = (str) => {
    let t = String(str || '').trim();
    t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    t = t.replace(/,\s*([}\]])/g, '$1');
    return t;
  };

  try { return JSON.parse(clean(noFence)); } catch {}

  const a = noFence.indexOf('{');
  const b = noFence.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) {
    try { return JSON.parse(clean(noFence.slice(a, b + 1))); } catch {}
  }

  const m = noFence.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(clean(m[0])); } catch { return null; }
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
    diagnosis:    toList(obj.diagnosis    || obj.mistakes  || obj.notes),
    missing:      toList(obj.missing),
    improvements: toList(obj.improvements || obj.fixes     || obj.suggestions),
    golden:       String(obj.golden       || obj.goldenPrompt || obj.prompt || '').trim()
  };
}

async function sha256Hex(str) {
  const data   = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signToken(payload, secret) {
  if (!secret || secret.length < 16) throw new Error('token_secret_too_short');
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const sig  = await hmacSha256(secret, b64);
  return `${b64}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expected   = await hmacSha256(secret, b64);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}