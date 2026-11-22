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
    if path == 'config': out = {'supabaseUrl': 'https://fake.supabase.co', 'supabaseAnonKey': 'anon', 'phase': 2}
    elif path == 'keys' and req.method == 'GET': out = {'providers': providers}
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
    elif path == 'meta': out = {'range': 'last_7d', 'spend': 198.8, 'leads': 14, 'cpl': 14.2, 'previous': {'spend': 160, 'leads': 10, 'cpl': 16}, 'campaigns': [{'id': '1', 'name': 'Mortgage leads', 'spend': 198.8, 'leads': 14, 'cpl': 14.2}]}
    elif path == 'chat': out = {'thread_id': 't1', 'messages': [], 'drafts': [{'id': 'new', 'title': 'Hooks', 'type': 'Hooks'}], 'warnings': ['Brain search skipped: OpenAI has no credits left.']}
    elif path == 'brain' and body.get('action') == 'search': out = {'results': [{'source_name': 'about_me', 'content': 'mortgage brokers', 'similarity': 0.82}]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(out))

BOARD = {'pipelines': [{'id': 'p1', 'name': 'Agency Pipeline'}], 'pipeline': {'id': 'p1', 'name': 'Agency Pipeline'},
  'stages': [{'id': 's0', 'name': 'New Lead', 'position': 0}, {'id': 's1', 'name': 'Qualified Lead', 'position': 1}, {'id': 's2', 'name': 'Appointment Booked', 'position': 2}],
  'opportunities': [{'id': 'o1', 'name': 'Marc deal', 'pipelineStageId': 's0', 'status': 'open', 'monetaryValue': 497, 'createdAt': '2026-11-21T10:00:00Z', 'contact': {'id': 'c1', 'name': 'Marc Tremblay', 'tags': ['mortgage']}},
                    {'id': 'o2', 'name': 'Sophie deal', 'pipelineStageId': 's1', 'status': 'open', 'monetaryValue': 697, 'createdAt': '2026-11-01T10:00:00Z', 'contact': {'id': 'c2', 'name': 'Sophie Gagnon', 'tags': []}}],
  'stats': {'total': 2, 'newLeads7d': 1, 'qualified': 1, 'appointments': 0, 'active': 2, 'won': 0, 'lost': 0, 'openValue': 1194}}

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
shots = os.environ.get('SHOTS')
shot = lambda pg, n: shots and pg.screenshot(path=f'{shots}/live-{n}.png', full_page=True)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        ctx.route('https://esm.sh/**', lambda r: r.fulfill(status=200, body=FAKE, headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'}))
        ctx.route('**/api/**', api)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and errors.append('console: ' + m.text))
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
        assert pg.locator('.nav-link[href="#approvals"] .count').inner_text() == '3', 'live pending count'
        shot(pg, 'approvals')
        pg.locator('.card', has_text='5 Reel hooks').locator('[data-act=approve]').click(); pg.wait_for_selector('text=Moved to Content')
        ap = pg.evaluate("window.__FAKE_DB__.approvals.find(a=>a.id==='ap1')"); ci = pg.evaluate("window.__FAKE_DB__.content_items")
        assert ap['status'] == 'approved' and ap['version'] == 2 and len(ci) == 1 and ci[0]['approval_id'] == 'ap1' and ci[0]['format'] == 'Short video', (ap, ci)
        assert 'not cold' in ci[0]['hook']
        pg.wait_for_function("document.querySelector('.nav-link[href=\"#approvals\"] .count').innerText === '2'")
        pg.locator('.toast button').first.click(); pg.wait_for_function("window.__FAKE_DB__.approvals.find(a=>a.id==='ap1').status==='pending'")
        assert pg.evaluate("window.__FAKE_DB__.content_items.length") == 0, 'undo should remove the content card'
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
        pg.goto(base + '#team'); pg.wait_for_selector('text=Arrives in Phase 5')
        pg.locator('[data-agent=researcher]').click(); assert pg.locator('#asend').is_disabled() and pg.locator('#aen').is_disabled()
        pg.locator('[data-agent=content-strategist]').click(); pg.fill('#amsg', '5 hooks for brokers'); pg.click('#asend')
        pg.wait_for_selector('text=1 draft saved to Approvals')
        sent = [c for c in calls if c[0] == 'chat'][-1][2]
        assert sent['agent_slug'] == 'content-strategist' and sent['message'] == '5 hooks for brokers', sent
        shot(pg, 'team')
        pg.locator('[data-agent=chief-of-staff]').click(); assert pg.locator('#aen').is_disabled(), 'Chief of Staff is pinned on'

        # 14. Home: real numbers from HighLevel and Meta
        pg.goto(base + '#home'); pg.wait_for_selector('text=Meta campaigns (7 days)')
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

        # 18. Demo screens still render in live mode and say which phase makes them real
        pg.goto(base + '#funnels'); pg.wait_for_selector('#view h1'); assert 'Phase 5' in pg.locator('#demo-pill').inner_text()
        b.close()
finally:
    srv.terminate()
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('OK: live mode e2e (login, Brain, keys, Approvals, Chat, Strategy Room, Team, Home, Pipeline, HighLevel writes, custom values)')
