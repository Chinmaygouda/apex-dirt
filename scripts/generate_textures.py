import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

TEXTURE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "APEX_RALLY_TEXTURES")
os.makedirs(TEXTURE_DIR, exist_ok=True)

print(f"Generating textures in: {TEXTURE_DIR}")

def get_font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        try:
            return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
        except Exception:
            return ImageFont.load_default()

def get_bold_font(size):
    try:
        return ImageFont.truetype("arialbd.ttf", size)
    except Exception:
        try:
            return ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", size)
        except Exception:
            return get_font(size)

# ==============================================================================
# 1. RACING STRIPES (2048 x 2048)
# ==============================================================================
def create_racing_stripes():
    w, h = 2048, 2048
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Dual Alpine white racing stripes running vertically along car centerline
    stripe_w = 220
    gap = 90
    cx = w // 2
    
    # Left Stripe:
    x1_left = cx - gap // 2 - stripe_w
    x2_left = cx - gap // 2
    # Right Stripe:
    x1_right = cx + gap // 2
    x2_right = cx + gap // 2 + stripe_w
    
    # Outer black pinstripe borders (12px)
    pin = 14
    draw.rectangle([x1_left - pin, 0, x1_left, h], fill=(20, 20, 24, 255))
    draw.rectangle([x2_left, 0, x2_left + pin, h], fill=(20, 20, 24, 255))
    
    draw.rectangle([x1_right - pin, 0, x1_right, h], fill=(20, 20, 24, 255))
    draw.rectangle([x2_right, 0, x2_right + pin, h], fill=(20, 20, 24, 255))
    
    # Fill main stripes with Alpine White (#F8F8FA)
    draw.rectangle([x1_left, 0, x2_left, h], fill=(248, 248, 252, 255))
    draw.rectangle([x1_right, 0, x2_right, h], fill=(248, 248, 252, 255))
    
    path = os.path.join(TEXTURE_DIR, "racing_stripes.png")
    img.save(path)
    print("Saved:", path)

# ==============================================================================
# 2. DECALS & BRANDING SHEET (2048 x 2048)
# ==============================================================================
def create_decals():
    w, h = 2048, 2048
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    f_huge = get_bold_font(120)
    f_large = get_bold_font(84)
    f_med = get_bold_font(52)
    f_small = get_bold_font(36)
    
    # Quadrant 1 (Top-Left): Hood Main Branding "APEX RALLY"
    draw.rectangle([60, 60, 960, 480], fill=(20, 20, 25, 230), outline=(210, 25, 25, 255), width=8)
    draw.text((100, 110), "APEX RALLY", font=f_huge, fill=(255, 255, 255, 255))
    draw.line([(100, 260), (920, 260)], fill=(225, 30, 30, 255), width=12)
    draw.text((100, 290), "GROUP B TURBO 4WD", font=f_med, fill=(240, 200, 30, 255))
    draw.text((100, 370), "MONTE CARLO RALLY 1986", font=f_small, fill=(200, 205, 215, 255))
    
    # Quadrant 2 (Top-Right): Competition Rally Door Plates #84
    for offset_x in [1040]:
        draw.rectangle([offset_x, 60, offset_x + 900, 520], fill=(245, 245, 250, 255), outline=(20, 20, 25, 255), width=10)
        draw.rectangle([offset_x + 20, 80, offset_x + 880, 150], fill=(210, 25, 25, 255))
        draw.text((offset_x + 80, 88), "WORLD RALLY CHAMPIONSHIP", font=f_med, fill=(255, 255, 255, 255))
        draw.text((offset_x + 310, 170), "84", font=ImageFont.truetype("arialbd.ttf" if os.name == 'nt' else "DejaVuSans-Bold.ttf", 260), fill=(20, 20, 25, 255))
        draw.text((offset_x + 180, 440), "APEX MOTORSPORT", font=f_med, fill=(210, 25, 25, 255))
        
    # Quadrant 3 (Bottom-Left): Windshield Sunstrip & Rear Wing Typography
    draw.rectangle([60, 600, 1980, 800], fill=(18, 18, 22, 255))
    draw.rectangle([60, 788, 1980, 800], fill=(225, 30, 30, 255))
    draw.text((450, 640), "APEX RALLY", font=ImageFont.truetype("arialbd.ttf" if os.name == 'nt' else "DejaVuSans-Bold.ttf", 140), fill=(255, 255, 255, 255))
    
    # Sponsor Badges (Bottom Half)
    sponsors = [
        ("MICHELIN", (240, 200, 30), (20, 20, 80)),
        ("BILSTEIN", (255, 255, 255), (30, 80, 180)),
        ("SPARCO", (255, 255, 255), (20, 30, 140)),
        ("OMP", (245, 245, 245), (220, 30, 30)),
        ("MAGNETI MARELLI", (255, 255, 255), (20, 40, 120)),
        ("BREMBO", (255, 255, 255), (210, 20, 20)),
    ]
    
    sx, sy = 60, 880
    for name, text_col, bg_col in sponsors:
        draw.rectangle([sx, sy, sx + 440, sy + 180], fill=(*bg_col, 255), outline=(255, 255, 255, 200), width=4)
        draw.text((sx + 30, sy + 55), name, font=f_med, fill=(*text_col, 255))
        sx += 480
        if sx > 1600:
            sx = 60
            sy += 220
            
    # Technical Spec Text
    draw.text((60, 1500), "HOMOLOGATION: B-284-86", font=f_med, fill=(240, 240, 240, 255))
    draw.text((60, 1580), "ENGINE: 2.1L TWIN-CHARGED 16V", font=f_small, fill=(220, 220, 220, 255))
    draw.text((60, 1640), "OUTPUT: 480 BHP @ 8200 RPM", font=f_small, fill=(220, 220, 220, 255))
    draw.text((60, 1700), "KERB WEIGHT: 980 KG", font=f_small, fill=(220, 220, 220, 255))

    path = os.path.join(TEXTURE_DIR, "apex_rally_decals.png")
    img.save(path)
    print("Saved:", path)

# ==============================================================================
# 3. CARBON FIBER 2x2 TWILL NORMAL MAP (1024 x 1024)
# ==============================================================================
def create_carbon_fiber_normal():
    size = 1024
    pattern_size = 16
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    
    x = np.arange(size)
    y = np.arange(size)
    xx, yy = np.meshgrid(x, y)
    
    # 2x2 Twill weave modulation
    u = (xx % pattern_size) / pattern_size
    v = (yy % pattern_size) / pattern_size
    
    phase = ((xx // (pattern_size // 2) + yy // (pattern_size // 2)) % 2)
    
    nx = np.where(phase == 0, np.sin(u * math.pi * 2) * 0.45, np.cos(v * math.pi * 2) * 0.45)
    ny = np.where(phase == 0, np.cos(u * math.pi * 2) * 0.45, -np.sin(v * math.pi * 2) * 0.45)
    nz = np.sqrt(np.clip(1.0 - nx**2 - ny**2, 0.05, 1.0))
    
    arr[..., 0] = np.uint8(np.clip((nx * 0.5 + 0.5) * 255, 0, 255))
    arr[..., 1] = np.uint8(np.clip((ny * 0.5 + 0.5) * 255, 0, 255))
    arr[..., 2] = np.uint8(np.clip((nz * 0.5 + 0.5) * 255, 0, 255))
    
    img = Image.fromarray(arr, 'RGB')
    path = os.path.join(TEXTURE_DIR, "carbon_fiber_normal.png")
    img.save(path)
    print("Saved:", path)

# ==============================================================================
# 4. HONEYCOMB GRILLE MESH (1024 x 1024)
# ==============================================================================
def create_honeycomb_grille():
    size = 1024
    img = Image.new("RGBA", (size, size), (12, 12, 14, 255))
    draw = ImageDraw.Draw(img)
    
    r = 28 # Hex radius
    w_hex = r * math.sqrt(3)
    h_hex = r * 1.5
    
    for row in range(-2, int(size / h_hex) + 4):
        y_c = row * h_hex
        x_offset = (w_hex / 2.0) if (row % 2 == 1) else 0.0
        for col in range(-2, int(size / w_hex) + 4):
            x_c = col * w_hex + x_offset
            
            # Draw hex boundary with metallic border
            points = []
            for k in range(6):
                ang = math.pi / 6.0 + k * math.pi / 3.0
                px = x_c + r * math.cos(ang)
                py = y_c + r * math.sin(ang)
                points.append((px, py))
            draw.polygon(points, outline=(60, 60, 65, 255), fill=(24, 24, 28, 255))
            
            # Inner aperture cutout (dark recessed void)
            r_in = r * 0.72
            in_points = []
            for k in range(6):
                ang = math.pi / 6.0 + k * math.pi / 3.0
                px = x_c + r_in * math.cos(ang)
                py = y_c + r_in * math.sin(ang)
                in_points.append((px, py))
            draw.polygon(in_points, fill=(6, 6, 8, 255))
            
    path = os.path.join(TEXTURE_DIR, "grille_honeycomb.png")
    img.save(path)
    print("Saved:", path)

# ==============================================================================
# 5. DASHBOARD INSTRUMENT GAUGES (1024 x 1024)
# ==============================================================================
def create_dashboard_gauges():
    size = 1024
    img = Image.new("RGBA", (size, size), (18, 18, 22, 255))
    draw = ImageDraw.Draw(img)
    
    f_num = get_bold_font(32)
    f_title = get_bold_font(24)
    f_small = get_bold_font(18)
    
    # Left Gauge: Speedometer (Center: 280, 320, Radius: 200)
    cx1, cy1, r1 = 280, 320, 200
    draw.ellipse([cx1 - r1, cy1 - r1, cx1 + r1, cy1 + r1], fill=(12, 12, 14, 255), outline=(120, 120, 130, 255), width=8)
    draw.ellipse([cx1 - r1 + 10, cy1 - r1 + 10, cx1 + r1 - 10, cy1 + r1 - 10], outline=(60, 60, 65, 255), width=4)
    draw.text((cx1 - 35, cy1 + 70), "MPH", font=f_title, fill=(220, 220, 230, 255))
    draw.text((cx1 - 50, cy1 + 110), "APEX DIRT", font=f_small, fill=(210, 30, 30, 255))
    
    # Speeds 0 to 180 mph
    for spd in range(0, 190, 20):
        # Angle from 140 deg to 400 deg (260 deg sweep)
        frac = spd / 180.0
        ang = math.radians(140 + frac * 260)
        x_outer = cx1 + (r1 - 18) * math.cos(ang)
        y_outer = cy1 + (r1 - 18) * math.sin(ang)
        x_inner = cx1 + (r1 - 42) * math.cos(ang)
        y_inner = cy1 + (r1 - 42) * math.sin(ang)
        draw.line([(x_inner, y_inner), (x_outer, y_outer)], fill=(245, 245, 250, 255), width=4)
        
        tx = cx1 + (r1 - 70) * math.cos(ang) - 15
        ty = cy1 + (r1 - 70) * math.sin(ang) - 15
        draw.text((tx, ty), str(spd), font=f_small, fill=(245, 245, 250, 255))

    # Right Gauge: Tachometer (Center: 744, 320, Radius: 200)
    cx2, cy2, r2 = 744, 320, 200
    draw.ellipse([cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2], fill=(12, 12, 14, 255), outline=(120, 120, 130, 255), width=8)
    draw.ellipse([cx2 - r2 + 10, cy2 - r2 + 10, cx2 + r2 - 10, cy2 + r2 - 10], outline=(60, 60, 65, 255), width=4)
    draw.text((cx2 - 45, cy2 + 70), "RPM x1000", font=f_title, fill=(220, 220, 230, 255))
    
    # RPM 0 to 10
    for rpm in range(0, 11):
        frac = rpm / 10.0
        ang = math.radians(140 + frac * 260)
        col = (245, 245, 250, 255) if rpm < 7 else ((240, 200, 30, 255) if rpm < 8 else (225, 30, 30, 255))
        x_outer = cx2 + (r2 - 18) * math.cos(ang)
        y_outer = cy2 + (r2 - 18) * math.sin(ang)
        x_inner = cx2 + (r2 - 46) * math.cos(ang)
        y_inner = cy2 + (r2 - 46) * math.sin(ang)
        draw.line([(x_inner, y_inner), (x_outer, y_outer)], fill=col, width=5)
        
        tx = cx2 + (r2 - 72) * math.cos(ang) - 10
        ty = cy2 + (r2 - 72) * math.sin(ang) - 15
        draw.text((tx, ty), str(rpm), font=f_num, fill=col)

    # Center Auxiliary Gauges: Turbo Boost & Oil Temp
    # Turbo Gauge: (Center: 512, 680, Radius: 120)
    cxt, cyt, rt = 512, 680, 120
    draw.ellipse([cxt - rt, cyt - rt, cxt + rt, cyt + rt], fill=(12, 12, 14, 255), outline=(100, 100, 110, 255), width=6)
    draw.text((cxt - 35, cyt - 20), "TURBO", font=f_small, fill=(220, 30, 30, 255))
    draw.text((cxt - 25, cyt + 15), "BAR", font=f_small, fill=(200, 200, 200, 255))
    
    # Small Warning Indicator LEDs
    indicators = [
        (220, 680, "OIL", (220, 30, 30)),
        (300, 680, "BATT", (220, 30, 30)),
        (724, 680, "DIFF", (240, 200, 30)),
        (804, 680, "HIGH", (30, 100, 240))
    ]
    for ix, iy, label, col in indicators:
        draw.ellipse([ix - 18, iy - 18, ix + 18, iy + 18], fill=col)
        draw.ellipse([ix - 22, iy - 22, ix + 22, iy + 22], outline=(40, 40, 45, 255), width=3)
        draw.text((ix - 16, iy + 26), label, font=f_small, fill=(200, 200, 200, 255))

    path = os.path.join(TEXTURE_DIR, "dashboard_gauges.png")
    img.save(path)
    print("Saved:", path)

# ==============================================================================
# 6. TIRE SIDEWALL & TREAD TEXTURES (1024 x 1024)
# ==============================================================================
def create_tire_textures():
    # Sidewall texture
    size = 1024
    img = Image.new("RGBA", (size, size), (22, 22, 24, 255))
    draw = ImageDraw.Draw(img)
    
    cx, cy = size // 2, size // 2
    r_outer = 480
    r_inner = 280
    
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=(45, 45, 48, 255), width=16)
    draw.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], outline=(35, 35, 38, 255), width=12)
    
    f_side = get_bold_font(34)
    # Radial embossed lettering
    text = "APEX RALLY TARMAC • 245/45 R15 • COMPETITION USE ONLY •"
    total_len = len(text)
    r_text = (r_outer + r_inner) // 2
    for i, char in enumerate(text):
        ang = (i / total_len) * 2 * math.pi - math.pi / 2
        px = cx + r_text * math.cos(ang)
        py = cy + r_text * math.sin(ang)
        draw.text((px - 10, py - 12), char, font=f_side, fill=(160, 160, 165, 255))
        
    path_side = os.path.join(TEXTURE_DIR, "tire_sidewall.png")
    img.save(path_side)
    print("Saved:", path_side)

    # Tread normal map (1024x1024)
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    # Base flat normal (0, 0, 1) -> (128, 128, 255)
    arr[..., 0] = 128
    arr[..., 1] = 128
    arr[..., 2] = 255
    
    # Longitudinal channels
    for ch_y in [256, 512, 768]:
        arr[ch_y-20:ch_y+20, :, 0] = 128
        arr[ch_y-20:ch_y, :, 1] = 40   # Slopes down
        arr[ch_y:ch_y+20, :, 1] = 216  # Slopes up
        arr[ch_y-20:ch_y+20, :, 2] = 180
        
    # Diagonal transverse rally groove sipes
    for i in range(0, size, 48):
        for w_s in range(12):
            idx = (i + w_s) % size
            arr[:, idx, 0] = 210 if w_s > 6 else 46
            arr[:, idx, 2] = 190
            
    img_tread = Image.fromarray(arr, 'RGB')
    path_tread = os.path.join(TEXTURE_DIR, "tire_tread_normal.png")
    img_tread.save(path_tread)
    print("Saved:", path_tread)

# ==============================================================================
# 7. BRAKE ROTOR SWIRL & HOLES (1024 x 1024)
# ==============================================================================
def create_brake_rotor_texture():
    size = 1024
    img = Image.new("RGBA", (size, size), (180, 185, 190, 255))
    draw = ImageDraw.Draw(img)
    
    cx, cy = size // 2, size // 2
    r_outer = 480
    r_inner = 220
    
    # Outer disc boundary
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=(120, 125, 130, 255), width=8)
    # Inner mounting bell (aluminum hat)
    draw.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], fill=(45, 45, 50, 255), outline=(20, 20, 22, 255), width=10)
    
    # 5 Wheel stud lug nut holes
    for k in range(5):
        ang = k * (2 * math.pi / 5.0)
        lx = cx + 130 * math.cos(ang)
        ly = cy + 130 * math.sin(ang)
        draw.ellipse([lx - 22, ly - 22, lx + 22, ly + 22], fill=(10, 10, 12, 255), outline=(190, 190, 200, 255), width=4)
        
    # Center hub hole
    draw.ellipse([cx - 65, cy - 65, cx + 65, cy + 65], fill=(10, 10, 12, 255))
    
    # Concentric friction grooves
    for r in range(r_inner + 15, r_outer - 15, 6):
        col_v = int(170 + 40 * math.sin(r * 0.8))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(col_v, col_v, col_v + 5, 255), width=2)
        
    # Curved cross-drilled cooling holes
    for spiral in range(18):
        ang_base = spiral * (2 * math.pi / 18.0)
        for step in range(6):
            r_hole = r_inner + 45 + step * 38
            ang_curved = ang_base + (step * 0.08)
            hx = cx + r_hole * math.cos(ang_curved)
            hy = cy + r_hole * math.sin(ang_curved)
            draw.ellipse([hx - 9, hy - 9, hx + 9, hy + 9], fill=(12, 12, 14, 255), outline=(100, 100, 105, 255), width=2)

    path = os.path.join(TEXTURE_DIR, "brake_rotor_swirl.png")
    img.save(path)
    print("Saved:", path)

if __name__ == "__main__":
    create_racing_stripes()
    create_decals()
    create_carbon_fiber_normal()
    create_honeycomb_grille()
    create_dashboard_gauges()
    create_tire_textures()
    create_brake_rotor_texture()
    print("All textures generated successfully.")

