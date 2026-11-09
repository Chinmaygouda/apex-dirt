import time
import os
import shutil
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Chinmaygouda\.gemini\antigravity\brain\64af6e27-64eb-45c1-8d95-50bd0eb0b905"

def copy_to_artifact(src_path, filename):
    dst_path = os.path.join(ARTIFACT_DIR, filename)
    shutil.copy2(src_path, dst_path)
    print(f"Copied {filename} to artifact directory: {dst_path}")

def main():
    os.makedirs('docs', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--use-gl=angle',
                '--use-angle=default',
                '--enable-webgl',
                '--enable-features=Vulkan',
                '--no-sandbox',
                '--disable-gpu-sandbox',
                '--ignore-gpu-blocklist'
            ]
        )
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        console_logs = []
        page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))

        print('Navigating to http://localhost:5173/ ...')
        page.goto('http://localhost:5173/')

        # Wait for canvas
        page.wait_for_selector('canvas', timeout=15000)
        print('Canvas found! Waiting 5 seconds for Rapier, assets, and GLB loading...')
        time.sleep(5)

        # Chase Camera View
        print('Capturing Chase Camera View...')
        page.screenshot(path='docs/in_game_chase_view.png')
        copy_to_artifact('docs/in_game_chase_view.png', 'in_game_chase_view.png')

        # Press '1' for Shot 1: Middle of Road Corridor Pass
        print('Switching to Shot 1: Middle of Road Pass (Key: 1)...')
        page.keyboard.press('1')
        time.sleep(2)
        page.screenshot(path='docs/in_game_shot1_middle_of_road.png')
        copy_to_artifact('docs/in_game_shot1_middle_of_road.png', 'in_game_shot1_middle_of_road.png')

        # Press '2' for Shot 2: Banked Hairpin Drift
        print('Switching to Shot 2: Banked Hairpin Drift (Key: 2)...')
        page.keyboard.press('2')
        time.sleep(2)
        page.screenshot(path='docs/in_game_shot2_hairpin_drift.png')
        copy_to_artifact('docs/in_game_shot2_hairpin_drift.png', 'in_game_shot2_hairpin_drift.png')

        # Press '3' for Shot 3: High-Altitude Aerial Journey Map
        print('Switching to Shot 3: Overall Aerial Journey Map (Key: 3)...')
        page.keyboard.press('3')
        time.sleep(2)
        page.screenshot(path='docs/in_game_shot3_aerial_journey.png')
        copy_to_artifact('docs/in_game_shot3_aerial_journey.png', 'in_game_shot3_aerial_journey.png')

        # Press 'c' for Helicopter Broadcast TV Cam
        print('Testing Helicopter Broadcast TV Cam...')
        page.keyboard.press('c') # flythrough
        time.sleep(1)
        page.keyboard.press('c') # helicopter
        time.sleep(2)
        page.screenshot(path='docs/in_game_helicopter_cam.png')
        copy_to_artifact('docs/in_game_helicopter_cam.png', 'in_game_helicopter_cam.png')

        # Read HUD Telemetry
        speed = page.inner_text('#speed-display')
        surface = page.inner_text('#tel-surface')
        friction = page.inner_text('#tel-friction')
        timer = page.inner_text('#stage-timer')
        print(f'HUD Telemetry: Speed={speed} km/h, Surface={surface}, Friction={friction}, StageTime={timer}')

        print('Recent console logs:')
        for l in console_logs[-10:]:
            print('  ', l)

        browser.close()
        print('Browser capture completed successfully!')

if __name__ == '__main__':
    main()

