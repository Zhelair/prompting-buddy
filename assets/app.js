// Deterministic, nice-looking color for project dots.
function colorForKey(key){
  const s = String(key||'');
  let h = 0;
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}

(function(){
  const data = window.PB_DATA || {};
  const house = data.house || {};
  const ENDPOINT = String(house.endpoint || "").trim();
  const DAILY_PROMPT_LIMIT = Number(house.dailyPromptLimit || 30);
  const DAILY_COACH_LIMIT = Number(house.dailyCoachLimit || 5);
  const PROMPT_MAX_CHARS = Number(house.promptMaxChars || 5000);
  const COACH_MAX_CHARS = Number(house.coachMaxChars || 8000);

  const formatInt = (n)=>{ try{ return Number(n||0).toLocaleString(); }catch{ return String(n||0); } };

  try{ const el = document.getElementById('pbPromptCap'); if(el) el.textContent = formatInt(PROMPT_MAX_CHARS); }catch{}

  const app = document.getElementById("app");
  const year = document.getElementById("year");
  const footerSupport = document.getElementById("footerSupport");
  const brandName = document.getElementById("brandName");
  const guideBtn = document.getElementById("guideBtn");
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
    coachBoard: "pb_coach_board_v1",
    projects: "pb_projects_v1",
    ideas: "pb_ideas_v1",
    draftPrompt: "pb_draft_prompt_v1",
    draftForce: "pb_draft_force_v1",
    theme: "pb_theme",
    variant: (t)=>`pb_theme_variant_${t}`,
    libSelProject: "pb_lib_sel_project_v1",
    libSelSection: "pb_lib_sel_section_v1",
    onboarded: "pb_onboarded_v1",
    guideTab: "pb_guide_tab_v1"
  };

  // Tiny localStorage helpers (defensive, because we never want a bad JSON to brick the app).
  function getLS(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  }
  function setLS(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

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

  // --- Guide / onboarding (friendly helper)
  const GUIDE = {
    buddy: {
      title: "Buddy (Prompt Check)",
      lines: [
        "Paste your prompt, pick a lens, and run Prompt Check.",
        "Auditor is strict, Thinker is balanced, Creator is more playful.",
        "Golden Prompt is the final cleaned version - copy it into ChatGPT / Claude / Midjourney / etc.",
        "Results can be saved to Vault so your best prompts are never lost."
      ]
    },
    coach: {
      title: "Coach (Batch review)",
      lines: [
        "Add up to 5 prompts (from Library or paste manually).",
        "Run Coach to get recurring issues, fixes, and a reusable meta-prompt.",
        "Hide collapses the whole Coach result area for a clean page.",
        "Coach slots are saved locally - they stay after refresh."
      ]
    },
    library: {
      title: "Library (Your prompt toolbox)",
      lines: [
        "Store prompts and find them fast.",
        "Send to Buddy reviews a prompt before you use it.",
        "Edit titles and notes to keep prompts reusable.",
        "Export/Import moves your library between browsers."
      ]
    },
    vault: {
      title: "Vault (Saved Buddy results)",
      lines: [
        "Vault stores your Buddy results, including the Golden Prompt.",
        "Use it as your best-of shelf.",
        "You can send items back to Buddy or into Coach slots."
      ]
    },
    tips: {
      title: "Tips",
      lines: [
        "Short best practices you can apply in seconds.",
        "Perfect when your prompt is close, but not quite there."
      ]
    },
    about: {
      title: "About",
      lines: [
        "A quick overview of what Prompting Buddy is (and isn't).",
        "Support link and project info."
      ]
    }
  };

  const ONBOARDING_SLIDES = [
    {
      title: "Step 1 - Unlock + run Buddy",
      body: "Hit Unlock (top right), paste your passphrase, then go to Buddy. Paste a prompt, pick a lens, and run Prompt Check. You'll get a Golden Prompt you can reuse anywhere."
    },
    {
      title: "Step 2 - Save + organize",
      body: "Buddy results can be saved to Vault, and your own prompts live in Library. Think of Vault as your best-of and Library as your prompt toolbox."
    },
    {
      title: "Step 3 - Coach for pattern fixes",
      body: "Coach reviews up to 5 prompts at once and finds recurring issues. It also gives you a reusable meta-prompt you can plug into future work."
    }
  ];

  let currentRoute = 'buddy';

  function openGuide(opts){
    const route = String((opts && opts.route) || currentRoute || 'buddy');
    const initialTab = String((opts && opts.tab) || getLS(LS.guideTab, 'quick') || 'quick');
    let tab = (initialTab === 'page') ? 'page' : 'quick';
    let step = 0;

    const backdrop = document.createElement('div');
    backdrop.className = 'pbmodal__backdrop';
    backdrop.innerHTML = `
      <div class="pbmodal pbmodal--guide" role="dialog" aria-modal="true">
        <div class="pbmodal__hd">
          <strong>Guide</strong>
          <button class="btn btn--mini" data-act="close" type="button">Close</button>
        </div>
        <div class="pbmodal__bd">
          <div class="guide__tabs">
            <button class="guide__tab" data-tab="quick" type="button">Quick start</button>
            <button class="guide__tab" data-tab="page" type="button">This page</button>
          </div>

          <div class="guide__panel" data-panel="quick">
            <div class="guide__slide">
              <div class="guide__title" id="gStepTitle"></div>
              <div class="guide__text" id="gStepBody"></div>
            </div>
            <div class="guide__dots" id="gDots" aria-label="Steps"></div>
            <div class="guide__nav">
              <button class="btn" id="gPrev" type="button">Back</button>
              <button class="btn btn--primary" id="gNext" type="button">Next</button>
            </div>
          </div>

          <div class="guide__panel" data-panel="page">
            <div class="guide__title" id="gPageTitle"></div>
            <ul class="guide__list" id="gPageList"></ul>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = ()=>{
      // If the user saw the onboarding once, don't nag on every load.
      try{ if(!getLS(LS.onboarded, false)) setLS(LS.onboarded, true); }catch{}
      try{ backdrop.remove(); }catch{}
    };
    backdrop.querySelector('[data-act="close"]')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) close(); });

    const tabBtns = Array.from(backdrop.querySelectorAll('.guide__tab'));
    const panels = Array.from(backdrop.querySelectorAll('.guide__panel'));
    const gStepTitle = backdrop.querySelector('#gStepTitle');
    const gStepBody = backdrop.querySelector('#gStepBody');
    const gDots = backdrop.querySelector('#gDots');
    const gPrev = backdrop.querySelector('#gPrev');
    const gNext = backdrop.querySelector('#gNext');
    const gPageTitle = backdrop.querySelector('#gPageTitle');
    const gPageList = backdrop.querySelector('#gPageList');

    function renderTabs(){
      tabBtns.forEach(b=>b.classList.toggle('is-active', b.getAttribute('data-tab')===tab));
      panels.forEach(p=>p.style.display = (p.getAttribute('data-panel')===tab) ? '' : 'none');
      setLS(LS.guideTab, tab);
    }

    function renderQuick(){
      const s = ONBOARDING_SLIDES[step] || ONBOARDING_SLIDES[0];
      if(gStepTitle) gStepTitle.textContent = String(s.title||'');
      if(gStepBody) gStepBody.textContent = String(s.body||'');
      if(gDots){
        gDots.innerHTML = ONBOARDING_SLIDES.map((_,i)=>`<button class="guide__dot ${i===step?'is-active':''}" data-step="${i}" type="button" aria-label="Step ${i+1}"></button>`).join('');
        gDots.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click', ()=>{ step = Number(b.getAttribute('data-step')||0) || 0; renderQuick(); }));
      }
      if(gPrev) gPrev.disabled = step<=0;
      if(gNext){
        const last = step >= (ONBOARDING_SLIDES.length-1);
        gNext.textContent = last ? 'Done' : 'Next';
      }
    }

    function renderPage(){
      const info = GUIDE[route] || GUIDE.buddy;
      if(gPageTitle) gPageTitle.textContent = info.title || 'This page';
      if(gPageList){
        gPageList.innerHTML = (info.lines||[]).map(x=>`<li>${escapeHtml(String(x||''))}</li>`).join('');
      }
    }

    tabBtns.forEach(b=>b.addEventListener('click', ()=>{
      tab = String(b.getAttribute('data-tab')||'quick');
      renderTabs();
      if(tab==='quick') renderQuick();
      else renderPage();
    }));

    gPrev?.addEventListener('click', ()=>{ step = Math.max(0, step-1); renderQuick(); });
    gNext?.addEventListener('click', ()=>{
      const last = step >= (ONBOARDING_SLIDES.length-1);
      if(last){
        setLS(LS.onboarded, true);
        close();
      } else {
        step = Math.min(ONBOARDING_SLIDES.length-1, step+1);
        renderQuick();
      }
    });

    renderTabs();
    if(tab==='quick') renderQuick();
    else renderPage();
    return { close };
  }

  function maybeShowOnboarding(){
    const done = !!getLS(LS.onboarded, false);
    if(done) return;
    setTimeout(()=>{ try{ openGuide({ tab:'quick', route: currentRoute }); }catch{} }, 250);
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
  function setDraftPromptForce(v){
    // Used when user clicks "Send to Buddy" from Library/Vault.
    // This should overwrite whatever is currently in the Buddy textarea.
    setDraftPrompt(v);
    try{ localStorage.setItem(LS.draftForce, "1"); }catch{}
  }
  function getDraftForce(){
    try{ return localStorage.getItem(LS.draftForce)==="1"; }catch{ return false; }
  }
  function clearDraftForce(){
    try{ localStorage.removeItem(LS.draftForce); }catch{}
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

  // --- Projects (OneNote-ish structure for Library)
  // Shape: [{ id, name, sections:[{id,name}] }]
  function defaultProjects(){
    const pid = `p_${Date.now()}`;
    return [
      {
        id: pid,
        name: "General",
        sections: [
          { id: `${pid}_s_research`, name: "Research" },
          { id: `${pid}_s_drafts`, name: "Prompt drafts" },
          { id: `${pid}_s_final`, name: "Final prompts" },
          { id: `${pid}_s_marketing`, name: "Marketing" },
          { id: `${pid}_s_auto`, name: "Automation" }
        ]
      }
    ];
  }
  function loadProjects(){
    const p = getLS(LS.projects, null);
    if(Array.isArray(p) && p.length) return p;
    const d = defaultProjects();
    setLS(LS.projects, d);
    return d;
  }
  function saveProjects(arr){
    setLS(LS.projects, Array.isArray(arr)?arr:[]);
  }
  function getSelectedProjectId(){
    try{ return String(localStorage.getItem(LS.libSelProject) || ""); }catch{ return ""; }
  }
  function setSelectedProjectId(id){
    try{ localStorage.setItem(LS.libSelProject, String(id||"")); }catch{}
  }
  function getSelectedSectionId(){
    try{ return String(localStorage.getItem(LS.libSelSection) || ""); }catch{ return ""; }
  }
  function setSelectedSectionId(id){
    try{ localStorage.setItem(LS.libSelSection, String(id||"")); }catch{}
  }

  // Export/Import bundle (Vault + Library). Local-only “seatbelt”.
  function makeExportBundle(){
    return {
      schema: "pb_export_v1",
      exportedAt: new Date().toISOString(),
      vault: loadVault(),
      library: loadLibrary(),
      projects: loadProjects(),
      coachBoard: loadCoachBoard(),
      lastCoach: loadLastCoach()
    };
  }
  function applyImportBundle(bundle){
    if(!bundle || typeof bundle !== 'object') throw new Error('Invalid file.');
    const v = Array.isArray(bundle.vault) ? bundle.vault : [];
    const l = Array.isArray(bundle.library) ? bundle.library : [];
    const p = Array.isArray(bundle.projects) ? bundle.projects : null;
    const cb = Array.isArray(bundle.coachBoard) ? bundle.coachBoard : null;
    const lc = (bundle.lastCoach && typeof bundle.lastCoach === 'object') ? bundle.lastCoach : null;
    saveVault(v);
    saveLibrary(l);
    if(p && p.length) saveProjects(p);
    if(cb) saveCoachBoard(cb);
    if(lc) saveLastCoach(lc);
  }

  // --- Coach Board (choose up to 5 prompts to review)
  function loadCoachBoard(){
    try {
      const raw = localStorage.getItem(LS.coachBoard);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveCoachBoard(arr){
    try{
      const safe = (Array.isArray(arr)?arr:[])
        .map(x=>({
          id: String(x?.id||''),
          t: Number(x?.t||0)||Date.now(),
          title: String(x?.title||'').slice(0,120),
          text: String(x?.text||'')
        }))
        // Keep empty slots too (manual slots). We already ignore empties when running Coach.
        .filter(x=>x.id)
        .slice(0,5);
      localStorage.setItem(LS.coachBoard, JSON.stringify(safe));
    } catch {}
  }
  function addToCoachBoard(entry){
    const cur = loadCoachBoard();
    const e = {
      id: `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      t: Date.now(),
      title: String(entry?.title||'').trim().slice(0,120),
      text: String(entry?.text||'')
    };
    if(!e.text.trim()) return cur;
    // Deduplicate by exact text (keeps the newest)
    const next = [e, ...cur.filter(x=>String(x?.text||'') !== e.text)].slice(0,5);
    saveCoachBoard(next);
    return next;
  }
  function updateCoachBoardSlot(id, patch){
    const cur = loadCoachBoard();
    const next = cur.map(x=>{
      if(!x || String(x.id)!==String(id)) return x;
      return {
        ...x,
        title: (patch?.title != null) ? String(patch.title).slice(0,120) : x.title,
        text: (patch?.text != null) ? String(patch.text) : x.text
      };
    });
    saveCoachBoard(next);
    return next;
  }
  function removeCoachBoardSlot(id){
    const cur = loadCoachBoard();
    const next = cur.filter(x=>x && String(x.id)!==String(id));
    saveCoachBoard(next);
    return next;
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
    // Worker versions differ: can return expiresAt (ISO) OR exp (ms timestamp).
    let expMs = 0;
    if (typeof expiresAtISO === 'number' && Number.isFinite(expiresAtISO)) {
      expMs = expiresAtISO;
    } else if (expiresAtISO) {
      expMs = Date.parse(String(expiresAtISO));
    }
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
    currentRoute = String(route||'buddy') || 'buddy';
    setActiveNav(route);
    app.innerHTML = "";
    if(route === "vault") {
      app.appendChild(tpl("tpl-vault"));
      initVault();
    } else if(route === "coach") {
      app.appendChild(tpl("tpl-coachpage"));
      initCoach();
    } else if(route === "library") {
      app.appendChild(tpl("tpl-library"));
      initLibrary();
    } else if(route === "ideas") {
      app.appendChild(tpl("tpl-ideas"));
      initIdeas();
    } else if(route === "tips") {
      app.appendChild(tpl("tpl-tips"));
      initTips();
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
    const buy = frag.querySelector('#unlockBuy');
    const close = frag.querySelector('#unlockClose');
    const status = frag.querySelector('#unlockStatus');

    // Wire "Get passphrase" button (optional)
    try {
      const url = (window.PB_DATA && window.PB_DATA.supportUrl) ? String(window.PB_DATA.supportUrl).trim() : "";
      if(buy){
        if(!url || url === "#"){
          buy.setAttribute("href", "#about");
          try{ buy.removeAttribute("target"); }catch{}
          buy.addEventListener("click", (e)=>{
            e.preventDefault();
            cleanup();
            location.hash = "#about";
            render("about");
          });
        } else {
          buy.setAttribute("href", url);
          buy.setAttribute("target", "_blank");
        }
      }
    } catch {}

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
            // Keep header for backward compatibility (older Worker versions).
            "X-OU-PASS": pass
          },
          // New Worker expects passphrase in JSON body.
          body: { passphrase: pass }
        });
        if(j && j.token){
          // Worker may return expiresAt (ISO) or exp (ms).
          setToken(j.token, j.expiresAt || j.exp);
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

  guideBtn?.addEventListener('click', ()=>{
    try{ openGuide({ route: currentRoute, tab: 'page' }); } catch {}
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
    const lensHelp = document.getElementById('pcLensHelp');

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

    lensHelp?.addEventListener('click', ()=>{
      // Tiny “what's this” helper (keep details in About).
      const msg =
        "Auditor - strict, finds holes and wasted tokens.\n"+
        "Thinker - balanced, makes it clear and usable.\n"+
        "Creator - bold, adds options and angles.\n\n"+
        "More details in About.";
      alert(msg);
    });


    function setStatus(msg){ if(status) status.textContent = msg || ""; }
    function countChars(){
      const n = String(prompt?.value||"").length;
      if(ch) ch.textContent = String(n);
      return n;
    }
    // Restore draft so switching tabs doesn't erase what you're typing.
    // If we arrived via "Send to Buddy", we force overwrite once.
    if(prompt){
      const draft = getDraftPrompt();
      const force = getDraftForce();
      if(draft && (force || !prompt.value)){
        prompt.value = draft;
        if(force){
          try{ localStorage.removeItem(LS.draftForce); }catch{}
        }
      }
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
          modeUsed: getLens(),
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
        const mode = String(item.modeUsed||'').trim().toLowerCase();
        const modeNice = mode ? (mode==='auditor'?'Auditor':mode==='creator'?'Creator':'Thinker') : '';
        return `
          <article class="card card--flat vault__item" data-idx="${idx}">
            <div class="card__body">
              <div class="vault__meta">
                <span class="muted">${ts}</span>
                ${modeNice ? `<span class="chip chip--mode">${escapeHtml(modeNice)}</span>` : ''}
              </div>
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
                    <button class="btn btn--mini" data-act="saveToLibrary" type="button">Save to Library</button>
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

          if(act === 'saveToLibrary') {
            const goldenTxt = String(item.golden||"").trim();
            const originalTxt = String(item.prompt||"").trim();
            if(!goldenTxt){
              setCoachStatus('No Golden Prompt to save.');
              setTimeout(()=>setCoachStatus(''), 900);
              return;
            }
            const lib = loadLibrary();
            const titleBase = (originalTxt.split('\n')[0] || 'From Vault').slice(0, 60);
            lib.unshift({
              id: `lib_${Date.now()}_${Math.random().toString(16).slice(2)}`,
              t: Date.now(),
              title: titleBase,
              // v2 fields
              golden: goldenTxt,
              prompt: "",
              original: originalTxt,
              // legacy fallback (kept for older versions / exports)
              text: goldenTxt,
              tags: "#from-vault",
              model: "",
              notes: "",
              cat: "General",
              fav: false,
              modeUsed: String(item.modeUsed||"")
            });
            saveLibrary(lib);
            setCoachStatus('Saved to Library ✅');
            setTimeout(()=>setCoachStatus(''), 900);
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
      const s0 = String(txt).trim();
      if(!s0) return null;

      const tryParse = (str) => {
        if(!str) return null;
        const repaired = String(str)
          // remove trailing commas before } or ]
          .replace(/,\s*([}\]])/g, "$1")
          // normalize smart quotes
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .trim();
        try { return JSON.parse(repaired); } catch { return null; }
      };

      // 1) Prefer fenced JSON blocks if present
      const fenceMatch = s0.match(/```\s*json\s*([\s\S]*?)```/i) || s0.match(/```\s*([\s\S]*?)```/i);
      if(fenceMatch && fenceMatch[1]){
        const fromFence = tryParse(fenceMatch[1]);
        if(fromFence) return fromFence;
      }

      // 2) Try direct parse
      const direct = tryParse(s0);
      if(direct) return direct;

      // 3) Try to extract the first balanced {...} JSON object (quote-aware)
      const extractBalancedObject = (str) => {
        let start = -1;
        let depth = 0;
        let inString = false;
        let escaped = false;

        for(let i=0;i<str.length;i++){
          const ch = str[i];

          if(inString){
            if(escaped){ escaped = false; continue; }
            if(ch === '\\'){ escaped = true; continue; }
            if(ch === '"'){ inString = false; continue; }
            continue;
          } else {
            if(ch === '"'){ inString = true; continue; }
            if(ch === '{'){
              if(depth === 0) start = i;
              depth++;
              continue;
            }
            if(ch === '}'){
              if(depth > 0) depth--;
              if(depth === 0 && start !== -1){
                return str.slice(start, i+1);
              }
            }
          }
        }
        return null;
      };

      const balanced = extractBalancedObject(s0);
      if(!balanced) return null;
      return tryParse(balanced);
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
      // 2) {text:"..."} or {raw:"..."}
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

      if(typeof obj === 'string'){
        obj = parseJsonFromText(obj) || { diagnosis: [obj] };
      }

      const diagnosis = Array.isArray(obj?.diagnosis) ? obj.diagnosis : (obj?.diagnosis ? [String(obj.diagnosis)] : []);
      const missing = Array.isArray(obj?.missing) ? obj.missing : (obj?.missing ? [String(obj.missing)] : []);
      const improvements = Array.isArray(obj?.improvements) ? obj.improvements : (obj?.improvements ? [String(obj.improvements)] : []);
      const golden = typeof obj?.golden === 'string' ? obj.golden : (typeof obj?.goldenPrompt === 'string' ? obj.goldenPrompt : '');

      // Salvage: sometimes the model "double-wraps" the real JSON inside the golden field as a string.
      const outerLooksEmpty = !(diagnosis.length || missing.length || improvements.length);
      const goldenLooksLikeJson = (typeof golden === 'string') && (golden.includes('```') || golden.includes('{')) && (/"diagnosis"\s*:|\bdiagnosis\b\s*:/i.test(golden));
      if(outerLooksEmpty && goldenLooksLikeJson){
        const nested = parseJsonFromText(golden);
        if(nested && typeof nested === 'object'){
          const nd = Array.isArray(nested.diagnosis) ? nested.diagnosis : (nested.diagnosis ? [String(nested.diagnosis)] : []);
          const nm = Array.isArray(nested.missing) ? nested.missing : (nested.missing ? [String(nested.missing)] : []);
          const ni = Array.isArray(nested.improvements) ? nested.improvements : (nested.improvements ? [String(nested.improvements)] : []);
          const ng = typeof nested.golden === 'string' ? nested.golden : (typeof nested.goldenPrompt === 'string' ? nested.goldenPrompt : '');

          const nestedHasSignal = (nd.length || nm.length || ni.length || (ng && ng.trim().length));
          if(nestedHasSignal){
            return { diagnosis: nd, missing: nm, improvements: ni, golden: ng || '', _raw: obj, _nested: nested };
          }
        }
      }

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

  // --- Coach (choose up to 5 prompts and run Coach agent)
  function initCoach(){
    const slotsWrap = document.getElementById('coachSlots');
    const addEmptyBtn = document.getElementById('coachAddEmpty');
    const clearBtn = document.getElementById('coachClearAll');
    const runBtn = document.getElementById('coachRun');
    const statusEl = document.getElementById('coachPageStatus');
    const capEl = document.getElementById('coachCap');

    const outWrap = document.getElementById('coachOut');
    const outMini = document.getElementById('coachOutMini');
    const outMiniWhen = document.getElementById('coachOutMiniWhen');
    const miniShowBtn = document.getElementById('coachMiniShow');
    const miniClearBtn = document.getElementById('coachMiniClear');
    const outWhen = document.getElementById('coachOutWhen');
    const outMist = document.getElementById('coachOutMistakes');
    const outFix = document.getElementById('coachOutFixes');
    const outMeta = document.getElementById('coachOutMeta');
    const outRaw = document.getElementById('coachOutRaw');
    const copyBtn = document.getElementById('coachCopy');
    const hideBtn = document.getElementById('coachHide');
    const clearResBtn = document.getElementById('coachClearResult');

    if(capEl) capEl.textContent = String(COACH_MAX_CHARS);

    const setStatus = (m)=>{ if(statusEl) statusEl.textContent = m||""; };

    function fmtWhen(ts){
      if(!ts) return "";
      try{ return new Date(ts).toLocaleString(); }catch{ return ""; }
    }

    function renderSlots(){
      const board = loadCoachBoard();
      if(!slotsWrap) return;

      if(!board.length){
        slotsWrap.innerHTML = `
          <div class="muted" style="padding:10px 0">
            No prompts yet. Add from Library (Send to Coach) or click “Add slot”.
          </div>
        `;
        return;
      }

      slotsWrap.innerHTML = board.map((x, i)=>{
        const title = escapeHtml(String(x.title||`Prompt ${i+1}`));
        const text = escapeHtml(String(x.text||""));
        return `
          <div class="block" data-id="${escapeHtml(String(x.id||""))}">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
              <strong>Slot ${i+1}</strong>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="btn btn--mini" data-act="save" type="button">Save</button>
                <button class="btn btn--mini" data-act="remove" type="button">Remove</button>
              </div>
            </div>
            <div class="libws__editgrid" style="margin-top:10px">
              <label class="field">
                <span class="field__label">Title</span>
                <input class="field__input" data-role="title" type="text" value="${title}" placeholder="Short name" />
              </label>
              <label class="field" style="grid-column:1/-1">
                <span class="field__label">Prompt text</span>
                <textarea class="field__input" data-role="text" rows="7" placeholder="Paste a prompt...">${text}</textarea>
              </label>
            </div>
          </div>
        `;
      }).join('');

      // Wire actions
      slotsWrap.querySelectorAll('[data-act="save"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const block = btn.closest('[data-id]');
          const id = String(block?.getAttribute('data-id')||'');
          const titleEl = block?.querySelector('input[data-role="title"]');
          const textEl = block?.querySelector('textarea[data-role="text"]');
          updateCoachBoardSlot(id, { title: titleEl?.value || '', text: textEl?.value || '' });
          setStatus('Saved ✅');
          setTimeout(()=>setStatus(''), 700);
        });
      });
      slotsWrap.querySelectorAll('[data-act="remove"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const block = btn.closest('[data-id]');
          const id = String(block?.getAttribute('data-id')||'');
          removeCoachBoardSlot(id);
          renderSlots();
          setStatus('Removed ✅');
          setTimeout(()=>setStatus(''), 700);
        });
      });

      // Persist edits on input (fast + safe)
      slotsWrap.querySelectorAll('input[data-role="title"]').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          const block = inp.closest('[data-id]');
          const id = String(block?.getAttribute('data-id')||'');
          updateCoachBoardSlot(id, { title: inp.value });
        });
      });
      slotsWrap.querySelectorAll('textarea[data-role="text"]').forEach(ta=>{
        ta.addEventListener('input', ()=>{
          const block = ta.closest('[data-id]');
          const id = String(block?.getAttribute('data-id')||'');
          updateCoachBoardSlot(id, { text: ta.value });
        });
      });
    }

    function renderResult(){
      const data = loadLastCoach();
      const hidden = isCoachHidden();
      if(hideBtn) hideBtn.hidden = hidden;

      if(!outWrap) return;
      if(!data){
        outWrap.hidden = true;
        if(outMini) outMini.hidden = true;
        return;
      }

      if(hidden){
        outWrap.hidden = true;
        if(outMini) outMini.hidden = false;
        if(outMiniWhen) outMiniWhen.textContent = `${fmtWhen(data.t)} (hidden)`;
        return;
      }

      if(outMini) outMini.hidden = true;
      outWrap.hidden = false;

      if(outWhen) outWhen.textContent = fmtWhen(data.t);
      const cleanList = (arr)=> (arr||[]).map(x=>String(x??'').trim()).filter(Boolean).slice(0, 12);
      const m = cleanList(data.mistakes);
      const f = cleanList(data.fixes);
      if(outMist) outMist.innerHTML = (m.length?m:['—']).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('');
      if(outFix) outFix.innerHTML = (f.length?f:['—']).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('');
      if(outMeta) outMeta.textContent = String(data.metaPrompt||'');
      if(outRaw) outRaw.textContent = String(data.raw||'');
    }

    function parseJsonFromText(txt){
      if(!txt) return null;
      const s0 = String(txt).trim();
      if(!s0) return null;

      const tryParse = (str) => {
        if(!str) return null;
        const repaired = String(str)
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .trim();
        try { return JSON.parse(repaired); } catch { return null; }
      };

      const fenceMatch = s0.match(/```\s*json\s*([\s\S]*?)```/i) || s0.match(/```\s*([\s\S]*?)```/i);
      if(fenceMatch && fenceMatch[1]){
        const fromFence = tryParse(fenceMatch[1]);
        if(fromFence) return fromFence;
      }

      const direct = tryParse(s0);
      if(direct) return direct;

      // balanced object extraction
      let start = -1, depth = 0, inStr = false, esc = false;
      for(let i=0;i<s0.length;i++){
        const ch = s0[i];
        if(inStr){
          if(esc){ esc = false; continue; }
          if(ch==='\\'){ esc = true; continue; }
          if(ch==='"'){ inStr = false; continue; }
          continue;
        }
        if(ch==='"'){ inStr = true; continue; }
        if(ch==='{'){ if(depth===0) start=i; depth++; continue; }
        if(ch==='}'){ if(depth>0) depth--; if(depth===0 && start!==-1){
          const slice = s0.slice(start, i+1);
          return tryParse(slice);
        }}
      }
      return null;
    }

    function normalizeCoachPayload(maybe){
      let obj = maybe;
      if(typeof obj === 'string') obj = parseJsonFromText(obj) || { metaPrompt: obj };
      if(obj && typeof obj === 'object'){
        if(typeof obj.metaPrompt === 'string' && (!Array.isArray(obj.mistakes) || !Array.isArray(obj.fixes))){
          const parsed = parseJsonFromText(obj.metaPrompt);
          if(parsed && typeof parsed === 'object') obj = { ...obj, ...parsed };
        }
        return {
          mistakes: Array.isArray(obj.mistakes) ? obj.mistakes : [],
          fixes: Array.isArray(obj.fixes) ? obj.fixes : [],
          metaPrompt: String(obj.metaPrompt||obj.meta||'').trim(),
          _raw: obj
        };
      }
      return { mistakes: [], fixes: [], metaPrompt: String(maybe||'') };
    }

    async function runCoach(){
      setStatus('');
      const tok = getToken();
      if(!tok){ setStatus('🔒 Unlock to use Coach.'); return; }

      const board = loadCoachBoard();
      if(!board.length){ setStatus('Add at least 1 prompt first.'); return; }

      // Build items (prompts + optional other AI reply - none for now)
      const items = board.slice(0,5).map(x=>({
        prompt: String(x.text||'').slice(0, PROMPT_MAX_CHARS),
        aiReply: ""
      })).filter(x=>x.prompt.trim());
      if(!items.length){ setStatus('No usable prompt text.'); return; }

      const combined = items.map((it,i)=>`#${i+1} PROMPT\n${String(it.prompt||'')}`).join("\n\n");
      const clipped = combined.slice(0, COACH_MAX_CHARS);

      runBtn && (runBtn.disabled = true);
      setStatus('Coaching...');

      try {
        const res = await fetch(`${ENDPOINT.replace(/\/+$/,'')}/coach-last5`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tok}`
          },
          body: JSON.stringify({ text: clipped, items })
        });
        if(!res.ok){
          const t = await res.text().catch(()=>"");
          throw new Error(t || `HTTP ${res.status}`);
        }
        const txt = await res.text();
        const parsed = normalizeCoachPayload(parseJsonFromText(txt) || txt);

        saveLastCoach({
          mistakes: parsed.mistakes,
          fixes: parsed.fixes,
          metaPrompt: parsed.metaPrompt,
          raw: txt
        });
        setCoachHidden(false);
        renderResult();
        // Bring the result into view (it's now above the slots, but this helps on long pages)
        try{ outWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }catch{}
        setStatus('Done ✅');
        setTimeout(()=>setStatus(''), 900);
        await refreshStatus();
      } catch (err){
        setStatus(String(err?.message || err));
      } finally {
        runBtn && (runBtn.disabled = false);
      }
    }

    addEmptyBtn?.addEventListener('click', ()=>{
      const cur = loadCoachBoard();
      if(cur.length >= 5){ setStatus('Max 5 slots. Remove one first.'); return; }
      const id = `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const next = [{ id, t: Date.now(), title: `Slot ${cur.length+1}`, text: '' }, ...cur].slice(0,5);
      saveCoachBoard(next);
      renderSlots();
      setStatus('Added ✅');
      setTimeout(()=>setStatus(''), 700);
    });

    clearBtn?.addEventListener('click', ()=>{
      if(!confirm('Clear Coach slots?')) return;
      saveCoachBoard([]);
      renderSlots();
      setStatus('Cleared ✅');
      setTimeout(()=>setStatus(''), 700);
    });

    runBtn?.addEventListener('click', runCoach);

    copyBtn?.addEventListener('click', async ()=>{
      const txt = String(outMeta?.textContent||'').trim();
      if(!txt) return;
      try{ await navigator.clipboard.writeText(txt); setStatus('Meta-prompt copied ✅'); }
      catch{ setStatus('Copy failed.'); }
      setTimeout(()=>setStatus(''), 900);
    });
    hideBtn?.addEventListener('click', ()=>{ setCoachHidden(true); renderResult(); });
    miniShowBtn?.addEventListener('click', ()=>{ setCoachHidden(false); renderResult(); });
    clearResBtn?.addEventListener('click', ()=>{
      try{ localStorage.removeItem(LS_LAST.coach); }catch{}
      try{ localStorage.removeItem(LS_LAST.coachHidden); }catch{}
      renderResult();
      setStatus('Result cleared ✅');
      setTimeout(()=>setStatus(''), 900);
    });

    miniClearBtn?.addEventListener('click', ()=>{
      try{ localStorage.removeItem(LS_LAST.coach); }catch{}
      try{ localStorage.removeItem(LS_LAST.coachHidden); }catch{}
      renderResult();
      setStatus('Result cleared ✅');
      setTimeout(()=>setStatus(''), 900);
    });

    renderSlots();
    renderResult();
  }

  // --- Library
  function initLibrary(){
    const list = document.getElementById('libList');
    const addBtn = document.getElementById('libAdd');
    const exportBtn = document.getElementById('libExport');
    const importBtn = document.getElementById('libImport');
    const importFile = document.getElementById('libImportFile');
    const search = document.getElementById('libSearch');
    const projectSel = document.getElementById('libProject');
    const sectionSel = document.getElementById('libSection');
    // Workspace UI (v2)
    const wsProjects = document.getElementById('libWsProjects');
    const wsAddProject = document.getElementById('libWsAddProject');
    const wsManage = document.getElementById('libWsManage');
    const wsCrumb = document.getElementById('libWsCrumb');
    const wsSections = document.getElementById('libWsSections');
    const manageProjectsBtn = document.getElementById('libManageProjects');
    const catSel = document.getElementById('libCat');
    const onlyFav = document.getElementById('libOnlyFav');

    // Inline editor (inside Library page)
    const editorWrap = document.getElementById('libEditorWrap');
    const editorTitle = document.getElementById('libEditorTitle');
    const editorClose = document.getElementById('libEditorClose');
    const editorStatus = document.getElementById('libEditStatus');
    const fTitle = document.getElementById('libFieldTitle');
    const fGolden = document.getElementById('libFieldGolden');
    const fPromptW = document.getElementById('libFieldPrompt');
    const fOriginal = document.getElementById('libFieldOriginal');
    const fCat = document.getElementById('libFieldCat');
    const fProject = document.getElementById('libFieldProject');
    const fSection = document.getElementById('libFieldSection');
    const fMode = document.getElementById('libFieldMode');
    const fTags = document.getElementById('libFieldTags');
    const fModel = document.getElementById('libFieldModel');
    const fNotes = document.getElementById('libFieldNotes');
    const btnSave = document.getElementById('libSave');
    const btnCancel = document.getElementById('libCancel');

    let editingId = null;
    let editingCreatedAt = null;

    const CATS = Array.isArray(data.libraryCategories) && data.libraryCategories.length
      ? data.libraryCategories.slice(0,50)
      : ["Various","Daily drivers","Writing","Coding","Research / OSINT","Visuals","Marketing","Business","Finances","Life / Mood"];

    const LS_LIB_SEEDED = "pb_library_seeded_v1";
    const LS_IDEAS_SEEDED = "pb_ideas_seeded_v1";

    function ensureCategoriesInUI(){
      if(!catSel || !fCat) return;
      // Category filter dropdown
      if(catSel.options.length <= 1){
        // Add "None" so users can intentionally filter prompts without a category.
        const n = document.createElement('option');
        n.value = '__none__';
        n.textContent = 'None';
        catSel.appendChild(n);
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
        o0.textContent = "None";
        fCat.appendChild(o0);
        CATS.forEach(c=>{
          const o = document.createElement('option');
          o.value = c;
          o.textContent = c;
          fCat.appendChild(o);
        });
      }
    }

    function refreshEditorSections(){
      const projects = loadProjects();
      if(!fSection) return;
      const keepSection = String(fSection.value||'');
      while(fSection.options.length) fSection.remove(0);
      const o0 = document.createElement('option');
      o0.value = "";
      o0.textContent = "";
      fSection.appendChild(o0);
      const pid = String(fProject?.value||"");
      const proj = projects.find(p=>p.id===pid) || null;
      (proj?.sections||[]).forEach(s=>{
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name;
        fSection.appendChild(o);
      });
      // restore if still valid
      if(keepSection && Array.from(fSection.options).some(o=>String(o.value)===keepSection)){
        fSection.value = keepSection;
      }
    }

    function ensureProjectsInUI(){
      const projects = loadProjects();
      // Filters (hidden legacy selects)
      if(projectSel){
        const keep = String(projectSel.value||getLS(LS.libSelProject, "")||"");
        // keep first option (All)
        while(projectSel.options.length > 1) projectSel.remove(1);
        projects.forEach(p=>{
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name;
          projectSel.appendChild(o);
        });
        if(keep && Array.from(projectSel.options).some(o=>String(o.value)===keep)) projectSel.value = keep;
      }
      if(sectionSel){
        const keepS = String(sectionSel.value||getLS(LS.libSelSection, "")||"");
        while(sectionSel.options.length > 1) sectionSel.remove(1);
        const pid = String(projectSel?.value||getLS(LS.libSelProject, "")||"");
        const proj = projects.find(p=>p.id===pid) || null;
        (proj?.sections||[]).forEach(s=>{
          const o = document.createElement('option');
          o.value = s.id;
          o.textContent = s.name;
          sectionSel.appendChild(o);
        });
        if(keepS && Array.from(sectionSel.options).some(o=>String(o.value)===keepS)) sectionSel.value = keepS;
      }

      // Editor selects
      if(fProject){
        const keepP = String(fProject.value||"");
        while(fProject.options.length) fProject.remove(0);
        const oNone = document.createElement('option');
        oNone.value = "";
        oNone.textContent = "(none)";
        fProject.appendChild(oNone);
        projects.forEach(p=>{
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name;
          fProject.appendChild(o);
        });
        if(keepP && Array.from(fProject.options).some(o=>String(o.value)===keepP)){
          fProject.value = keepP;
        }
      }
      refreshEditorSections();
    }

    function openModal({title, bodyHtml, onMount}){
      // Minimal modal (no window.prompt).
      const back = document.createElement('div');
      back.className = 'pbmodal__backdrop';
      back.innerHTML = `
        <div class="pbmodal" role="dialog" aria-modal="true">
          <div class="pbmodal__hd">
            <strong>${escapeHtml(String(title||''))}</strong>
            <button class="btn btn--mini" data-act="close" type="button">Close</button>
          </div>
          <div class="pbmodal__bd">${bodyHtml||''}</div>
          <div class="pbmodal__ft">
            <button class="btn" data-act="close" type="button">Cancel</button>
            <button class="btn btn--primary" data-act="ok" type="button">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(back);
      const close = ()=>{ try{ back.remove(); }catch{} };
      const okBtn = back.querySelector('[data-act="ok"]');
      back.querySelectorAll('[data-act="close"]').forEach(b=>b.addEventListener('click', close));
      back.addEventListener('click', (e)=>{ if(e.target===back) close(); });
      if(onMount) onMount({back, close, okBtn});
      return {back, close, okBtn};
    }

    function renderWorkspace(){
      const projects = loadProjects();
      const selP = String(getSelectedProjectId()||'');
      const selS = String(getSelectedSectionId()||'');

      // Sidebar projects
      if(wsProjects){
        const items = [{ id:'', name:'All Projects', sections:[] }, ...projects];
        const projectButtons = items.map(p=>{
          const pid = String(p.id||'');
          const active = pid===selP;
          const count = pid ? loadLibrary().filter(x=>x && String(x.projectId||'')===pid).length : loadLibrary().length;
          const dot = pid ? colorForKey(pid) : 'rgba(0,0,0,.25)';
          return `
            <button class="libws__projbtn ${active?'is-active':''}" data-pid="${escapeHtml(pid)}" type="button">
              <span class="libws__dot" style="background:${dot}"></span>
              <span class="libws__projmeta">
                <span>${escapeHtml(String(p.name||''))}</span>
                <span class="chip chip--time">${count}</span>
              </span>
              ${pid ? `<span class="muted">›</span>` : ``}
            </button>
          `;
        }).join('');

        // Collapsible group (Notion-ish)
        wsProjects.innerHTML = `
          <details class="wsGroup" open>
            <summary>Projects</summary>
            <div class="wsGroup__body">${projectButtons}</div>
          </details>
        `;

        wsProjects.querySelectorAll('[data-pid]').forEach(b=>{
          b.addEventListener('click', ()=>{
            const pid = String(b.getAttribute('data-pid')||'');
            setSelectedProjectId(pid);
            // Reset section when switching project
            setSelectedSectionId('');
            ensureProjectsInUI();
            renderWorkspace();
            renderLibrary();
          });
        });
      }

      // Breadcrumb + Sections
      if(wsCrumb){
        const name = selP ? (projects.find(p=>p.id===selP)?.name || 'Project') : 'All Projects';
        wsCrumb.textContent = name;
      }
      if(wsSections){
        if(!selP){
          wsSections.hidden = true;
          wsSections.innerHTML = '';
        } else {
          const proj = projects.find(p=>p.id===selP) || null;
          const sections = Array.isArray(proj?.sections) ? proj.sections : [];
          wsSections.hidden = false;
          wsSections.innerHTML = [
            `<button class="libws__sectbtn ${!selS?'is-active':''}" data-sid="" type="button">All</button>`
          , ...sections.map(s=>`<button class="libws__sectbtn ${String(s.id)===selS?'is-active':''}" data-sid="${escapeHtml(String(s.id))}" type="button">${escapeHtml(String(s.name||''))}</button>`)
          ].join('');
          wsSections.querySelectorAll('[data-sid]').forEach(b=>{
            b.addEventListener('click', ()=>{
              setSelectedSectionId(String(b.getAttribute('data-sid')||''));
              ensureProjectsInUI();
              renderWorkspace();
              renderLibrary();
            });
          });
        }
      }

      // Keep hidden selects in sync (legacy)
      if(projectSel) projectSel.value = selP;
      if(sectionSel) sectionSel.value = selS;
    }

    function manageProjectsDialog(preselectId){
      const projects = loadProjects();
      const pid0 = String(preselectId||getSelectedProjectId()||'') || (projects[0]?.id||'');

      const bodyHtml = `
        <label class="field">
          <span class="field__label">Project</span>
          <select class="field__input" id="pbProjPick">
            ${projects.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </label>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn" id="pbProjAdd" type="button">+ Add project</button>
          <button class="btn" id="pbProjRename" type="button">Rename</button>
          <button class="btn" id="pbProjDelete" type="button">Delete</button>
          <button class="btn btn--primary" id="pbProjSections" type="button">Edit sections</button>
        </div>
        <div class="muted" style="font-size:12px">Deleting a project won't delete prompts. Prompts will just lose their project/section.</div>
      `;

      const modal = openModal({
        title: 'Manage projects',
        bodyHtml,
        onMount: ({back, close, okBtn})=>{
          const sel = back.querySelector('#pbProjPick');
          if(sel) sel.value = pid0;
          okBtn.textContent = 'Done';

          const addBtn = back.querySelector('#pbProjAdd');
          const renBtn = back.querySelector('#pbProjRename');
          const delBtn = back.querySelector('#pbProjDelete');
          const secBtn = back.querySelector('#pbProjSections');

          addBtn?.addEventListener('click', ()=>{
            const inner = openModal({
              title:'Add project',
              bodyHtml:`<label class="field"><span class="field__label">Name</span><input class="field__input" id="pbNewProjName" placeholder="New project" /></label>`,
              onMount: ({back: b2, close: c2, okBtn: ok2})=>{
                ok2.textContent = 'Add';
                ok2.addEventListener('click', ()=>{
                  const name = String(b2.querySelector('#pbNewProjName')?.value||'').trim();
                  if(!name) return;
                  const ps = loadProjects();
                  ps.unshift({ id:`p_${Date.now()}_${Math.random().toString(16).slice(2)}`, name, sections:[] });
                  saveProjects(ps);
                  setSelectedProjectId(ps[0].id);
                  setSelectedSectionId('');
                  c2();
                  close();
                  ensureProjectsInUI();
                  renderWorkspace();
                  renderLibrary();
                });
              }
            });
            // focus
            setTimeout(()=>inner?.back.querySelector('#pbNewProjName')?.focus(), 50);
          });

          renBtn?.addEventListener('click', ()=>{
            const pid = String(sel?.value||'');
            const p0 = loadProjects().find(x=>x.id===pid);
            const inner = openModal({
              title:'Rename project',
              bodyHtml:`<label class="field"><span class="field__label">Name</span><input class="field__input" id="pbRenProjName" value="${escapeHtml(String(p0?.name||''))}" /></label>`,
              onMount: ({back: b2, close: c2, okBtn: ok2})=>{
                ok2.textContent = 'Save';
                ok2.addEventListener('click', ()=>{
                  const name = String(b2.querySelector('#pbRenProjName')?.value||'').trim();
                  if(!name) return;
                  const ps = loadProjects().map(x=>x.id===pid ? { ...x, name } : x);
                  saveProjects(ps);
                  c2();
                  close();
                  ensureProjectsInUI();
                  renderWorkspace();
                  renderLibrary();
                });
              }
            });
            setTimeout(()=>inner?.back.querySelector('#pbRenProjName')?.focus(), 50);
          });

          delBtn?.addEventListener('click', ()=>{
            const pid = String(sel?.value||'');
            const p0 = loadProjects().find(x=>x.id===pid);
            const inner = openModal({
              title:'Delete project',
              bodyHtml:`<div>Delete <strong>${escapeHtml(String(p0?.name||''))}</strong>?</div><div class="muted" style="font-size:12px">Prompts won't be deleted.</div>`,
              onMount: ({close: c2, okBtn: ok2})=>{
                ok2.textContent = 'Delete';
                ok2.addEventListener('click', ()=>{
                  let ps = loadProjects().filter(x=>x.id!==pid);
                  if(!ps.length) ps = defaultProjects();
                  saveProjects(ps);
                  // Unlink prompts
                  const lib = loadLibrary().map(it=> (it && String(it.projectId||'')===pid) ? { ...it, projectId:'', sectionId:'' } : it);
                  saveLibrary(lib);
                  // selection
                  if(getSelectedProjectId()===pid){ setSelectedProjectId(''); setSelectedSectionId(''); }
                  c2();
                  close();
                  ensureProjectsInUI();
                  renderWorkspace();
                  renderLibrary();
                });
              }
            });
          });

          secBtn?.addEventListener('click', ()=>{
            const pid = String(sel?.value||'');
            const p0 = loadProjects().find(x=>x.id===pid);
            if(!p0) return;
            manageSectionsDialog(pid);
          });

          okBtn.addEventListener('click', ()=>{ close(); });
        }
      });
      return modal;
    }

    function manageSectionsDialog(projectId){
      const ps0 = loadProjects();
      const proj0 = ps0.find(p=>p.id===projectId);
      if(!proj0) return;
      const sections0 = Array.isArray(proj0.sections) ? proj0.sections : [];

      const bodyHtml = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px">
          <strong>${escapeHtml(proj0.name)}</strong>
          <button class="btn" id="pbSecAdd" type="button">+ Section</button>
        </div>
        <div id="pbSecList" style="display:flex; flex-direction:column; gap:6px"></div>
        <div class="muted" style="font-size:12px">Deleting a section won't delete prompts. Prompts will just lose their section.</div>
      `;

      const modal = openModal({
        title: 'Edit sections',
        bodyHtml,
        onMount: ({back, close, okBtn})=>{
          okBtn.textContent = 'Done';
          const listEl = back.querySelector('#pbSecList');
          const render = ()=>{
            const ps = loadProjects();
            const proj = ps.find(p=>p.id===projectId);
            const sections = Array.isArray(proj?.sections) ? proj.sections : [];
            if(!listEl) return;
            if(!sections.length){
              listEl.innerHTML = '<div class="muted">No sections yet.</div>';
              return;
            }
            listEl.innerHTML = sections.map(s=>`
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid rgba(0,0,0,.12); border-radius:12px; background:rgba(255,255,255,.55)">
                <span>${escapeHtml(String(s.name||''))}</span>
                <span style="display:flex; gap:6px">
                  <button class="btn btn--mini" data-act="ren" data-sid="${escapeHtml(String(s.id))}" type="button">Rename</button>
                  <button class="btn btn--mini" data-act="del" data-sid="${escapeHtml(String(s.id))}" type="button">Delete</button>
                </span>
              </div>
            `).join('');

            listEl.querySelectorAll('button[data-act]').forEach(b=>{
              b.addEventListener('click', ()=>{
                const sid = String(b.getAttribute('data-sid')||'');
                const act = String(b.getAttribute('data-act')||'');
                if(act==='ren'){
                  const inner = openModal({
                    title:'Rename section',
                    bodyHtml:`<label class="field"><span class="field__label">Name</span><input class="field__input" id="pbRenSecName" value="${escapeHtml(String(sections.find(x=>x.id===sid)?.name||''))}" /></label>`,
                    onMount: ({back: b2, close: c2, okBtn: ok2})=>{
                      ok2.textContent='Save';
                      ok2.addEventListener('click', ()=>{
                        const name = String(b2.querySelector('#pbRenSecName')?.value||'').trim();
                        if(!name) return;
                        const ps2 = loadProjects().map(p=>{
                          if(p.id!==projectId) return p;
                          const secs = (p.sections||[]).map(x=>x.id===sid ? { ...x, name } : x);
                          return { ...p, sections: secs };
                        });
                        saveProjects(ps2);
                        c2();
                        render();
                        ensureProjectsInUI();
                        renderWorkspace();
                        renderLibrary();
                      });
                    }
                  });
                  setTimeout(()=>inner?.back.querySelector('#pbRenSecName')?.focus(), 50);
                }
                if(act==='del'){
                  const inner = openModal({
                    title:'Delete section',
                    bodyHtml:`<div>Delete section <strong>${escapeHtml(String(sections.find(x=>x.id===sid)?.name||''))}</strong>?</div>`,
                    onMount: ({close: c2, okBtn: ok2})=>{
                      ok2.textContent='Delete';
                      ok2.addEventListener('click', ()=>{
                        const ps2 = loadProjects().map(p=>{
                          if(p.id!==projectId) return p;
                          const secs = (p.sections||[]).filter(x=>x.id!==sid);
                          return { ...p, sections: secs };
                        });
                        saveProjects(ps2);
                        // unlink prompts
                        const lib2 = loadLibrary().map(it=> (it && String(it.projectId||'')===projectId && String(it.sectionId||'')===sid) ? { ...it, sectionId:'' } : it);
                        saveLibrary(lib2);
                        if(getSelectedSectionId()===sid) setSelectedSectionId('');
                        c2();
                        render();
                        ensureProjectsInUI();
                        renderWorkspace();
                        renderLibrary();
                      });
                    }
                  });
                }
              });
            });
          };

          back.querySelector('#pbSecAdd')?.addEventListener('click', ()=>{
            const inner = openModal({
              title:'Add section',
              bodyHtml:`<label class="field"><span class="field__label">Name</span><input class="field__input" id="pbNewSecName" placeholder="New section" /></label>`,
              onMount: ({back: b2, close: c2, okBtn: ok2})=>{
                ok2.textContent='Add';
                ok2.addEventListener('click', ()=>{
                  const name = String(b2.querySelector('#pbNewSecName')?.value||'').trim();
                  if(!name) return;
                  const ps2 = loadProjects().map(p=>{
                    if(p.id!==projectId) return p;
                    const secs = Array.isArray(p.sections) ? [...p.sections] : [];
                    secs.push({ id:`s_${Date.now()}_${Math.random().toString(16).slice(2)}`, name });
                    return { ...p, sections: secs };
                  });
                  saveProjects(ps2);
                  c2();
                  render();
                  ensureProjectsInUI();
                  renderWorkspace();
                  renderLibrary();
                });
              }
            });
            setTimeout(()=>inner?.back.querySelector('#pbNewSecName')?.focus(), 50);
          });

          okBtn.addEventListener('click', close);
          render();
        }
      });
      return modal;
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

      // Make sure selects are populated before we set values.
      ensureCategoriesInUI();
      ensureProjectsInUI();

      if(editorTitle) editorTitle.textContent = isEdit ? 'Edit prompt' : 'Add prompt';
      if(fTitle) fTitle.value = existing?.title || '';
      if(fGolden) fGolden.value = existing?.golden || existing?.text || '';
      if(fPromptW) fPromptW.value = existing?.prompt || '';
      if(fOriginal) fOriginal.value = existing?.original || '';
      const legacyCat = String(existing?.cat || '').trim();
      if(fCat) fCat.value = (legacyCat.toLowerCase() === 'general') ? '' : legacyCat;

      // Defaults for new items: inherit current workspace selection.
      const defaultPid = isEdit ? String(existing?.projectId||'') : String(getSelectedProjectId()||'');
      const defaultSid = isEdit ? String(existing?.sectionId||'') : String(getSelectedSectionId()||'');

      if(fProject) fProject.value = defaultPid;
      refreshEditorSections();
      if(fSection) fSection.value = defaultSid;
      if(fMode) fMode.value = existing?.modeUsed || '';
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
      const selP = String(getSelectedProjectId()||'').trim();
      const selS = String(getSelectedSectionId()||'').trim();
      const favOnly = !!(onlyFav && onlyFav.checked);

      const projects = loadProjects();
      const projectName = (pid)=> (projects.find(p=>p.id===pid)?.name || "");
      const sectionName = (pid,sid)=> (projects.find(p=>p.id===pid)?.sections||[]).find(s=>s.id===sid)?.name || "";

      // Normalize legacy category values.
      // Older builds used "General" as a category; we now treat that as "None".
      const libAllRaw = loadLibrary().map(it=>{
        if(!it || typeof it!=='object') return it;
        const rawCat = String(it.cat || "").trim();
        const normCat = (rawCat.toLowerCase() === 'general') ? "" : rawCat;
        return {
          ...it,
          cat: normCat,
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
        if(cat){
          if(cat === '__none__'){
            if(String(it.cat||'').trim()) return false;
          } else {
            if(String(it.cat||'') !== cat) return false;
          }
        }
        if(selP && String(it.projectId||"") !== selP) return false;
        if(selS && String(it.sectionId||"") !== selS) return false;
        if(favOnly && !it.fav) return false;
        if(!q) return true;
        const hay = [it?.title, it?.golden, it?.text, it?.prompt, it?.original, it?.tags, it?.model, it?.notes, it?.cat, projectName(it.projectId), sectionName(it.projectId,it.sectionId), it?.modeUsed].filter(Boolean).join(' ').toLowerCase();
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
        const pName = escapeHtml(projectName(String(item.projectId||"")));
        const sName = escapeHtml(sectionName(String(item.projectId||""), String(item.sectionId||"")));
        const mode = String(item.modeUsed||"").toLowerCase();
        const modeNice = mode ? (mode==='auditor'?'Auditor':mode==='creator'?'Creator':'Thinker') : '';
        const notes = escapeHtml(String(item.notes || ''));
        const golden = escapeHtml(String(item.golden || item.text || ''));
        const wprompt = escapeHtml(String(item.prompt || ''));
        const orig = escapeHtml(String(item.original || ''));
        return `
          <article class="card card--flat lib__item" data-id="${escapeHtml(String(item.id||""))}" data-cat="${cat}">
            <div class="card__body">
              <div class="lib__head">
                <div>
                  <div class="lib__title">${title}</div>
                  <div class="lib__meta">
                    <span class="chip chip--time">🕒 ${ts}</span>
                    ${modeNice ? `<span class="chip chip--mode">🎛️ ${modeNice}</span>` : ''}
                    ${cat ? `<span class="chip chip--cat"><span class="chip__dot"></span>${cat}</span>` : ''}
                    ${pName ? `<span class="chip chip--proj">📁 ${pName}</span>` : ''}
                    ${sName ? `<span class="chip chip--sec">🗂️ ${sName}</span>` : ''}
                    ${model ? `<span class="chip chip--model">🤖 ${model}</span>` : ''}
                    ${tags ? `<span class="chip chip--tags">🏷️ ${tags}</span>` : ''}
                  </div>
                </div>
                <div class="lib__actions">
                  <button class="btn btn--mini btn--star" data-act="fav" type="button">${item.fav ? "★" : "☆"}</button>
                  <button class="btn btn--mini" data-act="copy" type="button">Copy</button>
                  <button class="btn btn--mini" data-act="send" type="button">Send to Buddy</button>
                  <button class="btn btn--mini" data-act="coach" type="button">Send to Coach</button>
                  <button class="btn btn--mini" data-act="edit" type="button">Edit</button>
                  <button class="btn btn--mini" data-act="del" type="button">Delete</button>
                </div>
              </div>

              ${notes ? `<div class="lib__notes">${notes}</div>` : ''}
              <pre class="pre pre--sm lib__pre">${golden}</pre>
              <details class="fold" ${wprompt?"":"hidden"}>
                <summary class="fold__sum">Working Prompt</summary>
                <div class="fold__body"><pre class="pre pre--sm">${wprompt}</pre></div>
              </details>
              <details class="fold" ${orig?"":"hidden"}>
                <summary class="fold__sum">Original Prompt</summary>
                <div class="fold__body"><pre class="pre pre--sm">${orig}</pre></div>
              </details>
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
            try{ await navigator.clipboard.writeText(String(item.golden||item.text||"")); setStatus('Copied ✅'); }
            catch{ setStatus('Copy failed.'); }
            setTimeout(()=>setStatus(''), 900);
          }
          if(act === 'send'){
            setDraftPromptForce(String(item.golden||item.text||""));
            location.hash = 'buddy';
          }
          if(act === 'coach'){
            const txt = String(item.golden||item.text||"");
            if(!txt.trim()){
              setStatus('Nothing to send.');
              setTimeout(()=>setStatus(''), 900);
              return;
            }
            addToCoachBoard({
              title: String(item.title||'').trim() || (txt.split(/\n|\r/)[0]||'').slice(0,60),
              text: txt
            });
            setStatus('Sent to Coach ✅');
            setTimeout(()=>setStatus(''), 900);
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

    // When editing, switching project should update available sections.
    fProject?.addEventListener('change', ()=>{
      refreshEditorSections();
      // if current section isn't valid anymore, clear it
      const sid = String(fSection?.value||'');
      if(sid && !Array.from(fSection?.options||[]).some(o=>String(o.value)===sid)){
        if(fSection) fSection.value = '';
      }
    });

    btnSave?.addEventListener('click', ()=>{
      const rawCat = String(fCat?.value || '').trim();
      const safeCat = (rawCat.toLowerCase() === 'general') ? '' : rawCat;
      const item = {
        id: editingId || `lib_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        t: editingCreatedAt || Date.now(),
        title: String(fTitle?.value || '').trim(),
        golden: String(fGolden?.value || '').trim(),
        prompt: String(fPromptW?.value || '').trim(),
        original: String(fOriginal?.value || '').trim(),
        // legacy field for backward compatibility
        text: String(fGolden?.value || '').trim(),
        cat: safeCat,
        projectId: String(fProject?.value || '').trim(),
        sectionId: String(fSection?.value || '').trim(),
        modeUsed: String(fMode?.value || '').trim(),
        tags: String(fTags?.value || '').trim(),
        model: String(fModel?.value || '').trim(),
        notes: String(fNotes?.value || '').trim(),
        fav: false
      };

      // For newly created items, inherit the current workspace project/section if empty.
      if(!editingId){
        if(!item.projectId) item.projectId = String(getSelectedProjectId()||'').trim();
        if(!item.sectionId) item.sectionId = String(getSelectedSectionId()||'').trim();
      }
      if(!item.golden){ setEditStatus('Golden Prompt is required.'); return; }
      if(!item.title){ item.title = item.golden.split(/\n|\r/)[0].slice(0,48) || 'Untitled'; }

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
    wsAddProject?.addEventListener('click', ()=>{ manageProjectsDialog(); });
    wsManage?.addEventListener('click', ()=>{ manageProjectsDialog(getSelectedProjectId()); });
    projectSel?.addEventListener('change', ()=>{
      setLS(LS.libSelProject, String(projectSel.value||""));
      // reset section when project changes
      if(sectionSel) sectionSel.value = "";
      setLS(LS.libSelSection, "");
      ensureProjectsInUI();
      renderLibrary();
    });
    sectionSel?.addEventListener('change', ()=>{
      setLS(LS.libSelSection, String(sectionSel.value||""));
      renderLibrary();
    });
    manageProjectsBtn?.addEventListener('click', ()=>{
      manageProjectsDialog();
      ensureProjectsInUI();
      renderLibrary();
    });

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
    ensureProjectsInUI();
    seedLibraryIfEmpty();
    renderWorkspace();
    renderLibrary();
  }

  function closeAllModals(){
    // Route changes replace page content; open modals can get "stuck".
    document.querySelectorAll('.modal_backdrop').forEach(n=>{
      try{ n.remove(); }catch{}
    });
    document.querySelectorAll('.pbmodal__backdrop').forEach(n=>{
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

  function initTips(){
    const box = document.getElementById('tipsBody');
    if(!box) return;
    box.innerHTML = data.tipsHtml || "";
  }

  function initAbout(){
    const box = document.getElementById('aboutBody');
    if(!box) return;
    box.innerHTML = data.aboutHtml || "";

    const support = box.querySelector('#pbSupportLink');
    if(support) support.href = data.supportUrl || '#';
    const aboutUnlock = box.querySelector("#pbAboutUnlock");
    if(aboutUnlock){
      aboutUnlock.addEventListener("click", ()=>{
        if(getToken()){
          location.hash = "#buddy";
          render("buddy");
          return;
        }
        openUnlock();
      });
    }


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
    // Extension / deep-link support.
    // If pb_in is present, treat it like "Send to Buddy" and then scrub the URL.
    try{
      const url = new URL(location.href);
      const pbIn = url.searchParams.get('pb_in');
      if(pbIn && pbIn.trim()){
        const decoded = decodeURIComponent(pbIn);
        setDraftPromptForce(decoded);
        // Force Buddy view.
        if((location.hash||"") !== "#buddy") location.hash = "buddy";
        // Remove the param to avoid leaving the prompt in the address bar/history.
        url.searchParams.delete('pb_in');
        const qs = url.searchParams.toString();
        history.replaceState(null, '', url.pathname + (qs ? ('?' + qs) : '') + (location.hash || ''));
      }
    } catch {}

    let r = (location.hash || "#buddy").replace('#','') || 'buddy';
    // Extension page is disabled for now.
    if(r === 'extension') r = 'buddy';
    render(r);
    refreshStatus();
    maybeShowOnboarding();
  }

  window.addEventListener('hashchange', boot);
  boot();

})();
