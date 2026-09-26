# ReplyFlow QA Environment — Infrastructure Setup Guide

Phase 1 (code isolation) is committed on the `qa` branch. This guide is the
ordered infrastructure sequence. **[MANUAL]** = requires dashboard access;
everything else is already in the repo.

Order matters: **create the QA project plumbing before pushing `qa`** —
a `qa` push under the existing production Vercel project would otherwise
create a preview deployment that inherits production env vars.

---

## Step 1 — Protect the production Vercel project [MANUAL]

Vercel → **production project** → Settings → Git → **Ignored Build Step**:

```sh
if [ "$VERCEL_GIT_COMMIT_REF" = "qa" ]; then exit 0; else exit 1; fi
```

Exit 0 = skip build. This prevents the production project from deploying
the `qa` branch under any circumstance. (`git.deploymentEnabled` in
vercel.json cannot be used — both projects share the repo and it would
also disable the QA project's `qa` builds.)

Note: `Ignored Build Step` applies to preview deploys; `main` continues
to deploy production normally.

## Step 2 — GitHub branch protection for `main` [MANUAL]

GitHub → Settings → Branches → Add rule for `main`:

- Require a pull request before merging
- Require status checks: `build` (Vercel) + test suite, if/when wired in CI
- Restrict pushes that create files larger than 100 MB (default)
- **Do not allow force pushes** and **do not allow deletions**
- Optionally: require approval from code owner before release batches

## Step 3 — Create the QA Supabase project [MANUAL]

Supabase → New project (`replyflow-qa`, separate region OK). Then locally:

```bat
npx supabase link --project-ref <QA_PROJECT_REF>
npx supabase db push
```

All 161 migrations are reproducible — verified in repo:
- `supabase/migrations/` includes storage bucket creation
  (`business-logos`), RLS policies, and the number-recycling fields —
  `supabase/manual-migrations/add_recycling_fields_production.sql` is
  **redundant** (covered by `20260706000000_add_number_recycling_fields.sql`).
- No manual SQL is required for schema parity.

Optional manual steps (not required for QA bootstrap):
- `supabase/email-templates/setup-email-templates.sql` — branded auth
  emails; skip or run in QA SQL editor if email UX is under test.
- `supabase/reset_business_data.sql` — per-business data reset utility;
  run on demand only.
- **Auth settings** (dashboard → Authentication → URL Configuration):
  Site URL = `https://<qa-host>`; add redirect URLs for the QA host.
- Enable the same auth providers as production (email at minimum;
  Google OAuth requires a separate QA OAuth client — Step 5).

## Step 4 — Create the QA Vercel project [MANUAL]

Vercel → Add New → Project → import the **same GitHub repo**:

- **Production Branch**: `qa` (Settings → Git → Production Branch)
- Leave **Ignored Build Step** empty (QA should deploy `qa` branch)
- The project reads `vercel.json` **from the qa branch** — which now
  registers zero crons (belt) plus runtime gating in `verifyCronRequest`
  (suspenders). No dashboard cron changes needed.
- Do **not** copy environment variables from the production project.
  Set only the values in `.env.qa.example`.

## Step 5 — QA credentials [MANUAL — create, never copy]

| Resource | Action |
|---|---|
| Supabase | QA project keys from Step 3 (anon + service-role) |
| Stripe | Create **test-mode** API key + test webhook endpoint pointing at `https://<qa-host>/api/stripe/webhook` |
| Twilio | Create a **subaccount** (or separate account); buy 1 QA number; point its voice/SMS webhooks at `https://<qa-host>`; set `REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID` to that SID |
| Google OAuth | New OAuth client, redirect = `https://<qa-host>/api/google/calendar/callback` |
| Firebase/APNs | Separate Firebase project; `APNS_ENV=development` |
| Upstash | Separate QA database (or omit — rate limiting degrades gracefully) |
| Sentry | Leave DSN empty or a separate QA Sentry project |
| Resend | QA key + `qa@replyflowhq.com` sender |
| Secrets | Fresh random `CRON_SECRET`, `INTERNAL_API_SECRET`, `PROVISIONING_ADMIN_SECRET`, `MMS_MEDIA_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`, `GOOGLE_PLAY_RTDN_SECRET`, `ADMIN_SECRET` |
| Google Play | Out of scope — keep `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` empty; RTDN endpoint stays production-only |

## Step 6 — Deploy the QA voice service [MANUAL]

```bat
cd services\replyflow-ai-voice
fly apps create replyflow-ai-voice-qa
fly secrets set -c fly.qa.toml REPLYFLOW_ENV=qa MAIN_APP_URL=https://<qa-host> ^
  BASE_URL=https://replyflow-ai-voice-qa.fly.dev SUPABASE_URL=https://<qa-ref>.supabase.co ^
  SUPABASE_SERVICE_ROLE_KEY=<qa-srk> TWILIO_ACCOUNT_SID=<qa-sid> TWILIO_AUTH_TOKEN=<qa-token> ^
  REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID=<qa-sid> OPENAI_API_KEY=<qa-openai> ^
  INTERNAL_API_SECRET=<qa-internal>
fly deploy -c fly.qa.toml
```

The service's `assertVoiceQaIsolation()` runs before binding — a prod
reference kills startup, visible in `fly logs`.

## Step 7 — Push `qa` and verify isolation

Only after Steps 1–5:

```bat
git push -u origin qa
```

Verification checklist:
- QA Vercel build log shows `[ENV ISOLATION] QA build configuration verified`
- First request logs `[ENV] REPLYFLOW_ENV=qa`
- QA signup creates rows **only** in QA Supabase (verify `businesses` row
  count unchanged in production before/after)
- QA Twilio console shows the QA host on webhook URLs
- `GET /api/cron/send-followups` on QA returns **404** (cron gate)
- A deliberate misconfig test: set `NEXT_PUBLIC_SUPABASE_URL` to the prod
  ref in QA → next build/deploy fails with `[ENV ISOLATION]`

## Rollback

- Repo: `git branch -D qa` + `git worktree remove` — production untouched.
- Infra: delete the QA Vercel project, QA Supabase project, QA Fly app,
  and release the QA Twilio number. Nothing shared with production exists.

## What remains manual-by-design

- GitHub branch protection (Step 2) — dashboard only
- Vercel project creation + env vars (Steps 1, 4, 5) — dashboard only
- Supabase project creation (Step 3) — dashboard + CLI
- Fly app + secrets (Step 6) — CLI with credentials
- Twilio subaccount + number purchase (Step 5) — dashboard
- Stripe test webhook endpoint (Step 5) — dashboard
