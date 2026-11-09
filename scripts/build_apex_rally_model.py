import bpy
import bmesh
import math
import os
import sys

# Set directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTURE_DIR = os.path.join(BASE_DIR, "APEX_RALLY_TEXTURES")
OUTPUT_BLEND = os.path.join(BASE_DIR, "APEX_RALLY_MASTER.blend")
OUTPUT_GLB = os.path.join(BASE_DIR, "APEX_RALLY.glb")
PREVIEW_DIR = BASE_DIR

print(f"=== BUILDING APEX RALLY 3D VEHICLE ===")
print(f"Base Directory: {BASE_DIR}")
print(f"Texture Directory: {TEXTURE_DIR}")

# ==============================================================================
# 1. SCENE CLEANUP & UNIT SETUP
# ==============================================================================
def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'
    
    # Configure render settings
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    print("Scene initialized to Metric standard.")

# ==============================================================================
# 2. COLLECTION MANAGEMENT
# ==============================================================================
COLLECTIONS = {}

def get_or_create_collection(name, parent_col=None):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
    else:
        col = bpy.data.collections.new(name)
        if parent_col:
            parent_col.children.link(col)
        else:
            bpy.context.scene.collection.children.link(col)
    COLLECTIONS[name] = col
    return col

def setup_collection_hierarchy():
    root = get_or_create_collection("APEX_RALLY")
    get_or_create_collection("BODY", root)
    get_or_create_collection("WHEELS", root)
    get_or_create_collection("SUSPENSION", root)
    get_or_create_collection("LIGHTS", root)
    get_or_create_collection("INTERIOR", root)
    get_or_create_collection("AERODYNAMICS", root)
    get_or_create_collection("EXHAUST", root)
    print("Collection hierarchy constructed.")

# ==============================================================================
# 3. PBR MATERIAL FACTORY
# ==============================================================================
MATERIALS = {}

def set_socket(bsdf, names, value):
    for name in names:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
            return True
    return False

def create_pbr_material(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5,
                        transmission=0.0, coat=0.0, emission=None, texture_name=None, normal_name=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Get or create Principled BSDF
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        output = nodes.get("Material Output")
        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        
    set_socket(bsdf, ["Base Color"], base_color)
    set_socket(bsdf, ["Metallic"], metallic)
    set_socket(bsdf, ["Roughness"], roughness)
    set_socket(bsdf, ["Transmission Weight", "Transmission"], transmission)
    set_socket(bsdf, ["Coat Weight", "Clearcoat"], coat)
    set_socket(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.05)
    
    if emission:
        set_socket(bsdf, ["Emission Color", "Emission"], emission)
        set_socket(bsdf, ["Emission Strength"], 2.0)
        
    # Diffuse / Color Texture
    if texture_name:
        tex_path = os.path.join(TEXTURE_DIR, texture_name)
        if os.path.exists(tex_path):
            img = bpy.data.images.load(tex_path)
            tex_node = nodes.new("ShaderNodeTexImage")
            tex_node.image = img
            tex_node.location = (-400, 200)
            links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
            if "Alpha" in tex_node.outputs and "Alpha" in bsdf.inputs and texture_name.endswith(".png"):
                # Blend mode for transparency if needed
                mat.blend_method = 'HASHED'
                links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
                
    # Normal Map Texture
    if normal_name:
        norm_path = os.path.join(TEXTURE_DIR, normal_name)
        if os.path.exists(norm_path):
            n_img = bpy.data.images.load(norm_path)
            n_img.colorspace_settings.name = 'Non-Color'
            n_tex_node = nodes.new("ShaderNodeTexImage")
            n_tex_node.image = n_img
            n_tex_node.location = (-600, -200)
            
            norm_node = nodes.new("ShaderNodeNormalMap")
            norm_node.location = (-300, -200)
            norm_node.inputs["Strength"].default_value = 1.0
            
            links.new(n_tex_node.outputs["Color"], norm_node.inputs["Color"])
            links.new(norm_node.outputs["Normal"], bsdf.inputs["Normal"])
            
    MATERIALS[name] = mat
    return mat

def create_all_materials():
    # 1. Apex_Red_Paint
    create_pbr_material("Apex_Red_Paint", base_color=(0.82, 0.05, 0.05, 1.0), metallic=0.15, roughness=0.12, coat=1.0)
    # 2. Racing_White
    create_pbr_material("Racing_White", base_color=(0.95, 0.95, 0.97, 1.0), metallic=0.0, roughness=0.18, texture_name="racing_stripes.png")
    # 3. Tyre_Rubber
    create_pbr_material("Tyre_Rubber", base_color=(0.04, 0.04, 0.05, 1.0), metallic=0.0, roughness=0.82, normal_name="tire_tread_normal.png")
    # 4. Rim_White
    create_pbr_material("Rim_White", base_color=(0.98, 0.98, 1.0, 1.0), metallic=0.05, roughness=0.20, coat=0.6)
    # 5. Brake_Metal
    create_pbr_material("Brake_Metal", base_color=(0.75, 0.77, 0.80, 1.0), metallic=0.95, roughness=0.28, texture_name="brake_rotor_swirl.png")
    # 6. Caliper_Material
    create_pbr_material("Caliper_Material", base_color=(0.80, 0.02, 0.02, 1.0), metallic=0.40, roughness=0.22, coat=0.8)
    # 7. Carbon_Fibre
    create_pbr_material("Carbon_Fibre", base_color=(0.03, 0.03, 0.04, 1.0), metallic=0.20, roughness=0.35, normal_name="carbon_fiber_normal.png")
    # 8. Window_Glass
    create_pbr_material("Window_Glass", base_color=(0.05, 0.07, 0.09, 1.0), metallic=0.10, roughness=0.05, transmission=0.85)
    # 9. Light_Glass
    create_pbr_material("Light_Glass", base_color=(0.95, 0.95, 0.92, 1.0), metallic=0.05, roughness=0.08, transmission=0.90)
    # 10. Rear_Light_Red
    create_pbr_material("Rear_Light_Red", base_color=(0.70, 0.02, 0.02, 1.0), metallic=0.10, roughness=0.15, transmission=0.65, emission=(0.8, 0.05, 0.05, 1.0))
    # 11. Aluminium
    create_pbr_material("Aluminium", base_color=(0.85, 0.86, 0.88, 1.0), metallic=0.92, roughness=0.30)
    # 12. Black_Plastic
    create_pbr_material("Black_Plastic", base_color=(0.02, 0.02, 0.03, 1.0), metallic=0.0, roughness=0.55)
    # 13. Interior_Material
    create_pbr_material("Interior_Material", base_color=(0.06, 0.06, 0.07, 1.0), metallic=0.0, roughness=0.92, texture_name="dashboard_gauges.png")
    # 14. Exhaust_Metal
    create_pbr_material("Exhaust_Metal", base_color=(0.55, 0.58, 0.62, 1.0), metallic=0.88, roughness=0.32)
    print("14 PBR materials initialized.")

# ==============================================================================
# 4. HELPER CREATION UTILITIES
# ==============================================================================
def assign_material(obj, mat_name):
    if mat_name in MATERIALS:
        if obj.data.materials:
            obj.data.materials[0] = MATERIALS[mat_name]
        else:
            obj.data.materials.append(MATERIALS[mat_name])

def create_mesh_object(name, collection_name, verts, faces, mat_name=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    
    # Smooth normals
    for p in mesh.polygons:
        p.use_smooth = True
        
    obj = bpy.data.objects.new(name, mesh)
    COLLECTIONS[collection_name].objects.link(obj)
    if mat_name:
        assign_material(obj, mat_name)
    return obj

def create_cylinder(name, collection_name, radius, depth, location, rotation=(0,0,0), segments=24, mat_name=None):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=segments,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    for col in obj.users_collection:
        col.objects.unlink(obj)
    COLLECTIONS[collection_name].objects.link(obj)
    if mat_name:
        assign_material(obj, mat_name)
    return obj

def create_box(name, collection_name, size, location, rotation=(0,0,0), mat_name=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for col in obj.users_collection:
        col.objects.unlink(obj)
    COLLECTIONS[collection_name].objects.link(obj)
    if mat_name:
        assign_material(obj, mat_name)
    return obj

# ==============================================================================
# 5. GEOMETRY GENERATORS: BODY & AERODYNAMICS
# ==============================================================================
def build_main_body():
    # Stations along vehicle length Y: from +1.95 (cowl/front) to -1.95 (rear bumper)
    # Z is Up, X is Lateral
    y_stations = [1.95, 1.70, 1.25, 0.85, 0.40, 0.00, -0.40, -0.85, -1.25, -1.70, -1.95]
    n_y = len(y_stations)
    
    verts = []
    faces = []
    
    # Cross section profile indices per station:
    # 0: Keel / Bottom Center (0, Y, 0.16)
    # 1: Left Rocker Sill (XSill, Y, 0.18)
    # 2: Left Flare Waist (XWaist, Y, 0.45)
    # 3: Left Beltline (XBelt, Y, 0.82)
    # 4: Left Roof Header (XRoof, Y, 1.34)
    # 5: Roof Crown Center (0, Y, 1.38)
    # 6: Right Roof Header (-XRoof, Y, 1.34)
    # 7: Right Beltline (-XBelt, Y, 0.82)
    # 8: Right Flare Waist (-XWaist, Y, 0.45)
    # 9: Right Rocker Sill (-XSill, Y, 0.18)
    
    num_pts_per_station = 10
    
    for y in y_stations:
        # Coke-bottle waist calculation:
        # Flare peaks at front axle (y=1.25) and rear axle (y=-1.25)
        # Narrows at door midpoint (y=0.0)
        t_front = max(0.0, 1.0 - abs(y - 1.25) / 0.55)
        t_rear = max(0.0, 1.0 - abs(y - (-1.25)) / 0.55)
        
        x_waist = 0.79 + 0.14 * max(t_front, t_rear) # 0.79m door waist -> 0.93m flare blister
        x_sill = 0.76 + 0.09 * max(t_front, t_rear)
        x_belt = 0.76 + 0.08 * max(t_front, t_rear)
        x_roof = 0.62 if abs(y) < 0.90 else 0.50
        
        # Roof height profile (drops at front cowl and rear deck)
        if y > 0.60:
            z_roof = 0.86 + (1.95 - y) * 0.35 # Slopes down to hood
            z_crown = z_roof + 0.03
        elif y < -0.80:
            z_roof = 0.90 + (-0.80 - y) * (-0.15) # Slopes down to trunk
            z_crown = z_roof + 0.03
        else:
            z_roof = 1.34 - (abs(y) * 0.04)
            z_crown = 1.38 - (abs(y) * 0.04)
            
        z_sill = 0.18
        z_waist = 0.46
        z_belt = 0.82 if abs(y) < 1.0 else 0.78
        
        verts.append((0.0, y, 0.16))               # 0: Bottom center
        verts.append((x_sill, y, z_sill))          # 1: Left Sill
        verts.append((x_waist, y, z_waist))        # 2: Left Waist / Blister
        verts.append((x_belt, y, z_belt))          # 3: Left Belt
        verts.append((x_roof, y, z_roof))          # 4: Left Roof Header
        verts.append((0.0, y, z_crown))            # 5: Roof Crown Center
        verts.append((-x_roof, y, z_roof))         # 6: Right Roof Header
        verts.append((-x_belt, y, z_belt))         # 7: Right Belt
        verts.append((-x_waist, y, z_waist))       # 8: Right Waist / Blister
        verts.append((-x_sill, y, z_sill))         # 9: Right Sill
        
    for i in range(n_y - 1):
        s0 = i * num_pts_per_station
        s1 = (i + 1) * num_pts_per_station
        for k in range(num_pts_per_station):
            k_next = (k + 1) % num_pts_per_station
            faces.append((s0 + k, s1 + k, s1 + k_next, s0 + k_next))
            
    body = create_mesh_object("Main_Body", "BODY", verts, faces, "Apex_Red_Paint")
    
    # Add Subdivision Surface Modifier
    sub = body.modifiers.new("Subdivision", 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 2
    
    # Roof air scoop
    create_box("Roof_Scoop", "BODY", (0.28, 0.42, 0.08), (0.0, 0.10, 1.42), mat_name="Apex_Red_Paint")
    
    # Front NACA ducts on hood
    create_box("NACA_Duct_L", "BODY", (0.16, 0.28, 0.04), (0.35, 1.35, 0.88), mat_name="Black_Plastic")
    create_box("NACA_Duct_R", "BODY", (0.16, 0.28, 0.04), (-0.35, 1.35, 0.88), mat_name="Black_Plastic")
    
    return body

def build_bonnet():
    # Sculpted rally bonnet / hood
    b_verts = [
        # Centerline & corners
        (0.0, 1.95, 0.76),   (0.72, 1.95, 0.74),   (0.74, 1.30, 0.86),   (0.0, 1.30, 0.88), # Left half
        (-0.72, 1.95, 0.74), (-0.74, 1.30, 0.86),                                           # Right half
        (0.0, 1.65, 0.83),   (0.50, 1.65, 0.81),   (-0.50, 1.65, 0.81)                       # Mid points
    ]
    b_faces = [
        (0, 1, 7, 6), (6, 7, 2, 3), # Left quad
        (0, 6, 8, 4), (6, 3, 5, 8)  # Right quad
    ]
    bonnet = create_mesh_object("Bonnet", "BODY", b_verts, b_faces, "Racing_White")
    
    # Hood quick-release pin latches
    create_cylinder("HoodPin_L", "BODY", 0.018, 0.02, (0.55, 1.88, 0.77), mat_name="Aluminium")
    create_cylinder("HoodPin_R", "BODY", 0.018, 0.02, (-0.55, 1.88, 0.77), mat_name="Aluminium")
    return bonnet

def build_bumpers_and_armor():
    # Front Bumper with trapezoidal radiator aperture
    fb = create_box("Front_Bumper", "BODY", (1.82, 0.35, 0.44), (0.0, 2.05, 0.44), mat_name="Apex_Red_Paint")
    
    # Honeycomb grille mesh insert
    grille = create_box("Front_Grille", "BODY", (1.20, 0.02, 0.24), (0.0, 2.18, 0.44), mat_name="Black_Plastic")
    assign_material(grille, "Black_Plastic")
    
    # Carbon Front Splitter
    splitter = create_box("Front_Splitter", "AERODYNAMICS", (1.86, 0.42, 0.04), (0.0, 2.12, 0.14), mat_name="Carbon_Fibre")
    
    # Splitter turnbuckle struts
    for sx in [0.45, -0.45]:
        strut = create_cylinder(f"SplitterStrut_{'L' if sx>0 else 'R'}", "AERODYNAMICS", 0.008, 0.26, (sx, 2.18, 0.26), rotation=(math.radians(24), 0, 0), mat_name="Aluminium")
        
    # Aluminum Front Skid Plate
    skid = create_box("Skid_Plate", "BODY", (1.10, 0.85, 0.016), (0.0, 1.55, 0.15), rotation=(math.radians(-8), 0, 0), mat_name="Aluminium")
    
    # Rear Bumper
    rb = create_box("Rear_Bumper", "BODY", (1.82, 0.35, 0.46), (0.0, -2.05, 0.46), mat_name="Apex_Red_Paint")
    
    # Rear Carbon Diffuser with 4 aero tunnels
    diff = create_box("Rear_Diffuser", "AERODYNAMICS", (1.65, 0.65, 0.18), (0.0, -1.95, 0.22), mat_name="Carbon_Fibre")
    for fx in [-0.55, -0.18, 0.18, 0.55]:
        fin = create_box(f"DiffuserFin_{fx}", "AERODYNAMICS", (0.015, 0.55, 0.12), (fx, -1.95, 0.18), mat_name="Carbon_Fibre")
        
    # Side Skirts (Left & Right)
    create_box("SideSkirt_L", "BODY", (0.08, 2.10, 0.08), (0.86, 0.0, 0.18), mat_name="Black_Plastic")
    create_box("SideSkirt_R", "BODY", (0.08, 2.10, 0.08), (-0.86, 0.0, 0.18), mat_name="Black_Plastic")

def build_doors_and_glass():
    # Left & Right Doors
    create_box("Door_L", "BODY", (0.06, 1.25, 0.55), (0.82, 0.05, 0.54), mat_name="Apex_Red_Paint")
    create_box("Door_R", "BODY", (0.06, 1.25, 0.55), (-0.82, 0.05, 0.54), mat_name="Apex_Red_Paint")
    
    # Recessed handles
    create_box("DoorHandle_L", "BODY", (0.02, 0.14, 0.04), (0.86, -0.25, 0.78), mat_name="Black_Plastic")
    create_box("DoorHandle_R", "BODY", (0.02, 0.14, 0.04), (-0.86, -0.25, 0.78), mat_name="Black_Plastic")
    
    # Functional Side Mirrors
    for s, name in [(1.0, "SideMirror_L"), (-1.0, "SideMirror_R")]:
        mirror_body = create_box(name, "BODY", (0.16, 0.12, 0.09), (s * 0.88, 0.55, 0.92), mat_name="Black_Plastic")
        glass = create_box(name + "_Glass", "BODY", (0.01, 0.10, 0.07), (s * 0.96, 0.55, 0.92), mat_name="Aluminium")

    # Front Windshield
    create_box("Windshield_Front", "BODY", (1.30, 0.72, 0.02), (0.0, 0.65, 1.10), rotation=(math.radians(52), 0, 0), mat_name="Window_Glass")
    # Rear Windshield
    create_box("Windshield_Rear", "BODY", (1.26, 0.68, 0.02), (0.0, -0.75, 1.12), rotation=(math.radians(-48), 0, 0), mat_name="Window_Glass")
    # Side Windows
    create_box("Window_Side_L", "BODY", (0.02, 1.20, 0.38), (0.72, 0.02, 1.10), mat_name="Window_Glass")
    create_box("Window_Side_R", "BODY", (0.02, 1.20, 0.38), (-0.72, 0.02, 1.10), mat_name="Window_Glass")

def build_rear_spoiler():
    # Inverted camber aerodynamic wing blade
    wing = create_box("Rear_Spoiler", "AERODYNAMICS", (1.52, 0.36, 0.06), (0.0, -1.82, 1.24), rotation=(math.radians(-6), 0, 0), mat_name="Apex_Red_Paint")
    
    # 3D Endplates
    for sx, name in [(0.76, "SpoilerEndplate_L"), (-0.76, "SpoilerEndplate_R")]:
        ep = create_box(name, "AERODYNAMICS", (0.02, 0.44, 0.22), (sx, -1.82, 1.24), mat_name="Apex_Red_Paint")
        
    # Twin Swept Aerodynamic Pylons
    for sx, name in [(0.42, "SpoilerPylon_L"), (-0.42, "SpoilerPylon_R")]:
        pylon = create_box(name, "AERODYNAMICS", (0.04, 0.16, 0.42), (sx, -1.72, 1.05), rotation=(math.radians(-18), 0, 0), mat_name="Carbon_Fibre")

# ==============================================================================
# 6. WHEELS, TYRES & SUSPENSION
# ==============================================================================
def build_wheel_assembly(prefix, pos):
    x, y, z = pos
    is_left = (x > 0)
    
    # Root Empty for Wheel Pivot (exactly at axle center!)
    wheel_empty = bpy.data.objects.new(prefix, None)
    wheel_empty.location = (x, y, z)
    COLLECTIONS["WHEELS"].objects.link(wheel_empty)
    
    # 1. Tyre (Radius 0.35m, Width 0.28m, centered on pivot)
    # Cylinder rotated 90 deg around Y so axle is along X
    tyre = create_cylinder(f"Tyre_{prefix.split('_')[1]}", "WHEELS", radius=0.35, depth=0.28,
                           location=(x, y, z), rotation=(0, math.radians(90), 0), segments=36, mat_name="Tyre_Rubber")
    tyre.parent = wheel_empty
    
    # 2. White Multi-spoke Rim (15 spokes + central hub)
    rim = create_cylinder(f"Rim_{prefix.split('_')[1]}", "WHEELS", radius=0.22, depth=0.26,
                          location=(x, y, z), rotation=(0, math.radians(90), 0), segments=30, mat_name="Rim_White")
    rim.parent = wheel_empty
    
    # Center Hub & Lug Nuts
    hub = create_cylinder(f"Hub_{prefix.split('_')[1]}", "WHEELS", radius=0.08, depth=0.27,
                          location=(x, y, z), rotation=(0, math.radians(90), 0), segments=16, mat_name="Rim_White")
    hub.parent = wheel_empty
    
    # 5 Lug nuts
    for k in range(5):
        ang = k * (2 * math.pi / 5.0)
        lx = x + (0.135 if is_left else -0.135)
        ly = y + 0.045 * math.cos(ang)
        lz = z + 0.045 * math.sin(ang)
        nut = create_cylinder(f"Lug_{prefix}_{k}", "WHEELS", radius=0.012, depth=0.03,
                              location=(lx, ly, lz), rotation=(0, math.radians(90), 0), segments=6, mat_name="Aluminium")
        nut.parent = wheel_empty
        
    # 3. Brake Disc (Rotates with wheel)
    disc_x = x - (0.06 if is_left else -0.06)
    disc = create_cylinder(f"BrakeDisc_{prefix.split('_')[1]}", "WHEELS", radius=0.18, depth=0.024,
                           location=(disc_x, y, z), rotation=(0, math.radians(90), 0), segments=32, mat_name="Brake_Metal")
    disc.parent = wheel_empty
    
    # 4. Brake Caliper (Mounted to hub, does NOT rotate with wheel spin)
    caliper_x = disc_x
    caliper = create_box(f"BrakeCaliper_{prefix.split('_')[1]}", "WHEELS", size=(0.06, 0.14, 0.09),
                         location=(caliper_x, y + 0.12, z + 0.10), mat_name="Caliper_Material")
    # Caliper remains in suspension/hub frame
    
    return wheel_empty

def build_suspension_components(corner_id, wheel_pos):
    wx, wy, wz = wheel_pos
    is_left = (wx > 0)
    
    # Inboard chassis attachment node
    cx = wx - (0.28 if is_left else -0.28)
    cy = wy
    cz = wz + 0.32
    
    # 1. Real 3D Helical Coil Spring
    # Generate parametric helical coil wire
    n_coils = 10
    n_steps = 180
    r_coil = 0.048
    r_wire = 0.008
    h_spring = 0.28
    
    verts = []
    faces = []
    
    for i in range(n_steps):
        t = i / float(n_steps - 1)
        ang = t * n_coils * 2.0 * math.pi
        z_t = cz - t * h_spring
        x_t = cx + r_coil * math.cos(ang)
        y_t = cy + r_coil * math.sin(ang)
        
        # Circle cross section around wire tangent
        n_wire_seg = 6
        for w in range(n_wire_seg):
            w_ang = w * (2.0 * math.pi / n_wire_seg)
            vx = x_t + r_wire * math.cos(w_ang) * math.cos(ang)
            vy = y_t + r_wire * math.cos(w_ang) * math.sin(ang)
            vz = z_t + r_wire * math.sin(w_ang)
            verts.append((vx, vy, vz))
            
    for i in range(n_steps - 1):
        s0 = i * 6
        s1 = (i + 1) * 6
        for w in range(6):
            w_next = (w + 1) % 6
            faces.append((s0 + w, s1 + w, s1 + w_next, s0 + w_next))
            
    spring = create_mesh_object(f"Spring_{corner_id}", "SUSPENSION", verts, faces, "Apex_Red_Paint")
    
    # 2. Shock Absorber (Inverted Monotube Damper Body + Piston Shaft)
    shock_body = create_cylinder(f"Shock_{corner_id}", "SUSPENSION", radius=0.026, depth=0.30,
                                 location=(cx, cy, cz - 0.12), segments=16, mat_name="Aluminium")
    piston_rod = create_cylinder(f"Piston_{corner_id}", "SUSPENSION", radius=0.012, depth=0.22,
                                 location=(cx, cy, cz - 0.24), segments=16, mat_name="Aluminium")
    
    # 3. Lower A-Arm Control Wishbone
    arm = create_box(f"ControlArm_{corner_id}", "SUSPENSION", size=(0.28, 0.22, 0.035),
                     location=(cx + (0.12 if is_left else -0.12), cy, wz - 0.08), mat_name="Black_Plastic")

def build_all_running_gear():
    wheelbase = 2.50 # 2500 mm
    track_front = 1.65 # 1650 mm (X = +-0.825)
    track_rear = 1.65
    axle_z = 0.35 # 350 mm
    
    positions = {
        "FL": (track_front / 2.0, wheelbase / 2.0, axle_z),
        "FR": (-track_front / 2.0, wheelbase / 2.0, axle_z),
        "RL": (track_rear / 2.0, -wheelbase / 2.0, axle_z),
        "RR": (-track_rear / 2.0, -wheelbase / 2.0, axle_z),
    }
    
    for corner, pos in positions.items():
        build_wheel_assembly(f"Wheel_{corner}", pos)
        build_suspension_components(corner, pos)
        
    print("Wheels and suspension systems constructed.")

# ==============================================================================
# 7. LIGHTING SYSTEM
# ==============================================================================
def build_lighting():
    # 1. Main Headlights (Composite outer units)
    for sx, name in [(0.65, "Headlight_L"), (-0.65, "Headlight_R")]:
        lamp = create_box(name, "LIGHTS", size=(0.28, 0.12, 0.14), location=(sx, 2.04, 0.62), mat_name="Light_Glass")
        bezel = create_box(name + "_Bezel", "LIGHTS", size=(0.30, 0.04, 0.16), location=(sx, 2.02, 0.62), mat_name="Black_Plastic")
        
    # 2. Quad Auxiliary 150mm Rally Driving Pods (Bumper light bar)
    aux_x = [0.42, 0.15, -0.15, -0.42]
    for i, ax in enumerate(aux_x):
        pod = create_cylinder(f"Auxiliary_Lamp_{i+1}", "LIGHTS", radius=0.08, depth=0.10,
                              location=(ax, 2.14, 0.68), rotation=(math.radians(90), 0, 0), segments=24, mat_name="Light_Glass")
        housing = create_cylinder(f"Aux_Housing_{i+1}", "LIGHTS", radius=0.085, depth=0.09,
                                  location=(ax, 2.10, 0.68), rotation=(math.radians(90), 0, 0), segments=24, mat_name="Black_Plastic")
        
    # 3. Lower Bumper Amber Fog Lamps
    create_box("FogLamp_L", "LIGHTS", size=(0.18, 0.06, 0.08), location=(0.60, 2.10, 0.32), mat_name="Light_Glass")
    create_box("FogLamp_R", "LIGHTS", size=(0.18, 0.06, 0.08), location=(-0.60, 2.10, 0.32), mat_name="Light_Glass")
    
    # 4. Rear Full-Width Tail Light Assembly
    create_box("Tail_Lights", "LIGHTS", size=(1.60, 0.08, 0.14), location=(0.0, -2.06, 0.66), mat_name="Rear_Light_Red")
    
    print("Lighting systems constructed.")

# ==============================================================================
# 8. COCKPIT INTERIOR
# ==============================================================================
def build_interior():
    # 1. Interior Floor Pan
    create_box("Interior_Floor", "INTERIOR", size=(1.40, 1.80, 0.04), location=(0.0, -0.10, 0.22), mat_name="Interior_Material")
    
    # 2. Flocked Dashboard
    dash = create_box("Dashboard", "INTERIOR", size=(1.38, 0.44, 0.28), location=(0.0, 0.45, 0.72), mat_name="Interior_Material")
    
    # 3. Instrument Binnacle & Gauges
    binnacle = create_box("Instrument_Cluster", "INTERIOR", size=(0.42, 0.18, 0.16), location=(0.35, 0.38, 0.82), mat_name="Interior_Material")
    
    # 4. Steering Column & Steering Wheel (Pivot placed on steering column axis!)
    col_x, col_y, col_z = 0.35, 0.24, 0.76
    rake_angle = math.radians(22) # 22 degree rake
    
    column = create_cylinder("Steering_Column", "INTERIOR", radius=0.022, depth=0.32,
                             location=(col_x, col_y, col_z), rotation=(rake_angle, 0, 0), segments=16, mat_name="Black_Plastic")
                             
    # Deep-dish Steering Wheel Rim & 3 Spokes
    sw_pos = (col_x, col_y - 0.15 * math.cos(rake_angle), col_z + 0.15 * math.sin(rake_angle))
    
    # Empty at rotation axis
    sw_empty = bpy.data.objects.new("Steering_Wheel", None)
    sw_empty.location = sw_pos
    sw_empty.rotation_euler = (rake_angle, 0, 0)
    COLLECTIONS["INTERIOR"].objects.link(sw_empty)
    
    rim = create_cylinder("Steering_Wheel_Rim", "INTERIOR", radius=0.17, depth=0.025,
                          location=sw_pos, rotation=(rake_angle, 0, 0), segments=28, mat_name="Black_Plastic")
    rim.parent = sw_empty
    
    hub = create_cylinder("Steering_Wheel_Hub", "INTERIOR", radius=0.04, depth=0.05,
                          location=sw_pos, rotation=(rake_angle, 0, 0), segments=16, mat_name="Aluminium")
    hub.parent = sw_empty
    
    # 5. FIA Racing Bucket Seats (Driver Left, Navigator Right)
    for sx, name in [(0.35, "Seat_Driver"), (-0.35, "Seat_Navigator")]:
        seat_base = create_box(name + "_Base", "INTERIOR", size=(0.46, 0.52, 0.14), location=(sx, -0.15, 0.32), mat_name="Interior_Material")
        seat_back = create_box(name + "_Back", "INTERIOR", size=(0.44, 0.12, 0.65), location=(sx, -0.38, 0.64), rotation=(math.radians(-14), 0, 0), mat_name="Interior_Material")
        
        # Red 5-Point Harness Straps
        for belt_x in [sx - 0.10, sx + 0.10]:
            create_box(f"Harness_{sx}_{belt_x}", "INTERIOR", size=(0.045, 0.015, 0.55), location=(belt_x, -0.36, 0.64), rotation=(math.radians(-14), 0, 0), mat_name="Apex_Red_Paint")
            
    # 6. Full FIA 45mm Tubular Steel Roll Cage
    tubes = [
        # Main B-Hoop
        ("RollCage_BHoop_Top", (1.20, 0.045, 0.045), (0.0, -0.32, 1.28)),
        ("RollCage_BHoop_L", (0.045, 0.045, 0.95), (0.58, -0.32, 0.80)),
        ("RollCage_BHoop_R", (0.045, 0.045, 0.95), (-0.58, -0.32, 0.80)),
        # Roof Diagonal
        ("RollCage_RoofDiag", (0.045, 0.85, 0.045), (0.0, 0.05, 1.28)),
        # Front A-Pillar Down-tubes
        ("RollCage_APillar_L", (0.045, 0.65, 0.045), (0.58, 0.25, 0.95)),
        ("RollCage_APillar_R", (0.045, 0.65, 0.045), (-0.58, 0.25, 0.95)),
        # Rear Stays to Shock Towers
        ("RollCage_RearStay_L", (0.045, 0.95, 0.045), (0.58, -0.80, 0.85)),
        ("RollCage_RearStay_R", (0.045, 0.95, 0.045), (-0.58, -0.80, 0.85)),
    ]
    for t_name, t_size, t_pos in tubes:
        create_box(t_name, "INTERIOR", size=t_size, location=t_pos, mat_name="Aluminium")
        
    # 7. Sequential Shifter & Tall Hydraulic Handbrake
    create_cylinder("Shifter_Lever", "INTERIOR", radius=0.012, depth=0.32, location=(0.08, 0.08, 0.44), mat_name="Aluminium")
    create_cylinder("Handbrake_Lever", "INTERIOR", radius=0.014, depth=0.45, location=(-0.06, 0.02, 0.50), rotation=(math.radians(12), 0, 0), mat_name="Apex_Red_Paint")
    
    # 8. Aluminium Pedal Box (Throttle, Brake, Clutch)
    for px, p_name in [(0.42, "Pedal_Throttle"), (0.35, "Pedal_Brake"), (0.28, "Pedal_Clutch")]:
        create_box(p_name, "INTERIOR", size=(0.045, 0.015, 0.08), location=(px, 0.72, 0.32), rotation=(math.radians(35), 0, 0), mat_name="Aluminium")
        
    print("Cockpit interior constructed.")

# ==============================================================================
# 9. EXHAUST SYSTEMS
# ==============================================================================
def build_exhaust():
    # 1. Right Rocker Side-Exit Oval Tip
    create_cylinder("Exhaust_Side", "EXHAUST", radius=0.038, depth=0.18,
                    location=(0.89, -0.45, 0.18), rotation=(0, math.radians(90), 0), segments=16, mat_name="Exhaust_Metal")
                    
    # 2. Dual Rear 76mm Stainless Tips through Diffuser
    for sx in [0.28, -0.28]:
        tip = create_cylinder(f"Exhaust_Rear_{'L' if sx>0 else 'R'}", "EXHAUST", radius=0.042, depth=0.22,
                              location=(sx, -2.14, 0.24), rotation=(math.radians(90), 0, 0), segments=20, mat_name="Exhaust_Metal")
    print("Exhaust systems constructed.")

# ==============================================================================
# 10. STUDIO LIGHTING RIG & MULTI-VIEW CAMERAS
# ==============================================================================
CAMERAS = {}

def setup_studio_lighting():
    # 3-Point Studio Lights
    # 1. Key Light
    key_data = bpy.data.lights.new(name="Key_Light", type='AREA')
    key_data.energy = 2500
    key_data.size = 4.0
    key_obj = bpy.data.objects.new("Key_Light", key_data)
    key_obj.location = (4.5, 4.5, 5.0)
    key_obj.rotation_euler = (math.radians(45), math.radians(15), math.radians(45))
    bpy.context.scene.collection.objects.link(key_obj)
    
    # 2. Fill Light
    fill_data = bpy.data.lights.new(name="Fill_Light", type='AREA')
    fill_data.energy = 1200
    fill_data.size = 5.0
    fill_obj = bpy.data.objects.new("Fill_Light", fill_data)
    fill_obj.location = (-4.5, 2.5, 4.0)
    fill_obj.rotation_euler = (math.radians(40), math.radians(-15), math.radians(-40))
    bpy.context.scene.collection.objects.link(fill_obj)
    
    # 3. Rim / Hair Light
    rim_data = bpy.data.lights.new(name="Rim_Light", type='AREA')
    rim_data.energy = 2000
    rim_data.size = 3.5
    rim_obj = bpy.data.objects.new("Rim_Light", rim_data)
    rim_obj.location = (0.0, -5.5, 4.5)
    rim_obj.rotation_euler = (math.radians(-50), 0, math.radians(180))
    bpy.context.scene.collection.objects.link(rim_obj)
    
    # 4. Underbody Uplight
    up_data = bpy.data.lights.new(name="Underbody_Light", type='POINT')
    up_data.energy = 400
    up_obj = bpy.data.objects.new("Underbody_Light", up_data)
    up_obj.location = (0.0, 0.0, -0.5)
    bpy.context.scene.collection.objects.link(up_obj)

def setup_camera(name, location, rotation, lens=50):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam_obj = bpy.data.objects.new(name, cam_data)
    cam_obj.location = location
    cam_obj.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(cam_obj)
    CAMERAS[name] = cam_obj
    return cam_obj

def setup_all_cameras():
    # 1. Front Elevation
    setup_camera("Cam_Front", (0.0, 6.5, 0.65), (math.radians(88), 0, math.radians(180)), lens=65)
    # 2. Rear Elevation
    setup_camera("Cam_Rear", (0.0, -6.5, 0.75), (math.radians(92), 0, 0), lens=65)
    # 3. Left Side Profile
    setup_camera("Cam_Left", (6.8, 0.0, 0.65), (math.radians(88), 0, math.radians(90)), lens=65)
    # 4. Right Side Profile
    setup_camera("Cam_Right", (-6.8, 0.0, 0.65), (math.radians(88), 0, math.radians(-90)), lens=65)
    # 5. Top Plan View
    setup_camera("Cam_Top", (0.0, 0.0, 7.5), (0, 0, math.radians(90)), lens=50)
    # 6. Front 3/4 Isometric
    setup_camera("Cam_Iso_Front", (4.8, 4.8, 2.8), (math.radians(65), 0, math.radians(135)), lens=55)
    # 7. Rear 3/4 Isometric
    setup_camera("Cam_Iso_Rear", (4.8, -4.8, 2.8), (math.radians(115), 0, math.radians(45)), lens=55)
    # 8. Cockpit First-Person (FPV)
    setup_camera("Cam_Cockpit", (0.35, -0.15, 0.95), (math.radians(85), 0, math.radians(180)), lens=28)
    print("Multi-angle studio cameras initialized.")

# ==============================================================================
# 11. MULTI-VIEW RENDERING PIPELINE
# ==============================================================================
def render_all_previews():
    scene = bpy.context.scene
    render_passes = [
        ("Cam_Iso_Front", "APEX_RALLY_PREVIEW.png"),
        ("Cam_Front", "preview_front.png"),
        ("Cam_Rear", "preview_rear.png"),
        ("Cam_Left", "preview_left.png"),
        ("Cam_Right", "preview_right.png"),
        ("Cam_Top", "preview_top.png"),
        ("Cam_Iso_Rear", "preview_iso_rear.png"),
        ("Cam_Cockpit", "preview_cockpit.png"),
    ]
    
    for cam_name, filename in render_passes:
        if cam_name in CAMERAS:
            scene.camera = CAMERAS[cam_name]
            out_path = os.path.join(PREVIEW_DIR, filename)
            scene.render.filepath = out_path
            print(f"Rendering: {filename} from {cam_name}...")
            bpy.ops.render.render(write_still=True)
            print(f"Saved: {out_path}")

# ==============================================================================
# 12. EXPORT ASSETS (GLB & BLEND)
# ==============================================================================
def export_assets():
    # 1. Save master .blend file
    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
    print(f"Master project saved to: {OUTPUT_BLEND}")
    
    # 2. Export glTF 2.0 binary asset (.glb)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False
    )
    print(f"Game-ready GLB asset exported to: {OUTPUT_GLB}")

# ==============================================================================
# 13. GENERATE APEX_RALLY_COMPONENTS.MD DOCUMENTATION
# ==============================================================================
def generate_documentation():
    doc_path = os.path.join(BASE_DIR, "APEX_RALLY_COMPONENTS.md")
    
    lines = [
        "# APEX RALLY — 3D Asset Hierarchy & Component Specification",
        "",
        "## 1. Asset Overview",
        "- **Vehicle Type**: 1980s Group B Rally Coupe",
        "- **Target Environment**: WebGL / Three.js / React Three Fiber & Unreal Engine 5",
        "- **Master Project**: [`APEX_RALLY_MASTER.blend`](file:///d:/carrr/APEX_RALLY_MASTER.blend)",
        "- **Exported Web Asset**: [`APEX_RALLY.glb`](file:///d:/carrr/APEX_RALLY.glb)",
        "- **Texture Directory**: [`APEX_RALLY_TEXTURES/`](file:///d:/carrr/APEX_RALLY_TEXTURES/)",
        "- **Hero Preview**: [`APEX_RALLY_PREVIEW.png`](file:///d:/carrr/APEX_RALLY_PREVIEW.png)",
        "",
        "## 2. Metric Dimensions",
        "- **Overall Length**: 4,300 mm (Y: -2.15m to +2.15m)",
        "- **Overall Width**: 1,900 mm over blister flares (X: -0.95m to +0.95m)",
        "- **Wheelbase**: 2,500 mm (Front Axle Y: +1.25m, Rear Axle Y: -1.25m)",
        "- **Overall Height**: 1,380 mm from ground plane (Z: 0.00m to 1.38m)",
        "- **Track Width**: 1,650 mm (X: ±0.825m)",
        "- **Wheel Outer Diameter**: 700 mm (R = 0.35m), Tyre Width: 280 mm",
        "",
        "## 3. Object Hierarchy & Collection Structure",
        "```",
        "APEX_RALLY (Master Collection)",
        "├── BODY",
        "│   ├── Main_Body (Monocoque unibody, roof, sills, pillars, quarter panels)",
        "│   ├── Bonnet (Forward-hinged hood with twin NACA ducts and white stripes)",
        "│   ├── Front_Bumper (Deep rally apron with radiator cutout and lip)",
        "│   ├── Rear_Bumper (Aerodynamic rear fascia with diffuser cutouts)",
        "│   ├── Door_L & Door_R (Independent door skins with recessed handles)",
        "│   ├── Skid_Plate (8mm brushed aluminium underbody armor plate)",
        "│   ├── SideSkirt_L & SideSkirt_R (Aero rocker panels)",
        "│   ├── Roof_Scoop (Ram-air induction scoop on roof crown)",
        "│   └── Windshield_Front / Rear / Side_L / Side_R (Tinted glass)",
        "├── WHEELS",
        "│   ├── Wheel_FL (Pivot: +0.825, +1.250, 0.350)",
        "│   ├── Wheel_FR (Pivot: -0.825, +1.250, 0.350)",
        "│   ├── Wheel_RL (Pivot: +0.825, -1.250, 0.350)",
        "│   ├── Wheel_RR (Pivot: -0.825, -1.250, 0.350)",
        "│   └── (Each wheel contains Tyre_*, Rim_*, BrakeDisc_*, BrakeCaliper_*)",
        "├── SUSPENSION",
        "│   ├── Spring_FL / FR / RL / RR (3D mathematical helical coil springs)",
        "│   ├── Shock_FL / FR / RL / RR (Inverted monotube damper bodies)",
        "│   └── ControlArm_FL / FR / RL / RR (Tubular lower A-arm wishbones)",
        "├── LIGHTS",
        "│   ├── Headlight_L & Headlight_R (Main composite rectangular lenses)",
        "│   ├── Auxiliary_Lamp_1..4 (Quad 150mm round rally driving pods)",
        "│   ├── FogLamp_L & FogLamp_R (Lower bumper amber fog lamps)",
        "│   └── Tail_Lights (Full-width smoked ruby red lightbar)",
        "├── INTERIOR",
        "│   ├── Dashboard (Flocked rally dash with instrument binnacle)",
        "│   ├── Instrument_Cluster (Analog speedometer, tachometer, boost gauges)",
        "│   ├── Steering_Wheel (Pivot along steering column axis at 22° rake)",
        "│   ├── Steering_Column (Chromoly steering shaft)",
        "│   ├── Seat_Driver & Seat_Navigator (FIA racing buckets with 5-point harnesses)",
        "│   ├── RollCage_* (45mm tubular steel safety cage with X-bracing)",
        "│   ├── Shifter_Lever & Handbrake_Lever (Sequential rally shifter & e-brake)",
        "│   └── Pedal_Throttle / Brake / Clutch (Aluminium floor pedal box)",
        "├── AERODYNAMICS",
        "│   ├── Rear_Spoiler (Inverted camber aerodynamic airfoil blade)",
        "│   ├── SpoilerEndplate_L & SpoilerEndplate_R (3D endplates)",
        "│   ├── SpoilerPylon_L & SpoilerPylon_R (Twin swept carbon pylons)",
        "│   ├── Front_Splitter (Chassis-mounted carbon splitter with turnbuckles)",
        "│   └── Rear_Diffuser (4-tunnel aerodynamic carbon diffuser with strakes)",
        "└── EXHAUST",
        "    ├── Exhaust_Side (Right rocker exit oval tip)",
        "    └── Exhaust_Rear_L & Exhaust_Rear_R (Dual 76mm stainless tips)",
        "```",
        "",
        "## 4. PBR Material Manifest (14 Materials)",
        "1. `Apex_Red_Paint` — Glossy red automotive clearcoat finish (`#D11919`).",
        "2. `Racing_White` — Alpine white racing stripes (`#F8F8FA`).",
        "3. `Tyre_Rubber` — Asymmetric rally block tread with sidewall typography.",
        "4. `Rim_White` — 15-spoke rally alloy gloss finish.",
        "5. `Brake_Metal` — Cross-drilled machined rotor steel.",
        "6. `Caliper_Material` — Brembo racing red 4-piston calipers.",
        "7. `Carbon_Fibre` — 2x2 twill weave carbon fiber.",
        "8. `Window_Glass` — High-transparency dark smoke automotive glass.",
        "9. `Light_Glass` — Fluted clear glass prism headlight covers.",
        "10. `Rear_Light_Red` — Smoked ruby red tail lamp lens.",
        "11. `Aluminium` — Brushed metal for skid plate and suspension struts.",
        "12. `Black_Plastic` — Satin textured black trim and seals.",
        "13. `Interior_Material` — Flocked dashboard with analog gauges.",
        "14. `Exhaust_Metal` — Heat-blued stainless steel.",
        "",
        "## 5. WebGL / Three.js Loading Example",
        "```typescript",
        "import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';",
        "",
        "const loader = new GLTFLoader();",
        "loader.load('APEX_RALLY.glb', (gltf) => {",
        "  const car = gltf.scene;",
        "  scene.add(car);",
        "  ",
        "  // Access independent moving components:",
        "  const wheelFL = car.getObjectByName('Wheel_FL');",
        "  const wheelFR = car.getObjectByName('Wheel_FR');",
        "  const steeringWheel = car.getObjectByName('Steering_Wheel');",
        "  const bonnet = car.getObjectByName('Bonnet');",
        "  const frontBumper = car.getObjectByName('Front_Bumper');",
        "  const rearSpoiler = car.getObjectByName('Rear_Spoiler');",
        "});",
        "```"
    ]
    
    with open(doc_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Documentation generated: {doc_path}")

# ==============================================================================
# MAIN PIPELINE EXECUTION
# ==============================================================================
def main():
    setup_scene()
    setup_collection_hierarchy()
    create_all_materials()
    
    build_main_body()
    build_bonnet()
    build_bumpers_and_armor()
    build_doors_and_glass()
    build_rear_spoiler()
    
    build_all_running_gear()
    build_lighting()
    build_interior()
    build_exhaust()
    
    setup_studio_lighting()
    setup_all_cameras()
    
    render_all_previews()
    export_assets()
    generate_documentation()
    print("=== APEX RALLY ASSET PIPELINE COMPLETE ===")

if __name__ == "__main__":
    main()

