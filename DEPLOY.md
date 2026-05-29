# Deploying Pedigree Discover Lite to Vercel

This app is a **Vite frontend + serverless API** (`/api/*`). On Vercel the frontend is
served as static files and the API runs as Node serverless functions. The OpenAI key lives
only on the server side — it is never exposed to the browser.

There are three things to set up:

1. **OpenAI API key** (required for real AI parsing + audio transcription)
2. **Supabase** (optional — for cloud persistence; without it the app uses the browser's localStorage)
3. **Vercel** (hosting + your custom domain)

---

## 1. Get an OpenAI API key

1. Go to <https://platform.openai.com> and sign in.
2. Add a payment method / credits under **Settings → Billing** (the API is pay-as-you-go).
3. Go to **Settings → API keys → Create new secret key**.
4. Copy the key (starts with `sk-...`). You'll paste it into Vercel in step 3. **Save it now —
   you can't view it again later.**

> The app still runs without this key — it falls back to a deterministic local parser. With the
> key set, the Parse/Review step shows a **GPT** badge and uses real GPT structured output.

---

## 2. (Optional) Create a Supabase project

Skip this to launch faster; the app persists to `localStorage` without it. Add it later anytime.

1. Go to <https://supabase.com> → **New project**. Pick a name, a database password, and a region.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → e.g. `https://abcd1234.supabase.co`
   - **anon public** key (a long `eyJ...` token)
   - (The `service_role` key is **not** required — the current app only reads/writes from the
     browser using the anon key. Keep service_role secret if you ever use it server-side.)
3. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql),
   and click **Run**. This creates the tables (`workspaces`, `people`, `profiles`,
   `discovery_sessions`, `agent_manifests`) and demo-friendly anon access policies. It is safe to
   re-run (everything uses `if not exists`).

> **Auth note (important for real client data).** The built-in sign-in is **auth-lite**: email +
> name + company with **no password**, and the Supabase policies are open (anyone with the anon key
> can read/write). Workspaces are keyed by company, so the same company shares one workspace. This is
> fine for demos and single-operator use, but **before storing real/regulated client data**, add
> Supabase Auth (magic link or SSO) and tighten the RLS policies to per-user/per-org access.

---

## 3. Deploy to Vercel

1. Go to <https://vercel.com> and **sign in with GitHub** (the same account, `mattrob333`).
2. **Add New… → Project → Import** `mattrob333/MiniPedigree`.
3. Vercel auto-detects the **Vite** framework. Leave **Root Directory** as the default (`./`) —
   the app lives at the repo root. Build settings come from `vercel.json` (build `npm run build`,
   output `dist`).
4. Expand **Environment Variables** and add the following (apply to **Production** and **Preview**):

   | Name | Value | Required |
   | --- | --- | --- |
   | `OPENAI_API_KEY` | your `sk-...` key | yes (for AI) |
   | `OPENAI_MODEL` | `gpt-4o-2024-08-06` | optional |
   | `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-transcribe` | optional |
   | `TRANSCRIPTION_PROVIDER` | `openai` | optional |
   | `VITE_SUPABASE_URL` | your Supabase Project URL | only if using Supabase |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon key | only if using Supabase |

   > `VITE_`-prefixed variables are baked into the frontend at **build time**, so if you add or
   > change them you must **redeploy**. The others are read at runtime by the functions.

5. Click **Deploy**. After ~1 minute you'll get a `https://<project>.vercel.app` URL.

### Verify the deployment
- Visit the URL, click **Use Demo CSV** (or a sample org), open the **Org Map**, and run a
  **Mapping Session** → it should parse and show a **GPT** badge in Review.
- Visit `https://<project>.vercel.app/api/health` — it should return
  `{"ok":true,"openai":true,...}` confirming the key is wired.

---

## 4. Connect your custom domain (Agent Pedigree)

1. In the Vercel project → **Settings → Domains → Add**.
2. Enter your domain, e.g. `agentpedigree.com` (also add `www.agentpedigree.com`).
3. Vercel shows the DNS records to add. At your **domain registrar** (wherever you bought the
   domain), add them:
   - Apex `agentpedigree.com`: an **A record → `76.76.21.21`** (or switch to Vercel's nameservers
     if Vercel offers that for your registrar).
   - `www`: a **CNAME → `cname.vercel-dns.com`**.
4. Vercel automatically provisions HTTPS/SSL once DNS resolves (can take a few minutes to a few
   hours). When the domain shows **Valid Configuration**, you're live at your URL.

---

## Ongoing

- **Auto-deploy:** every push to `main` redeploys automatically. Pull requests get preview URLs.
- **Rotate/keys:** change env vars in **Settings → Environment Variables**, then **Redeploy**.
- **Costs:** Vercel Hobby is free for this; OpenAI is pay-as-you-go; Supabase has a free tier.

## Local development (unchanged)

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY etc. (optional)
npm run dev            # Vite client :5173 + Express API :8787
```

Locally the API is the Express server in `server/`; on Vercel the same logic runs from the
functions in `api/` (both import the shared core in `server/core/`).
