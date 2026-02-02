(function(){
  const data = window.PB_DATA || {};
  const house = data.house || {};
  const ENDPOINT = String(house.endpoint || "").trim();
  const DAILY_PROMPT_LIMIT = Number(house.dailyPromptLimit || 30);
  const DAILY_COACH_LIMIT = Number(house.dailyCoachLimit || 5);
  const PROMPT_MAX_CHARS = Number(house.promptMaxChars || 5000);
  const COACH_MAX_CHARS = Number(house.coachMaxChars || 8000);

  const app = document.getElementById("app");
  const year = document.getElementById("year");
  const footerSupport = document.getElementById("footerSupport");
  const brandName = document.getElementById("brandName");
  const unlockBtn = document.getElementById("unlockBtn");
  const pillPrompts = document.getElementById("pillPrompts");
  const pillCoach = document.getElementById("pillCoach");
  const promptsLeftEl = document.getElementById("promptsLeft");
  const promptsLimitEl = document.getElementById("promptsLimit");
  const coachLeftEl = document.getElementById("coachLeft");
  const coachLimitEl = document.getElementById("coachLimit");

  const LS = {
    token: "pb_token",
    tokenExp: "pb_token_exp",
    vault: "pb_vault_v1",
    library: "pb_library_v1",
    ideas: "pb_ideas_v1",
    draftPrompt: "pb_draft_prompt_v1",
    theme: "pb_theme",
    variant: (t)=>`pb_theme_variant_${t}`
  };

  // last-run caches (for persistence when navigating Buddy/Vault/About)
  const LS_LAST = {
    pc: "pb_last_promptcheck_v1",
    coach: "pb_last_coach_v1",
    coachHidden: "pb_last_coach_hidden_v1"
  };

  function isCoachHidden(){
    try{ return localStorage.getItem(LS_LAST.coachHidden) === '1'; }catch{ return false; }
  }
  function setCoachHidden(v){
    try{ localStorage.setItem(LS_LAST.coachHidden, v ? '1' : '0'); }catch{}
  }

  function loadLastCoach(){
    try{
      const raw = localStorage.getItem(LS_LAST.coach);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || typeof obj !== 'object') return null;
      return {
        t: Number(obj.t||0) || 0,
        mistakes: Array.isArray(obj.mistakes) ? obj.mistakes : [],
        fixes: Array.isArray(obj.fixes) ? obj.fixes : [],
        metaPrompt: String(obj.metaPrompt||""),
        raw: String(obj.raw||"")
      };
    } catch { return null; }
  }

  function saveLastCoach(payload){
    try{
      const safe = {
        t: Date.now(),
        mistakes: Array.isArray(payload?.mistakes) ? payload.mistakes : [],
        fixes: Array.isArray(payload?.fixes) ? payload.fixes : [],
        metaPrompt: String(payload?.metaPrompt||""),
        raw: String(payload?.raw||"")
      };
      localStorage.setItem(LS_LAST.coach, JSON.stringify(safe));
    } catch {}
  }

  function setDraftPrompt(v){
    try{ localStorage.setItem(LS.draftPrompt, String(v||"")); }catch{}
  }
  function getDraftPrompt(){
    try{ return String(localStorage.getItem(LS.draftPrompt) || ""); }catch{ return ""; }
  }

  function nowYear(){ try{ return new Date().getFullYear(); }catch{ return ""; } }
  if(year) year.textContent = String(nowYear());
  if(footerSupport) footerSupport.href = data.supportUrl || "#";
  if(brandName) brandName.textContent = data.brand || "Prompting Buddy";

  // --- Theme (same mechanism as main app, lightweight)
  function getTheme(){
    let t = (localStorage.getItem(LS.theme) || "modern").trim();
    if (t === "myspace") t = "glitter";
    return t;
  }
  function getVariant(theme){
    const t = (theme || getTheme()).trim();
    return (localStorage.getItem(LS.variant(t)) || "default").trim();
  }
  function applyTheme(theme, variant){
    const t = (theme || getTheme() || "modern").trim();
    const v = (variant || getVariant(t) || "default").trim();
    document.body.dataset.theme = t;
    document.body.dataset.variant = v;
    localStorage.setItem(LS.theme, t);
    localStorage.setItem(LS.variant(t), v);
  }
  applyTheme(getTheme(), getVariant(getTheme()));

  // --- Vault helpers
  function loadVault(){
    try {
      const raw = localStorage.getItem(LS.vault);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveVault(arr){
    try { localStorage.setItem(LS.vault, JSON.stringify(arr.slice(0,10))); } catch {}
  }
  function addVaultItem(item){
    const v = loadVault();
    v.unshift(item);
    saveVault(v);
  }

  // --- Library helpers (local-only)
  function loadLibrary(){
    try {
      const raw = localStorage.getItem(LS.library);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveLibrary(arr){
    try { localStorage.setItem(LS.library, JSON.stringify(Array.isArray(arr)?arr:[])); } catch {}
  }

  // Export/Import bundle (Vault + Library). Local-only “seatbelt”.
  function makeExportBundle(){
    return {
      schema: "pb_export_v1",
      exportedAt: new Date().toISOString(),
      vault: loadVault(),
      library: loadLibrary()
    };
  }
  function applyImportBundle(bundle){
    if(!bundle || typeof bundle !== 'object') throw new Error('Invalid file.');
    const v = Array.isArray(bundle.vault) ? bundle.vault : [];
    const l = Array.isArray(bundle.library) ? bundle.library : [];
    saveVault(v);
    saveLibrary(l);
  }

  // --- Auth / token
  function getToken(){
    const t = (localStorage.getItem(LS.token)||"").trim();
    const exp = Number(localStorage.getItem(LS.tokenExp)||"0");
    if(!t) return "";
    if(exp && Date.now() > exp) {
      localStorage.removeItem(LS.token);
      localStorage.removeItem(LS.tokenExp);
      return "";
    }
    return t;
  }
  function setToken(token, expiresAtISO){
    localStorage.setItem(LS.token, token);
    const expMs = expiresAtISO ? Date.parse(expiresAtISO) : 0;
    if(expMs) localStorage.setItem(LS.tokenExp, String(expMs));
  }
  function clearToken(){
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.tokenExp);
  }

  function hasEndpoint(){ return !!ENDPOINT; }

  async function api(path, { method="GET", headers={}, body=null }={}){
    if(!hasEndpoint()) throw new Error("Worker endpoint not set. Edit assets/data.js and set house.endpoint.");
    const url = ENDPOINT.replace(/\/+$/,'') + path;
    const res = await fetch(url, {
      method,
      headers,
      body: body!=null ? JSON.stringify(body) : null
    });
    const txt = await res.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { j = null; }
    if(!res.ok) {
      const msg = (j && (j.error||j.message)) ? (j.error||j.message) : (txt||`HTTP ${res.status}`);
      throw new Error(String(msg));
    }
    return j;
  }

  async function refreshStatus(){
    const tok = getToken();
    if(!tok){
      pillPrompts.hidden = true;
      pillCoach.hidden = true;
      promptsLeftEl.textContent = "0";
      coachLeftEl.textContent = "0";
      return;
    }
    try {
      const st = await api("/status", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${tok}`
        }
      });
      // expected: { prompt: {used,limit,left}, coach: {used,limit,left} }
      const p = st && st.prompt ? st.prompt : { used:0, limit:DAILY_PROMPT_LIMIT, left:DAILY_PROMPT_LIMIT };
      const c = st && st.coach ? st.coach : { used:0, limit:DAILY_COACH_LIMIT, left:DAILY_COACH_LIMIT };
      pillPrompts.hidden = false;
      pillCoach.hidden = false;
      promptsLeftEl.textContent = String(p.left ?? Math.max(0, (p.limit||DAILY_PROMPT_LIMIT) - (p.used||0)));
      promptsLimitEl.textContent = String(p.limit ?? DAILY_PROMPT_LIMIT);
      coachLeftEl.textContent = String(c.left ?? Math.max(0, (c.limit||DAILY_COACH_LIMIT) - (c.used||0)));
      coachLimitEl.textContent = String(c.limit ?? DAILY_COACH_LIMIT);
    } catch {
      // token probably invalid
      pillPrompts.hidden = true;
      pillCoach.hidden = true;
    }
  }

  // --- UI rendering
  function tpl(id){
    const t = document.getElementById(id);
    return t ? t.content.cloneNode(true) : document.createDocumentFragment();
  }

  function setActiveNav(route){
    document.querySelectorAll('[data-route]').forEach(b=>{
      b.classList.toggle('is-active', b.getAttribute('data-route')===route);
    });
  }

  function render(route){
    closeAllModals();
    setActiveNav(route);
    app.innerHTML = "";
    if(route === "vault") {
      app.appendChild(tpl("tpl-vault"));
      initVault();
    } else if(route === "library") {
      app.appendChild(tpl("tpl-library"));
      initLibrary();
    } else if(route === "ideas") {
      app.appendChild(tpl("tpl-ideas"));
      initIdeas();
    } else if(route === "extension") {
      app.appendChild(tpl("tpl-extension"));
      initExtension();
    } else if(route === "about") {
      app.appendChild(tpl("tpl-about"));
      initAbout();
    } else {
      app.appendChild(tpl("tpl-buddy"));
      initBuddy();
    }
  }

  // --- Unlock modal
  function openUnlock(){
    // Remove any existing unlock modal (prevents stacked panels)
    const existing = document.getElementById('unlockBackdrop');
    if(existing) existing.remove();

    const frag = tpl("tpl-unlock");
    const backdrop = frag.querySelector('#unlockBackdrop');
    const input = frag.querySelector('#unlockPass');
    const btn = frag.querySelector('#unlockDo');
    const close = frag.querySelector('#unlockClose');
    const status = frag.querySelector('#unlockStatus');

    function cleanup(){ backdrop?.remove(); }
    close?.addEventListener('click', cleanup);
    backdrop?.addEventListener('click', (e)=>{ if(e.target===backdrop) cleanup(); });

    btn?.addEventListener('click', async ()=>{
      const pass = String(input?.value || "").trim();
      if(!pass){ status.textContent = "Paste your passphrase."; return; }
      status.textContent = "Unlocking...";
      try {
        const j = await api("/unlock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OU-PASS": pass
          },
          body: {}
        });
        if(j && j.token){
          setToken(j.token, j.expiresAt);
          status.textContent = "Unlocked ✅";
          await refreshStatus();
          setTimeout(cleanup, 450);
        } else {
          status.textContent = "Unexpected response.";
        }
      } catch (err){
        status.textContent = String(err?.message || err);
      }
    });

    document.body.appendChild(frag);
    setTimeout(()=>{ try{ input?.focus(); }catch{} }, 50);
  }

  unlockBtn?.addEventListener('click', ()=>{
    // If already unlocked, offer quick "lock".
    if(getToken()) {
      if(confirm("Lock this device (remove token)?")) {
        clearToken();
        refreshStatus();
        render(location.hash.replace('#','')||'buddy');
      }
      return;
    }
    openUnlock();
  });

  // --- Buddy
  function initBuddy(){
    const prompt = document.getElementById('pcPrompt');
    const lensSel = document.getElementById('pcLens');
    const run = document.getElementById('pcRun');
    const clear = document.getElementById('pcClear');
    const status = document.getElementById('pcStatus');
    const out = document.getElementById('pcOut');
    const diag = document.getElementById('pcDiagnosis');
    const miss = document.getElementById('pcMissing');
    const sugg = document.getElementById('pcImprovements');
    const gold = document.getElementById('pcGolden');
    const raw = document.getElementById('pcRaw');
    const copy = document.getElementById('pcCopyGolden');
    const ch = document.getElementById('pcChar');
    const chMax = document.getElementById('pcCharMax');

    if(chMax) chMax.textContent = String(PROMPT_MAX_CHARS);

    const LS_LENS = 'pb_pref_lens_v1';
    function getLens(){
      const v = String(lensSel?.value || '').trim().toLowerCase();
      return (v === 'thinker' || v === 'creator') ? v : 'auditor';
    }
    // Restore lens preference
    try{
      const saved = localStorage.getItem(LS_LENS);
      if(lensSel && saved) lensSel.value = saved;
    }catch{}
    lensSel?.addEventListener('change', ()=>{
      try{ localStorage.setItem(LS_LENS, getLens()); }catch{}
    });


    function setStatus(msg){ if(status) status.textContent = msg || ""; }
    function countChars(){
      const n = String(prompt?.value||"").length;
      if(ch) ch.textContent = String(n);
      return n;
    }
    // Restore draft so switching Buddy/Vault/About doesn't erase what you're typing
    if(prompt && !prompt.value){
      const draft = getDraftPrompt();
      if(draft) prompt.value = draft;
    }

    // Restore last Prompt Check output so switching tabs doesn't wipe results
    try {
      const last = localStorage.getItem(LS_LAST.pc);
      if(last){
        const obj = JSON.parse(last);
        const norm = normalizePromptCheckPayload(obj);
        if((norm.diagnosis?.length || norm.missing?.length || norm.improvements?.length || norm.golden) && out){
          // Re-render only (do not auto-open any modal when returning to Buddy).
          out.hidden = false;
          renderLines(diag, norm.diagnosis);
          renderLines(miss, norm.missing);
          renderLines(sugg, norm.improvements);
          if(gold) gold.textContent = String(norm.golden || "");
        }
      }
    } catch {}

    prompt?.addEventListener('input', ()=>{
      countChars();
      setDraftPrompt(prompt?.value||"");
    });
    countChars();

    
    function stripFences(t){
      const x = String(t||'').trim();
      if(!x) return '';
      const m = x.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      return m ? String(m[1]||'').trim() : x;
    }
function renderLines(el, arr){
      if(!el) return;
      const items = Array.isArray(arr) ? arr : [];
      if(!items.length) { el.innerHTML = '<p class="muted">—</p>'; return; }
      el.innerHTML = `<ul class="pc__list">${items.map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
    }

    function renderResult(j){
      const norm = normalizePromptCheckPayload(j);
      out.hidden = false;
      renderLines(diag, norm.diagnosis);
      renderLines(miss, norm.missing);
      renderLines(sugg, norm.improvements);

      // Golden prompt display: keep it clean. If the model/server returned JSON-ish text, push it to Debug.
      let g = String(norm.golden || "").trim();
      const looksJson = (g.startsWith("{") && g.includes("diagnosis")) || g.includes("```");
      if(looksJson && !(norm.diagnosis.length || norm.missing.length || norm.improvements.length)) {
        // No usable sections + golden looks like JSON -> treat as raw debug.
        if(raw) raw.textContent = g;
        g = "";
      }
      if(gold) gold.textContent = stripFences(g);

      // Debug: show the most useful raw blob we have.
      if(raw){
        const inner = norm._debug && norm._debug.innerGoldenRaw ? String(norm._debug.innerGoldenRaw) : "";
        if(inner){ raw.textContent = inner; }
        else {
          try{ raw.textContent = JSON.stringify(j, null, 2); } catch{ raw.textContent = String(j??""); }
        }
      }
      // Persist (store raw response so switching tabs keeps results)
      try{ localStorage.setItem(LS_LAST.pc, JSON.stringify(j)); }catch{}
      return norm;
    }

    clear?.addEventListener('click', ()=>{
      if(prompt) prompt.value = "";
      setDraftPrompt("");
      countChars();
      out.hidden = true;
      setStatus("");
    });

    copy?.addEventListener('click', async ()=>{
      const txt = String(gold?.textContent||"").trim();
      if(!txt) return;
      try{ await navigator.clipboard.writeText(txt); setStatus("Golden Prompt copied ✅"); }
      catch{ setStatus("Copy failed — select and copy manually."); }
      setTimeout(()=>setStatus(""), 1200);
    });

    const openGoldenWin = document.getElementById('pcOpenGolden');
    openGoldenWin?.addEventListener('click', ()=>{
      const t = String(gold?.textContent||"").trim();
      if(!t) return;
      openGoldenModal(t);
    });

    run?.addEventListener('click', async ()=>{
      setStatus("");
      const tok = getToken();
      if(!tok){ setStatus("🔒 Unlock to use Prompt Check."); return; }
      const text = String(prompt?.value||"").trim();
      if(!text){ setStatus("Paste a prompt first."); return; }
      const n = text.length;
      if(n > PROMPT_MAX_CHARS){ setStatus(`Too long: ${n}/${PROMPT_MAX_CHARS} characters.`); return; }

      run.disabled = true;
      setStatus("Running Prompt Check...");
      try {
        const j = await api("/prompt-check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${tok}`
          },
          body: { prompt: text, lens: getLens() }
        });
        const norm = renderResult(j || {});
        try{ localStorage.setItem(LS_LAST.pc, JSON.stringify(norm)); }catch{}
        addVaultItem({
          t: Date.now(),
          prompt: text,
          golden: String(norm.golden || "").trim(),
          diagnosis: norm.diagnosis || [],
          missing: norm.missing || [],
          improvements: norm.improvements || [],
          aiReply: ""
        });
        setStatus("Done ✅ Saved to Vault.");
        await refreshStatus();
      } catch (err){
        setStatus(String(err?.message || err));
      } finally {
        run.disabled = false;
      }
    });
  }

  // --- Vault
  function initVault(){
    const list = document.getElementById('vaultList');
    const reset = document.getElementById('vaultReset');
    const coachBtn = document.getElementById('vaultCoach');
    const coachCap = document.getElementById('vaultCoachCap');
    const persistWrap = document.getElementById('vaultCoachPersist');

    if(coachCap) coachCap.textContent = String(COACH_MAX_CHARS);

    function setCoachStatus(msg){
      const s = document.getElementById('vaultStatus');
      if(s) s.textContent = msg||"";
    }

    function fmtWhen(ts){
      if(!ts) return "";
      try{
        const d = new Date(ts);
        // Keep it short and locale-friendly.
        return d.toLocaleString();
      } catch { return ""; }
    }

    function renderCoachPersisted(data){
      if(!persistWrap) return;
      persistWrap.innerHTML = "";
      if(!data) return;

      // If user hid the panel, show a compact "Show" bar instead of deleting the result.
      if(isCoachHidden()){
        const mini = document.createElement('div');
        mini.className = 'card';
        mini.style.marginTop = '12px';
        mini.innerHTML = `
          <div class="card__body" style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
              <strong>Last 5 Review</strong>
              <span class="muted" style="margin-left:8px;font-size:12px">(hidden)</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn" id="vaultCoachShow" type="button">Show</button>
              <button class="btn" id="vaultCoachClearMini" type="button">Clear</button>
            </div>
          </div>
        `;
        persistWrap.appendChild(mini);

        mini.querySelector('#vaultCoachShow')?.addEventListener('click', ()=>{
          setCoachHidden(false);
          renderCoachPersisted(data);
        });
        mini.querySelector('#vaultCoachClearMini')?.addEventListener('click', ()=>{
          try{ localStorage.removeItem(LS_LAST.coach); }catch{}
          try{ localStorage.removeItem(LS_LAST.coachHidden); }catch{}
          persistWrap.innerHTML = '';
          setCoachStatus('Cleared ✅');
          setTimeout(()=>setCoachStatus(''), 900);
        });
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.style.marginTop = '12px';
      wrap.innerHTML = `
        <div class="card__body">
          <div class="modal__head" style="padding:0; background:none; border:none; margin-bottom:10px">
            <strong>Last 5 Review</strong>
            <div style="display:flex; gap:8px; align-items:center">
              <span class="muted" style="font-size:12px">${escapeHtml(fmtWhen(data.t))}</span>
              <button class="btn" id="vaultCoachHide" type="button">Hide</button>
              <button class="btn" id="vaultCoachClear" type="button">Clear</button>
            </div>
          </div>

          <section class="pc__section">
            <div class="pc__h">Recurring issues</div>
            <div class="pb__scroll"><ul class="pc__list" id="vaultCoachMistakes"></ul></div>
          </section>

          <section class="pc__section">
            <div class="pc__h">Fixes to apply</div>
            <div class="pb__scroll"><ul class="pc__list" id="vaultCoachFixes"></ul></div>
          </section>

          <section class="pc__section pc__section--gold">
            <div class="pc__h">Reusable meta-prompt</div>
            <pre class="pc__pre" id="vaultCoachMeta"></pre>
            <div class="panel__actions">
              <button class="btn btn--primary" id="vaultCoachCopy" type="button">Copy</button>
            </div>
          </section>

          <details class="fold">
            <summary class="fold__sum">Show raw output (debug)</summary>
            <div class="fold__body">
              <pre class="pc__pre" id="vaultCoachRaw"></pre>
            </div>
          </details>
        </div>
      `;
      persistWrap.appendChild(wrap);

      const ulM = wrap.querySelector('#vaultCoachMistakes');
      const ulF = wrap.querySelector('#vaultCoachFixes');
      const preMeta = wrap.querySelector('#vaultCoachMeta');
      const preRaw = wrap.querySelector('#vaultCoachRaw');
      const btnCopy = wrap.querySelector('#vaultCoachCopy');
      const btnHide = wrap.querySelector('#vaultCoachHide');
      const btnClear = wrap.querySelector('#vaultCoachClear');

      const cleanList = (arr)=> (arr||[])
        .map(x=>String(x ?? '').trim())
        .filter(Boolean)
        .slice(0, 12);
      const mList = cleanList(data.mistakes);
      const fList = cleanList(data.fixes);
      if(ulM) ulM.innerHTML = (mList.length?mList:["—"]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('');
      if(ulF) ulF.innerHTML = (fList.length?fList:["—"]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('');
      if(preMeta) preMeta.textContent = String(data.metaPrompt||"");
      if(preRaw) preRaw.textContent = String(data.raw||"");

      btnCopy?.addEventListener('click', async ()=>{
        const txt = String(preMeta?.textContent||"").trim();
        if(!txt) return;
        try{ await navigator.clipboard.writeText(txt); setCoachStatus('Meta-prompt copied ✅'); }
        catch{ setCoachStatus('Copy failed.'); }
        setTimeout(()=>setCoachStatus(''), 900);
      });
      btnHide?.addEventListener('click', ()=>{
        setCoachHidden(true);
        renderCoachPersisted(data);
      });
      btnClear?.addEventListener('click', ()=>{
        try{ localStorage.removeItem(LS_LAST.coach); }catch{}
        try{ localStorage.removeItem(LS_LAST.coachHidden); }catch{}
        persistWrap.innerHTML = "";
        setCoachStatus('Cleared ✅');
        setTimeout(()=>setCoachStatus(''), 900);
      });
    }

    function createCoachModal(){
      const tpl = document.getElementById('tpl-coach');
      if(!tpl) return null;
      const node = tpl.content.firstElementChild.cloneNode(true);

      // close helpers
      const closeBtn = node.querySelector('#coachClose');
      function close(){ node.remove(); }
      closeBtn?.addEventListener('click', close);
      node.addEventListener('click', (e)=>{ if(e.target===node) close(); });
      document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); }, { once:true });

      document.body.appendChild(node);
      return node;
    }

    function tryParseJSONFromText(text){
      if(!text) return null;
      let t = String(text).trim();
      // strip ``` fences if present
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      // best-effort: extract the first {...} block
      const m = t.match(/\{[\s\S]*\}/);
      if(!m) return null;
      try{ return JSON.parse(m[0]); }catch{ return null; }
    }

    function normalizeCoachPayload(payload){
      // payload can be an object or raw text
      let obj = payload;
      if(typeof payload === 'string'){
        // try parse whole text as JSON, then try extract
        try{ obj = JSON.parse(payload); }catch{ obj = tryParseJSONFromText(payload); }
      }

      // Some models return JSON inside a string
      if(obj && typeof obj === 'object'){
        if(typeof obj.mistakes === 'string' && (obj.mistakes.includes('{') && obj.mistakes.includes('"mistakes"'))){
          const inner = tryParseJSONFromText(obj.mistakes);
          if(inner) obj = inner;
        }
        if(typeof obj.text === 'string' && obj.text.includes('{')){
          const inner = tryParseJSONFromText(obj.text);
          if(inner) obj = inner;
        }
        if(typeof obj.raw === 'string' && obj.raw.includes('{')){
          const inner = tryParseJSONFromText(obj.raw);
          if(inner) obj = inner;
        }
      }

      const mistakes = Array.isArray(obj?.mistakes) ? obj.mistakes : [];
      const fixes = Array.isArray(obj?.fixes) ? obj.fixes : [];
      const metaPrompt = typeof obj?.metaPrompt === 'string' ? obj.metaPrompt : (typeof obj?.meta === 'string' ? obj.meta : '');
      return { mistakes, fixes, metaPrompt, raw: obj };
    }

    function renderVault(){
      const v = loadVault();
      if(!list) return;
      if(!v.length){
        list.innerHTML = '<p class="muted">No saved runs yet. Use Prompt Check first.</p>';
        return;
      }
      list.innerHTML = v.map((item, idx)=>{
        const dt = new Date(item.t || Date.now());
        const ts = dt.toLocaleString();
        const prompt = escapeHtml(String(item.prompt||""));
        const golden = escapeHtml(String(item.golden||""));
        const ai = escapeHtml(String(item.aiReply||""));
        return `
          <article class="card card--flat vault__item" data-idx="${idx}">
            <div class="card__body">
              <div class="vault__meta"><span class="muted">${ts}</span></div>
              <div class="vault__grid">
                <div>
                  <div class="vault__label">Prompt</div>
                  <pre class="pre pre--sm">${prompt}</pre>
                </div>
                <div>
                  <div class="vault__label">Golden Prompt</div>
                  <pre class="pre pre--sm" data-role="golden">${golden}</pre>
                  <div class="panel__actions">
                    <button class="btn btn--mini" data-act="copyGolden" type="button">Copy Golden</button>
                  </div>
                </div>
              </div>
              <label class="field">
                <span class="field__label">Paste result from another AI (optional)</span>
                <textarea class="field__textarea" rows="4" data-role="aiReply" placeholder="Paste the other model's reply here...">${ai}</textarea>
              </label>
              <div class="panel__actions">
                <button class="btn btn--mini" data-act="saveReply" type="button">Save reply</button>
              </div>
            </div>
          </article>
        `;
      }).join('');

      list.querySelectorAll('button[data-act]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const card = btn.closest('[data-idx]');
          const idx = Number(card?.getAttribute('data-idx'));
          const v = loadVault();
          const item = v[idx];
          if(!item) return;

          const act = btn.getAttribute('data-act');
          if(act === 'copyGolden') {
            const txt = String(item.golden||"").trim();
            if(!txt) return;
            try{ await navigator.clipboard.writeText(txt); setCoachStatus("Golden copied ✅"); }
            catch{ setCoachStatus("Copy failed."); }
            setTimeout(()=>setCoachStatus(""), 900);
          }
          if(act === 'saveReply') {
            const ta = card.querySelector('textarea[data-role="aiReply"]');
            item.aiReply = String(ta?.value||"").trim();
            v[idx] = item;
            saveVault(v);
            setCoachStatus("Saved ✅");
            setTimeout(()=>setCoachStatus(""), 900);
          }
        });
      });
    }

    reset?.addEventListener('click', ()=>{
      if(!confirm("Reset Vault (delete saved runs)?")) return;
      saveVault([]);
      renderVault();
      setCoachStatus("Vault reset ✅");
      setTimeout(()=>setCoachStatus(""), 900);
    });

    function parseJsonFromText(txt){
      if(!txt) return null;
      const s = String(txt).trim();
      // Strip common code fences
      const noFence = s
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "");
      // Try direct JSON first (with a tiny bit of leniency)
      const tryParse = (str) => {
        const repaired = String(str)
          // remove trailing commas before } or ]
          .replace(/,\s*([}\]])/g, "$1")
          // normalize smart quotes (rare, but happens)
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .trim();
        try { return JSON.parse(repaired); } catch { return null; }
      };
      const direct = tryParse(noFence);
      if(direct) return direct;
      // Otherwise, extract the first {...} block
      const m = noFence.match(/\{[\s\S]*\}/);
      if(!m) return null;
      return tryParse(m[0]);
    }

    function normalizeCoachPayload(maybe){
      // Accept object or string; try to end up with {mistakes:[], fixes:[], metaPrompt:""}
      let obj = maybe;
      if(typeof obj === 'string') obj = parseJsonFromText(obj) || { metaPrompt: obj };
      if(obj && typeof obj === 'object'){
        // If the model returned a big blob in metaPrompt, try to parse it
        if(typeof obj.metaPrompt === 'string' && ( (!Array.isArray(obj.mistakes) || !Array.isArray(obj.fixes)) || (Array.isArray(obj.mistakes) && obj.mistakes.some(m=>/not\s+valid\s+json/i.test(String(m)))) )){
          const parsed = parseJsonFromText(obj.metaPrompt);
          if(parsed && typeof parsed === 'object') obj = { ...obj, ...parsed };
        }
        const mistakes = Array.isArray(obj.mistakes) ? obj.mistakes : [];
        const fixes = Array.isArray(obj.fixes) ? obj.fixes : [];
        const metaPrompt = String(obj.metaPrompt || obj.meta || obj.raw || "").trim();
        return { mistakes, fixes, metaPrompt, _raw: obj };
      }
      return { mistakes: [], fixes: [], metaPrompt: String(maybe||"") };
    }

    function normalizePromptCheckPayload(maybe){
      // Accept:
      // 1) {diagnosis:[], missing:[], improvements:[], golden:""}
      // 2) {text:"```json {...}```"} or {raw:"..."}
      // 3) a raw string
      let obj = maybe;
      if(obj && typeof obj === 'object'){
        // If the worker wraps the model output as text, try to parse that.
        if((!obj.diagnosis && !obj.golden) && typeof obj.text === 'string'){
          const parsed = parseJsonFromText(obj.text);
          if(parsed && typeof parsed === 'object') obj = parsed;
        }
        if((!obj.diagnosis && !obj.golden) && typeof obj.raw === 'string'){
          const parsed = parseJsonFromText(obj.raw);
          if(parsed && typeof parsed === 'object') obj = parsed;
        }
      }
      if(typeof obj === 'string') obj = parseJsonFromText(obj) || { diagnosis: [obj] };

      const diagnosis = Array.isArray(obj?.diagnosis) ? obj.diagnosis : (obj?.diagnosis ? [String(obj.diagnosis)] : []);
      const missing = Array.isArray(obj?.missing) ? obj.missing : (obj?.missing ? [String(obj.missing)] : []);
      const improvements = Array.isArray(obj?.improvements) ? obj.improvements : (obj?.improvements ? [String(obj.improvements)] : []);
      const golden = typeof obj?.golden === 'string' ? obj.golden : (typeof obj?.goldenPrompt === 'string' ? obj.goldenPrompt : '');
      return { diagnosis, missing, improvements, golden, _raw: obj };
    }

    function openCoachModal(){
      const tpl = document.getElementById('tpl-coach');
      if(!tpl) return null;
      const node = tpl.content.firstElementChild.cloneNode(true);
      document.body.appendChild(node);

      const close = node.querySelector('#coachClose');
      const backdrop = node.querySelector('#coachBackdrop') || node;
      const onClose = ()=>{ try{ node.remove(); }catch{} };
      close?.addEventListener('click', onClose);
      node.addEventListener('click', (e)=>{ if(e.target === backdrop) onClose(); });

      // Esc to close
      const onKey = (e)=>{ if(e.key === 'Escape') { onClose(); document.removeEventListener('keydown', onKey); } };
      document.addEventListener('keydown', onKey);

      return node;
    }

    coachBtn?.addEventListener('click', async ()=>{
      setCoachStatus("");

      const tok = getToken();
      if(!tok){ setCoachStatus("🔒 Unlock to use Coaching."); return; }

      const vault = loadVault();
      const items = vault.slice(0,5).map(x=>({
        prompt: String(x.prompt||"").slice(0, PROMPT_MAX_CHARS),
        aiReply: String(x.aiReply||"").slice(0, 4000)
      }));
      if(!items.length){ setCoachStatus("No saved runs yet."); return; }

      // Build combined to enforce COACH_MAX_CHARS (truth label in UI)
      const combined = items.map((it,i)=>{
        const p = String(it.prompt||"");
        const r = String(it.aiReply||"").trim();
        return `#${i+1} PROMPT\n${p}\n${r?(`\n#${i+1} OTHER_AI_REPLY\n${r}\n`):""}`;
      }).join("\n\n");
      const clipped = combined.slice(0, COACH_MAX_CHARS);

      const modal = openCoachModal();
      if(!modal){ setCoachStatus("Modal template missing."); return; }

      const modalStatus = modal.querySelector('#coachStatus');
      const modalMist = modal.querySelector('#coachMistakes');
      const modalFix = modal.querySelector('#coachFixes');
      const modalMeta = modal.querySelector('#coachMeta');
      const modalRaw = modal.querySelector('#coachRaw');
      const modalCopy = modal.querySelector('#coachCopyMeta');

      const setModalStatus = (m)=>{ if(modalStatus) modalStatus.textContent = m||""; };

      modalCopy?.addEventListener('click', async ()=>{
        const txt = String(modalMeta?.textContent||"").trim();
        if(!txt) return;
        try{ await navigator.clipboard.writeText(txt); setModalStatus("Meta-prompt copied ✅"); }
        catch{ setModalStatus("Copy failed."); }
        setTimeout(()=>setModalStatus(""), 900);
      });

      coachBtn.disabled = true;
      setModalStatus("Coaching... (last 5, max 8,000 chars)");
      try {
        // We deliberately read as text first so we can recover if the model returns non-JSON.
        const res = await fetch(`${ENDPOINT.replace(/\/+$/,'')}/coach-last5`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${tok}`
          },
          body: JSON.stringify({ text: clipped, items })
        });
        if(!res.ok){
          const t = await res.text().catch(()=>"");
          throw new Error(t || `HTTP ${res.status}`);
        }
        const txt = await res.text();
        const parsed = normalizeCoachPayload(parseJsonFromText(txt) || txt);

        // Persist so results survive tab switches (Buddy/Vault/Library/About)
        saveLastCoach({
          mistakes: parsed.mistakes,
          fixes: parsed.fixes,
          metaPrompt: parsed.metaPrompt,
          raw: txt
        });
        renderCoachPersisted(loadLastCoach());

        if(modalRaw) modalRaw.textContent = txt;


        const cleanList = (arr)=> (arr||[])
          .map(x=>String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, 3);
        const mList = cleanList(parsed.mistakes);
        const fList = cleanList(parsed.fixes);
        if(modalMist) modalMist.innerHTML = (mList.length?mList:["—"]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('');
        if(modalFix) modalFix.innerHTML = (fList.length?fList:["—"]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('');
        if(modalMeta) modalMeta.textContent = parsed.metaPrompt;

        setModalStatus("Done ✅");
        setCoachStatus("Done ✅");
        await refreshStatus();
      } catch (err){
        const msg = String(err?.message || err);
        setModalStatus(msg);
        setCoachStatus(msg);
      } finally {
        coachBtn.disabled = false;
      }
    });

    // Restore persisted “Last 5 Review” output (if any)
    renderCoachPersisted(loadLastCoach());

    renderVault();
  }

  // --- Library
  function initLibrary(){
    const list = document.getElementById('libList');
    const addBtn = document.getElementById('libAdd');
    const exportBtn = document.getElementById('libExport');
    const importBtn = document.getElementById('libImport');
    const importFile = document.getElementById('libImportFile');
    const search = document.getElementById('libSearch');
    const catSel = document.getElementById('libCat');
    const onlyFav = document.getElementById('libOnlyFav');

    // Inline editor (inside Library page)
    const editorWrap = document.getElementById('libEditorWrap');
    const editorTitle = document.getElementById('libEditorTitle');
    const editorClose = document.getElementById('libEditorClose');
    const editorStatus = document.getElementById('libEditStatus');
    const fTitle = document.getElementById('libFieldTitle');
    const fText = document.getElementById('libFieldText');
    const fCat = document.getElementById('libFieldCat');
    const fTags = document.getElementById('libFieldTags');
    const fModel = document.getElementById('libFieldModel');
    const fNotes = document.getElementById('libFieldNotes');
    const btnSave = document.getElementById('libSave');
    const btnCancel = document.getElementById('libCancel');

    let editingId = null;
    let editingCreatedAt = null;

    const CATS = Array.isArray(data.libraryCategories) && data.libraryCategories.length
      ? data.libraryCategories.slice(0,50)
      : ["Daily drivers","Writing","Coding","Research / OSINT","Visuals","Creators","Business","Life / Mood"];

    const LS_LIB_SEEDED = "pb_library_seeded_v1";
    const LS_IDEAS_SEEDED = "pb_ideas_seeded_v1";

    function ensureCategoriesInUI(){
      if(!catSel || !fCat) return;
      // Category filter dropdown
      if(catSel.options.length <= 1){
        CATS.forEach(c=>{
          const o = document.createElement('option');
          o.value = c;
          o.textContent = c;
          catSel.appendChild(o);
        });
      }
      // Editor dropdown
      if(fCat.options.length === 0){
        const o0 = document.createElement('option');
        o0.value = "";
        o0.textContent = "General";
        fCat.appendChild(o0);
        CATS.forEach(c=>{
          const o = document.createElement('option');
          o.value = c;
          o.textContent = c;
          fCat.appendChild(o);
        });
      }
    }

    function seedLibraryIfEmpty(){
      // Library should be user-owned only.
      // We still keep a seeded flag so we don't accidentally re-run older placeholder logic.
      try{
        const seeded = localStorage.getItem(LS_LIB_SEEDED);
        if(seeded) return;
        localStorage.setItem(LS_LIB_SEEDED, "1");
      } catch {}
    }

    function defaultIdeas(){
      const now = Date.now();
      const presets = [
        {cat:"Daily drivers", title:"Daily starter (idea)", text:"Text will be added here.", tags:"#daily", model:"", notes:""},
        {cat:"Writing", title:"Rewrite like a pro (idea)", text:"Text will be added here.", tags:"#writing", model:"", notes:""},
        {cat:"Coding", title:"Debug buddy (idea)", text:"Text will be added here.", tags:"#coding", model:"", notes:""},
        {cat:"Research / OSINT", title:"Fast research plan (idea)", text:"Text will be added here.", tags:"#research #osint", model:"", notes:""},
        {cat:"Visuals", title:"Image prompt builder (idea)", text:"Text will be added here.", tags:"#visual", model:"", notes:""},
        {cat:"Creators", title:"TikTok hook machine (idea)", text:"Text will be added here.", tags:"#creator", model:"", notes:""},
        {cat:"Business", title:"Offer + proposal skeleton (idea)", text:"Text will be added here.", tags:"#business", model:"", notes:""},
        {cat:"Life / Mood", title:"Mood reset (idea)", text:"Text will be added here.", tags:"#mood", model:"", notes:""}
      ];
      return presets.map((x,i)=>({
        id: `idea_${now}_${i}`,
        t: now - i*1000,
        title: x.title,
        text: x.text,
        tags: x.tags,
        model: x.model,
        notes: x.notes,
        cat: x.cat,
        fav: false
      }));
    }

    function loadIdeas(){
      try{ return getLS(LS.ideas, []); } catch { return []; }
    }

    function saveIdeas(arr){
      try{ setLS(LS.ideas, Array.isArray(arr)?arr:[]); } catch {}
    }

    function seedIdeasIfEmpty(){
      try{
        const seeded = localStorage.getItem(LS_IDEAS_SEEDED);
        if(seeded) return;
        const ideas = loadIdeas();
        if(ideas && ideas.length){ localStorage.setItem(LS_IDEAS_SEEDED, "1"); return; }
        saveIdeas(defaultIdeas());
        localStorage.setItem(LS_IDEAS_SEEDED, "1");
      } catch {}
    }

    function migrateSeededLibraryToIdeas(){
      // If someone has older versions with placeholder cards in Library, move them to Ideas.
      try{
        const lib = loadLibrary();
        if(!lib || !lib.length) return;
        const seededItems = lib.filter(x=>x && String(x.id||'').startsWith('seed_'));
        if(!seededItems.length) return;

        const ideas = loadIdeas();
        const have = new Set(ideas.map(x=>String(x?.id||'')));
        const moved = seededItems
          .filter(x=>!have.has(String(x.id)))
          .map(x=>({
            ...x,
            id: String(x.id).replace(/^seed_/, 'idea_')
          }));

        if(moved.length){
          saveIdeas([ ...moved, ...ideas ]);
        }
        const cleaned = lib.filter(x=>!(x && String(x.id||'').startsWith('seed_')));
        saveLibrary(cleaned);
      } catch {}
    }

    function setStatus(msg){
      const s = document.getElementById('libStatus');
      if(s) s.textContent = msg || "";
    }

    function downloadText(filename, text){
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 500);
    }

    function setEditStatus(m){ if(editorStatus) editorStatus.textContent = m || ''; }

    function openEditor(existing){
      const isEdit = !!(existing && existing.id);
      editingId = existing?.id || null;
      editingCreatedAt = existing?.t || Date.now();

      if(editorTitle) editorTitle.textContent = isEdit ? 'Edit prompt' : 'Add prompt';
      if(fTitle) fTitle.value = existing?.title || '';
      if(fText) fText.value = existing?.text || '';
      if(fCat) fCat.value = existing?.cat || '';
      if(fTags) fTags.value = existing?.tags || '';
      if(fModel) fModel.value = existing?.model || '';
      if(fNotes) fNotes.value = existing?.notes || '';
      setEditStatus('');

      if(editorWrap){
        editorWrap.hidden = false;
        // keep it inside the main screen
        editorWrap.scrollIntoView({ behavior:'smooth', block:'start' });
      }
      setTimeout(()=>{ fTitle?.focus(); }, 30);
    }

    function closeEditor(){
      if(editorWrap) editorWrap.hidden = true;
      editingId = null;
      editingCreatedAt = null;
      setEditStatus('');
    }

    function renderLibrary(){
      const q = String(search?.value || '').trim().toLowerCase();
      const cat = String(catSel?.value || '').trim();
      const favOnly = !!(onlyFav && onlyFav.checked);

      const libAllRaw = loadLibrary().map(it=>{
        if(!it || typeof it!=='object') return it;
        return {
          ...it,
          cat: it.cat || "",
          fav: !!it.fav
        };
      });

      // Favorites first, then newest
      libAllRaw.sort((a,b)=>{
        const af = a?.fav ? 1 : 0;
        const bf = b?.fav ? 1 : 0;
        if(bf !== af) return bf - af;
        return (b?.t||0) - (a?.t||0);
      });

      const libAll = libAllRaw;

      const lib = libAll.filter(it=>{
        if(!it) return false;
        if(cat && String(it.cat||'') !== cat) return false;
        if(favOnly && !it.fav) return false;
        if(!q) return true;
        const hay = [it?.title, it?.text, it?.tags, it?.model, it?.notes, it?.cat].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
      if(!list) return;
      if(!lib.length){
        list.innerHTML = (q || catSel?.value || (onlyFav && onlyFav.checked))
          ? '<p class="muted">No matches. Try a different search.</p>'
          : '<p class="muted">No saved prompts yet. Click “Add prompt”.</p>';
        return;
      }

      list.innerHTML = lib.map((item, idx)=>{
        const dt = new Date(item.t || Date.now());
        const ts = dt.toLocaleString();
        const title = escapeHtml(String(item.title || 'Untitled'));
        const tags = escapeHtml(String(item.tags || ''));
        const model = escapeHtml(String(item.model || ''));
        const cat = escapeHtml(String(item.cat || ''));
        const notes = escapeHtml(String(item.notes || ''));
        const text = escapeHtml(String(item.text || ''));
        return `
          <article class="card card--flat lib__item" data-id="${escapeHtml(String(item.id||""))}" data-cat="${cat}">
            <div class="card__body">
              <div class="lib__head">
                <div>
                  <div class="lib__title">${title}</div>
                  <div class="lib__meta">
                    <span class="chip chip--time">🕒 ${ts}</span>
                    ${cat ? `<span class="chip chip--cat"><span class="chip__dot"></span>${cat}</span>` : ''}
                    ${model ? `<span class="chip chip--model">🤖 ${model}</span>` : ''}
                    ${tags ? `<span class="chip chip--tags">🏷️ ${tags}</span>` : ''}
                  </div>
                </div>
                <div class="lib__actions">
                  <button class="btn btn--mini btn--star" data-act="fav" type="button">${item.fav ? "★" : "☆"}</button>
                  <button class="btn btn--mini" data-act="copy" type="button">Copy</button>
                  <button class="btn btn--mini" data-act="send" type="button">Send to Buddy</button>
                  <button class="btn btn--mini" data-act="edit" type="button">Edit</button>
                  <button class="btn btn--mini" data-act="del" type="button">Delete</button>
                </div>
              </div>

              ${notes ? `<div class="lib__notes">${notes}</div>` : ''}
              <pre class="pre pre--sm lib__pre">${text}</pre>
            </div>
          </article>
        `;
      }).join('');

      list.querySelectorAll('button[data-act]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const card = btn.closest('[data-id]');
          const id = String(card?.getAttribute('data-id')||'');
          const libAll = loadLibrary();
          const item = libAll.find(x=>x && String(x.id)===id);
          if(!item) return;

          const act = btn.getAttribute('data-act');

          if(act === 'fav'){
            const next = libAll.map(x=>{
              if(!x || String(x.id)!==id) return x;
              return { ...x, fav: !x.fav };
            });
            saveLibrary(next);
            renderLibrary();
            setStatus('Saved ✅');
            setTimeout(()=>setStatus(''), 700);
            return;
          }

          if(act === 'copy'){
            try{ await navigator.clipboard.writeText(String(item.text||"")); setStatus('Copied ✅'); }
            catch{ setStatus('Copy failed.'); }
            setTimeout(()=>setStatus(''), 900);
          }
          if(act === 'send'){
            setDraftPrompt(String(item.text||""));
            location.hash = 'buddy';
          }
          if(act === 'edit'){
            openEditor(item);
          }
          if(act === 'del'){
            if(!confirm('Delete this prompt from Library?')) return;
            const next = libAll.filter(x=>x && String(x.id)!==id);
            saveLibrary(next);
            renderLibrary();
            setStatus('Deleted ✅');
            setTimeout(()=>setStatus(''), 900);
          }
        });
      });
    }

    // Editor buttons
    addBtn?.addEventListener('click', ()=>openEditor(null));
    editorClose?.addEventListener('click', closeEditor);
    btnCancel?.addEventListener('click', closeEditor);

    btnSave?.addEventListener('click', ()=>{
      const item = {
        id: editingId || `lib_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        t: editingCreatedAt || Date.now(),
        title: String(fTitle?.value || '').trim(),
        text: String(fText?.value || '').trim(),
        cat: String(fCat?.value || '').trim(),
        tags: String(fTags?.value || '').trim(),
        model: String(fModel?.value || '').trim(),
        notes: String(fNotes?.value || '').trim(),
        fav: false
      };
      if(!item.text){ setEditStatus('Prompt text is required.'); return; }
      if(!item.title){ item.title = item.text.split(/\n|\r/)[0].slice(0,48) || 'Untitled'; }

      const libAll = loadLibrary();
      const idx = libAll.findIndex(x=>x && x.id === item.id);
      if(idx >= 0){
        const prev = libAll[idx] || {};
        item.fav = !!prev.fav;
        libAll[idx] = item;
      } else {
        libAll.unshift(item);
      }
      saveLibrary(libAll);
      renderLibrary();
      setStatus(editingId ? 'Saved ✅' : 'Added ✅');
      setTimeout(()=>setStatus(''), 900);
      closeEditor();
    });

    search?.addEventListener('input', ()=>renderLibrary());
    catSel?.addEventListener('change', ()=>renderLibrary());
    onlyFav?.addEventListener('change', ()=>renderLibrary());

    exportBtn?.addEventListener('click', ()=>{
      try{
        const bundle = makeExportBundle();
        const stamp = new Date().toISOString().slice(0,10);
        downloadText(`prompting-buddy-export-${stamp}.json`, JSON.stringify(bundle, null, 2));
        setStatus('Exported ✅');
        setTimeout(()=>setStatus(''), 900);
      } catch {
        setStatus('Export failed.');
      }
    });

    importBtn?.addEventListener('click', ()=>{ importFile?.click(); });
    importFile?.addEventListener('change', async ()=>{
      const f = importFile.files && importFile.files[0];
      if(!f) return;
      try{
        const txt = await f.text();
        const parsed = JSON.parse(txt);
        if(Array.isArray(parsed)){
          // allow importing a plain Library array
          saveLibrary(parsed);
        } else {
          applyImportBundle(parsed);
        }
        renderLibrary();
        setStatus('Imported ✅');
        setTimeout(()=>setStatus(''), 900);
      } catch {
        setStatus('Import failed.');
      }
      // reset input so you can import same file again
      try{ importFile.value = ''; }catch{}
    });

    ensureCategoriesInUI();
    seedLibraryIfEmpty();
    renderLibrary();
  }

  function closeAllModals(){
    // Route changes replace page content; open modals can get "stuck".
    document.querySelectorAll('.modal_backdrop').forEach(n=>{
      try{ n.remove(); }catch{}
    });
  }

  function openPromptCheckModal(norm){
    closeAllModals();
    const tpl = document.getElementById('tpl-pcmodal');
    if(!tpl) return null;

    const node = tpl.content.firstElementChild.cloneNode(true);
    document.body.appendChild(node);

    const closeBtn = node.querySelector('#pcClose');
    const diag = node.querySelector('#pcDiag');
    const missing = node.querySelector('#pcMissing');
    const impr = node.querySelector('#pcImpr');
    const openGoldenBtn = node.querySelector('#pcOpenGolden');

    const goldenText = String(norm?.golden||'').trim();

    if(diag) renderLines(diag, norm?.diagnosis);
    if(missing) renderLines(missing, norm?.missing);
    if(impr) renderLines(impr, norm?.improvements);

    openGoldenBtn?.addEventListener('click', ()=>{
      if(!goldenText) return;
      openGoldenModal(goldenText);
    });

    closeBtn?.addEventListener('click', closeAllModals);
    node.addEventListener('click', (e)=>{
      if(e.target===node) closeAllModals();
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key==='Escape') closeAllModals();
    }, {once:true});

    return node;
  }

  function openGoldenModal(text){
    closeAllModals();
    const tpl = document.getElementById('tpl-goldmodal');
    if(!tpl) return null;

    const node = tpl.content.firstElementChild.cloneNode(true);
    document.body.appendChild(node);

    const closeBtn = node.querySelector('[data-close="goldModal"]');
    const pre = node.querySelector('#goldText');
    const copy = node.querySelector('#goldCopyBtn');

    const val = String(text||'').trim();
    if(pre) pre.textContent = val;

    copy?.addEventListener('click', async ()=>{
      const txt = val;
      try{
        await navigator.clipboard.writeText(txt);
        toast('Copied ✅');
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try{ document.execCommand('copy'); toast('Copied ✅'); }catch{}
        ta.remove();
      }
    });

    closeBtn?.addEventListener('click', closeAllModals);
    node.addEventListener('click', (e)=>{ if(e.target===node) closeAllModals(); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeAllModals(); }, {once:true});

    return node;
  }

  function initAbout(){
    const box = document.getElementById('aboutBody');
    if(!box) return;
    box.innerHTML = data.aboutHtml || "";

    const support = box.querySelector('#pbSupportLink');
    if(support) support.href = data.supportUrl || '#';

    // Wire theme picker (radio list)
    const currentTheme = getTheme();
    const currentVar = getVariant(currentTheme);
    box.querySelectorAll('input[name="pbTheme"]')?.forEach(inp=>{
      const t = inp.getAttribute('data-theme') || "modern";
      const v = inp.getAttribute('data-variant') || "default";
      if(t === currentTheme && v === currentVar) inp.checked = true;
      inp.addEventListener('change', ()=>{
        if(!inp.checked) return;
        applyTheme(t, v);
      });
    });
  }

  function initExtension(){
    const originEl = document.getElementById('extOrigin');
    const endpointEl = document.getElementById('extEndpoint');
    const copyBtn = document.getElementById('extCopyEndpoint');
    const goBuddy = document.getElementById('extGoBuddy');

    if(originEl) originEl.textContent = String(location.origin || '').trim() || '—';
    if(endpointEl) endpointEl.textContent = ENDPOINT || '(not set — edit assets/data.js → house.endpoint)';

    copyBtn?.addEventListener('click', async ()=>{
      const txt = ENDPOINT || '';
      if(!txt){ toast('Endpoint not set'); return; }
      try{
        await navigator.clipboard.writeText(txt);
        toast('Copied ✅');
      } catch {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try{ document.execCommand('copy'); toast('Copied ✅'); }catch{}
        ta.remove();
      }
    });

    goBuddy?.addEventListener('click', ()=>{
      location.hash = 'buddy';
    });
  }

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  // -------- Shared parsers (must be top-level so Buddy + Vault can both use them) --------
  function parseJsonFromText(txt){
    if(!txt) return null;
    const s = String(txt).trim();
    const noFence = s
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");
    try{ return JSON.parse(noFence); }catch{}
    const m = noFence.match(/\{[\s\S]*\}/);
    if(!m) return null;
    try{ return JSON.parse(m[0]); }catch{ return null; }
  }

  function normalizePromptCheckPayload(maybe){
    const unwrap = (x)=>{
      if(x && typeof x === 'object' && x.result && typeof x.result === 'object') return x.result;
      return x;
    };
    let obj = unwrap(maybe);
    const original = obj;

    // If server ever returns plain text, try to parse it; otherwise treat as golden raw.
    if(typeof obj === 'string') obj = parseJsonFromText(obj) || { golden: obj };

    if(!obj || typeof obj !== 'object') obj = {};

    // Salvage: sometimes a whole JSON blob lands inside `golden`. Parse and prefer the inner fields.
    const goldenField = (typeof obj.golden === 'string') ? obj.golden : '';
    if(goldenField && (goldenField.includes('```') || goldenField.trim().startsWith('{'))){
      const inner = parseJsonFromText(goldenField);
      if(inner && typeof inner === 'object'){
        const looksLikeSchema = !!(inner.diagnosis || inner.missing || inner.improvements || inner.golden || inner.goldenPrompt || inner.prompt);
        if(looksLikeSchema){
          obj = { ...obj, ...inner, _innerGoldenRaw: goldenField };
        }
      }
    }

    const toList = (v)=>{
      if(Array.isArray(v)) return v.map(x=>String(x)).filter(Boolean);
      if(typeof v === 'string' && v.trim()) return [v.trim()];
      return [];
    };

    return {
      diagnosis: toList(obj.diagnosis || obj.mistakes || obj.notes),
      missing: toList(obj.missing),
      improvements: toList(obj.improvements || obj.fixes || obj.suggestions),
      golden: String(obj.golden || obj.goldenPrompt || obj.prompt || '').trim(),
      _raw: original,
      _debug: {
        mergedFromGolden: typeof obj._innerGoldenRaw === 'string',
        innerGoldenRaw: String(obj._innerGoldenRaw || '').trim()
      }
    };
  }

  function normalizeCoachPayload(maybe){
    let obj = maybe;
    if(typeof obj === 'string') obj = parseJsonFromText(obj) || { metaPrompt: obj };
    if(obj && typeof obj === 'object'){
      if(obj.result && typeof obj.result === 'object') obj = obj.result;
      if(typeof obj.metaPrompt === 'string' && ( (!Array.isArray(obj.mistakes) || !Array.isArray(obj.fixes)) || (Array.isArray(obj.mistakes) && obj.mistakes.some(m=>/not\s+valid\s+json/i.test(String(m)))) )){
        const parsed = parseJsonFromText(obj.metaPrompt);
        if(parsed && typeof parsed === 'object') obj = { ...obj, ...parsed };
      }
      const mistakes = Array.isArray(obj.mistakes) ? obj.mistakes : [];
      const fixes = Array.isArray(obj.fixes) ? obj.fixes : [];
      const metaPrompt = String(obj.metaPrompt || obj.meta || obj.raw || "").trim();
      return { mistakes, fixes, metaPrompt, _raw: obj };
    }
    return { mistakes: [], fixes: [], metaPrompt: String(maybe||"") };
  }

  // nav wiring
  document.querySelectorAll('[data-route]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = btn.getAttribute('data-route') || 'buddy';
      location.hash = r;
    });
  });

  function boot(){
    const r = (location.hash || "#buddy").replace('#','') || 'buddy';
    render(r);
    refreshStatus();
  }

  window.addEventListener('hashchange', boot);
  boot();

})();
