"""Render the app icon's layers for Icon Composer.

Run headlessly, never against an open Blender: another project's file is usually loaded, and
`--background` gets its own process.

    Blender --background --factory-startup --python scripts/build-icon.py -- <output-dir>

Emits one transparent PNG per layer. It draws no chassis, no bevel, no shadow and no rounded
mask: macOS 26 composites all four onto the layers itself, and a baked copy underneath the
system's own reads as a doubled edge.
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


def rounded_rect(x, y, w, h, radii, segments=24):
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
    return [(px - CANVAS / 2, CANVAS / 2 - py, 0.0) for px, py in points]


def shape(name, verts, colour, collection):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [list(range(len(verts)))])
    mesh.update()

    material = bpy.data.materials.new(name)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = hex_to_linear(colour)
    links.new(emission.outputs["Emission"], nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
    mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def build():
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.collections):
        for item in list(block):
            block.remove(item)

    scene = bpy.context.scene
    bodies = bpy.data.collections.new("bodies")
    detail = bpy.data.collections.new("detail")
    for collection in (bodies, detail):
        scene.collection.children.link(collection)

    for index, (name, body, header, pill) in enumerate(TILES):
        x = ORIGIN + (index % 2) * (TILE + GAP)
        y = ORIGIN + (index // 2) * (TILE + GAP)

        shape(f"{name}-body", rounded_rect(x, y, TILE, TILE, (RADIUS,) * 4), body, bodies)
        # Square bottom corners: the header is a band across the top of the tile, not a pill on it.
        shape(f"{name}-header", rounded_rect(x, y, TILE, HEADER_H, (RADIUS, RADIUS, 0, 0)), header, detail)
        for slot, (width, top) in enumerate(zip(PILL_W, PILL_Y)):
            verts = rounded_rect(x + PILL_X, y + top, width, PILL_H, (PILL_H / 2,) * 4)
            shape(f"{name}-pill{slot}", verts, pill, detail)

    camera_data = bpy.data.cameras.new("Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = CANVAS
    camera = bpy.data.objects.new("Camera", camera_data)
    camera.location = (0, 0, 100)
    scene.collection.objects.link(camera)
    scene.camera = camera

    render = scene.render
    render.engine = "BLENDER_EEVEE"
    render.resolution_x = render.resolution_y = CANVAS
    render.film_transparent = True
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGBA"
    # Emission shaders only match their hex if nothing tone-maps them on the way out.
    scene.view_settings.view_transform = "Standard"
    return {"bodies": bodies, "detail": detail}


def render_layers(collections, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for name, wanted in collections.items():
        for other in collections.values():
            other.hide_render = other is not wanted
        bpy.context.scene.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"wrote {name}.png")


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "assets/icon.icon/Assets"
    render_layers(build(), out)
