"""Render the app icon's layers for Icon Composer.

Run headlessly, never against an open Blender: another project's file is usually loaded, and
`--background` gets its own process.

    Blender --background --factory-startup --python scripts/build-icon.py -- <output-dir>

Emits one transparent PNG. It draws no chassis and no rounded mask - macOS 26 supplies the
chiclet, and a baked copy underneath the system's own reads as a doubled edge - but the tiles
inside it are modelled and lit here. The system's glass is a sheen over the whole icon; it is not
a substitute for the artwork having form, and flat plates under it read as any other icon.
"""

import math
import os
import sys

import bpy

CANVAS = 1024

# The design is laid out in canvas pixels with the origin top-left, which is how the measurements
# off the old render read. Blender wants centre-origin and y up.
BLOCK = int(os.environ.get("ICON_BLOCK", 928))
GAP = round(BLOCK * 0.033)
TILE = (BLOCK - GAP) // 2
ORIGIN = (CANVAS - BLOCK) // 2

# Everything inside a tile is a fraction of it, so the block above is the only number to tune.
RADIUS = round(TILE * 0.143)
HEADER_H = round(TILE * 0.231)
PILL_H = round(TILE * 0.071)
PILL_X = round(TILE * 0.132)
PILL_W = (round(TILE * 0.407), round(TILE * 0.571))
PILL_Y = (round(TILE * 0.503), round(TILE * 0.657))

# Depth, in the same canvas pixels. The tiles are plates; the header and the pills sit proud of
# them, which is what puts a lit rim on each and a shadow under it.
DEPTH = round(TILE * 0.075)
RAISE_HEADER = round(TILE * 0.012)
RAISE_PILL = round(TILE * 0.022)
BEVEL = max(2.0, TILE * 0.008)

# The tray the tiles sit in. It takes the system chiclet's own outline, pulled in just enough that
# its lit rim is not clipped away by the mask.
BASE_COLOUR = "34353C"
BASE_INSET = 0.984
BASE_DEPTH = round(CANVAS * 0.08)
# Wide enough that the tray's rim reads as a lit bevel rather than a cut edge - the tiles' own
# bevel is a few pixels because they are small, and the same radius on the tray shows nothing.
BASE_BEVEL = round(CANVAS * 0.060)

TILES = [
    ("blue",   "2F63D2", "6E9DFF", "9DBCFB"),
    ("green",  "0F9A5E", "4CF5A4", "83EFC4"),
    ("purple", "6B1FBE", "B45CF9", "CE9CFB"),
    ("orange", "B84518", "F27A4C", "F7B195"),
]


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(value):
    r, g, b = (int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def rounded_rect(x, y, w, h, radii, segments=20):
    """Perimeter of a rounded rectangle in canvas pixels, as centre-origin Blender coordinates."""
    tl, tr, br, bl = radii
    corners = [
        (x + w - tr, y + tr, tr, -math.pi / 2, 0),
        (x + w - br, y + h - br, br, 0, math.pi / 2),
        (x + bl, y + h - bl, bl, math.pi / 2, math.pi),
        (x + tl, y + tl, tl, math.pi, math.pi * 3 / 2),
    ]
    points = []
    for cx, cy, r, start, end in corners:
        if r <= 0:
            points.append((cx, cy))
            continue
        for i in range(segments + 1):
            a = start + (end - start) * i / segments
            points.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    flat = [(px - CANVAS / 2, CANVAS / 2 - py) for px, py in points]

    # Solidify extrudes along the face normal, so the winding decides which way the slab grows.
    area = sum(ax * by - bx * ay for (ax, ay), (bx, by) in zip(flat, flat[1:] + flat[:1]))
    if area < 0:
        flat.reverse()
    return flat


def slab(name, outline, colour, top, thickness, collection, bevel_radius=None):
    """A rounded-rect plate with real thickness, shaded as though its top rim were rounded."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x, y, top) for x, y in outline], [], [list(range(len(outline)))])
    mesh.update()

    material = bpy.data.materials.new(name)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    principled = nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = hex_to_linear(colour)
    principled.inputs["Roughness"].default_value = 0.62
    principled.inputs["Specular IOR Level"].default_value = 0.22
    # The rim highlight comes from the shader rounding the normals, not from bevel geometry: a
    # bevel wide enough to catch light also self-intersects on the corner arcs.
    bevel = nodes.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = BEVEL if bevel_radius is None else bevel_radius
    bevel.samples = 6
    links.new(bevel.outputs["Normal"], principled.inputs["Normal"])
    mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    solidify = obj.modifiers.new("solidify", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = -1
    obj.data.shade_smooth()
    collection.objects.link(obj)
    return obj


def build(silhouette):
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.collections,
                  bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)

    scene = bpy.context.scene
    tiles = bpy.data.collections.new("tiles")
    scene.collection.children.link(tiles)

    if silhouette:
        slab("base", silhouette, BASE_COLOUR, -DEPTH, BASE_DEPTH, tiles, BASE_BEVEL)

    for index, (name, body, header, pill) in enumerate(TILES):
        x = ORIGIN + (index % 2) * (TILE + GAP)
        y = ORIGIN + (index // 2) * (TILE + GAP)

        slab(f"{name}-body", rounded_rect(x, y, TILE, TILE, (RADIUS,) * 4), body, 0, DEPTH, tiles)
        # Square bottom corners: the header is a band across the top of the tile, not a pill on it.
        slab(f"{name}-header", rounded_rect(x, y, TILE, HEADER_H, (RADIUS, RADIUS, 0, 0)),
             header, RAISE_HEADER, RAISE_HEADER, tiles)
        for slot, (width, top) in enumerate(zip(PILL_W, PILL_Y)):
            outline = rounded_rect(x + PILL_X, y + top, width, PILL_H, (PILL_H / 2,) * 4)
            slab(f"{name}-pill{slot}", outline, pill, RAISE_PILL, RAISE_PILL, tiles)

    key = bpy.data.lights.new("key", "SUN")
    key.energy, key.angle = 1.70, 0.55
    key_obj = bpy.data.objects.new("key", key)
    key_obj.rotation_euler = (math.radians(34), 0, math.radians(28))
    scene.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy, fill.angle = 0.55, 0.90
    fill_obj = bpy.data.objects.new("fill", fill)
    fill_obj.rotation_euler = (math.radians(-26), 0, math.radians(-150))
    scene.collection.objects.link(fill_obj)

    world = bpy.data.worlds.new("world")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.72
    scene.world = world

    camera_data = bpy.data.cameras.new("Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = CANVAS
    # The scene is measured in canvas pixels, so the default 100-unit far clip sits in front of it.
    camera_data.clip_start, camera_data.clip_end = 1, CANVAS * 4
    camera = bpy.data.objects.new("Camera", camera_data)
    camera.location = (0, 0, 2000)
    scene.collection.objects.link(camera)
    scene.camera = camera

    render = scene.render
    render.engine = "CYCLES"
    scene.cycles.samples = 256
    scene.cycles.use_denoising = True
    render.resolution_x = render.resolution_y = CANVAS
    render.film_transparent = True
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    # Base colours only land on their hex if nothing tone-maps them on the way out.
    scene.view_settings.view_transform = "Standard"


def read_silhouette(path):
    """The traced chiclet outline, in Blender coordinates, pulled in off the mask edge."""
    points = []
    with open(path) as handle:
        for line in handle:
            x, y = (float(v) for v in line.split())
            points.append(((x - CANVAS / 2) * BASE_INSET, (CANVAS / 2 - y) * BASE_INSET))
    area = sum(ax * by - bx * ay for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]))
    if area < 0:
        points.reverse()
    return points


def render_icon(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bpy.context.scene.render.filepath = os.path.join(out_dir, "tiles.png")
    bpy.ops.render.render(write_still=True)
    print("wrote tiles.png")


if __name__ == "__main__":
    rest = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = rest[0] if rest else "assets/icon.icon/Assets"
    build(read_silhouette(rest[1]) if len(rest) > 1 else None)
    render_icon(out)
