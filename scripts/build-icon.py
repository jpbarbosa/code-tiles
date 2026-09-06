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
from mathutils import Vector

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
DEPTH = round(TILE * 0.115)
RAISE_HEADER = round(TILE * 0.030)
RAISE_PILL = round(TILE * 0.007)
BEVEL = max(2.0, TILE * 0.027)
# The header stands a few pixels proud, and the tiles' own bevel is wider than that: the same
# radius rounds the whole step away and leaves a colour change with no shadow under it.
HEADER_BEVEL = max(1.0, RAISE_HEADER * 0.30)

# The tray the tiles sit in. It takes the system chiclet's own outline, pulled in just enough that
# its lit rim is not clipped away by the mask.
BASE_COLOUR = "212229"
BASE_INSET = 0.984
BASE_DEPTH = round(CANVAS * 0.08)
# Wide enough that the tray's rim reads as a lit bevel rather than a cut edge - the tiles' own
# bevel is a few pixels because they are small, and the same radius on the tray shows nothing.
BASE_BEVEL = round(CANVAS * 0.060)
# The tiles want a tight specular so their rim reads as a crisp bevel. The tray does not: its rim
# is ten times wider, so the same finish turns the whole top-left corner into a blown highlight.
ROUGHNESS = 0.16
SPECULAR = 0.75
BASE_ROUGHNESS = 0.24
BASE_SPECULAR = 0.55
# The halo: how far it stands out past the tile, how thick, and how hard it burns. Only its spill
# is seen, so it carries more strength than a visible emitter would.
GLOW_SPREAD = round(TILE * 0.004)
GLOW_STRENGTH = 4.0
# The tiles stand this far off the tray, and the glow lives in that gap.
GLOW_GAP = round(DEPTH * 0.42)

# Where the light travels TO. The key comes from above and to the left, which is what puts the
# bright rim on a tile's top and left edges and drops its shadow to the bottom right.
KEY_FROM = (0.75, -0.85, -1.30)
FILL_FROM = (-0.55, 0.5, -1.15)
CUT_RADIUS = round(TILE * 0.055)

TILES = [
    ("blue",   "3F82FF", "6BA0FF", "A8C6FF"),
    ("green",  "0FC97E", "3AEBA6", "8DF5CB"),
    ("purple", "9333EA", "B45CF9", "D4A2FB"),
    ("orange", "E2551C", "F5834A", "F9B48D"),
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


def clip(polygon, planes):
    """Sutherland-Hodgman against half-planes `nx*x + ny*y <= d`."""
    for nx, ny, d in planes:
        if not polygon:
            return polygon
        out, previous = [], polygon[-1]
        for point in polygon:
            a, b = nx * previous[0] + ny * previous[1] - d, nx * point[0] + ny * point[1] - d
            if (a <= 0 <= b or b <= 0 <= a) and abs(a - b) > 1e-12:
                t = a / (a - b)
                out.append((previous[0] + (point[0] - previous[0]) * t,
                            previous[1] + (point[1] - previous[1]) * t))
            if b <= 1e-9:
                out.append(point)
            previous = point
        polygon = dedupe(out)
    return polygon


def dedupe(polygon, tolerance=1e-6):
    """Drop points that repeat their neighbour. A zero-length edge carries no direction, so any
    corner next to one is invisible to the turn angle that round_corners keys off."""
    out = []
    for point in polygon:
        if not out or math.hypot(point[0] - out[-1][0], point[1] - out[-1][1]) > tolerance:
            out.append(point)
    while len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= tolerance:
        out.pop()
    return out


def inset_polygon(polygon, distance):
    """A convex outline pulled in by a constant distance, each point moved along its own normal.

    Not by clipping against one half-plane per edge: 720 near-parallel planes applied in sequence
    erode the curve numerically, and a smooth 720-point outline came out of it as a 34-point shape
    with 421px sides - which is what put visible flat facets on the tiles' corners. Not by scaling
    about the centre either, which shrinks the corner radius and leaves a rim twice as wide there.
    """
    count = len(polygon)
    out = []
    for i in range(count):
        ax, ay = polygon[i - 1]
        cx, cy = polygon[(i + 1) % count]
        tx, ty = cx - ax, cy - ay
        length = math.hypot(tx, ty)
        if length < 1e-9:
            continue
        bx, by = polygon[i]
        out.append((bx - ty / length * distance, by + tx / length * distance))
    return out


def inner_corner(x, y, sx, sy, radius, segments=28):
    """Half-planes that round off the one corner of a quadrant facing the icon's centre."""
    planes = [(sx, 0.0, sx * x), (0.0, sy, sy * y)]
    cx, cy = x - sx * radius, y - sy * radius
    for i in range(segments + 1):
        a = math.pi / 2 * i / segments
        nx, ny = sx * math.cos(a), sy * math.sin(a)
        planes.append((nx, ny, nx * cx + ny * cy + radius))
    return planes


def round_corners(polygon, radius, threshold=20.0):
    """Replace any corner sharper than `threshold` with an arc of `radius`.

    Quartering the plate leaves two square corners per tile where a cut edge runs into the outer
    curve. The one facing the icon's centre is rounded by the clip itself; these two are not, and a
    90-degree corner beside a neighbour's identical one is the tell that the tiles were cut rather
    than drawn.
    """
    count = len(polygon)

    def walk(start, step, distance):
        """The point `distance` along the outline from vertex `start`, and the vertices consumed."""
        index, remaining, eaten = start, distance, []
        while True:
            following = (index + step) % count
            ax, ay = polygon[index]
            bx, by = polygon[following]
            span = math.hypot(bx - ax, by - ay)
            if span >= remaining or span < 1e-9:
                t = remaining / span if span > 1e-9 else 0.0
                return (ax + (bx - ax) * t, ay + (by - ay) * t), eaten
            remaining -= span
            eaten.append(following)
            index = following

    arcs, dropped = {}, set()
    for i in range(count):
        (ax, ay), (bx, by), (cx, cy) = polygon[i - 1], polygon[i], polygon[(i + 1) % count]
        ux, uy, vx, vy = ax - bx, ay - by, cx - bx, cy - by
        lu, lv = math.hypot(ux, uy), math.hypot(vx, vy)
        if lu < 1e-9 or lv < 1e-9:
            continue
        interior = math.acos(max(-1.0, min(1.0, (ux * vx + uy * vy) / (lu * lv))))
        if math.degrees(math.pi - interior) <= threshold:
            continue
        trim = radius / math.tan(interior / 2)
        if trim > lu + lv:
            continue
        start_point, back = walk(i, -1, trim)
        end_point, forward = walk(i, 1, trim)
        centre_distance = radius / math.sin(interior / 2)
        mx, my = ux / lu + vx / lv, uy / lu + vy / lv
        ml = math.hypot(mx, my)
        if ml < 1e-9:
            continue
        ox, oy = bx + mx / ml * centre_distance, by + my / ml * centre_distance
        a0 = math.atan2(start_point[1] - oy, start_point[0] - ox)
        a1 = math.atan2(end_point[1] - oy, end_point[0] - ox)
        while a1 - a0 > math.pi:
            a1 -= 2 * math.pi
        while a0 - a1 > math.pi:
            a1 += 2 * math.pi
        steps = max(4, int(abs(a1 - a0) / math.radians(4)))
        arcs[i] = [(ox + math.cos(a0 + (a1 - a0) * k / steps) * radius,
                    oy + math.sin(a0 + (a1 - a0) * k / steps) * radius) for k in range(steps + 1)]
        dropped.update(back)
        dropped.update(forward)

    out = []
    for i in range(count):
        if i in arcs:
            out.extend(arcs[i])
        elif i not in dropped:
            out.append(polygon[i])
    return out


def slab(name, outline, colour, top, thickness, collection, bevel_radius=None, emission=0.0,
         roughness=None, specular=None):
    """A rounded-rect plate with real thickness, shaded as though its top rim were rounded."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x, y, top) for x, y in outline], [], [list(range(len(outline)))])
    mesh.update()

    material = bpy.data.materials.new(name)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    if emission:
        nodes.clear()
        shader = nodes.new("ShaderNodeEmission")
        shader.inputs["Color"].default_value = hex_to_linear(colour)
        shader.inputs["Strength"].default_value = emission
        links.new(shader.outputs["Emission"], nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        solid = obj.modifiers.new("solidify", "SOLIDIFY")
        solid.thickness, solid.offset = thickness, -1
        collection.objects.link(obj)
        return obj
    principled = nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = hex_to_linear(colour)
    principled.inputs["Roughness"].default_value = ROUGHNESS if roughness is None else roughness
    principled.inputs["Specular IOR Level"].default_value = SPECULAR if specular is None else specular
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
        slab("base", silhouette, BASE_COLOUR, -DEPTH - GLOW_GAP, BASE_DEPTH, tiles, BASE_BEVEL,
             roughness=BASE_ROUGHNESS, specular=BASE_SPECULAR)

    # The tiles are the tray's own outline quartered, not rounded rectangles laid on top of it:
    # each keeps the chiclet's corner on its outer side and takes a small fillet facing the centre.
    plate = inset_polygon(silhouette, (CANVAS - BLOCK) / 2) if silhouette else None

    for index, (name, body, header, pill) in enumerate(TILES):
        x = ORIGIN + (index % 2) * (TILE + GAP)
        y = ORIGIN + (index // 2) * (TILE + GAP)
        sx, sy = (1 if index % 2 == 0 else -1), (-1 if index // 2 == 0 else 1)

        if plate:
            quadrant = clip(plate, inner_corner(-sx * GAP / 2, -sy * GAP / 2, sx, sy, RADIUS))
        else:
            quadrant = rounded_rect(x, y, TILE, TILE, (RADIUS,) * 4)
        quadrant = round_corners(quadrant, CUT_RADIUS)
        slab(f"{name}-body", quadrant, body, 0, DEPTH, tiles)

        # The header is a band across the top of the tile, so it inherits the tile's own top edge
        # rather than a rounded rectangle's.
        band = clip(quadrant, [(0.0, -1.0, -(CANVAS / 2 - y - HEADER_H))])
        slab(f"{name}-header", band, header, RAISE_HEADER, RAISE_HEADER, tiles, HEADER_BEVEL)

        for slot, (width, top) in enumerate(zip(PILL_W, PILL_Y)):
            outline = rounded_rect(x + PILL_X, y + top, width, PILL_H, (PILL_H / 2,) * 4)
            slab(f"{name}-pill{slot}", outline, pill, RAISE_PILL, RAISE_PILL, tiles)

        # The halo fills the gap the tile stands off the tray by, on the tile's own outline, so its
        # light leaves SIDEWAYS and falls off with distance. Anything overhanging the tray instead
        # lights the strip beneath it almost evenly, and that flat strip is a ring, not a glow.
        halo = inset_polygon(quadrant, -GLOW_SPREAD)
        lamp = slab(f"{name}-halo", halo, header, -DEPTH, GLOW_GAP, tiles,
                    emission=GLOW_STRENGTH)
        # Hidden from the camera, so what lands on the tray is its LIGHT and not the shape itself.
        # Seen directly it is a solid ring of colour, which is a border, not a glow.
        lamp.visible_camera = False

    # Aimed by direction rather than Euler angles: with an XYZ order the azimuth of a tilted sun
    # is not the Z term, and two opposite Z values gave two different renders that both read as
    # lit from the same side.
    def aim(obj, towards):
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(Vector(towards).normalized())

    key = bpy.data.lights.new("key", "SUN")
    key.energy, key.angle = 2.80, 0.22
    key_obj = bpy.data.objects.new("key", key)
    aim(key_obj, KEY_FROM)
    scene.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy, fill.angle = 0.70, 0.90
    fill_obj = bpy.data.objects.new("fill", fill)
    aim(fill_obj, FILL_FROM)
    scene.collection.objects.link(fill_obj)

    world = bpy.data.worlds.new("world")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.30
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
