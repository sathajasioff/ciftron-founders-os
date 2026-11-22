# Founders AI OS (Ciftron)

A private, single-owner AI command center on top of HighLevel. HighLevel is the system of record. The OS is the intelligence and creation layer.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Clickable demo, every screen, sample data, light/dark, EN / FR-QC | **Done** |
| 2 | Supabase auth, schema with RLS, encrypted keys, full Brain | **Done** (setup: `docs/SETUP.md`) |
| 3 | AI Chat with Brand DNA, Approvals queue, Content Strategist agent | **Done** (run migration 003) |
| 4 | HighLevel + Meta Ads (read-only) connections, Pipeline, confirmed writes | |
| 5 | Creation studio modules you confirm, remaining agents | |
| 6 | Jarvis voice, MCP server, recurring routines | |
| 7 | os.ciftron.com, security headers, error logging, tests | |

## Live vs demo

With Supabase configured (see `docs/SETUP.md`), sign-in is required and **Brain**, **Connections and Settings**, **AI Chat**, **AI Team** and **Approvals** use real data. Other screens show demo data with a "Phase N" tag until their phase. Without Supabase env vars (local static server, hosted demo) the whole app runs in demo mode.

## Phase 1: what is real and what is mocked

Real: navigation, layout, light/dark theme, EN / Quebec French interface toggle, every screen and its interactions, the confirm-before-send pattern for HighLevel writes, forward-only pipeline moves, reversible trash, the "type delete" danger zone, JSON export.

Mocked: all data (`assets/js/data.js`), AI replies, HighLevel and Meta numbers, connection tests, image generation. Nothing is sent anywhere. Nothing persists after a reload except theme and language.

## Run locally

No build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Test

```bash
npm install
npm test                    # database + RLS (PGlite with pgvector), crypto, Brain logic
python3 tests/smoke.py      # every demo screen, both themes, desktop + mobile
python3 tests/live_e2e.py   # live mode UI against a fake Supabase
```

Opens all 14 screens in light and dark, desktop and mobile, fails on any console error, and checks approve, pipeline move confirmation, chat, Strategy Room, goals, language switch and the delete guard. (The script points at `/usr/bin/google-chrome`; change `executable_path` if your Chrome lives elsewhere.)

## Structure

```
index.html              App shell entry
vercel.json             Static hosting + security headers
assets/css/app.css      Design tokens and components
assets/js/app.js        Shell, router, theme, language
assets/js/i18n.js       EN and FR-QC strings
assets/js/ui.js         Icons, modal, drawer, toast, confirmWrite
assets/js/data.js       Phase 1 sample data
assets/js/screens/*.js  One file per screen
api/                    Vercel server functions (config, keys, brain, chat, account)
api/_lib/               Auth guard, AES-256-GCM, providers, Brain logic
supabase/migrations/    Schema, RLS, storage policies
assets/js/live.js       Supabase auth, API calls, versioned updates
tests/                  Node tests and Playwright suites
docs/SETUP.md           Supabase and Vercel setup
```

## Design tokens

Verified from engine.ciftron.com: Space Grotesk (headings), DM Sans (body), #111111 ink, #F5F5F3 off-white, #A2A2A2 muted, pill buttons, 12 to 14px card radius. Accent #C8F36B comes from the brand brief because the reference site has no accent color. All tokens live at the top of `app.css`.

## Guardrails built into the UI

- Every HighLevel write shows the exact payload and needs one confirm click. Every write is logged.
- Every AI draft goes to Approvals first.
- Pipeline moves are forward-only by default and warn that automations may fire.
- HighLevel conversations are never read or shown.
- Placeholders like `[PROOF: ...]` are highlighted so invented details never pass as real.
