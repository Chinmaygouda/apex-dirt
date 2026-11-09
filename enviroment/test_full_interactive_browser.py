import time
import sys
from playwright.sync_api import sync_playwright

def test_full_interactive_experience():
    print('Starting Comprehensive Interactive Browser Test...')
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--use-gl=angle',
                '--use-angle=default',
                '--enable-webgl',
                '--no-sandbox',
                '--disable-gpu-sandbox'
            ]
        )
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))

        print('1. Loading web application on http://localhost:5173/ ...')
        page.goto('http://localhost:5173/')
        page.wait_for_selector('canvas', timeout=15000)
        time.sleep(3)

        # 2. Check initial HUD values
        print('2. Checking HUD elements...')
        timer_text = page.inner_text('#stage-timer')
        sector_text = page.inner_text('#sector-display')
        surface_text = page.inner_text('#tel-surface')
        print(f'   Initial HUD: Timer={timer_text}, Sector={sector_text}, Surface={surface_text}')
        assert timer_text != '', 'Timer element should be populated'

        # 3. Test Keyboard Driving Inputs (W, A, S, D, Space)
        print('3. Testing Keyboard Manual Driving (WASD + Handbrake)...')
        page.keyboard.down('w')
        time.sleep(2.0)
        speed_after_w = float(page.inner_text('#speed-display'))
        print(f'   Speed after accelerating with W: {speed_after_w} km/h')
        assert speed_after_w > 0, 'Vehicle speed should increase under throttle'

        # Test Handbrake drift
        page.keyboard.down(' ')
        page.keyboard.down('a')
        time.sleep(1.0)
        scrub_text = page.inner_text('#tel-scrub')
        print(f'   Lateral scrub under handbrake drift: {scrub_text}')
        page.keyboard.up(' ')
        page.keyboard.up('a')
        page.keyboard.up('w')

        # 4. Test Track Switching ('T' key)
        print('4. Testing Track Circuit Toggle (Key: T)...')
        page.keyboard.press('t')
        time.sleep(1.0)
        pacenote = page.inner_text('#pacenote-banner')
        print(f'   Pacenote banner after T: "{pacenote}"')
        assert 'Rallycross' in pacenote or 'GREEN LIGHT' in pacenote or 'Turn 1' in pacenote, 'Should switch to Rallycross circuit'

        # Toggle back to Special Stage
        page.keyboard.press('t')
        time.sleep(1.0)
        pacenote = page.inner_text('#pacenote-banner')
        print(f'   Pacenote banner after toggling back: "{pacenote}"')
        assert 'Special Stage' in pacenote or 'GO!' in pacenote or 'flat' in pacenote, 'Should switch back to Special Stage'

        # 5. Test Camera Presets ('1', '2', '3', 'C')
        print('5. Testing Camera Hotkeys (1, 2, 3, C)...')
        for key in ['1', '2', '3', 'c']:
            page.keyboard.press(key)
            time.sleep(0.5)
            cam_mode = page.inner_text('#tel-cam')
            print(f'   Pressed {key} -> Camera Mode: {cam_mode}')

        # 6. Test Co-Driver Voice Toggle ('V' key)
        print('6. Testing Co-Driver Voice Toggle (Key: V)...')
        page.keyboard.press('v')
        time.sleep(0.5)
        pacenote = page.inner_text('#pacenote-banner')
        print(f'   Voice toggle pacenote: "{pacenote}"')

        # 7. Check for unhandled browser runtime errors
        print('7. Verifying zero browser page errors...')
        if errors:
            print(f'   FAIL: Browser encountered {len(errors)} errors:', errors)
            sys.exit(1)
        else:
            print('   PASS: 0 browser page errors encountered!')

        browser.close()
        print('All comprehensive interactive browser checks PASSED!')

if __name__ == '__main__':
    test_full_interactive_experience()
