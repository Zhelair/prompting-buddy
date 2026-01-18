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
    theme: "pb_theme",
    variant: (t)=>`pb_theme_variant_${t}`
  };

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
    const frag = tpl("tpl-unlock");
    const modal = frag.querySelector('.modal');
    const input = frag.querySelector('#unlockPass');
    const btn = frag.querySelector('#unlockGo');
    const close = frag.querySelector('[data-close]');
    const status = frag.querySelector('#unlockStatus');

    function cleanup(){ modal?.remove(); }
    close?.addEventListener('click', cleanup);
    modal?.addEventListener('click', (e)=>{ if(e.target===modal) cleanup(); });

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
    const sugg = document.getElementById('pcSuggest');
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
    prompt?.addEventListener('input', countChars);
    countChars();

    function renderLines(el, arr){
      if(!el) return;
      const items = Array.isArray(arr) ? arr : [];
      if(!items.length) { el.innerHTML = '<p class="muted">—</p>'; return; }
      el.innerHTML = `<ul class="tips__list">${items.map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
    }

    function renderResult(j){
      out.hidden = false;
      renderLines(diag, j.diagnosis);
      renderLines(miss, j.missing);
      renderLines(sugg, j.improvements);
      if(gold) gold.textContent = String(j.golden||"").trim();
    }

    clear?.addEventListener('click', ()=>{
      if(prompt) prompt.value = "";
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
        renderResult(j || {});
        addVaultItem({
          t: Date.now(),
          prompt: text,
          golden: String((j && j.golden) || "").trim(),
          diagnosis: j?.diagnosis || [],
          missing: j?.missing || [],
          improvements: j?.improvements || [],
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
    const coachStatus = document.getElementById('vaultCoachStatus');
    const coachOut = document.getElementById('vaultCoachOut');
    const coachMist = document.getElementById('vaultCoachMistakes');
    const coachFix = document.getElementById('vaultCoachFixes');
    const coachMeta = document.getElementById('vaultCoachMeta');
    const coachCopy = document.getElementById('vaultCoachCopy');
    const coachCap = document.getElementById('vaultCoachCap');

    if(coachCap) coachCap.textContent = String(COACH_MAX_CHARS);

    function setCoachStatus(msg){ if(coachStatus) coachStatus.textContent = msg||""; }

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

    coachCopy?.addEventListener('click', async ()=>{
      const txt = String(coachMeta?.textContent||"").trim();
      if(!txt) return;
      try{ await navigator.clipboard.writeText(txt); setCoachStatus("Meta-prompt copied ✅"); }
      catch{ setCoachStatus("Copy failed."); }
      setTimeout(()=>setCoachStatus(""), 900);
    });

    coachBtn?.addEventListener('click', async ()=>{
      setCoachStatus("");
      coachOut.hidden = true;

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

      coachBtn.disabled = true;
      setCoachStatus("Coaching... (last 5, max 8,000 chars)");
      try {
        const j = await api("/coach-last5", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${tok}`
          },
          body: { text: clipped, items }
        });

        coachOut.hidden = false;
        coachMist.innerHTML = `<ul class="tips__list">${(j?.mistakes||[]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
        coachFix.innerHTML = `<ul class="tips__list">${(j?.fixes||[]).map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`;
        coachMeta.textContent = String(j?.metaPrompt||"").trim();

        setCoachStatus("Done ✅");
        await refreshStatus();
      } catch (err){
        setCoachStatus(String(err?.message || err));
      } finally {
        coachBtn.disabled = false;
      }
    });

    renderVault();
  }

  function initAbout(){
    const box = document.getElementById('aboutBox');
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
