"""Live-mode UI test with a fake supabase-js and stubbed /api routes.
Checks the login gate, Brain fact review with version checks, uploads, Brand DNA and Connections."""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE = open(os.path.join(ROOT, 'tests/fixtures/fake-supabase.js')).read()
calls = []
providers = [
    {'id': 'highlevel', 'name': 'HighLevel', 'connected': False, 'phase': 4, 'status': 'none', 'fields': {'secret': ['private_integration_token'], 'plain': ['location_id']}, 'config': {}},
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
    elif path == 'brain' and body.get('action') == 'search': out = {'results': [{'source_name': 'about_me', 'content': 'mortgage brokers', 'similarity': 0.82}]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(out))

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

        # 11. Demo screens still render in live mode and say which phase makes them real
        pg.goto(base + '#pipeline'); pg.wait_for_selector('#view h1'); assert 'Phase 4' in pg.locator('#demo-pill').inner_text()
        b.close()
finally:
    srv.terminate()
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('OK: live mode e2e (login gate, facts, version conflict, compile, uploads, search, keys, danger zone)')
