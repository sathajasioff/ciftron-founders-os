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

# Phase 5 update (Jarvis and the creation studio)

1. **Required:** in Supabase SQL Editor, run `supabase/migrations/20261122000004_studio.sql`.
2. Reload the OS. All nine AI Team agents switch on with their instructions (any you already edited are kept).
3. Add the keys for the parts you want, in **Connections and Settings**:

| Key | Used by |
|---|---|
| Anthropic (already added) | Jarvis, every module's AI drafts |
| OpenAI | Brain search, Strategy Room challenger |
| OpenRouter | Graphics image generation (any image model it lists) |
| Apify | Instagram research in Content |
| YouTube | YouTube research in Content |
| ElevenLabs (optional) | Jarvis voice. Without it, Jarvis uses the browser's voice. |

4. **New HighLevel write scopes** (only for the actions you want; each is previewed and confirmed):
   - `products.write` and `products/prices.write`: send an offer's product and monthly price with a funnel
   - `courses.write`: send a program as a draft course (all modules and lessons stay draft)

## Jarvis

- Jarvis is the home screen. Type in the command bar, tap a quick prompt, press **Talk**, or tap the core.
- Voice input uses the browser's speech recognition (Chrome, Edge or Safari). The first time, allow the microphone.
- Jarvis reads Brand DNA plus live HighLevel, Meta, Approvals, Content and Goals data, and answers in one to three spoken sentences. It cannot change anything.
- No transcript is shown or saved. Typed questions show only the latest answer.
- **Hold drafting agents** turns off every agent except the Chief of Staff until you resume them.

## Every AI draft still goes through Approvals

| Module | What lands in Approvals | What approving does |
|---|---|---|
| Content | Remixes and agent drafts | Creates a Content card |
| Emails | Generated sequences | Unlocks "Save as HighLevel template" |
| Funnels | Each built or revised version | Unlocks "Send products, media and email templates to HighLevel" |
| Graphics | Each generated or edited image | Marks that version approved |
| Programs | AI program proposals | Builds the program board exactly as proposed |
| Vault | Briefs (labeled inspiration) | Creates a Content card; never a Brand DNA fact |

Goals are not drafts: the AI only turns your sentence into a measurable target, which you can edit.

## Optional Vercel env vars

- `OPENROUTER_IMAGE_MODEL` (default `google/gemini-2.5-flash-image`; you can also pick a model per image in Graphics)
- `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL` (default `eleven_multilingual_v2`, which also speaks French)

# Phase 6 update (MCP server and routines)

1. **Required:** in Supabase SQL Editor, run `supabase/migrations/20261122000005_mcp_routines.sql`.
2. **For routines:** in Vercel → Project → Settings → Environment Variables, add `CRON_SECRET`. Make a value with `openssl rand -base64 32` (at least 16 characters). Redeploy. Vercel sends it to `/api/cron` on its own; you never type it anywhere else.
3. Reload the OS.

## MCP access (Claude Code, Codex, other MCP clients)

1. **Connections and Settings → MCP access → New token.** Name it after the device or tool. Pick **Read only** or **Read and write**.
2. Copy the token from the window. It is shown once; only a hash is stored. Do not paste it into chats or commit it to a repo.
3. In a terminal, for Claude Code:

```bash
claude mcp add --transport http founders-os https://YOUR-DOMAIN/api/mcp --header "Authorization: Bearer cfos_..."
```

Add `--scope user` to use it in every project. If your Claude Code version drops the header, use:

```bash
claude mcp add-json founders-os '{"type":"http","url":"https://YOUR-DOMAIN/api/mcp","headers":{"Authorization":"Bearer cfos_..."}}'
```

Other clients: add an HTTP (Streamable HTTP) MCP server with the URL `https://YOUR-DOMAIN/api/mcp` and the header `Authorization: Bearer <token>`.

| Read tools (both token types) | Write tools (read and write only) |
|---|---|
| `get_brand_dna`, `search_brain`, `list_facts`, `list_offers` | `create_draft`: adds a draft to Approvals |
| `list_approvals`, `get_approval`, `list_content`, `list_goals` | `update_draft`: edits a draft that is still pending |
| `list_email_sequences`, `list_funnels`, `list_programs`, `list_vault`, `list_agents` | `update_content_item`: stage, date, channel, title, hook, notes |
| `get_business_snapshot` (pipeline counts, ads, approvals, content, goals) | `update_fact`: changed text goes back to proposed |
| `get_ads_summary` (Meta Ads, read-only) | `update_goal`: target, due date; current value only on manual goals |
| | `add_vault_item`: save a link or text |

What MCP can never do:

- Read API keys, connection settings, or HighLevel contacts and conversations. Pipeline data is counts only.
- Publish, post, send, or write to HighLevel. Approvals and HighLevel sends stay in the OS, with your confirm click.
- Overwrite text you wrote, unless the client passes `overwrite_my_text: true` (tell it to only when you asked for that change).
- Save over newer work: every edit must send the row version it read.

Every MCP write appears under **Edits made through MCP** with the previous value. **Undo** restores it. Undo refuses if the row changed after that edit, so later work is never lost. **Revoke** cuts a token off immediately.

## Routines

1. **AI Team** → pick an agent → **Routines → Add**.
2. Choose daily, weekly (pick the day) or monthly (day 1 to 28), the language, and what the agent should do. Each agent starts with a suggestion you can edit.
3. The cron runs once a day around 10:30 UTC (about 5:30 am in Toronto in winter, 6:30 am in summer). On the free Vercel plan the time can drift by up to an hour.
4. Each run saves drafts to **Approvals**, tagged `routine`. Nothing publishes or sends.
5. **Run now** runs it immediately. A routine that ran today (by hand or by the cron) does not run again the same day.
6. If a run fails (for example, no Anthropic credits), the error shows on the routine card.

Up to 6 routines run per day. Each run costs one Claude call, plus one OpenAI embedding when the OpenAI key is saved.

## Optional Vercel env vars

- `APP_ORIGIN`: extra browser origins allowed to call `/api/mcp`, comma separated. Terminal clients need nothing.

# Phase 7 update (production)

1. **Required:** in Supabase SQL Editor, run `supabase/migrations/20261122000006_error_log.sql`.
2. Push is already deployed by Vercel. The new security headers apply on the next deploy automatically.

## Custom domain: os.ciftron.com

1. **Vercel:** open the `ciftron-founders-os-y3f4` project, then **Settings → Domains → Add**. Type `os.ciftron.com` and click **Add**.
2. Vercel shows the DNS record to create, usually a **CNAME** with name `os`. Copy the exact value it shows.
3. **Your DNS provider for ciftron.com** (wherever the domain is managed: GoDaddy, Namecheap, Cloudflare, Google, HighLevel): add that record.
   - Type `CNAME`, Name/Host `os`, Value as Vercel showed, TTL automatic.
   - On Cloudflare, set the record to **DNS only** (grey cloud) so Vercel can issue the certificate.
4. Back in Vercel, wait until the domain shows **Valid Configuration**. This usually takes a few minutes, and can take up to a few hours.
5. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** `https://os.ciftron.com`
   - **Redirect URLs:** add `https://os.ciftron.com/**`. Keep the vercel.app one until you've signed in once on the new domain.
   Without this, sign-in links still send you to the old address.
6. Open `https://os.ciftron.com`, sign in with a new link, and check that everything loads.
7. **Claude Code:** point MCP at the new address. Your token stays the same:
   ```bash
   claude mcp remove founders-os
   claude mcp add --transport http founders-os https://os.ciftron.com/api/mcp --header "Authorization: Bearer YOUR_TOKEN" --scope user
   ```

Nothing in the code needs changing for the domain. The cron, MCP and sign-in use whatever address the app is served from.

## Security headers (automatic)

Every page and API response now sends:

- **Content-Security-Policy:**
  - Scripts only from the app itself, esm.sh (the Supabase client) and jsDelivr (the zip download in Graphics).
  - No inline scripts and no eval.
  - Data only to Supabase.
  - The app can't be framed by other sites.
- **Strict-Transport-Security** (HTTPS only, two years).
- **Cross-Origin-Opener-Policy**, **X-Content-Type-Options**, **X-Frame-Options**, **Referrer-Policy**.
- **Permissions-Policy:** microphone allowed for Jarvis only; camera, location and payment are blocked.

If a future feature loads something from a new site, the browser blocks it and the UI tests fail until `vercel.json` is updated. That's intended.

## Error log

**Connections and Settings → Error log** shows the last 50 failures from:

- server functions
- MCP calls
- routines
- your browser

Keys and tokens are removed before anything is saved. Entries older than 30 days are deleted by the daily cron, and **Clear** empties the log. Vercel's own logs (**Project → Logs**) show the same server errors with full timing.

## Tests

`npm run test:all` runs everything. `docs/TESTS.md` maps every feature to its tests.

## Screens you could cut

See `docs/CUT-LIST.md`. Nothing has been removed yet.
