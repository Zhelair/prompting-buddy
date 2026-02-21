// Configuration for Prompting Buddy (safe to be public)
window.PB_DATA = {
  brand: "Prompting Buddy",
  // Your BuyMeACoffee product or page URL
  supportUrl: "#",
  extZipUrl: "#",
  extStoreUrl: "#",
  aboutHtml: `
  <div class="card">
    <div class="card__body">
      <h2 style="margin:0 0 6px">Help Center</h2>
      <p class="muted" style="margin:0 0 12px">
        Prompting Buddy helps you tighten prompts before you spend tokens. No accounts. Vault + Library live in your browser.
      </p>

      <div class="block" style="margin-top:10px">
        <h3 style="margin:0 0 8px">Start in 60 seconds</h3>
        <ol class="pc__list" style="margin:0; padding-left:18px">
          <li>Click <strong>Unlock</strong> (gets this browser a token).</li>
          <li>Go to <strong>Buddy</strong> → click <strong>Run Prompt Check</strong>.</li>
          <li>Copy the <strong>Golden Prompt</strong> → paste into ChatGPT, Claude, Suno, etc.</li>
        </ol>
        <p class="muted" style="margin:10px 0 0">If you do only one thing: copy the Golden Prompt.</p>
      </div>

      <div class="block" style="margin-top:10px">
        <h3 style="margin:0 0 8px">What each tab does</h3>
        <ul class="pc__list" style="margin:0">
          <li><strong>Buddy</strong> — analyzes your prompt and outputs a Golden Prompt.</li>
          <li><strong>Vault</strong> — keeps your last 10 runs (local, in this browser).</li>
          <li><strong>Library</strong> — your best prompts (tags, search, favorites, export/import JSON).</li>
        </ul>
      </div>

      <div class="block" style="margin-top:10px">
        <h3 style="margin:0 0 8px">Passphrase and privacy</h3>
        <p class="muted" style="margin:0 0 10px">
          Your Library + Vault are stored locally (localStorage). A passphrase unlocks a token for the Worker - it’s not an account.
        </p>
        <div class="panel__actions" style="margin-top:6px">
          <a class="btn btn--primary" id="pbSupportLink" href="#" target="_blank" rel="noopener">Get passphrase</a>
          <button class="btn" id="pbAboutUnlock" type="button">Unlock</button>
        </div>
      </div>

      <div class="block" style="margin-top:10px">
        <h3 style="margin:0 0 8px">Theme</h3>
        <div class="theme-grid" id="themePicker" aria-label="Theme picker">
          <label class="theme-chip"><input type="radio" name="pbTheme" data-theme="modern" data-variant="default"> <span>Modern Calm</span></label>
          <label class="theme-chip"><input type="radio" name="pbTheme" data-theme="retro" data-variant="neon-grid"> <span>Neon Grid</span></label>
          <label class="theme-chip"><input type="radio" name="pbTheme" data-theme="retro" data-variant="candy-console"> <span>Candy Console</span></label>
          <label class="theme-chip"><input type="radio" name="pbTheme" data-theme="nostalgia" data-variant="cardboard-arcade"> <span>Cardboard Arcade</span></label>
          <label class="theme-chip"><input type="radio" name="pbTheme" data-theme="glitter" data-variant="default"> <span>Fancy Glitter</span></label>
          <label class="theme-chip"><input type="radio" name="pbTheme" data-theme="terminal" data-variant="default"> <span>Terminal Hacker</span></label>
        </div>
      </div>
    </div>
  </div>
`,

  tipsHtml: `
  <div class="block">
    <h2 style="margin:0 0 6px">Tips</h2>
    <p class="muted" style="margin:0">Short, practical, and made for real use.</p>
  </div>

  <details class="fold" open>
    <summary class="fold__sum">START IN 60 SECONDS</summary>
    <div class="fold__body">
      <ol class="pc__list" style="margin:0; padding-left:18px">
        <li>Paste a rough prompt into <strong>Buddy</strong>.</li>
        <li>Pick a lens. Use <strong>Thinker</strong> if you’re unsure.</li>
        <li>Click <strong>Run Prompt Check</strong>.</li>
        <li>Copy the <strong>Golden Prompt</strong>.</li>
        <li>Paste it into ChatGPT, Claude, Suno, etc.</li>
      </ol>
      <p class="muted" style="margin:10px 0 0">If you do only one thing: copy the Golden Prompt. That’s where the token savings are.</p>
    </div>
  </details>

  <details class="fold">
    <summary class="fold__sum">HOW IT SAVES TOKENS</summary>
    <div class="fold__body">
      <ul class="pc__list" style="margin:0">
        <li>Removes vague instructions and repeated wording.</li>
        <li>Forces a clean output structure so the AI doesn’t ramble.</li>
        <li>Compresses wording without losing meaning.</li>
        <li>Prevents the “here’s a novel before the answer” problem.</li>
      </ul>
      <p class="muted" style="margin:10px 0 0">Quick rule: clearer inputs = shorter and better outputs.</p>
    </div>
  </details>

  <details class="fold">
    <summary class="fold__sum">PICKING THE RIGHT LENS</summary>
    <div class="fold__body">
      <ul class="pc__list" style="margin:0">
        <li><strong>Auditor</strong> - sharp and picky. Best when you want a clean final prompt that won’t waste tokens.</li>
        <li><strong>Thinker</strong> - the default smart-friend mode. Best for everyday prompts.</li>
        <li><strong>Creator</strong> - playful and expansive. Best for brainstorming, story beats, marketing angles, and variations.</li>
      </ul>
    </div>
  </details>

  <details class="fold">
    <summary class="fold__sum">REAL WORKFLOWS (THE ONES YOU’LL ACTUALLY USE)</summary>
    <div class="fold__body">
      <ul class="pc__list" style="margin:0">
        <li>Improve a prompt: Buddy → Golden → paste into your AI tool.</li>
        <li>Build reusable templates: Buddy → Vault → refine → Library → tag.</li>
        <li>Portable setup: Library → Export JSON → Import on another device.</li>
        <li>Batch upgrade: run 3-5 similar prompts, keep the best, save to Library.</li>
      </ul>
    </div>
  </details>

  <details class="fold">
    <summary class="fold__sum">VAULT VS LIBRARY (QUICK RULE)</summary>
    <div class="fold__body">
      <ul class="pc__list" style="margin:0">
        <li><strong>Vault</strong> = your recent attempts (last 10). Great for “what did I do earlier?”.</li>
        <li><strong>Library</strong> = your best prompts (tagged and searchable). Great for reusable templates.</li>
      </ul>
    </div>
  </details>

  <details class="fold">
    <summary class="fold__sum">QUICK DEMO IDEAS (YOU CAN RECORD THESE LATER)</summary>
    <div class="fold__body">
      <ul class="pc__list" style="margin:0">
        <li>10s GIF: Unlock → paste prompt → Run → Copy Golden.</li>
        <li>10s GIF: Auditor vs Creator on the same prompt (before/after).</li>
        <li>10s GIF: Vault → pick a run → Save into Library.</li>
      </ul>
      <p class="muted" style="margin:10px 0 0">Drop these into this page anytime. We’ll wire the embeds when you have the clips.</p>
    </div>
  </details>
  `,


  libraryCategories: [
    "Various",
    "Daily drivers",
    "Writing",
    "Coding",
    "Research / OSINT",
    "Visuals",
    "Marketing",
    "Business",
    "Finances",
    "Life / Mood"
  ],
  house: {
    endpoint: "https://prompting-buddy-house.nik-sales-737.workers.dev",
    dailyPromptLimit: 30,
    dailyCoachLimit: 5,
    // Prompt Check input cap (client-side). Buddy textarea itself can be any size,
    // but we use this to guard requests sent to the Worker.
    promptMaxChars: 5000,
    coachMaxChars: 8000,
    timezone: "Europe/Sofia"
  }
};
