// Configuration for Prompting Buddy (safe to be public)
window.PB_DATA = {
  brand: "Prompting Buddy",
  // Your BuyMeACoffee product or page URL
  supportUrl: "#",

  // Chrome extension (sidebar) download link (zip) — GitHub Releases URL
  extensionDownloadUrl: "#",
  extensionVersion: "v0.1.3",
  aboutHtml: `
  <div class="card">
    <div class="card__body">
      <h2 style="margin:0 0 6px">About Prompting Buddy</h2>
      <p class="muted" style="margin:0 0 12px">
        A tiny privacy-first tool that helps you tighten prompts <em>before</em> you spend tokens.
        No accounts. Vault + Library live in your browser.
      </p>

      <div class="card card--flat" style="margin-top:10px">
        <div class="card__body">
          <h3 style="margin:0 0 8px">Passphrase</h3>
          <p class="muted" style="margin:0 0 10px">
            Buy a passphrase on BuyMeACoffee. I may rotate the passphrase monthly.
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
          <h3 style="margin:0 0 8px">Privacy</h3>
          <p class="muted" style="margin:0">
            Library + Vault are stored locally (localStorage). Your passphrase unlocks a token for the worker — it’s not an “account”.
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
