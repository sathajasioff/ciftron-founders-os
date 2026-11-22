"""Live-mode UI test with a fake supabase-js and stubbed /api routes.
Checks the login gate, Brain fact review with version checks, uploads, Brand DNA and Connections."""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE = open(os.path.join(ROOT, 'tests/fixtures/fake-supabase.js')).read()
calls = []
providers = [
    {'id': 'highlevel', 'name': 'HighLevel', 'connected': True, 'phase': None, 'status': 'ok', 'last4': '12cf', 'fields': {'secret': ['private_integration_token'], 'plain': ['location_id']}, 'config': {}},
    {'id': 'anthropic', 'name': 'Anthropic', 'connected': True, 'phase': None, 'status': 'ok', 'last4': 'x7Qf', 'test_message': 'Key works', 'fields': {'secret': ['api_key'], 'plain': []}, 'config': {}},
    {'id': 'openai', 'name': 'OpenAI', 'connected': False, 'phase': None, 'status': 'none', 'fields': {'secret': ['api_key'], 'plain': []}, 'config': {}},
    {'id': 'google', 'name': 'Google (Calendar and Meet)', 'connected': True, 'linked': False, 'phase': None, 'status': 'untested', 'last4': 'cret', 'test_message': 'Saved. Now click Sign in with Google.', 'fields': {'secret': ['client_secret'], 'plain': ['client_id']}, 'config': {'client_id': 'cid.apps.googleusercontent.com'}},
]

def api(route):
    try:
        _api(route)
    except Exception as e:
        errors.append(f'api stub crashed: {e!r}'); route.fulfill(status=500, body='{}')

def _api(route):
    req = route.request
    body = json.loads(req.post_data or '{}') if req.method != 'GET' else {}
    calls.append((req.url.split('/api/')[1], req.method, body, req.headers.get('authorization')))
    path = req.url.split('/api/')[1].split('?')[0]
    out = {'ok': True}
    if path == 'chat' and body.get('mode') == 'jarvis': out = {'reply': 'Two drafts are waiting and one new lead came in today.'}
    elif path == 'config': out = {'supabaseUrl': 'https://fake.supabase.co', 'supabaseAnonKey': 'anon', 'phase': 2}
    elif path == 'voice': return route.fulfill(status=400, content_type='application/json', body=json.dumps({'error': 'Add your ElevenLabs key in Connections first'}))
    elif path == 'keys' and req.method == 'GET': out = {'providers': providers, 'custom': [{'id': 'cc1', 'last4': '3456'}]}
    elif path == 'keys' and body.get('action') == 'custom_save': out = {'id': 'cc2'}
    elif path == 'keys' and body.get('action') == 'custom_test': out = {'ok': True, 'message': 'Works: GET /scheduled_events returned 200'}
    elif path == 'keys' and body.get('action') == 'test': out = {'ok': True, 'status': 'ok', 'message': 'Key works'}
    elif path == 'brain' and body.get('action') == 'compile': out = {'brand_dna': {'version_no': 2}}
    elif path == 'brain' and body.get('action') == 'ingest': out = {'ok': True, 'chunks': 7}
    elif path == 'brain' and body.get('action') == 'propose': out = {'proposed': 0}
    elif path == 'hl':
        a = body.get('action')
        if a == 'board': out = BOARD
        elif a == 'contact': out = {'contact': {'id': 'c1', 'name': 'Marc Tremblay', 'email': 'marc@example.com', 'phone': '+15145550101', 'companyName': 'Tremblay Hypotheques', 'tags': ['mortgage'], 'city': 'Montreal'}}
        elif a == 'context': out = {'socialAccounts': [{'id': 'acc1', 'name': 'Ciftron IG', 'platform': 'instagram'}], 'customValues': [{'id': 'cv1', 'name': 'OS_offer_1_name', 'value': 'Lead Gen'}]}
        elif a == 'preview': out = {'preview': {'method': 'PUT' if body['kind'] == 'move' else 'POST', 'url': '/x', 'body': body['input'], 'summary': 'Preview ' + body['kind'], 'warning': 'HighLevel automations may trigger', 'scope': 'opportunities.write'}}
        elif a == 'write': out = {'ok': True, 'id': 'new1', 'summary': 'Done ' + body['kind']}
    elif path == 'studio':
        a = body.get('action')
        out = {'remix': {'drafts': 2}, 'email_sequence': {'sequence_id': 'es1'}, 'funnel_build': {'version_no': 2}, 'goal': {'goal_id': 'g1'}, 'goals_sync': {'updated': 0, 'sources': {}},
               'program_propose': {'approval_id': 'apx'}, 'vault_brief': {'brief': {}}, 'learning_refresh': {'signals': 1}, 'routine_run': {'status': 'ok', 'drafts': 2}, 'content_funnel': {'drafts': 9, 'by_stage': {'tofu': 4, 'mofu': 3, 'bofu': 2}},
               'playbook_propose': {'proposed': 2}, 'chat_models': {'models': [{'id': 'google/gemini-x', 'name': 'Gemini X'}], 'openrouter': True},
               'call_analyze': {'analysis': {}}, 'call_to_brain': {'source_id': 's1'}, 'call_to_playbook': {'proposed': 1},
               'revenue': {'stripe': True, 'stripe_error': None, 'entries': [{'id': 're1', 'occurred_on': '2026-11-02', 'amount': 1500, 'currency': 'CAD', 'client': 'Batisseur', 'description': 'Retainer', 'recurring': True}],
                           'charges': [{'id': 'ch_1', 'amount': 497, 'currency': 'USD', 'date': '2026-11-03', 'description': 'Lead Gen'}],
                           'summary': {'currencies': ['USD', 'CAD'], 'mrr': {'USD': 497, 'CAD': 1500}, 'this_month': {'USD': 497, 'CAD': 1500}, 'last_month': {'USD': 994, 'CAD': 1500},
                                       'months': [{'month': m, 'USD': {'stripe': v, 'manual': 0, 'total': v}, 'CAD': {'stripe': 0, 'manual': 1500, 'total': 1500}} for m, v in [('2026-06', 0), ('2026-07', 497), ('2026-08', 497), ('2026-09', 994), ('2026-10', 994), ('2026-11', 497)]]}}, 'research_fetch': {'posts': 12, 'median': 1800},
               'graphic': {'b64': 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwHwyBNAOU8R8AjjgL9YdRIygAAAAASUVORK5CYII=', 'media_type': 'image/png', 'prompt': 'p', 'model': 'm', 'cost': 0.04}, 'rewrite_email': {'subject': 'New subject', 'preview': '', 'body': 'Shorter body'},
               'tella_list': {'videos': [{'id': 'vid_1', 'name': 'Why leads go cold', 'description': 'Loom-style walkthrough', 'views': 12, 'created_at': '2026-11-20T10:00:00Z', 'url': 'https://www.tella.tv/video/vid_1/view', 'in_brain': False}], 'next': None},
               'tella_import': {'source_id': 'src_t1', 'chars': 900}, 'tella_repurpose': {'drafts': 3},
               'custom_fetch': {'name': 'Calendly', 'path': '/scheduled_events', 'status': 200, 'ok': True, 'type': 'application/json', 'text': '{\n "collection": [{"name": "Discovery with Marc"}]\n}', 'truncated': False},
               'page_build': {'page_id': 'pg2', 'version_no': 2, 'preview_path': '/p/tok_x'}, 'slides_build': {'deck_id': 'dk2', 'slides': 6}, 'slides_pptx': {'b64': 'UEsDBAo=', 'filename': 'Lead-Response-Bootcamp.pptx'},
               'theme': {'theme': {'bg': '#0E1A2B', 'surface': '#FFFFFF14', 'text': '#F5F5F3', 'muted': '#C9C9C3', 'accent': '#C8F36B', 'accentText': '#111111', 'highlight': '#C8F36B', 'fonts': {'heading': 'Space Grotesk', 'body': 'DM Sans'}}}}.get(a, {'ok': True})
    elif path == 'account' and body.get('action') == 'mcp_token_create': out = {'token': 'cfos_' + 'T' * 43, 'id': 'mt2', 'name': body['name'], 'scope': body['scope'], 'token_prefix': 'cfos_TTTTTTT'}
    elif path == 'account' and body.get('action') == 'member_invite': out = {'member': {'id': 'wm1', 'email': body['email'], 'role': 'member'}}
    elif path == 'account' and body.get('action') == 'mcp_undo': out = {'ok': True, 'message': 'Restored the previous value'}
    elif path == 'google':
        a = body.get('action')
        out = {'start': {'url': '#connections?google=connected'}, 'calendar': {'events': [{'id': 'e1', 'title': 'Discovery call with Marc', 'start': '2030-01-01T15:00:00Z', 'end': '2030-01-01T15:30:00Z', 'all_day': False, 'meet': True}]},
               'meet_list': {'calls': [{'record': 'conferenceRecords/r9', 'transcript': 'conferenceRecords/r9/transcripts/t9', 'start': '2026-11-21T15:00:00Z', 'end': '2026-11-21T15:20:00Z', 'title': 'Coaching with Sophie', 'imported': False}]},
               'meet_import': {'call_id': 'new-call', 'chars': 1200}}.get(a, {'ok': True})
    elif path == 'meta': out = {'range': 'last_7d', 'spend': 198.8, 'leads': 14, 'cpl': 14.2, 'previous': {'spend': 160, 'leads': 10, 'cpl': 16}, 'campaigns': [{'id': '1', 'name': 'Mortgage leads', 'spend': 198.8, 'leads': 14, 'cpl': 14.2}]}
    elif path == 'chat': out = {'thread_id': 't1', 'messages': [], 'drafts': [{'id': 'new', 'title': 'Hooks', 'type': 'Hooks'}], 'warnings': ['Brain search skipped: OpenAI has no credits left.']}
    elif path == 'brain' and body.get('action') == 'search': out = {'results': [{'source_name': 'about_me', 'content': 'mortgage brokers', 'similarity': 0.82}]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(out))

BOARD = {'pipelines': [{'id': 'p1', 'name': 'Agency Pipeline'}], 'pipeline': {'id': 'p1', 'name': 'Agency Pipeline'},
  'stages': [{'id': 's0', 'name': 'New Lead', 'position': 0}, {'id': 's1', 'name': 'Qualified Lead', 'position': 1}, {'id': 's2', 'name': 'Appointment Booked', 'position': 2}],
  'opportunities': [{'id': 'o1', 'name': 'Marc deal', 'pipelineStageId': 's0', 'status': 'open', 'monetaryValue': 497, 'createdAt': '2026-11-21T10:00:00Z', 'contact': {'id': 'c1', 'name': 'Marc Tremblay', 'tags': ['mortgage']}},
                    {'id': 'o2', 'name': 'Sophie deal', 'pipelineStageId': 's1', 'status': 'open', 'monetaryValue': 697, 'createdAt': '2026-11-01T10:00:00Z', 'contact': {'id': 'c2', 'name': 'Sophie Gagnon', 'tags': []}}],
  'stats': {'total': 2, 'newLeads7d': 1, 'qualified': 1, 'appointments': 0, 'active': 2, 'won': 0, 'lost': 0, 'openValue': 1194}}

srv = subprocess.Popen([sys.executable, '-I', os.path.join(ROOT, 'tests', 'serve.py'), '8767'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []

def node_json(code):
    return json.loads(subprocess.run(['node', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True).stdout)

def wait_js(pg, expr, timeout=8):
    # Polls with page.evaluate (runs over the DevTools protocol, so the app's CSP still forbids eval in the page).
    end = time.time() + timeout
    while time.time() < end:
        if pg.evaluate(expr):
            return
        time.sleep(0.1)
    raise AssertionError(f'timed out waiting for: {expr}')
shots = os.environ.get('SHOTS')
shot = lambda pg, n: shots and pg.screenshot(path=f'{shots}/live-{n}.png', full_page=True)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        ctx.route('https://esm.sh/**', lambda r: r.fulfill(status=200, body=FAKE, headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'}))
        ctx.route('**/api/**', api)
        ctx.add_init_script('''(() => {
          window.__SAY = []; window.__SPOKEN = []; window.__LISTENS = 0;
          class FakeSR { start() { window.__LISTENS++; setTimeout(() => { const t = window.__SAY.shift(); if (t == null) { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return; }
            this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, 120); } abort() {} stop() {} }
          window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
          Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__SPOKEN.push(u.text); setTimeout(() => u.onend && u.onend(), 80); }, cancel() {} } });
        })()''')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and '/api/voice' not in (m.location or {}).get('url', '') and errors.append('console: ' + m.text))
        base = 'http://localhost:8767/'

        # 1. Signed out: login screen only, owner-only magic link
        pg.goto(base + '#brain'); pg.wait_for_selector('#login')
        shot(pg, 'login')
        assert pg.locator('.sidebar').count() == 0, 'shell shown while signed out'
        pg.fill('#em', 'stranger@example.com'); pg.click('#go'); pg.wait_for_selector('text=not the owner account')
        pg.fill('#em', 'owner@ciftron.com'); pg.click('#go'); pg.wait_for_selector('text=Check your inbox')
        otp = pg.evaluate('window.__FAKE_CALLS__.find(c => c[0]==="otp")[1]')
        assert otp['options']['shouldCreateUser'] is False, 'login must not create users'

        # 2. Signed in: bootstrap runs with a bearer token, Brain is live
        pg.evaluate("localStorage.setItem('fake.session','1')"); pg.goto(base + '#brain'); pg.reload()
        pg.wait_for_selector('text=Serves mortgage brokers')
        assert any(c[0] == 'brain' and c[2].get('action') == 'bootstrap' and c[3] == 'Bearer test-token' for c in calls), 'bootstrap not called with token'
        assert pg.locator('#demo-pill').inner_text() == 'Live'
        assert pg.locator('text=mortgage brokers; private lenders').count() == 1, 'source quote not shown'
        shot(pg, 'facts')

        # 3. Approve a proposed fact: version bumps
        pg.locator('.fact', has_text='Serves mortgage brokers').locator('[data-set=approved]').click()
        pg.wait_for_selector('.fact >> text=Serves mortgage brokers', state='detached')
        v = pg.evaluate("window.__FAKE_DB__.brain_facts.find(f=>f.id==='f2')")
        assert v['status'] == 'approved' and v['version'] == 2, v

        # 4. Stale save is refused, not overwritten
        pg.evaluate("window.__FAKE_DB__.brain_facts.find(f=>f.id==='f3').version = 9")  # changed in another tab
        pg.locator('.fact', has_text='Writes plain').locator('[data-set=approved]').click()
        pg.wait_for_selector('text=changed in another tab')
        assert pg.evaluate("window.__FAKE_DB__.brain_facts.find(f=>f.id==='f3').status") == 'proposed'

        # 5. Out-of-date banner and compile
        pg.wait_for_selector('#compile-top'); pg.click('#compile-top'); pg.wait_for_selector('text=Brand DNA v2 is active')
        shot(pg, 'dna')

        # 6. Edit a fact: marked as written by you
        pg.click('[data-tab=facts]'); pg.click('[data-st=approved]'); pg.locator('.fact', has_text='Runs Ciftron').locator('[data-edit]').click()
        pg.fill('#ft', 'Runs Ciftron in Canada.'); pg.click('[data-ok]'); pg.wait_for_selector('text=Runs Ciftron in Canada.')
        assert pg.evaluate("window.__FAKE_DB__.brain_facts.find(f=>f.id==='f1').authored_by") == 'me'

        # 7. Sources: process a pending file, paste-text upload goes through ingest + propose
        pg.click('[data-tab=sources]'); pg.wait_for_selector('text=Captions.pdf')
        shot(pg, 'sources')
        pg.locator('[data-ingest=s2]').click(); pg.wait_for_selector('text=Processed: 7 chunks')
        pg.click('#up'); pg.click('[data-k=text]'); pg.fill('#utn', 'Reel captions'); pg.fill('#ut', 'Your leads are not cold. Your follow-up is slow. ' * 3)
        pg.click('#uws'); pg.click('.modal [data-ok]'); pg.wait_for_selector('.overlay', state='detached')
        made = pg.evaluate("window.__FAKE_DB__.brain_sources.find(s=>s.name==='Reel captions')")
        assert made and made['is_writing_sample'] and made['kind'] == 'text', made
        assert any(c[2].get('action') == 'propose' and c[2].get('source_id') == made['id'] for c in calls)

        # 8. Search
        pg.click('[data-tab=search]'); pg.fill('#sq', 'brokers'); pg.click('#sgo'); pg.wait_for_selector('text=match 82%')

        # 9. Connections: live providers, save + test sends values, nothing echoed back
        pg.goto(base + '#connections'); pg.wait_for_selector('text=Key ending x7Qf')
        shot(pg, 'connections')
        pg.locator('.card', has_text='OpenAI').locator('[data-conn]').click()
        pg.fill('#k_api_key', 'sk-test-123456789'); pg.click('.modal [data-ok]'); pg.wait_for_selector('.overlay', state='detached')
        save = [c for c in calls if c[0] == 'keys' and c[2].get('values')][-1]
        assert save[2] == {'provider': 'openai', 'values': {'api_key': 'sk-test-123456789'}}, save
        assert any(c[0] == 'keys' and c[2].get('action') == 'test' and c[2].get('provider') == 'openai' for c in calls)
        assert 'sk-test' not in pg.content(), 'key leaked into the page'

        # 10. Danger zone needs the exact word
        pg.fill('#del', 'Delete'); assert not pg.locator('#delbtn').is_enabled()
        pg.fill('#del', 'delete'); assert pg.locator('#delbtn').is_enabled()

        # 11. Approvals: live count, approve creates a Content card, undo, edit, pass, trash and restore
        pg.goto(base + '#approvals'); pg.wait_for_selector('text=5 Reel hooks: mortgage follow-up')
        assert pg.locator('.nav-link[href="#approvals"] .count').inner_text() == '4', 'live pending count'
        shot(pg, 'approvals')
        pg.locator('.card', has_text='5 Reel hooks').locator('[data-act=approve]').click(); pg.wait_for_selector('text=Moved to Content')
        ap = pg.evaluate("window.__FAKE_DB__.approvals.find(a=>a.id==='ap1')"); ci = pg.evaluate("window.__FAKE_DB__.content_items.filter(c=>c.approval_id==='ap1')")
        assert ap['status'] == 'approved' and ap['version'] == 2 and len(ci) == 1 and ci[0]['approval_id'] == 'ap1' and ci[0]['format'] == 'Short video', (ap, ci)
        assert 'not cold' in ci[0]['hook']
        wait_js(pg, "document.querySelector('.nav-link[href=\"#approvals\"] .count').innerText === '3'")
        pg.locator('.toast button').first.click(); wait_js(pg, "window.__FAKE_DB__.approvals.find(a=>a.id==='ap1').status==='pending'")
        assert pg.evaluate("window.__FAKE_DB__.content_items.filter(c=>c.approval_id==='ap1').length") == 0, 'undo should remove the content card'
        pg.locator('.card', has_text='Prêt privé').locator('[data-act=edit]').click(); pg.fill('#eb', 'Votre banque a dit non? Parlons-en.'); pg.click('.modal [data-ok]')
        pg.wait_for_selector('text=Edited by you')
        ap2 = pg.evaluate("window.__FAKE_DB__.approvals.find(a=>a.id==='ap2')")
        assert ap2['authored_by'] == 'me' and ap2['payload']['original'] == 'Votre banque a dit non?', ap2
        pg.select_option('#flang', 'fr-qc'); assert pg.locator('.stack > .card').count() == 1; pg.select_option('#flang', '')
        pg.locator('.card', has_text='Welcome sequence').locator('[data-act=trash]').click(); pg.wait_for_selector('text=Welcome sequence', state='detached')
        pg.click('[data-tab=trash]'); pg.locator('[data-act=restore]').click(); pg.wait_for_selector('text=Restored')
        assert pg.evaluate("window.__FAKE_DB__.approvals.find(a=>a.id==='ap3').trashed_at") is None

        # 12. AI Chat: sends to /api/chat with Strategy Room flag, shows saved drafts and warnings, renders the thread
        pg.goto(base + '#chat'); pg.wait_for_selector('text=Ask about strategy')
        pg.evaluate('''() => { const d = window.__FAKE_DB__; const now = new Date().toISOString();
          d.threads.unshift({ id: 't1', owner_id: '11111111-1111-1111-1111-111111111111', agent_id: null, title: 'Mortgage reels', strategy_room: true, created_at: now, updated_at: now });
          d.messages.push({ id: 'm1', thread_id: 't1', role: 'user', content: 'Plan reels', created_at: now },
            { id: 'm2', thread_id: 't1', role: 'strategist', content: 'Fix follow-up first.', model: 'claude-sonnet-5-5', sources: [{ kind: 'dna', label: 'Brand DNA v1' }], created_at: now },
            { id: 'm3', thread_id: 't1', role: 'challenger', content: 'Check lead intent too.', model: 'gpt-6.1-sol', created_at: now },
            { id: 'm4', thread_id: 't1', role: 'verdict', content: 'Verdict: do both.\\nNext steps:\\n1. Instant SMS\\n2. Add a form question', created_at: now }); }''')
        pg.click('label:has(#room-toggle) span'); pg.fill('#prompt', 'Plan reels'); pg.click('#send')
        pg.wait_for_selector('text=Check lead intent too.'); pg.wait_for_selector('text=1 draft saved to Approvals'); pg.wait_for_selector('text=OpenAI has no credits left')
        sent = [c for c in calls if c[0] == 'chat'][-1][2]
        assert sent['strategy_room'] is True and sent['message'] == 'Plan reels' and sent['thread_id'] is None, sent
        assert pg.locator('.room.verdict li').count() == 2
        order = pg.evaluate("[...document.querySelectorAll('#scroll .msg b, #scroll .msg.me .bubble')].map(e => e.innerText.trim())")
        assert order.index('Plan reels') < order.index('Strategist') < order.index('Challenger') < order.index('Verdict'), order
        shot(pg, 'chat')
        pg.locator('[data-save=m4]').click(); pg.wait_for_selector('text=Saved to Approvals')
        assert pg.evaluate("window.__FAKE_DB__.approvals.some(a => a.payload.body.startsWith('Verdict: do both'))")

        # 13. AI Team: agents from the database, later agents locked, messages go to /api/chat with the agent slug
        pg.goto(base + '#team'); pg.wait_for_selector('[data-agent=content-strategist]')
        pg.locator('[data-agent=content-strategist]').click(); pg.fill('#amsg', '5 hooks for brokers'); pg.click('#asend')
        pg.wait_for_selector('text=1 draft saved to Approvals')
        sent = [c for c in calls if c[0] == 'chat'][-1][2]
        assert sent['agent_slug'] == 'content-strategist' and sent['message'] == '5 hooks for brokers', sent
        shot(pg, 'team')
        pg.locator('[data-agent=chief-of-staff]').click(); assert pg.locator('#aen').is_disabled(), 'Chief of Staff is pinned on'

        # 14. Home: real numbers from HighLevel and Meta
        pg.goto(base + '#home'); pg.wait_for_selector('text=Meta campaigns (7 days)', timeout=15000)
        txt = pg.locator('#view').inner_text()
        assert '$14.20' in txt and 'Mortgage leads' in txt and '-1.80 vs last week' in txt and '$1,194' in txt, txt[:600]
        shot(pg, 'home')

        # 15. Pipeline: board, forward-only, confirmed move with server preview, contact drawer, new contact
        pg.goto(base + '#pipeline'); pg.wait_for_selector('text=Sophie Gagnon')
        assert pg.locator('[data-col=s0] .kcard').count() == 1
        pg.locator('[data-op=o2]').drag_to(pg.locator('[data-col=s0]')); pg.wait_for_selector('text=forward-only')
        assert not any(c[0] == 'hl' and c[2].get('action') == 'preview' for c in calls), 'backward move must not reach HighLevel'
        pg.locator('[data-op=o1]').drag_to(pg.locator('[data-col=s1]')); pg.wait_for_selector('text=Preview move')
        prev = [c for c in calls if c[0] == 'hl' and c[2].get('action') == 'preview'][-1][2]
        assert prev['kind'] == 'move' and prev['input']['toStageId'] == 's1' and prev['input']['fromStageId'] == 's0', prev
        pg.wait_for_selector('text=HighLevel automations may trigger')
        shot(pg, 'pipeline-confirm')
        pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Sent to HighLevel: Done move')
        w = [c for c in calls if c[0] == 'hl' and c[2].get('action') == 'write'][-1][2]
        assert w['confirmed'] is True and w['input'] == prev['input'], w
        assert pg.locator('[data-col=s1] .kcard').count() == 2
        pg.locator('[data-op=o2]').click(); pg.wait_for_selector('text=marc@example.com', state='detached'); pg.wait_for_selector('.drawer >> text=Conversations are not shown')
        pg.locator('.drawer [data-close]').click()
        pg.click('#newc'); pg.fill('#fn', 'Luc'); pg.fill('#em', 'luc@example.com'); pg.fill('#tg', 'fr, investor'); pg.click('.modal [data-ok]')
        pg.wait_for_selector('text=Preview contact')
        prev = [c for c in calls if c[0] == 'hl' and c[2].get('action') == 'preview'][-1][2]
        assert prev['input']['tags'] == ['fr', 'investor'] and prev['input']['email'] == 'luc@example.com'
        pg.click('.modal [data-close]')
        assert not any(c[0] == 'hl' and c[2].get('action') == 'write' and c[2].get('kind') == 'contact' for c in calls), 'cancel must not write'
        shot(pg, 'pipeline')

        # 16. Approvals: approved post goes to Social Planner as a draft after review
        pg.evaluate('''() => window.__FAKE_DB__.approvals.push({ id: 'ap9', owner_id: '11111111-1111-1111-1111-111111111111', type: 'Written post', title: 'LinkedIn: why your CRM is empty', payload: { body: 'Most CRMs are empty because of slow follow-up.' }, tags: [], language: 'en', source_agent: 'Content Strategist', target_module: 'content', status: 'approved', trashed_at: null, authored_by: 'ai', version: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })''')
        pg.goto(base + '#approvals'); pg.click('[data-tab=approved]'); pg.locator('[data-act=hl-social]').click()
        pg.wait_for_selector('text=Ciftron IG'); pg.check('[data-acc]'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Preview social_draft')
        prev = [c for c in calls if c[0] == 'hl' and c[2].get('action') == 'preview'][-1][2]
        assert prev['input']['accountIds'] == ['acc1'] and 'slow follow-up' in prev['input']['text']
        pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Sent to HighLevel ×1')
        assert pg.evaluate("window.__FAKE_DB__.approvals.find(a=>a.id==='ap9').payload.hl_sent[0].kind") == 'social_draft'

        # 17. Settings: OS_ custom values
        pg.goto(base + '#connections'); pg.click('#cvload'); pg.wait_for_selector('text=OS_offer_1_name')
        pg.click('#cvnew'); pg.fill('#cvn', 'OS_offer_2_price'); pg.fill('#cvv', '97'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Preview custom_value')
        pg.click('.modal [data-close]')

        # 18. Jarvis: typed question goes to Jarvis mode and shows the answer; no transcript list
        pg.goto(base + '#home'); pg.wait_for_selector('#jv-canvas'); pg.wait_for_selector('text=agents are on')
        pg.click('[data-p="What needs me today?"]'); pg.wait_for_selector('text=one new lead came in today')
        j = [c for c in calls if c[0] == 'chat'][-1][2]
        assert j['mode'] == 'jarvis' and j['message'] == 'What needs me today?', j
        assert pg.locator('.jv-answer').count() == 1, 'only the latest answer is shown'
        shot(pg, 'jarvis')

        # 19. Content: board drag with version bump, drawer save, remix, research fetch, learning
        pg.goto(base + '#content'); pg.wait_for_selector('text=Follow-up speed Reel')
        pg.locator('[data-card=ci1]').drag_to(pg.locator('[data-col=Scripting]'))
        wait_js(pg, "window.__FAKE_DB__.content_items.find(c=>c.id==='ci1').stage==='Scripting'")
        assert pg.evaluate("window.__FAKE_DB__.content_items.find(c=>c.id==='ci1').version") == 2
        pg.locator('[data-card=ci1]').click(); pg.fill('#d-hook', 'Your leads are not cold'); pg.click('#d-save'); pg.wait_for_selector('text=Saved')
        assert pg.evaluate("window.__FAKE_DB__.content_items.find(c=>c.id==='ci1').authored_by") == 'me'
        pg.click('[data-tab=research]'); pg.wait_for_selector('text=11.89'); pg.locator('[data-remix="0"]').click(); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=2 drafts sent to Approvals')
        r = [c for c in calls if c[0] == 'studio'][-1][2]; assert r['action'] == 'remix' and r['formats'] == ['Short video', 'Carousel'] and r['idea']['score'] == 11.89, r
        pg.locator('[data-fetch=rc1]').click(); pg.wait_for_selector('text=12 posts')
        pg.click('[data-tab=learning]'); pg.wait_for_selector('text=You approve most Hooks'); pg.locator('[data-to=paused]').click()
        wait_js(pg, "window.__FAKE_DB__.learning_signals[0].state==='paused'")

        # 20. Emails: generate, edit, rewrite preview without overwriting, approve unlocks HighLevel template
        pg.goto(base + '#emails'); pg.wait_for_selector('text=Your call is booked'); assert pg.locator('#ehl').count() == 0, 'not approved yet'
        pg.click('#erw'); pg.fill('#ri', 'shorter'); pg.click('#rgo'); pg.wait_for_selector('text=Shorter body')
        assert pg.evaluate("window.__FAKE_DB__.email_sequences[0].emails[0].body") == 'Hi NAME', 'rewrite must not overwrite until chosen'
        pg.click('#ruse'); wait_js(pg, "window.__FAKE_DB__.email_sequences[0].emails[0].body==='Shorter body'")
        assert pg.evaluate("window.__FAKE_DB__.email_sequences[0].authored_by") == 'me'
        pg.evaluate('''() => window.__FAKE_DB__.approvals.push({ id: 'ap20', owner_id: '11111111-1111-1111-1111-111111111111', type: 'Email sequence', title: 'Call reminders', payload: { sequence_id: 'es1', body: 'x' }, tags: [], language: 'en', source_agent: 'Email Writer', target_module: 'emails', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })''')
        pg.goto(base + '#approvals'); pg.click('[data-tab=pending]'); pg.locator('.card', has_text='Call reminders').locator('[data-act=approve]').click(); pg.wait_for_selector('text=Moved to Emails')
        wait_js(pg, "window.__FAKE_DB__.email_sequences[0].status==='approved'")
        pg.goto(base + '#emails'); pg.wait_for_selector('#ehl'); pg.click('#ehl'); pg.wait_for_selector('text=Preview email_template'); pg.click('.modal [data-close]')

        # 21. Funnels: brief save, build, preview iframe, approved version sends a bundle after review
        pg.goto(base + '#funnels'); pg.wait_for_selector('text=Meta Ads review call')
        pg.fill('[data-b=promise]', 'See where leads leak'); pg.click('#build'); pg.wait_for_selector('text=Built v2')
        assert pg.evaluate("window.__FAKE_DB__.funnels[0].brief.promise") == 'See where leads leak'
        pg.click('[data-tab=page]'); pg.wait_for_selector('text=Find your lead leaks'); pg.click('#prev'); pg.wait_for_selector('#pvf'); pg.click('.modal [data-close]')
        pg.click('#send'); pg.wait_for_selector('text=Preview funnel_bundle')
        fb = [c for c in calls if c[0] == 'hl' and c[2].get('action') == 'preview'][-1][2]['input']
        assert fb['product']['name'].startswith('Lead Generation') and fb['emails'][0]['subject'] == 'Booked' and list(fb['customValues'])[0].startswith('OS_'), fb
        pg.click('.modal [data-close]')

        # 22. Graphics: brand board save, generate crops to exact size and queues an approval
        pg.goto(base + '#graphics'); pg.wait_for_selector('#ggo'); pg.select_option('#gfmt', 'YouTube thumbnail'); pg.fill('#ghead', 'Audit'); pg.click('#ggo')
        pg.wait_for_selector('text=Saved v1 (1280 × 720)')
        g = pg.evaluate("window.__FAKE_DB__.graphics[0]"); assert g['width'] == 1280 and g['height'] == 720, g
        assert pg.evaluate("window.__FAKE_DB__.approvals.some(a => a.type === 'Graphic' && a.target_module === 'graphics')")
        pg.click('[data-tab=board]'); pg.wait_for_selector('#bsave'); pg.click('#bsave'); pg.wait_for_selector('text=Brand board saved')
        assert pg.evaluate("window.__FAKE_DB__.brand_board.length") == 1

        # 23. Vault, Goals, Programs
        pg.goto(base + '#vault'); pg.wait_for_selector('text=Clean pricing page'); pg.locator('[data-brief=v1]').click(); pg.wait_for_selector('text=Brief saved here')
        pg.goto(base + '#goals'); pg.fill('#graw', 'Book 15 qualified appointments'); pg.click('#gadd'); pg.wait_for_selector('text=Goal added')
        assert [c for c in calls if c[0] == 'studio' and c[2].get('action') == 'goal'][-1][2]['raw'] == 'Book 15 qualified appointments'
        pg.evaluate('''() => window.__FAKE_DB__.approvals.push({ id: 'ap23', owner_id: '11111111-1111-1111-1111-111111111111', type: 'Program', title: 'Program proposal: Lead Response Bootcamp', payload: { body: 'x', program: { name: 'Lead Response Bootcamp', description: 'd', modules: [{ title: 'Speed', lessons: [{ title: 'First 10 minutes', summary: 's' }] }] } }, tags: [], language: 'en', source_agent: 'Content Strategist', target_module: 'programs', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })''')
        pg.goto(base + '#approvals'); pg.click('[data-tab=pending]'); pg.locator('.card', has_text='Lead Response Bootcamp').locator('[data-act=approve]').click(); pg.wait_for_selector('text=Moved to Programs')
        assert pg.evaluate("window.__FAKE_DB__.program_lessons.length") == 1
        pg.goto(base + '#programs'); pg.wait_for_selector('text=First 10 minutes'); pg.click('#send'); pg.wait_for_selector('text=Preview course')
        c = [x for x in calls if x[0] == 'hl' and x[2].get('action') == 'preview'][-1][2]['input']['program']
        assert c['modules'][0]['lessons'][0]['title'] == 'First 10 minutes', c
        pg.click('.modal [data-close]')
        shot(pg, 'programs')

        # 24. AI Team: every agent usable now
        pg.goto(base + '#team'); pg.wait_for_selector('[data-agent=researcher]'); pg.locator('[data-agent=researcher]').click()
        assert not pg.locator('#asend').is_disabled() or pg.locator('#aen').is_checked() is False

        # 25. Phase 6: routines on an agent, run now sends the routine id
        pg.goto(base + '#team'); pg.wait_for_selector('[data-agent=content-strategist]'); pg.locator('[data-agent=content-strategist]').click()
        pg.click('#rnew'); pg.wait_for_selector('#rp')
        assert 'five short video ideas' in pg.input_value('#rp')
        pg.click('.modal [data-c=weekly]'); pg.select_option('#rw', '3'); pg.click('.modal [data-l=fr-qc]'); pg.fill('#rt', 'Plan de la semaine')
        pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Plan de la semaine')
        rt = pg.evaluate("window.__FAKE_DB__.agent_routines[0]")
        assert rt['cadence'] == 'weekly' and rt['weekday'] == 3 and rt['language'] == 'fr-qc' and rt['enabled'] and rt['agent_id'] == 'ag1', rt
        assert pg.locator('text=Every Wednesday').count() == 1
        pg.locator('[data-rrun]').click(); pg.wait_for_selector('text=2 drafts saved to Approvals')
        assert [c for c in calls if c[0] == 'studio'][-1][2] == {'action': 'routine_run', 'id': rt['id']}
        pg.locator('label.toggle:has([data-ren])').click(); pg.wait_for_selector('text=Routine off')
        assert pg.evaluate("window.__FAKE_DB__.agent_routines[0].enabled") is False
        shot(pg, 'routines')

        # 26. Phase 6: MCP tokens and the edit log in Settings
        pg.goto(base + '#connections'); pg.wait_for_selector('text=Claude Code laptop')
        assert pg.locator('#mcpurl').inner_text().endswith('/api/mcp')
        assert pg.locator('text=Edited goal (current_value)').count() == 1
        pg.click('#mcpnew'); pg.fill('#mtn', 'Codex'); pg.click('.modal [data-s=read]'); pg.click('.modal [data-ok]')
        pg.wait_for_selector('text=Copy your token now')
        assert pg.locator('.modal').inner_text().count('cfos_' + 'T' * 43) == 2, 'token and command shown once'
        assert [c for c in calls if c[0] == 'account'][-1][2] == {'action': 'mcp_token_create', 'name': 'Codex', 'scope': 'read'}
        pg.click('.modal [data-close]')
        pg.locator('[data-undo="7"]').click(); pg.wait_for_selector('text=Restored the previous value')
        assert [c for c in calls if c[0] == 'account'][-1][2] == {'action': 'mcp_undo', 'id': 7}
        shot(pg, 'mcp')

        # 27. Phase 7: error log card, clear, and browser errors reported to the server
        pg.wait_for_selector('text=OpenRouter timed out')
        pg.click('#errclear'); pg.wait_for_selector('text=Error log cleared')
        assert [c for c in calls if c[0] == 'account'][-1][2] == {'action': 'errors_clear'}
        pg.evaluate("window.dispatchEvent(new ErrorEvent('error', { message: 'Test boom', error: new Error('Test boom') }))")
        pg.wait_for_timeout(300)
        logged = [c for c in calls if c[0] == 'account' and c[2].get('action') == 'log_error']
        assert len(logged) == 1 and logged[0][2]['message'] == 'Test boom' and logged[0][2]['route'] == '#connections', logged
        pg.evaluate("window.dispatchEvent(new ErrorEvent('error', { message: 'Test boom', error: new Error('Test boom') }))")
        pg.wait_for_timeout(300)
        assert len([c for c in calls if c[0] == 'account' and c[2].get('action') == 'log_error']) == 1, 'same error reported twice'

        # 28. Team: the owner adds a member
        pg.wait_for_selector('#mem'); pg.fill('#mem', 'helper@example.com'); pg.click('#minvbtn'); pg.wait_for_selector('text=helper@example.com added')
        assert [c for c in calls if c[0] == 'account'][-1][2] == {'action': 'member_invite', 'email': 'helper@example.com'}
        shot(pg, 'team-owner')

        # 29. Signed in as a member: owner data, no keys, MCP, export or danger zone
        pg.evaluate("localStorage.setItem('fake.member', '1')"); pg.goto(base + '#connections'); pg.reload()
        pg.wait_for_selector('text=You are a team member')
        assert pg.locator('.sidebar-foot').inner_text().count('Team member') == 1
        assert pg.locator('[data-conn]').count() == 0 and pg.locator('[data-test]').count() == 0 and pg.locator('[data-rm]').count() == 0
        assert pg.locator('text=Only the owner can change keys.').count() > 0
        assert pg.locator('#mcpcard').count() == 0 and pg.locator('#exp').count() == 0 and pg.locator('#delbtn').count() == 0
        assert pg.locator('#errcard').count() == 1
        shot(pg, 'team-member')
        pg.goto(base + '#team'); pg.wait_for_selector('[data-agent=copywriter], [data-agent=content-strategist]')
        pg.locator('[data-agent=content-strategist]').click(); pg.click('#rnew'); pg.wait_for_selector('#rp'); pg.fill('#rt', 'Member routine'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Member routine')
        rt = pg.evaluate("window.__FAKE_DB__.agent_routines.find(r => r.title === 'Member routine')")
        assert rt['owner_id'] == '11111111-1111-1111-1111-111111111111', 'member rows belong to the owner'
        pg.evaluate("localStorage.removeItem('fake.member')")

        # 30. Phase 8: approving a funnel idea keeps its stage, format and hook on the card
        pg.goto(base + '#approvals'); pg.wait_for_selector('text=Book the leak audit')
        pg.locator('.card', has_text='Book the leak audit').locator('[data-act=approve]').click(); pg.wait_for_selector('text=Moved to Content')
        card = pg.evaluate("window.__FAKE_DB__.content_items.find(c => c.title === 'Book the leak audit')")
        assert card['funnel_stage'] == 'bofu' and card['format'] == 'Carousel' and card['hook'].startswith('Your ads are fine'), card

        # 30b. Phase 8: my feed, Apify spend, content funnel
        pg.goto(base + '#content'); pg.reload(); pg.wait_for_selector('[data-tab=feed]'); pg.click('[data-tab=feed]')
        pg.wait_for_selector('text=Your winners'); assert pg.locator('text=My Reel about follow-up speed').count() >= 1
        assert pg.locator('text=3.1× your median').count() >= 1 and pg.locator('text=62') .count() >= 0
        assert pg.locator('text=@sample.coach').count() == 0, 'other creators stay out of My feed'
        pg.click('[data-fp=LinkedIn]'); pg.wait_for_selector('text=LinkedIn post on CRM leaks'); assert pg.locator('text=My Reel about follow-up speed').count() == 0
        pg.click('[data-fp=all]'); pg.locator('[data-myremix]').first.click(); pg.wait_for_selector('text=Remix into my voice'); pg.click('.modal [data-close]')
        shot(pg, 'my-feed')
        pg.click('[data-tab=research]'); pg.wait_for_selector('#spend'); assert '$0.40' in pg.locator('#spend').inner_text() and '$0.10' in pg.locator('#spend').inner_text()
        pg.click('[data-tab=funnel]'); pg.wait_for_selector('#fgo'); pg.select_option('#ft', 'o1'); pg.click('#fgo'); pg.wait_for_selector('text=9 ideas sent to Approvals')
        fb = [c for c in calls if c[0] == 'studio'][-1][2]
        assert fb['action'] == 'content_funnel' and fb['offer_id'] == 'o1' and fb['counts'] == {'tofu': 4, 'mofu': 3, 'bofu': 2}, fb
        shot(pg, 'funnel')

        # 31. Phase 8: voice playbook
        pg.goto(base + '#brain'); pg.wait_for_selector('[data-tab=playbook]'); pg.click('[data-tab=playbook]')
        pg.wait_for_selector('text=How fast should a broker call a new lead?'); pg.locator('[data-pb=vp1][data-to=approved]').click(); pg.wait_for_selector('text=Approved (1)')
        assert pg.evaluate("window.__FAKE_DB__.voice_playbook[0].status") == 'approved' and pg.evaluate("window.__FAKE_DB__.voice_playbook[0].version") == 2
        pg.click('#pbadd'); pg.fill('#pq', 'Do you work with new agents?'); pg.fill('#pa', 'Yes, if they can answer leads within the hour.'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Do you work with new agents?')
        mine = pg.evaluate("window.__FAKE_DB__.voice_playbook.find(p => p.question === 'Do you work with new agents?')")
        assert mine['authored_by'] == 'me' and mine['status'] == 'approved'
        pg.click('#pbgo'); pg.wait_for_selector('text=2 pairs to review')
        shot(pg, 'playbook')

        # 32. Phase 8: model picker in AI Chat
        pg.goto(base + '#chat'); pg.wait_for_selector('#model'); pg.select_option('#model', '__load'); pg.wait_for_selector('#model option[value="or:google/gemini-x"]', state='attached')
        pg.select_option('#model', 'or:google/gemini-x'); pg.fill('#prompt', 'Compare two hooks'); pg.click('#send'); pg.wait_for_timeout(600)
        sent = [c for c in calls if c[0] == 'chat'][-1][2]
        assert sent['model'] == 'or:google/gemini-x', sent
        pg.evaluate("localStorage.removeItem('os.chatModel')")

        # 33. Phase 9: calls, review, Brain, playbook, Meet import, paste
        pg.goto(base + '#calls'); pg.wait_for_selector('text=Pricing-focused discovery call.')
        assert pg.locator('text=Tie it to lost leads first').count() == 1 and pg.locator('text=Send proposal Friday').count() == 1
        pg.click('#crev'); pg.wait_for_selector('text=Review ready')
        assert [c for c in calls if c[0] == 'studio'][-1][2] == {'action': 'call_analyze', 'id': 'cl1'}
        pg.click('#cbrain'); pg.wait_for_selector('text=Added to the Brain')
        assert any(c[0] == 'brain' and c[2] == {'action': 'ingest', 'source_id': 's1'} for c in calls)
        pg.click('#cpb'); pg.wait_for_selector('text=1 answer sent to Brain')
        pg.click('#meet'); pg.wait_for_selector('.modal >> text=Coaching with Sophie'); pg.check('[data-mi="0"]'); pg.select_option('[data-mk="0"]', 'coaching'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=1 call imported')
        mi = [c for c in calls if c[0] == 'google' and c[2].get('action') == 'meet_import'][-1][2]
        assert mi['transcript'] == 'conferenceRecords/r9/transcripts/t9' and mi['kind'] == 'coaching', mi
        pg.click('#paste'); pg.fill('#pt', 'Coaching with Leo'); pg.fill('#px', 'Leo: How do I get more leads?\nJasinthan: Start with your follow-up speed, then fix the form.'); pg.click('.modal [data-ok]'); pg.wait_for_selector('h2:has-text("Coaching with Leo")')
        cl = pg.evaluate("window.__FAKE_DB__.calls.find(c => c.title === 'Coaching with Leo')")
        assert cl['source'] == 'paste' and cl['speakers'] == ['Leo', 'Jasinthan'] and cl['owner_id'] == '11111111-1111-1111-1111-111111111111', cl
        shot(pg, 'calls')

        # 34. Phase 9: revenue
        pg.goto(base + '#revenue'); pg.wait_for_selector('text=Monthly recurring')
        assert '$497' in pg.locator('.stat').first.inner_text()
        pg.click('[data-cur=CAD]'); pg.wait_for_selector('text=By month (CAD)'); assert 'CA$1,500' in pg.locator('.stat').nth(1).inner_text()
        assert pg.locator('svg[aria-label="Revenue by month in CAD"] rect').count() == 6
        pg.click('#radd'); pg.fill('#rc', 'Investimaitre'); pg.fill('#ra', '800'); pg.select_option('#ry', 'CAD'); pg.check('#rr'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Logged')
        re = pg.evaluate("window.__FAKE_DB__.revenue_entries[0]")
        assert re['amount'] == 800 and re['currency'] == 'CAD' and re['recurring'] is True and re['client'] == 'Investimaitre', re
        shot(pg, 'revenue')

        # 35. Phase 9: Google sign-in from Settings, and today's calendar on Home
        pg.goto(base + '#connections'); pg.wait_for_selector('#gin'); pg.click('#gin'); pg.wait_for_selector('text=Signed in with Google')
        assert [c for c in calls if c[0] == 'google'][-1][2] == {'action': 'start'}
        pg.goto(base + '#home'); pg.wait_for_selector('#todaycal'); assert pg.locator('text=Discovery call with Marc').count() == 1
        assert pg.locator('#homerev').count() == 1
        # 36. Phase 10: designed funnel pages
        pg.goto(base + '#funnels'); pg.wait_for_selector('text=Meta Ads review call'); pg.click('[data-tab=design]'); pg.wait_for_selector('text=Page v1')
        pg.select_option('#dstyle', 'light'); pg.fill('#dnote', 'Photo of me by the headline'); pg.click('#dbuild'); pg.wait_for_selector('text=Page v2 is in Approvals')
        pb = [c for c in calls if c[0] == 'studio'][-1][2]
        assert pb['action'] == 'page_build' and pb['funnel_id'] == 'fn1' and pb['version_id'] == 'fv1' and pb['style'] == 'light' and pb['instruction'] == 'Photo of me by the headline', pb
        pg.click('[data-pv=pg1]'); pg.wait_for_selector('#pvf'); assert 'Find your lead leaks' in pg.frame_locator('#pvf').locator('h1').inner_text(); pg.click('.modal [data-close]')
        pg.uncheck('[data-share=pg1]'); pg.wait_for_selector('text=Preview link off')
        assert pg.evaluate("window.__FAKE_DB__.funnel_pages[0].shared") is False
        hlc = pg.evaluate("import('/assets/js/screens/funnels-live.js').then(m => m.forHighLevel(window.__FAKE_DB__.funnel_pages[0].html))")
        assert hlc.startswith('\n<style>body{background:#111') and '<h1>Find your lead leaks</h1>' in hlc and '<html' not in hlc and '<body' not in hlc, hlc
        shot(pg, 'funnel-design')
        pg.evaluate('''() => window.__FAKE_DB__.approvals.push({ id: 'apfp', owner_id: '11111111-1111-1111-1111-111111111111', type: 'Funnel page', title: 'Meta Ads review call page v1', payload: { body: 'Designed page', page_id: 'pg1', funnel_id: 'fn1', preview_path: '/p/tok_abcdefghijklmnopqrstu' }, tags: ['funnel', 'page'], language: 'en', source_agent: 'Funnel Builder', target_module: 'funnels', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })''')
        pg.goto(base + '#approvals'); pg.wait_for_selector('text=Meta Ads review call page v1')
        assert pg.locator('a[href="/p/tok_abcdefghijklmnopqrstu"]').count() == 1
        pg.click('[data-act=approve][data-id=apfp]'); pg.wait_for_timeout(500)
        assert pg.evaluate("window.__FAKE_DB__.funnel_pages[0].status") == 'approved'

        # 37. Phase 10: program slides, viewer edits, PowerPoint download
        prog = 'pr9'
        pg.evaluate('''() => { const o = '11111111-1111-1111-1111-111111111111', now = new Date().toISOString(); window.__FAKE_DB__.programs.unshift({ id: 'pr9', owner_id: o, name: 'Lead Response Bootcamp', description: 'd', stage: 'draft', version: 1, created_at: '2099-01-01T00:00:00Z', updated_at: now });
          window.__FAKE_DB__.program_modules.push({ id: 'pm9', owner_id: o, program_id: 'pr9', title: 'Speed', sort: 0 }); window.__FAKE_DB__.program_lessons.push({ id: 'pl9', owner_id: o, module_id: 'pm9', title: 'First 10 minutes', body: 'Call fast', file_paths: [], sort: 0 }); }''')
        pg.goto(base + '#programs'); pg.wait_for_selector('#mkslides'); pg.click('#mkslides'); pg.select_option('#ss', 'dark'); pg.select_option('#sp', '4'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=6 slides made')
        sb = [c for c in calls if c[0] == 'studio'][-1][2]
        assert sb == {'action': 'slides_build', 'program_id': prog, 'module_id': None, 'style': 'dark', 'language': 'en', 'per_lesson': 4}, sb
        pg.evaluate('''(p) => window.__FAKE_DB__.program_decks.push({ id: 'dk1', owner_id: '11111111-1111-1111-1111-111111111111', program_id: p, module_id: null, title: 'Lead Response Bootcamp', style: 'brand', status: 'draft', authored_by: 'ai', version: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          slides: [{ layout: 'title', title: 'Lead Response Bootcamp', subtitle: 'Speed wins', bullets: [], left: [], right: [], quote: '', attribution: '', notes: '' }, { layout: 'bullets', title: 'Why speed', subtitle: '', bullets: ['Leads cool fast', '[EXAMPLE NEEDED]'], left: [], right: [], quote: '', attribution: '', notes: 'Say it' }, { layout: 'cta', title: 'Ready?', subtitle: 'Book a call', bullets: [], left: [], right: [], quote: '', attribution: '', notes: '' }] })''', prog)
        pg.goto(base + '#home'); pg.goto(base + '#programs'); pg.wait_for_selector('[data-deck=dk1]'); pg.click('[data-deck=dk1]'); pg.wait_for_selector('.modal .sl')
        assert 'Lead Response Bootcamp' in pg.locator('.modal .sl h1').inner_text()
        pg.click('#dnext'); pg.wait_for_selector('.modal .sl mark'); pg.fill('#dedit [data-k=title]', 'Why speed matters'); pg.fill('#dedit [data-k=bullets]', 'Leads cool fast\nCall in five minutes')
        assert pg.locator('.modal .sl h2').inner_text() == 'Why speed matters'
        shot(pg, 'slides')
        pg.click('#dsave'); pg.wait_for_selector('text=Slides saved')
        dk = pg.evaluate("window.__FAKE_DB__.program_decks.find(d => d.id === 'dk1')")
        assert dk['version'] == 3 and dk['authored_by'] == 'me' and dk['slides'][1]['title'] == 'Why speed matters' and dk['slides'][1]['bullets'] == ['Leads cool fast', 'Call in five minutes'], dk
        with pg.expect_download() as dl: pg.click('[data-pptx=dk1]')
        assert dl.value.suggested_filename == 'Lead-Response-Bootcamp.pptx'
        assert [c for c in calls if c[0] == 'studio'][-1][2] == {'action': 'slides_pptx', 'deck_id': 'dk1'}
        pg.evaluate('''() => window.__FAKE_DB__.approvals.push({ id: 'apdk', owner_id: '11111111-1111-1111-1111-111111111111', type: 'Slides', title: 'Slides: Lead Response Bootcamp', payload: { body: '1. Title', deck_id: 'dk1' }, tags: ['slides'], language: 'en', source_agent: 'Content Strategist', target_module: 'programs', status: 'pending', trashed_at: null, authored_by: 'ai', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })''')
        pg.goto(base + '#approvals'); pg.wait_for_selector('text=Slides: Lead Response Bootcamp'); pg.click('[data-act=approve][data-id=apdk]'); pg.wait_for_timeout(500)
        dk = pg.evaluate("window.__FAKE_DB__.program_decks.find(d => d.id === 'dk1')")
        assert dk['status'] == 'approved' and dk['version'] == 4, dk
        # 38. Phase 11: 17 agents, new agent routines
        seeds = node_json("import('./api/_lib/chat.js').then(m => console.log(JSON.stringify(m.AGENT_SEEDS.slice(9).map(({ slug, name, role, sort }) => ({ slug, name, role, sort })))))")
        pg.evaluate('''(seeds) => { for (const a of seeds) window.__FAKE_DB__.agents.push({ id: 'ag_' + a.slug, owner_id: '11111111-1111-1111-1111-111111111111', instructions: 'x', enabled: true, pinned: false, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...a }); }''', seeds)
        pg.goto(base + '#home'); pg.goto(base + '#team'); pg.wait_for_selector('text=Project Manager')
        for a in seeds: assert pg.locator(f'text={a["name"]}').count() >= 1, a['name']
        pg.locator('text=Sales Coach').first.click(); pg.wait_for_selector('#amsg:not([disabled])')
        pg.locator('text=Project Manager').first.click(); pg.wait_for_selector('text=Reads your live business numbers')
        shot(pg, 'team17')

        # 39. Phase 11: hands-free Jarvis conversation: answers, listens again, ends on "goodbye"
        pg.evaluate("window.__SAY = ['How is my pipeline?', 'goodbye']; window.__SPOKEN = []; window.__LISTENS = 0")
        pg.goto(base + '#home'); pg.wait_for_selector('#jv-conv'); pg.click('#jv-conv')
        wait_js(pg, "window.__SPOKEN.length >= 2", 10)
        assert pg.evaluate("window.__SPOKEN") == ['Two drafts are waiting and one new lead came in today.', 'Okay.'], pg.evaluate("window.__SPOKEN")
        assert pg.evaluate("window.__LISTENS") == 2, 'listened again after answering'
        assert [c for c in calls if c[0] == 'chat'][-1][2]['message'] == 'How is my pipeline?'
        wait_js(pg, "document.querySelector('#jv-conv').getAttribute('aria-pressed') === 'false'", 5)
        assert pg.locator('.jv-answer:not(.hidden)').count() == 0, 'spoken answers are not shown as a transcript'
        # Two silences end the conversation.
        pg.evaluate("window.__SAY = []; window.__LISTENS = 0"); pg.click('#jv-conv'); pg.wait_for_selector('text=Conversation ended: I did not hear anything.')
        assert pg.evaluate("window.__LISTENS") == 2

        # 40. Phase 11: Tella in Content
        pg.goto(base + '#content'); pg.wait_for_selector('[data-tab=tella]'); pg.click('[data-tab=tella]'); pg.wait_for_selector('text=Why leads go cold')
        pg.click('[data-tlb="0"]'); pg.wait_for_selector('text=In Brain')
        assert any(c[0] == 'studio' and c[2] == {'action': 'tella_import', 'video_id': 'vid_1'} for c in calls)
        assert any(c[0] == 'brain' and c[2] == {'action': 'ingest', 'source_id': 'src_t1'} for c in calls)
        pg.click('[data-tlp="0"]'); pg.uncheck('[data-tf="Carousel"]'); pg.check('[data-tf="Email"]'); pg.select_option('#tll', 'fr-qc'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=3 drafts sent to Approvals')
        tr = [c for c in calls if c[0] == 'studio'][-1][2]
        assert tr == {'action': 'tella_repurpose', 'video_id': 'vid_1', 'formats': ['Short video', 'Written post', 'Email'], 'language': 'fr-qc'}, tr
        shot(pg, 'tella')

        # 41. Phase 11: custom API connection in Settings, then attach its data in AI Chat
        pg.evaluate('''() => window.__FAKE_DB__.custom_connections.push({ id: 'cc1', owner_id: '11111111-1111-1111-1111-111111111111', name: 'Calendly', base_url: 'https://api.calendly.com', auth: 'bearer', auth_name: null, endpoints: [{ name: 'Upcoming events', path: '/scheduled_events' }], last_status: 'ok', last_message: 'Works', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })''')
        pg.goto(base + '#connections'); pg.wait_for_selector('text=Custom API connections'); pg.wait_for_selector('text=key ending 3456')
        pg.click('#ccadd'); pg.fill('#ccn', 'Stripe reports'); pg.fill('#ccu', 'https://api.example-reports.com'); pg.select_option('#cca', 'header'); pg.fill('#ccan', 'X-API-Key'); pg.fill('#cck', 'rk_test_9999')
        pg.fill('[data-epn]', 'Summary'); pg.fill('[data-epp]', '/v1/summary'); pg.click('.modal [data-ok]'); pg.wait_for_selector('text=Saved. Click Test to check it.')
        cs = [c for c in calls if c[0] == 'keys' and c[2].get('action') == 'custom_save'][-1][2]
        assert cs['connection'] == {'name': 'Stripe reports', 'base_url': 'https://api.example-reports.com', 'auth': 'header', 'auth_name': 'X-API-Key', 'endpoints': [{'name': 'Summary', 'path': '/v1/summary'}]} and cs['key'] == 'rk_test_9999', cs
        pg.click('[data-cct=cc1]'); pg.wait_for_selector('text=Works: GET /scheduled_events returned 200')
        shot(pg, 'custom-connections')
        pg.goto(base + '#chat'); pg.wait_for_selector('#adata'); pg.fill('#prompt', 'Who am I meeting this week?'); pg.click('#adata'); pg.wait_for_selector('#adgo')
        assert pg.input_value('#adp') == '/scheduled_events'
        pg.click('#adgo'); pg.wait_for_selector('#adout >> text=Discovery with Marc'); pg.click('.modal [data-ok]')
        val = pg.input_value('#prompt')
        assert val.startswith('Who am I meeting this week?') and 'Data from Calendly (GET /scheduled_events)' in val and 'Discovery with Marc' in val, val
        assert [c for c in calls if c[0] == 'studio'][-1][2] == {'action': 'custom_fetch', 'id': 'cc1', 'path': '/scheduled_events'}

        # 42. Phase 11: design rules on the brand board
        pg.goto(base + '#graphics'); pg.wait_for_selector('[data-tab=board]'); pg.click('[data-tab=board]'); pg.wait_for_selector('#drules')
        pg.fill('#drules', 'Lots of white space. No gradients.'); pg.click('#bsave'); pg.wait_for_selector('text=Brand board saved')
        assert pg.evaluate("window.__FAKE_DB__.brand_board[0].design_rules") == 'Lots of white space. No gradients.'
        b.close()
finally:
    srv.terminate()
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('OK: live mode e2e (login, Brain, keys, Approvals, Chat, Team, Pipeline, HighLevel writes, Jarvis, Content, Emails, Funnels, Graphics, Vault, Goals, Programs, Routines, MCP, Error log, CSP, Team, My feed, Funnel, Playbook, Models, Calls, Revenue, Google, Funnel pages, Slides, 17 agents, Conversation, Tella, Custom connections, Design rules)')
