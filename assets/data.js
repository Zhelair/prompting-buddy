// Configuration for Prompting Buddy (safe to be public)
window.PB_DATA = {
  brand: "Prompting Buddy",
  supportUrl: "#",
  aboutHtml: `<div class="about">
  <h2>About Prompting Buddy</h2>
  <p class="muted">
    A tiny privacy-first tool that helps you tighten prompts <em>before</em> you spend tokens. No accounts. Vault + Library live in your browser.
  </p>

  <div class="card card--flat">
    <div class="card__body">
      <h3>Passphrase</h3>
      <p class="muted">
        Buy a passphrase on BuyMeACoffee. I may rotate the passphrase monthly. Support keeps the project ad-free, evolving, and without data sharing.
      </p>
      <a class="btn" id="bmcLink" href="#" target="_blank" rel="noopener">Get passphrase on BuyMeACoffee</a>
    </div>
  </div>

  <div class="card card--flat">
    <div class="card__body">
      <h3>Theme</h3>
      <div class="themePick" id="themePick">
        <label class="themePick__row"><input type="radio" name="pbPreset" value="modern" /> Modern Calm</label>
        <label class="themePick__row"><input type="radio" name="pbPreset" value="neon-grid" /> Neon Grid</label>
        <label class="themePick__row"><input type="radio" name="pbPreset" value="candy-console" /> Candy Console</label>
        <label class="themePick__row"><input type="radio" name="pbPreset" value="cardboard-arcade" /> Cardboard Arcade</label>
        <label class="themePick__row"><input type="radio" name="pbPreset" value="magnetic-tape" /> Magnetic Tape</label>
        <label class="themePick__row"><input type="radio" name="pbPreset" value="fancy-glitter" /> Fancy Glitter</label>
        <label class="themePick__row"><input type="radio" name="pbPreset" value="terminal-hacker" /> Terminal Hacker</label>
      </div>
    </div>
  </div>

  <div class="card card--flat">
    <div class="card__body">
      <h3>Privacy</h3>
      <p class="muted">
        Library + Vault are stored locally (localStorage). Your passphrase unlocks a token for the worker — it’s not an “account”.
      </p>
    </div>
  </div>
</div>

<script>
(function(){
  try{
    var data = window.PB_DATA || {};
    var bmc = document.getElementById('bmcLink');
    if(bmc) bmc.href = data.supportUrl || '#';

    var LS_THEME = 'pb_theme';
    var LS_VAR = function(t){ return 'pb_theme_variant_' + t; };

    function presetToThemeVariant(p){
      if(p === 'modern') return { theme:'modern', variant:'default' };
      if(p === 'fancy-glitter') return { theme:'nostalgia', variant:'fancy-glitter' };
      if(p === 'terminal-hacker') return { theme:'retro', variant:'terminal-hacker' };
      // retro "OU variants"
      return { theme:'retro', variant:p };
    }

    function apply(theme, variant){
      document.body.dataset.theme = theme;
      document.body.dataset.variant = variant;
      localStorage.setItem(LS_THEME, theme);
      localStorage.setItem(LS_VAR(theme), variant);
    }

    function getCurrentPreset(){
      var t = (localStorage.getItem(LS_THEME) || 'modern').trim();
      var v = (localStorage.getItem(LS_VAR(t)) || 'default').trim();
      if(t === 'modern') return 'modern';
      if(t === 'nostalgia' && v === 'fancy-glitter') return 'fancy-glitter';
      if(t === 'retro' && v === 'terminal-hacker') return 'terminal-hacker';
      return v || 'modern';
    }

    var current = getCurrentPreset();
    var radios = document.querySelectorAll('input[name="pbPreset"]');
    radios.forEach(function(r){
      r.checked = (r.value === current);
      r.addEventListener('change', function(){
        if(!r.checked) return;
        var tv = presetToThemeVariant(r.value);
        apply(tv.theme, tv.variant);
      });
    });
  }catch(e){}
})();
</script>`,


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
