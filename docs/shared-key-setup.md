# Shared image-import key setup

Lets testers use **screenshot → chords** without each bringing their own Claude
key, while your spend is **hard-capped** and the key **never leaks**. The key sits
in a tiny Cloudflare Worker (in [`worker/`](../worker)); the app talks to the
Worker, never to Anthropic directly (for the shared path).

**The one thing that makes $10 a guarantee is Step 1** — prepaid credits with
auto-reload off. Everything else makes the pool last and keeps the key private.

---

## Step 1 — Cap the money (Anthropic Console) — the hard ceiling

1. **Prepaid credits, auto-reload OFF.** In the [Anthropic Console](https://console.anthropic.com/)
   → **Billing**, buy **$10** of credits and make sure **auto-reload is off**.
   When credits hit $0 the API returns `402` and simply stops until you add more —
   this is the uncircumventable ceiling. (Failed/blocked calls aren't billed.)
2. **Dedicated workspace + spend limit** (belt and braces). **Settings →
   Workspaces → Create** (e.g. "FreeChords shared" — *not* the Default
   workspace). Open it → **Limits → set a monthly spend limit of $10** (this is
   the "Change Limit" dollar cap, *not* a spend "notification").
   - **Rate limit (recommended):** on the same Limits page, set **Claude Sonnet 5
     → Requests per Minute to ~20–30**. Server-enforced and unbypassable, this is
     the burst throttle we skip on the Worker (no KV) — it stops a bug or a
     scripted call from draining the whole $10 in one burst and locking testers
     out. Plenty for a small tester group; leave the token-per-minute limits at
     default, and ignore the other models (the proxy only calls Sonnet 5).
3. **Make the key inside that workspace.** In the workspace, **API keys → Create
   key**. Copy it. Because it's scoped to the workspace, it can never spend past
   that workspace's $10/month, and your other work is unaffected.

> Two independent stops now: credits (a hard total) and the workspace limit (a
> monthly cap). The worst case is ~$10, not a surprise bill.

## Step 2 — Deploy the proxy (Cloudflare Worker, free)

Free Cloudflare account required. From this repo:

```bash
cd worker
npm install -g wrangler
wrangler login

# rate-limit counters — create the namespace, then paste its id into wrangler.toml
wrangler kv namespace create LIMITS
#   → copy the printed id into the [[kv_namespaces]] block in wrangler.toml and uncomment it

# create the Worker first (so the secret has something to attach to)
wrangler deploy
#   → prints https://freechords-image-proxy.<you>.workers.dev  — copy this URL

# now store the key as a server-side secret. NOTE: "ANTHROPIC_API_KEY" is the
# secret's NAME — type it literally, do NOT replace it with the key. wrangler
# then prompts "Enter a secret value:" — paste the workspace-scoped key from
# Step 1 (sk-ant-…) there (hidden input). It takes effect immediately; no redeploy.
wrangler secret put ANTHROPIC_API_KEY
```

`worker/wrangler.toml` also has knobs you can tune: `MODEL`, `ALLOWED_ORIGINS`,
`DAILY_MAX`, `IP_DAILY_MAX`.

## Step 3 — Point the app at the proxy

Set `VITE_IMAGE_PROXY_URL` to the Worker URL.

- **Local:** add it to `.env`.
- **Deployed (GitHub Pages):** repo **Settings → Secrets and variables → Actions
  → Variables → New repository variable**, name `VITE_IMAGE_PROXY_URL`, value =
  the Worker URL. The next deploy enables the shared reader.

## Step 4 — Test & operate

- Open **Add a song → Upload screenshot** with **no** personal key set — it should
  read with Claude via the proxy.
- **Monitor:** watch spend in the Anthropic Console; watch requests in the
  Cloudflare dashboard (Workers → your worker → Logs/Metrics).
- **Kill switch:** to turn the shared reader off instantly, remove the
  `VITE_IMAGE_PROXY_URL` repo variable and redeploy, or set `DAILY_MAX = "0"` and
  `wrangler deploy`. The app then falls back to on-device OCR / bring-your-own-key.

### What each layer does (and doesn't)

- **Prepaid credits + workspace limit** — the *only* things that bound dollars.
  Hard.
- **The Worker** — keeps the key secret (never in the browser) and applies
  per-IP + daily throttles so the $10 lasts and one person can't drain it. The
  throttles use Cloudflare KV, which is eventually consistent, so they're
  approximate, not exact — fine, because the money cap is Anthropic-side.
- **Origin check** — a courtesy gate only; it's spoofable by non-browser clients,
  so it isn't a security boundary. The rate limits + spend cap are.
- **No model allowlist exists on Anthropic keys.** The Worker pins the model
  server-side (`MODEL`), and the client can't choose it — but if the raw key ever
  leaked it could call a pricier model, so keep the key *only* in the Worker
  secret and rely on the credit cap as the true bound.

If abuse ever shows up, add a bot check (e.g. Cloudflare Turnstile) in front of
the Worker — not needed for the money guarantee, only to protect availability.
