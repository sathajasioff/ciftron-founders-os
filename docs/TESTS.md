# Tests: one for every feature

Run everything with `npm run test:all`. The unit, database and API tests need nothing else. `npm run test:ui` needs Python, Playwright and Chrome.

| Suite | What it is |
|---|---|
| `tests/db.test.mjs` | The real SQL migrations in an in-process Postgres (PGlite + pgvector). Checks row level security, grants, version checks and constraints. |
| `tests/api.test.mjs` | Every `/api` function end to end. The real Supabase client talks to a fake Supabase, and Anthropic, OpenAI, HighLevel, Meta and ElevenLabs are stubbed. |
| `tests/unit.test.mjs`, `chat.test.mjs`, `hl.test.mjs`, `studio.test.mjs`, `mcp.test.mjs`, `prod.test.mjs` | Library logic: encryption, Brain parsing, prompts, HighLevel writes, studio validators, the MCP protocol, routines, redaction, headers. |
| `tests/smoke.py` | Demo mode: 14 screens × light/dark × desktop/mobile, with the production security headers. Any console error, page error or CSP violation fails. |
| `tests/live_e2e.py` | Live mode in a real browser with a fake supabase-js and stubbed `/api`, with the production security headers. Any console error or CSP violation fails. |

## Features → tests

| Feature | Tests |
|---|---|
| **Security and data** | |
| Owner-only sign-in (magic link, other emails refused) | e2e 1; api "owner only" |
| Row level security on every table | db "every public table has row level security", "other users see nothing", "cannot write rows owned by someone else", "anon sees nothing" |
| Keys encrypted server-side, never sent to the browser | unit "encrypt and decrypt", "tampered ciphertext"; db "provider_keys is unreadable"; api "keys"; e2e 9 |
| Stale saves cannot overwrite newer work | db "stale saves are rejected"; e2e 4, 19 |
| Append-only audit and write logs | db "audit log is append-only", "mcp tables", "error_log" |
| Storage only in the owner's folder | db "storage" |
| Security headers and CSP | prod "security headers", "CSP"; smoke and e2e run under the real CSP |
| Error log with secrets removed | prod "redact", "errorRow", "server handler: 5xx errors are logged"; api "server crash", "browser errors"; db "error_log"; e2e 27 |
| Data export without secrets, delete everything | api "account: export has no secrets"; e2e 10 |
| **Brain and Brand DNA** | |
| Upload, extract, chunk, embed | unit "chunkText", "htmlToText", "extractText"; e2e 7 |
| Facts proposed only with a supporting quote | unit "validateFacts"; e2e 3, 6 |
| Style guide always includes house rules | unit "finalizeStyle" |
| Brand DNA from approved facts only, flags missing proof | unit "compileDna"; db "one active Brand DNA"; e2e 5 |
| Brain search, owner's chunks only | db "match_chunks", "match_chunks_for"; api "brain"; e2e 8 |
| First sign-in seeds offers and nine agents, idempotent | api "brain: bootstrap"; chat "agent seeds" |
| **AI Chat, AI Team, Approvals** | |
| Chat uses Brand DNA, Brain and house rules | chat "systemPrompt"; api "chat"; e2e 12 |
| Drafts go to Approvals as AI drafts, no em dashes | chat "extractDrafts", "cleanCopy"; api "chat"; e2e 12 |
| Strategy Room | e2e 12 |
| Chief of Staff hand-off | chat "extractHandoff" |
| AI Team agents, enable, instructions | e2e 13, 24 |
| Approvals: approve, edit (marked yours), pass, trash, restore, undo | e2e 11 |
| **HighLevel and Meta** | |
| Read context, never conversations | hl "board helpers: no conversations"; api "hl"; mcp "no tool reads … conversations" |
| Every write previewed, confirmed and logged | api "hl: preview never calls HighLevel; write needs confirm"; e2e 15, 16 |
| Forward-only pipeline moves | hl "moves are forward-only"; e2e 15 |
| Custom values only with the OS_ prefix | hl "custom values must start with OS_"; api "hl" |
| Social posts only as drafts; products, courses, funnel bundles | hl "social posts are always drafts", "product, course and funnel bundle writes"; e2e 16, 21 |
| HighLevel API version fallback and scope errors | hl "hlFetch" ×2 |
| Meta Ads read-only | hl "Meta: leads"; api "meta"; e2e 14 |
| **Jarvis and creation studio** | |
| Jarvis: short, read-only, no transcript | studio "Jarvis prompt"; api "chat … Jarvis stores nothing"; e2e 18 |
| Jarvis voice (ElevenLabs, browser fallback) | api "voice" |
| Content board, remix, research, learning signals | studio "research", "learning signals"; e2e 19 |
| Emails: generate, rewrite without overwriting, HighLevel template | studio "funnel and sequence output"; e2e 20 |
| Funnels: build, preview, send bundle | studio "funnel and sequence output"; e2e 21 |
| Graphics: exact sizes, brand-aware prompts, approvals | studio "graphics"; e2e 22 |
| Vault briefs, Programs | studio "programs and vault briefs"; e2e 23 |
| Goals: measurable targets, live sync | studio "goals" ×2; api "studio: a goal"; e2e 23 |
| **MCP and routines** | |
| MCP protocol (current and legacy clients, headers, versions, Origin) | mcp protocol tests ×10; api "mcp over HTTP"; checked against the official MCP SDK client |
| Revocable read or read-write tokens, hashed | mcp "tokens"; api "account … MCP token", "mcp over HTTP"; db "mcp tables"; e2e 26 |
| Write tools: version checks, owner text protected, pending drafts only | mcp "updates need the current version", "update_goal", "add_vault_item" |
| Every MCP edit logged with Undo | mcp "create_draft … undo", "undo restores", "undo of an approved draft"; e2e 26 |
| Routines: daily, weekly, monthly, drafts only | mcp "isDue", "routinePrompt", "runRoutine" ×2; api "studio … routine_run", "cron over HTTP"; db "agent_routines"; e2e 25 |
| Cron only with CRON_SECRET | mcp "cron only runs"; api "cron over HTTP" |
| **App shell** | |
| Every screen, light and dark, desktop and mobile, EN and FR-QC | smoke |
| Live vs demo mode | smoke (demo), e2e (live) |

## What is not covered automatically

- Real provider responses (Anthropic, OpenAI, HighLevel, Meta, OpenRouter, Apify, YouTube, ElevenLabs). Tests use recorded shapes. The **Test** button on each connection checks the real API.
- Microphone and speech recognition for Jarvis. They need a real browser and a person.
- Vercel's cron timing. That runs on Vercel's side; check **Settings → Cron Jobs** in Vercel.
