"""Phase 1 smoke test: every screen, light and dark, desktop and mobile. Fails on any console or page error."""
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = ['home','chat','team','approvals','content','funnels','emails','graphics','programs','brain','vault','pipeline','revenue','calls','goals','connections']
shots = os.environ.get('SHOTS')
srv = subprocess.Popen([sys.executable, '-I', os.path.join(ROOT, 'tests', 'serve.py'), '8765'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for theme in ['light', 'dark']:
            for vp in [(1440, 900), (390, 844)]:
                ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]})
                ctx.add_init_script(f"localStorage.setItem('os.theme','{theme}')")
                pg = ctx.new_page()
                pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and '404 (File not found)' not in m.text and errors.append(f'{theme} {vp} console: {m.text}'))
                pg.on('pageerror', lambda e: errors.append(f'{theme} {vp} pageerror: {e}'))
                for r in ROUTES:
                    pg.goto(f'http://localhost:8765/#{r}')
                    pg.wait_for_selector('#view h1', timeout=5000)
                    if pg.query_selector('#view .empty h2'):
                        errors.append(f'{theme} {vp} {r}: screen failed to render')
                    if shots and vp[0] > 1000:
                        pg.screenshot(path=f'{shots}/{theme}-{r}.png', full_page=True)
                    elif shots and theme == 'light':
                        pg.screenshot(path=f'{shots}/mobile-{r}.png')
                ctx.close()
        # Interaction checks
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'interaction pageerror: {e}'))
        pg.goto('http://localhost:8765/#approvals'); pg.wait_for_selector('[data-act=approve]')
        before = pg.locator('[data-act=approve]').count(); pg.locator('[data-act=approve]').first.click()
        assert pg.locator('[data-act=approve]').count() == before - 1, 'approve did not remove item'
        pg.goto('http://localhost:8765/#pipeline'); pg.wait_for_selector('[data-op]'); pg.locator('[data-op]').first.click()
        pg.locator('#fwd').click(); pg.wait_for_selector('[data-ok]'); assert 'Confirm' in pg.locator('[data-ok]').inner_text()
        pg.locator('[data-ok]').click(); pg.wait_for_selector('.toast')
        pg.goto('http://localhost:8765/#chat'); pg.fill('#prompt', 'test'); pg.click('#send'); pg.wait_for_selector('text=Demo reply')
        pg.click('label:has(#room-toggle) span'); pg.wait_for_selector('text=Verdict')
        pg.goto('http://localhost:8765/#connections'); pg.fill('#del', 'delete'); assert pg.locator('#delbtn').is_enabled()
        pg.goto('http://localhost:8765/#goals'); pg.fill('#graw', 'Book 20 appointments'); pg.click('#gadd'); pg.wait_for_selector('text=20 opportunities')
        pg.goto('http://localhost:8765/#funnels'); pg.click('#prev'); pg.wait_for_selector('#pvf')
        pg.locator('[data-close]').last.click()
        pg.locator('.seg [data-lang=fr]').click(); pg.wait_for_selector('text=Objectifs')
        b.close()
finally:
    srv.terminate()
if errors:
    print('\n'.join(errors)); sys.exit(1)
print(f'OK: {len(ROUTES)} screens x 2 themes x 2 viewports, plus interaction checks')
