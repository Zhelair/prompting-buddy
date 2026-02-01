// Configuration for Prompting Buddy (safe to be public)
window.PB_DATA = {
  brand: "Prompting Buddy",
  supportUrl: "#",
  // About page markup (no scripts inside; app.js wires interactions)
  aboutHtml: `
    <div class="card">
      <div class="card__body">
        <h2 class="card__title">About Prompting Buddy</h2>
        <p class="card__desc">A tiny privacy-first tool that helps you tighten prompts <b>before</b> you spend tokens. No accounts. Vault + Library live in your browser.</p>

        <div class="block">
          <div class="card__title card__title--sm">Passphrase</div>
          <div class="card__desc">Buy a passphrase on BuyMeACoffee. I may rotate the passphrase monthly. Support keeps the project ad-free, evolving, and without data sharing.</div>
          <div class="card__actions">
            <a class="btn btn--primary" href="${"${PB_SUPPORT_URL}"}" target="_blank" rel="noopener">Get passphrase on BuyMeACoffee</a>
          </div>
        </div>

        <div class="block">
          <div class="card__title card__title--sm">Theme</div>
          <div class="fold__body" id="pbThemePicker">
            <label><input type="radio" name="pbTheme" data-theme="modern" data-variant=""> Modern Calm</label>
            <label><input type="radio" name="pbTheme" data-theme="modern" data-variant="neon-grid"> Neon Grid</label>
            <label><input type="radio" name="pbTheme" data-theme="modern" data-variant="candy-console"> Candy Console</label>
            <label><input type="radio" name="pbTheme" data-theme="nostalgia" data-variant="cardboard-arcade"> Cardboard Arcade</label>
            <label><input type="radio" name="pbTheme" data-theme="nostalgia" data-variant="magnetic-tape"> Magnetic Tape</label>
            <label><input type="radio" name="pbTheme" data-theme="modern" data-variant="fancy-glitter"> Fancy Glitter</label>
            <label><input type="radio" name="pbTheme" data-theme="modern" data-variant="matrix"> Terminal Hacker</label>
          </div>
        </div>

        <div class="block">
          <div class="card__title card__title--sm">Privacy</div>
          <div class="card__desc">Library + Vault are stored locally (localStorage). Your passphrase unlocks a token for the worker — it’s not an “account”.</div>
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
