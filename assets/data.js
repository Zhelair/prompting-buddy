window.PB_DATA = {
  brand: "Prompting Buddy",
  supportUrl: "https://buymeacoffee.com/",

  // Cloudflare Worker base URL (set this after you deploy the worker)
  house: {
    endpoint: "https://your-worker-name.your-subdomain.workers.dev",
    timezone: "Europe/Sofia",
    dailyPromptLimit: 30,
    dailyCoachLimit: 5,
    promptMaxChars: 5000,
    coachMaxChars: 8000
  },

  aboutHtml: `
    <h2 class="card__title">About Prompting Buddy</h2>
    <p class="card__desc">Prompting Buddy is a prompt-quality coach. It does <strong>not</strong> execute your task. It improves your prompt so your real AI tools waste fewer tokens and give better results.</p>
    <ul class="tips__list">
      <li><strong>Prompt Check</strong>: diagnosis → what's missing → improvements → Golden Prompt</li>
      <li><strong>Vault</strong>: saves your last 10 checks locally (in your browser)</li>
      <li><strong>Coach last 5</strong>: finds your repeating patterns and gives a reusable meta-prompt</li>
    </ul>
    <p class="panel__note">Daily limits reset at <strong>00:00 Sofia time</strong>. Prompt Check is capped at <strong>5,000 characters</strong> per check. Coach is capped at <strong>8,000 characters</strong> total for the last 5 prompts.</p>
  `
};
