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
        Prompting Buddy helps you tighten prompts <em>before</em> you spend tokens. No accounts. Vault + Library live in your browser.
      </p>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Start here (60 seconds)</h3>
          <ol class="pc__list" style="margin:0; padding-left:18px">
            <li>Click <strong>Unlock</strong> (gets this browser a token).</li>
            <li>Go to <strong>Buddy</strong> → run Prompt Check → copy your <strong>Golden Prompt</strong>.</li>
            <li>Your last runs are saved in <strong>Vault</strong>. Save your best prompts into <strong>Library</strong>.</li>
          </ol>
        </div>
      </div>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">What each tab does</h3>
          <ul class="pc__list" style="margin:0">
            <li><strong>Buddy</strong> — paste a prompt → get Diagnosis, Missing, Improvements, and a Golden Prompt.</li>
            <li><strong>Vault</strong> — last 10 prompt checks + “Last 5 Review” coaching.</li>
            <li><strong>Library</strong> — your curated prompts (tags, favorites, search, export/import JSON).</li>
            <li><strong>Extension</strong> — use Prompting Buddy on any webpage (send selected text to Buddy).</li>
          </ul>
        </div>
      </div>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Two common workflows</h3>
          <ul class="pc__list" style="margin:0">
            <li><strong>Save tokens</strong>: Buddy → Golden Prompt → paste into Claude/Suno/etc.</li>
            <li><strong>Build your arsenal</strong>: Buddy → Vault → refine → Library → export JSON for another device.</li>
          </ul>
        </div>
      </div>

      
      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Reasoning lens: Auditor / Thinker / Creator</h3>
          <p class="muted" style="margin:0 0 10px">
            This changes the style of the feedback you get from Prompt Check — not the “truth”, just the <em>attitude</em>.
          </p>
          <ul class="pc__list" style="margin:0">
            <li><strong>Auditor (Strict)</strong> — sharp and picky. Best when you want a clean final prompt that won’t waste tokens.</li>
            <li><strong>Thinker (Balanced)</strong> — the default “smart friend” mode. Best for everyday prompts.</li>
            <li><strong>Creator (Bold)</strong> — more playful + expansive. Best for brainstorming, story beats, marketing angles, variations.</li>
          </ul>
        </div>
      </div>

<div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Passphrase</h3>
          <p class="muted" style="margin:0 0 10px">
            Buy a passphrase on BuyMeACoffee. I may rotate the passphrase monthly. Support keeps the project ad-free, evolving, and without data sharing.
          </p>
          <a class="btn btn--primary" id="pbSupportLink" href="#" target="_blank" rel="noopener">Get passphrase on BuyMeACoffee</a>
        </div>
      </div>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Theme</h3>
          <div class="stack" style="gap:10px">
            <label class="check"><input type="radio" name="pbTheme" data-theme="modern" data-variant="default"> Modern Calm</label>
            <label class="check"><input type="radio" name="pbTheme" data-theme="retro" data-variant="neon-grid"> Neon Grid</label>
            <label class="check"><input type="radio" name="pbTheme" data-theme="retro" data-variant="candy-console"> Candy Console</label>
            <label class="check"><input type="radio" name="pbTheme" data-theme="nostalgia" data-variant="cardboard-arcade"> Cardboard Arcade</label>
            <label class="check"><input type="radio" name="pbTheme" data-theme="nostalgia" data-variant="magnetic-tape"> Magnetic Tape</label>
            <label class="check"><input type="radio" name="pbTheme" data-theme="glitter" data-variant="default"> Fancy Glitter</label>
            <label class="check"><input type="radio" name="pbTheme" data-theme="terminal" data-variant="default"> Terminal Hacker</label>
          </div>
        </div>
      </div>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Privacy</h3>
          <p class="muted" style="margin:0">
            Library + Vault are stored locally (localStorage). Your passphrase unlocks a token for the worker — it’s not an “account”.
          </p>
        </div>
      </div>
    </div>
  </div>
`,

  tipsHtml: `
  <div class="block">
    <h3 style="margin:0 0 8px">3-minute “first win”</h3>
    <ol class="pc__list" style="margin:0; padding-left:18px">
      <li>Paste a prompt in <strong>Buddy</strong> (rough is fine).</li>
      <li>Pick a lens: <strong>Thinker</strong> if unsure.</li>
      <li>Run <strong>Prompt Check</strong> → copy the <strong>Golden Prompt</strong> → paste into your AI tool.</li>
    </ol>
    <p class="muted" style="margin:10px 0 0">If you do only one thing: copy Golden. That’s where the token savings are.</p>
  </div>

  <div class="block">
    <h3 style="margin:0 0 8px">Which lens should I use?</h3>
    <ul class="pc__list" style="margin:0">
      <li><strong>Auditor</strong>: “Find every hole. Make it bulletproof.”</li>
      <li><strong>Thinker</strong>: “Make it clear and usable.”</li>
      <li><strong>Creator</strong>: “Give me options and angles.”</li>
    </ul>
  </div>

  <div class="block">
    <h3 style="margin:0 0 8px">Vault vs Library (quick rule)</h3>
    <ul class="pc__list" style="margin:0">
      <li><strong>Vault</strong> = your recent attempts (last 10). Great for “what did I do earlier?”</li>
      <li><strong>Library</strong> = your best prompts (tagged + searchable). Great for “my reusable templates”.</li>
    </ul>
  </div>

  <div class="block">
    <h3 style="margin:0 0 8px">Make it portable</h3>
    <p class="muted" style="margin:0">Export Library JSON → import on another device. No accounts. No drama.</p>
  </div>

  <div class="block">
    <h3 style="margin:0 0 8px">TikTok / Reels ideas (quick)</h3>
    <ul class="pc__list" style="margin:0">
      <li>“Bad prompt → Golden prompt” (15s) — show only before/after.</li>
      <li>“Auditor vs Creator” (20s) — same prompt, different lens.</li>
      <li>“Vault → Library” (15s) — turn one good result into a reusable template.</li>
    </ul>
  </div>
  `,


  libraryCategories: [
    "Daily drivers",
    "Writing",
    "Coding",
    "Research / OSINT",
    "Visuals",
    "Creators",
    "Business",
    "Life / Mood"
  ],
  house: {
    endpoint: "https://prompting-buddy-house.nik-sales-737.workers.dev",
    // Daily limits shown in UI (and used as client-side fallback if /status returns no limits).
    // If your Worker enforces different limits, update the Worker too.
    dailyPromptLimit: 100,
    dailyCoachLimit: 20,
    // Prompt Check input cap (client-side). Buddy textarea itself can be any size,
    // but we use this to guard requests sent to the Worker.
    promptMaxChars: 20000,
    coachMaxChars: 8000,
    timezone: "Europe/Sofia"
  }
};
