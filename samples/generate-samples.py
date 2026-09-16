# Generates the demo sample assets used by the Asset Library app.
#
# Run headless with Blender 4.2+ (tested with 5.2):
#   blender -b --python samples/generate-samples.py            (writes to samples/DemoProject)
#   blender -b --python samples/generate-samples.py -- OUTDIR  (custom output root)
#
# Every scene contains a red "marker" sphere that sits at the TOP of the camera
# frame so the row order of the embedded .blend thumbnail can be verified.

import bpy
import math
import os
import sys

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1:
    ROOT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
else:
    ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DemoProject")

ITEMS = os.path.join(ROOT, "Blender", "Items")
ENEMIES = os.path.join(ROOT, "Blender", "Enemies")
TEXTURES = os.path.join(ROOT, "Photoshop", "Textures", "Items")
for d in (ITEMS, ENEMIES, TEXTURES):
    os.makedirs(d, exist_ok=True)

WRITTEN = []


def done(path):
    WRITTEN.append(path)
    print("wrote %-60s %7d bytes" % (os.path.relpath(path, ROOT), os.path.getsize(path)))


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def op_exists(op):
    """bpy.ops.<mod>.<name> resolves lazily, so probe the RNA type instead of hasattr()."""
    try:
        op.get_rna_type()
        return True
    except KeyError:
        return False


def op_call(op, **kwargs):
    """Call an operator, silently dropping keyword args this Blender version lacks."""
    props = op.get_rna_type().properties.keys()
    return op(**{k: v for k, v in kwargs.items() if k in props})


def solid_shading(shading):
    """Solid shading coloured per object (no materials -> no node trees -> small files)."""
    shading.type = "SOLID"
    shading.light = "STUDIO"
    shading.color_type = "OBJECT"
    shading.background_type = "VIEWPORT"
    shading.background_color = (0.20, 0.22, 0.30)


def new_scene(name):
    """Fresh, tiny file: empty factory scene, all but one workspace removed."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = name
    # Drop the default workspaces/screens so uncompressed .blend files stay small.
    keep = bpy.context.workspace
    extra = [ws for ws in bpy.data.workspaces if ws != keep]
    if extra:
        bpy.data.batch_remove(ids=extra)
    if scene.sequence_editor:
        scene.sequence_editor_clear()
    # The thumbnail renderer uses the 3D viewport's shading when the screen has one,
    # otherwise the scene display settings, so configure both.
    solid_shading(scene.display.shading)
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    solid_shading(space.shading)
    scene.render.resolution_x = scene.render.resolution_y = 256

    # Camera: 7 units back, 2.3 up, aimed at the origin.
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (0.0, -7.0, 2.3)
    cam.rotation_euler = (math.radians(90.0) - math.atan2(2.3, 7.0), 0.0, 0.0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    light_data = bpy.data.lights.new("Sun", "SUN")
    light = bpy.data.objects.new("Sun", light_data)
    light.rotation_euler = (math.radians(45), math.radians(15), 0.0)
    scene.collection.objects.link(light)

    # Red marker sphere near the TOP of the frame (used to verify thumbnail row order).
    add_primitive("uv_sphere", "TopMarker", (1.0, 0.02, 0.02, 1.0),
                  radius=0.35, location=(0.0, 0.0, 1.8), segments=12, ring_count=6)
    # Neutral ground plane at the bottom.
    add_primitive("plane", "Ground", (0.35, 0.35, 0.38, 1.0), size=8.0, location=(0.0, 0.0, -1.0))
    return scene


def add_primitive(kind, name, rgba, **kwargs):
    getattr(bpy.ops.mesh, "primitive_%s_add" % kind)(**kwargs)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.color = rgba                 # shown by Solid shading in "Object" colour mode
    return obj


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def save_blend(path, compress):
    # Force a camera-rendered preview so a TEST (thumbnail) block is written even headless.
    bpy.context.preferences.filepaths.file_preview_type = "CAMERA"
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=compress, copy=True)
    done(path)


def export_fbx(obj, path):
    select_only(obj)
    if op_exists(bpy.ops.wm.fbx_export):             # native C++ exporter (if available)
        op_call(bpy.ops.wm.fbx_export, filepath=path, export_selected_objects=True,
                export_animation=False, export_materials=False)
    else:                                            # legacy Python add-on exporter
        op_call(bpy.ops.export_scene.fbx, filepath=path, use_selection=True,
                bake_anim=False, path_mode="STRIP", embed_textures=False)
    done(path)


def export_obj(obj, path):
    select_only(obj)
    op_call(bpy.ops.wm.obj_export, filepath=path, export_selected_objects=True,
            export_materials=False, export_uv=True, export_normals=True)
    done(path)


def export_glb(obj, path):
    select_only(obj)
    op_call(bpy.ops.export_scene.gltf, filepath=path, export_format="GLB",
            use_selection=True, export_animations=False, export_apply=True)
    done(path)


def save_image(name, path, fmt, painter, quality=90):
    """Build a 256x256 RGBA image with painter(x, y) -> (r, g, b) and save it."""
    size = 256
    img = bpy.data.images.new(name, size, size, alpha=False)
    px = [0.0] * (size * size * 4)
    for y in range(size):            # bpy pixel rows are bottom-up
        for x in range(size):
            r, g, b = painter(x, size - 1 - y)   # painter gets top-down coordinates
            i = (y * size + x) * 4
            px[i], px[i + 1], px[i + 2], px[i + 3] = r, g, b, 1.0
    img.pixels.foreach_set(px)
    img.file_format = fmt
    img.filepath_raw = path
    img.save(filepath=path, quality=quality)
    done(path)


# --------------------------------------------------------------------------- #
# Blender/Items
# --------------------------------------------------------------------------- #
new_scene("Cube")
cube = add_primitive("cube", "Cube", (0.15, 0.75, 0.25, 1.0), size=2.0)
save_blend(os.path.join(ITEMS, "Cube.blend"), compress=False)
export_fbx(cube, os.path.join(ITEMS, "Cube.fbx"))
export_obj(cube, os.path.join(ITEMS, "Cube.obj"))

new_scene("Torus")
torus = add_primitive("torus", "Torus", (0.95, 0.65, 0.15, 1.0),
                      major_segments=32, minor_segments=12, major_radius=1.0, minor_radius=0.4)
export_glb(torus, os.path.join(ITEMS, "Torus.glb"))

new_scene("Suzanne")
suz = add_primitive("monkey", "Suzanne", (0.25, 0.45, 0.95, 1.0), size=2.0)
save_blend(os.path.join(ITEMS, "Suzanne.blend"), compress=True)

# --------------------------------------------------------------------------- #
# Blender/Enemies
# --------------------------------------------------------------------------- #
export_fbx(suz, os.path.join(ENEMIES, "Suzanne.fbx"))

new_scene("Cone")
cone = add_primitive("cone", "Cone", (0.85, 0.25, 0.65, 1.0), vertices=24, radius1=1.0, depth=2.0)
export_obj(cone, os.path.join(ENEMIES, "Cone.obj"))

# --------------------------------------------------------------------------- #
# Photoshop/Textures/Items
# --------------------------------------------------------------------------- #
HOLES = [(40, 50, 18), (120, 30, 12), (200, 60, 22), (70, 130, 26), (160, 120, 15),
         (215, 150, 12), (35, 205, 14), (110, 210, 20), (190, 215, 17), (150, 175, 9)]


def cheese(x, y):
    for cx, cy, r in HOLES:
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return (0.55, 0.38, 0.05)              # hole
    if x < 8 or y < 8 or x >= 248 or y >= 248:
        return (0.85, 0.45, 0.10)                  # rind
    return (0.98, 0.80, 0.20)                      # cheese


def grid(x, y):
    if 14 <= y < 20:
        return (0.90, 0.10, 0.10)                  # red stripe near the top
    if x % 32 < 2 or y % 32 < 2:
        return (0.10, 0.10, 0.12)                  # grid lines
    return (0.88, 0.88, 0.90)


save_image("Cheese", os.path.join(TEXTURES, "Cheese.png"), "PNG", cheese)
save_image("Grid", os.path.join(TEXTURES, "Grid.jpg"), "JPEG", grid, quality=85)

# --------------------------------------------------------------------------- #
print("\nGenerated %d files under %s" % (len(WRITTEN), ROOT))
too_big = [p for p in WRITTEN if os.path.getsize(p) >= 300 * 1024]
if too_big:
    print("WARNING: files >= 300 KB:", too_big)
