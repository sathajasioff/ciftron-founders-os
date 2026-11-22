# Setup: Phase 2 (Supabase, keys, Brain)

About 20 minutes. Do the steps in order.

## 1. Create the Supabase project

1. Go to supabase.com, create a project (region: Canada Central if offered, otherwise US East). Save the database password somewhere safe.
2. Open **SQL Editor**, paste the whole of `supabase/migrations/20261122000001_schema.sql`, and run it.
3. Paste and run `supabase/migrations/20261122000002_storage.sql`.

Both should end with "Success. No rows returned".

## 2. Lock sign-in to you

1. **Authentication → Users → Add user → Create new user.** Enter your email, tick **Auto Confirm User**. Any password works; you sign in by email link.
2. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up". Leave Email enabled.
3. **Authentication → URL Configuration:**
   - Site URL: your Vercel URL (later `https://os.ciftron.com`)
   - Redirect URLs: add the same URL, plus `http://localhost:3000` if you run it locally.

## 3. Copy the keys

**Project Settings → API** (or **API Keys**):

| Vercel variable | Where it comes from |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon public key (or the publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (or a secret key). Server only. |
| `ENCRYPTION_KEY` | Run `openssl rand -base64 32` once. Keep a copy offline: if you lose it, saved provider keys must be re-entered. |
| `OWNER_EMAIL` | The email from step 2 |

## 4. Add them to Vercel

Vercel → your project → **Settings → Environment Variables**. Add all five for Production and Preview, then **Deployments → Redeploy**.

## 5. First sign-in

1. Open the site. You get the sign-in screen (if you still see demo data, the env vars are missing).
2. Enter your email, click the link in your inbox.
3. On first sign-in the OS creates your profile, your three offers (monthly prices), and adds the about_me brief as a Brain source.

## 6. Connect AI keys

**Connections and Settings:**

- **Anthropic**: an API key from console.anthropic.com. Used for fact proposals and the style guide.
- **OpenAI**: an API key from platform.openai.com. Used for embeddings (Brain search).

Each is tested when you save. Other connections can wait for their phase.

## 7. Fill the Brain

1. **Brain → Sources:** click **Process** on "about_me (build brief)", then **Propose facts**.
2. **Brain → Facts:** review each proposed fact. Each one shows the exact quote it came from. Approve, edit, star or reject.
3. **Upload** more: sales call notes, transcripts, PDFs, your website link. Tick "writing samples" for things you wrote yourself (captions, emails, posts).
4. **Style guide → Build style guide** once you have writing samples.
5. **Brand DNA → Compile.** Recompile whenever the yellow banner says it is out of date.

## Costs

Embeddings with text-embedding-3-small are about 0.02 USD per million tokens, so a 100-page PDF costs well under a cent. Each "Propose facts" is one Claude call on up to about 60,000 characters of the source.

# Phase 3 update (AI Chat, AI Team, Approvals)

1. In Supabase **SQL Editor**, run `supabase/migrations/20261122000003_agents.sql`. It is short and safe to run once.
2. Reload the OS. On load it adds the Chief of Staff and Content Strategist agents (and the later agents, switched off).
3. Credits: chat uses your **Anthropic** key. Brain search and the Strategy Room challenger use **OpenAI**. If OpenAI has no credits, chat still works without Brain search and the challenger falls back to Claude.
4. Optional Vercel env vars: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) and `OPENAI_MODEL` (default `gpt-6.1-sol`).

How it works:
- Every message loads the active Brand DNA and the closest Brain passages, shown as source cards.
- Finished deliverables (hooks, scripts, carousels, ad copy, emails) are saved to **Approvals** automatically. Nothing is published or sent.
- Chief of Staff routes content work to the Content Strategist, which works in its own thread.
- Approving a Content draft creates a card on the Content board (the board goes live in Phase 5). Edits are marked as yours.

# Phase 4 update (HighLevel and Meta Ads)

No SQL to run for this phase.

## HighLevel scopes

In HighLevel: **Settings → Private Integrations → your integration (ciftron os) → Edit → Scopes**. Tick these, then save. Your token keeps working; scopes apply to it right away.

**Read (needed now):**

| Scope | Used for |
|---|---|
| `locations.readonly` | Connection test, sub-account name |
| `opportunities.readonly` | Pipeline board: pipelines, stages, opportunities |
| `contacts.readonly` | Contact details in the Pipeline drawer |
| `products.readonly` | Products as context |
| `funnels/funnel.readonly` | Funnel list as context |
| `socialplanner/account.readonly` | Pick accounts for Social Planner drafts |
| `locations/customValues.readonly` | Read OS_ custom values |

**Write (only for actions you want; each one is previewed and needs your click):**

| Scope | Action |
|---|---|
| `opportunities.write` | Move a card to another stage |
| `contacts.write` | Create a contact |
| `socialplanner/post.write` | Send a Social Planner post as a draft |
| `emails/templates.write` | Save an email template |
| `locations/customValues.write` | Create or update OS_ custom values only |

Not used and not needed: anything with conversations, SMS sending, payments, workflows or users.

Then in the OS: **Connections → HighLevel → Test.** The result lists any read scope that is still missing.

## Meta Ads (read-only)

1. Meta Business Settings → **Users → System users → Add** (role: Employee).
2. **Assign assets → Ad accounts →** your account, permission **View performance** only.
3. **Generate new token**, pick your app, tick only **ads_read**, and set expiry to Never (or 60 days and rotate).
4. In the OS: **Connections → Meta Ads → Connect**, paste the token and your ad account ID (`act_...` or just the number). Save and test.

The OS never edits campaigns, budgets or ads.

## Optional Vercel env vars

- `HL_API_VERSION` (default `v3`; the OS falls back to `2021-07-28` automatically if HighLevel rejects it)
- `META_API_VERSION` (default `v26.0`)
