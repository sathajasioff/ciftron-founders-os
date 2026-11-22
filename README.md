# Founders AI OS (Ciftron)

A private, single-owner AI command center on top of HighLevel. HighLevel is the system of record. The OS is the intelligence and creation layer.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Clickable demo, every screen, sample data, light/dark, EN / FR-QC | **Done** |
| 2 | Supabase auth, schema with RLS, encrypted keys, full Brain | Waiting for "next phase" |
| 3 | AI Chat with Brand DNA, Approvals queue, Content Strategist agent | |
| 4 | HighLevel + Meta Ads (read-only) connections, Pipeline, confirmed writes | |
| 5 | Creation studio modules you confirm, remaining agents | |
| 6 | Jarvis voice, MCP server, recurring routines | |
| 7 | os.ciftron.com, security headers, error logging, tests | |

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
pip install playwright && python3 -m playwright install chromium
python3 tests/smoke.py
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
tests/smoke.py          Playwright smoke test
```

## Design tokens

Verified from engine.ciftron.com: Space Grotesk (headings), DM Sans (body), #111111 ink, #F5F5F3 off-white, #A2A2A2 muted, pill buttons, 12 to 14px card radius. Accent #C8F36B comes from the brand brief because the reference site has no accent color. All tokens live at the top of `app.css`.

## Guardrails built into the UI

- Every HighLevel write shows the exact payload and needs one confirm click. Every write is logged.
- Every AI draft goes to Approvals first.
- Pipeline moves are forward-only by default and warn that automations may fire.
- HighLevel conversations are never read or shown.
- Placeholders like `[PROOF: ...]` are highlighted so invented details never pass as real.
