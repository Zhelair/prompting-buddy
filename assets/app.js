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
    draftPrompt: "pb_draft_prompt_v1",
    theme: "pb_theme",
    variant: (t)=>`pb_theme_variant_${t}`
  };

  // last-run caches (for persistence when navigating Buddy/Vault/About)
  const LS_LAST = {
    pc: "pb_last_promptcheck_v1",
    coach: "pb_last_coach_v1"
  };

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
  function getTheme(){ return (localStorage.getItem(LS.theme) || "modern").trim(); }
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
    const run = document.getElementById('pcRun');
    const clear = document.getElementById('pcClear');
    const status = document.getElementById('pcStatus');
    const out = document.getElementById('pcOut');
    const diag = document.getElementById('pcDiagnosis');
    const miss = document.getElementById('pcMissing');
    const sugg = document.getElementById('pcImprovements');
    const gold = document.getElementById('pcGolden');
    const copy = document.getElementById('pcCopyGolden');
    const ch = document.getElementById('pcChar');
    const chMax = document.getElementById('pcCharMax');

    if(chMax) chMax.textContent = String(PROMPT_MAX_CHARS);

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

    function renderLines(el, arr){
      if(!el) return;
      const items = Array.isArray(arr) ? arr : [];
      if(!items.length) { el.innerHTML = '<p class="muted">—</p>'; return; }
      el.innerHTML = `<ul class="tips__list">${items.map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
    }

    function renderResult(j){
      const norm = normalizePromptCheckPayload(j);
      out.hidden = false;
      renderLines(diag, norm.diagnosis);
      renderLines(miss, norm.missing);
      renderLines(sugg, norm.improvements);
      if(gold) gold.textContent = String(norm.golden||"").trim();
      // Persist
      try{ localStorage.setItem(LS_LAST.pc, JSON.stringify(norm._raw || norm)); }catch{}
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
          body: { prompt: text }
        });
        const norm = normalizePromptCheckPayload(j || {});
        renderResult(norm);
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

    if(coachCap) coachCap.textContent = String(COACH_MAX_CHARS);

    function setCoachStatus(msg){
      const s = document.getElementById('vaultStatus');
      if(s) s.textContent = msg||"";
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
        if((!Array.isArray(obj.mistakes) || !Array.isArray(obj.fixes)) && typeof obj.metaPrompt === 'string'){
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
      const modalCopy = modal.querySelector('#coachCopy');

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

        const cleanList = (arr)=> (arr||[])
          .map(x=>String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, 3);
        const mList = cleanList(parsed.mistakes);
        const fList = cleanList(parsed.fixes);
        if(modalMist) modalMist.innerHTML = `<ul class="tips__list">${(mList.length?mList:["—"]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
        if(modalFix) modalFix.innerHTML = `<ul class="tips__list">${(fList.length?fList:["—"]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
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

    renderVault();
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
    if(box) box.innerHTML = data.aboutHtml || "";
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
    if(typeof obj === 'string') obj = parseJsonFromText(obj) || { golden: obj };
    if(!obj || typeof obj !== 'object') obj = {};

    const toList = (v)=>{
      if(Array.isArray(v)) return v.map(x=>String(x)).filter(Boolean);
      if(typeof v === 'string' && v.trim()) return [v.trim()];
      return [];
    };

    return {
      diagnosis: toList(obj.diagnosis || obj.mistakes || obj.notes),
      missing: toList(obj.missing),
      improvements: toList(obj.improvements || obj.fixes || obj.suggestions),
      golden: String(obj.golden || obj.goldenPrompt || obj.prompt || "").trim()
    };
  }

  function normalizeCoachPayload(maybe){
    let obj = maybe;
    if(typeof obj === 'string') obj = parseJsonFromText(obj) || { metaPrompt: obj };
    if(obj && typeof obj === 'object'){
      if(obj.result && typeof obj.result === 'object') obj = obj.result;
      if((!Array.isArray(obj.mistakes) || !Array.isArray(obj.fixes)) && typeof obj.metaPrompt === 'string'){
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
