// Configuration for Prompting Buddy (safe to be public)
window.PB_DATA = {
  brand: "Prompting Buddy",
  // Your BuyMeACoffee product or page URL
  supportUrl: "#",
  aboutHtml: `
  <div class="card">
    <div class="card__body">
      <div class="featured__label">Help Center</div>
      <h2 style="margin:0 0 6px">How to use Prompting Buddy</h2>
      <p class="muted" style="margin:0 0 12px">
        A privacy-first tool to tighten prompts <em>before</em> you spend tokens.
        No accounts. Your Vault + Library live in your browser.
      </p>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Start here (60 seconds)</h3>
          <ol class="pc__list" style="margin:0; padding-left:18px">
            <li>Click <strong>Unlock</strong> (top-right) and paste your passphrase.</li>
            <li>Go to <strong>Buddy</strong> → paste your prompt → run <strong>Prompt Check</strong>.</li>
            <li>Your last runs auto-save to <strong>Vault</strong> (last 10).</li>
            <li>Save your best prompts to <strong>Library</strong> (your reusable arsenal).</li>
            <li>Switching devices? Use <strong>Library → Export/Import</strong>.</li>
          </ol>
        </div>
      </div>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">What each button does</h3>
          <div class="stack" style="gap:10px">
            <div class="tips"><h3 style="margin:0 0 6px">Buddy</h3><p class="muted" style="margin:0">Paste a prompt → get Diagnosis, Missing, Improvements, and a clean <strong>Golden Prompt</strong> you can copy.</p></div>
            <div class="tips"><h3 style="margin:0 0 6px">Vault</h3><p class="muted" style="margin:0">Your last <strong>10</strong> checks (local). Great for quick copy/paste and comparing versions. Includes <strong>Last 5 Review</strong> coaching.</p></div>
            <div class="tips"><h3 style="margin:0 0 6px">Library</h3><p class="muted" style="margin:0">Your curated prompts: search, categories, favorites, notes. Export/import JSON to move your library between devices.</p></div>
            <div class="tips"><h3 style="margin:0 0 6px">Extension</h3><p class="muted" style="margin:0">Use Prompting Buddy on any website. Select text → send it to Buddy → refine → save.</p></div>
          </div>
        </div>
      </div>

      <details class="fold" style="margin-top:10px" open>
        <summary class="fold__sum">Two workflows people actually use</summary>
        <div class="fold__body">
          <div class="tips">
            <h3>Workflow 1: Save tokens</h3>
            <p class="muted" style="margin:0">Buddy → copy <strong>Golden Prompt</strong> → paste into Claude/Suno/etc. You spend tokens on a good prompt, not a chaotic one.</p>
          </div>
          <div class="tips">
            <h3>Workflow 2: Build your prompt arsenal</h3>
            <p class="muted" style="margin:0">Buddy → iterate → Vault (last 10) → Library (keep the winners) → Export JSON when moving devices.</p>
          </div>
        </div>
      </details>

      <details class="fold" style="margin-top:10px">
        <summary class="fold__sum">Common questions</summary>
        <div class="fold__body">
          <div class="tips">
            <h3>Where is my data stored?</h3>
            <p class="muted" style="margin:0">Vault + Library are stored locally in your browser (localStorage). If you clear browser storage, they reset.</p>
          </div>
          <div class="tips">
            <h3>Do you keep an account on me?</h3>
            <p class="muted" style="margin:0">No. The passphrase unlocks a token for the worker. That token is stored locally on this device.</p>
          </div>
          <div class="tips">
            <h3>Why did my Library disappear on another laptop?</h3>
            <p class="muted" style="margin:0">Because it’s local. Use <strong>Library → Export</strong> on device A, then <strong>Import</strong> on device B.</p>
          </div>
        </div>
      </details>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Passphrase</h3>
          <p class="muted" style="margin:0 0 10px">
            Buy a passphrase on BuyMeACoffee. Passphrases may rotate (e.g., monthly).
            Support keeps the project ad-free, evolving, and without data sharing.
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
          <h3 style="margin:0 0 8px">Tiny troubleshooting</h3>
          <p class="muted" style="margin:0">
            If Unlock/Extension suddenly breaks, it’s usually an endpoint/header mismatch (CORS) or an updated Worker URL.
            Go to <strong>Extension</strong> tab to see the current endpoint this app is using.
          </p>
        </div>
      </div>

    </div>
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
    dailyPromptLimit: 30,
    dailyCoachLimit: 5,
    promptMaxChars: 5000,
    coachMaxChars: 8000,
    timezone: "Europe/Sofia"
  }
};
