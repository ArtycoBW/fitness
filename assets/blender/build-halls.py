"""Author three editable Stride interiors inside the connected Blender session."""

import bpy
import math
import random
from mathutils import Vector
from pathlib import Path

ROOT = Path(r"E:\diploma\fitness")
MEDIA = ROOT / "apps" / "web" / "public" / "media" / "halls"
SOURCE = ROOT / "assets" / "blender"
MEDIA.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(4317)

# The active Blender file is the untouched default startup scene. Each room
# is authored into its own collection and can be edited in the saved .blend.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
    for datablock in list(datablocks):
        if datablock.users == 0:
            datablocks.remove(datablock)
for collection in list(bpy.data.collections):
    if not collection.objects and not collection.children:
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.7, 0.74, 0.69)


def image_noise(name, base, spread, speck=0.0, size=256):
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        for x in range(size):
            grain = random.gauss(0, spread)
            if speck and random.random() < speck:
                grain += random.choice([-0.17, 0.15])
            pixels.extend((max(0, min(1, base[0] + grain)),
                           max(0, min(1, base[1] + grain)),
                           max(0, min(1, base[2] + grain)), 1.0))
    image.pixels[:] = pixels
    image.pack()
    return image


plaster_map = image_noise("hand_trowelled_plaster", (0.79, 0.78, 0.72), 0.012)
rubber_map = image_noise("charcoal_rubber_speckle", (0.07, 0.078, 0.075), 0.018, 0.018)
linen_map = image_noise("woven_olive_linen", (0.27, 0.32, 0.265), 0.014)
oak_image = bpy.data.images.load(str(MEDIA / "oak-color.jpg"), check_existing=True)
oak_image.pack()
oak_normal = bpy.data.images.load(str(MEDIA / "oak-normal.jpg"), check_existing=True)
oak_normal.colorspace_settings.name = "Non-Color"
oak_normal.pack()
oak_roughness = bpy.data.images.load(str(MEDIA / "oak-roughness.jpg"), check_existing=True)
oak_roughness.colorspace_settings.name = "Non-Color"
oak_roughness.pack()
plank_image = bpy.data.images.load(str(MEDIA / "oak-plank-color.jpg"), check_existing=True)
plank_image.pack()
plank_normal = bpy.data.images.load(str(MEDIA / "oak-plank-normal.jpg"), check_existing=True)
plank_normal.colorspace_settings.name = "Non-Color"
plank_normal.pack()
plank_roughness = bpy.data.images.load(str(MEDIA / "oak-plank-roughness.jpg"), check_existing=True)
plank_roughness.colorspace_settings.name = "Non-Color"
plank_roughness.pack()
courtyard_image = bpy.data.images.load(str(MEDIA / "courtyard.jpg"), check_existing=True)
courtyard_image.pack()


def material(name, color, roughness=0.7, metallic=0.0, image=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Alpha"].default_value = alpha
    if image is not None:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], p.inputs["Base Color"])
        if image in (oak_image, plank_image):
            normal_tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            normal_tex.image = plank_normal if image == plank_image else oak_normal
            normal_node = mat.node_tree.nodes.new("ShaderNodeNormalMap")
            normal_node.inputs["Strength"].default_value = 0.48
            mat.node_tree.links.new(normal_tex.outputs["Color"], normal_node.inputs["Color"])
            mat.node_tree.links.new(normal_node.outputs["Normal"], p.inputs["Normal"])
            rough_tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            rough_tex.image = plank_roughness if image == plank_image else oak_roughness
            mat.node_tree.links.new(rough_tex.outputs["Color"], p.inputs["Roughness"])
    if alpha < 1:
        mat.surface_render_method = "BLENDED"
    return mat


plaster = material("Warm mineral plaster | matte", (0.79, 0.78, 0.72), 0.91, image=plaster_map)
ivory = material("Ivory lime paint", (0.85, 0.85, 0.8), 0.88)
wood = material("Natural oak | open grain", (0.66, 0.52, 0.34), 0.67, image=oak_image)
wood_floor = material("Individual oak floor boards", (0.68, 0.56, 0.4), 0.68, image=plank_image)
wood_end = material("Oak end grain", (0.43, 0.32, 0.2), 0.78)
rubber = material("Recycled charcoal rubber", (0.08, 0.085, 0.08), 0.92, image=rubber_map)
black = material("Powder coated graphite steel", (0.065, 0.073, 0.067), 0.49, 0.56)
aluminium = material("Brushed anodised aluminium", (0.48, 0.51, 0.47), 0.28, 0.88)
chrome = material("Polished chrome", (0.72, 0.74, 0.7), 0.16, 0.96)
upholstery = material("Sage woven upholstery", (0.27, 0.32, 0.265), 0.82, image=linen_map)
mat_sage = material("Muted sage exercise mat", (0.19, 0.28, 0.24), 0.9)
mat_cream = material("Cream exercise mat", (0.58, 0.6, 0.5), 0.9)
cork = material("Cork", (0.55, 0.39, 0.2), 0.88)
mirror = material("Smoky silvered mirror", (0.27, 0.31, 0.3), 0.085, 0.93)
glass = material("Architectural glazing", (0.73, 0.8, 0.77), 0.16, 0.1, alpha=0.16)
leaf = material("Foliage green", (0.12, 0.24, 0.14), 0.77)
pot_mat = material("Terracotta ceramic", (0.37, 0.32, 0.25), 0.73)
towel = material("Unbleached cotton", (0.73, 0.71, 0.64), 0.95)
curtain = material("Translucent natural linen partition", (0.66, 0.65, 0.59), 0.98, alpha=0.54)
light_mat = material("Diffused warm lamp", (0.95, 0.85, 0.69), 0.4)
steel_pin = material("Blackened stainless steel", (0.19, 0.2, 0.19), 0.36, 0.73)
outside = material("Courtyard garden wall", (0.4, 0.46, 0.39), 0.9)
courtyard = material("Photographic courtyard backdrop", (0.7, 0.7, 0.7), 0.95, image=courtyard_image)


def new_collection(name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection


def mesh_object(name, verts, faces, collection, mat, bevel=0):
    data = bpy.data.meshes.new(name + " mesh")
    data.from_pydata(verts, [], faces)
    data.update()
    uv = data.uv_layers.new(name="Architectural UV")
    for polygon in data.polygons:
        normal = polygon.normal
        axis = max(range(3), key=lambda component: abs(normal[component]))
        for loop_index in polygon.loop_indices:
            vertex = data.vertices[data.loops[loop_index].vertex_index].co
            if name == "Courtyard panorama" and axis == 0:
                uv.data[loop_index].uv = ((vertex.y + 6.25) / 12.5,
                                          vertex.z / 4.5 + 0.5)
            elif name.startswith("Oak plank") and axis == 2:
                variation = (sum(ord(letter) for letter in name) % 13) / 17
                uv.data[loop_index].uv = (vertex.y / 3.87 + 0.5 + variation,
                                          vertex.x / 0.493 + 0.5)
            elif axis == 2:
                uv.data[loop_index].uv = (vertex.x, vertex.y)
            elif axis == 1:
                uv.data[loop_index].uv = (vertex.x, vertex.z)
            else:
                uv.data[loop_index].uv = (vertex.y, vertex.z)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Machined edge radii", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.affect = "EDGES"
        obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    return obj


def box(name, c, d, mat, coll, bevel=0.0, rot=0):
    x, y, z = c
    w, h, depth = d
    a, b, e = w / 2, h / 2, depth / 2
    verts = [(-a, -e, -b), (a, -e, -b), (a, e, -b), (-a, e, -b),
             (-a, -e, b), (a, -e, b), (a, e, b), (-a, e, b)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = mesh_object(name, verts, faces, coll, mat, bevel)
    obj.location = (x, y, z)
    obj.rotation_euler[2] = rot
    return obj


def cylinder(name, c, radius, height, mat, coll, segments=24, bevel=0.004, rotation=None):
    verts = []
    for z in (-height / 2, height / 2):
        for n in range(segments):
            t = 2 * math.pi * n / segments
            verts.append((radius * math.cos(t), radius * math.sin(t), z))
    faces = []
    for n in range(segments):
        a, b = n, (n + 1) % segments
        faces.append((a, b, b + segments, a + segments))
    faces += [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    obj = mesh_object(name, verts, faces, coll, mat, bevel)
    obj.location = c
    if rotation is not None:
        obj.rotation_euler = rotation
    return obj


def rod(name, a, b, radius, mat, coll, segments=16):
    start, end = Vector(a), Vector(b)
    direction = end - start
    obj = cylinder(name, (start + end) / 2, radius, direction.length, mat, coll,
                   segments=segments, bevel=0.002)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def curved_tube(name, points, radius, mat, coll):
    data = bpy.data.curves.new(name + " path", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 12
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coords in zip(spline.bezier_points, points):
        point.co = coords
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    coll.objects.link(obj)
    data.materials.append(mat)
    return obj


def room_shell(coll, floor_material, name):
    box(name + " | continuous structural floor", (0, 0, -0.11), (10.2, 0.22, 12.2), floor_material, coll)
    box("Rear plaster wall", (0, 5.98, 1.92), (10.2, 3.84, 0.14), plaster, coll)
    box("Right plaster wall", (5, 0, 1.92), (0.14, 3.84, 12.1), plaster, coll)
    box("Flat plaster ceiling", (0, 1.4, 3.85), (10.1, 0.16, 9.15), ivory, coll)
    # Actual planks remain separate to catch the window light and show seams.
    if floor_material == wood:
        for ix in range(20):
            for iy in range(3):
                x = -4.75 + ix * 0.5
                y = -3.8 + iy * 3.9
                box("Oak plank %02d-%d" % (ix, iy), (x, y, 0.011),
                    (0.493, 0.022, 3.87), wood_floor, coll, 0.002)
    else:
        for ix in range(10):
            for iy in range(12):
                box("Interlocking rubber tile %02d-%02d" % (ix, iy),
                    (-4.5 + ix, -5.5 + iy, 0.012), (0.992, 0.026, 0.992),
                    rubber, coll, 0.002)
    for x in (-4.93, 4.93):
        box("Oak floor skirting", (x, 0, 0.1), (0.07, 0.2, 12.0), wood_end, coll, 0.006)
    box("Oak rear skirting", (0, 5.88, 0.1), (9.8, 0.2, 0.075), wood_end, coll, 0.006)
    # Three tall divided windows: actual frames, glass and deep reveals.
    for index, y in enumerate((-3.8, 0, 3.8), 1):
        box("Window %d top lintel" % index, (-5, y, 3.62), (0.18, 0.16, 3.5), ivory, coll, 0.008)
        box("Window %d sill" % index, (-4.88, y, 0.45), (0.38, 0.12, 3.5), wood, coll, 0.009)
        for dy in (-1.7, 1.7):
            box("Window %d vertical mullion" % index, (-4.98, y + dy, 2.0),
                (0.09, 3.12, 0.1), black, coll, 0.003)
        box("Window %d centre mullion" % index, (-4.98, y, 2.0),
            (0.07, 3.12, 0.08), black, coll, 0.002)
        for z in (0.65, 2.2, 3.49):
            box("Window %d horizontal mullion" % index, (-4.98, y, z),
                (0.07, 0.085, 3.5), black, coll, 0.002)
    # Physical timber slats; each casts its own slender shadow.
    for i in range(21):
        box("Rear oak acoustic fin %02d" % i, (-4.8 + i * 0.115, 5.8, 2.03),
            (0.047, 3.42, 0.105), wood, coll, 0.004)
    box("Acoustic panel backing", (-3.62, 5.91, 2.03), (2.5, 3.48, 0.025), black, coll)
    # Glazed mirror wall and metal trim (environment gives reflectance in WebGL).
    box("Wall mirror", (1.63, 5.82, 1.93), (5.35, 2.48, 0.035), mirror, coll, 0.003)
    for z in (0.68, 3.18):
        box("Mirror brushed trim", (1.63, 5.76, z), (5.46, 0.028, 0.05), aluminium, coll, 0.004)
    for x in (-1.12, 4.38):
        box("Mirror side trim", (x, 5.76, 1.93), (0.028, 2.52, 0.05), aluminium, coll, 0.003)
    # Ceiling tracks, flush diffusion panels and a dark mechanical rail.
    for y in (-2.3, 1.9, 4.5):
        box("Recessed LED track", (0, y, 3.735), (8.8, 0.032, 0.075), black, coll, 0.004)
        box("Warm LED diffuser", (0, y, 3.707), (8.55, 0.012, 0.035), light_mat, coll, 0.001)
    # A photographic courtyard sits behind the glazing, with real perspective
    # from the room's camera rather than primitive foliage silhouettes.
    box("Courtyard panorama", (-8.25, 0, 2.0), (0.06, 4.5, 12.5), courtyard, coll)


def folded_towels(coll, origin):
    x, y, z = origin
    for i in range(4):
        box("Folded cotton towel", (x, y, z + i * 0.038), (0.52, 0.034, 0.32), towel, coll, 0.014)


def shelf(coll, x, y, z, w=1.6):
    for level in range(3):
        box("Oak cubby shelf", (x, y, z + level * 0.43), (w, 0.055, 0.43), wood, coll, 0.007)
    for sx in (-w / 2 + 0.04, 0, w / 2 - 0.04):
        box("Oak cubby upright", (x + sx, y, z + 0.43), (0.055, 0.88, 0.43), wood, coll, 0.006)


def potted_plant(coll, x, y, scale=1):
    cylinder("Ceramic planter", (x, y, 0.24 * scale), 0.24 * scale,
             0.48 * scale, pot_mat, coll, 16, 0.02)
    for i in range(8):
        angle = 2 * math.pi * i / 8
        end = (x + math.cos(angle) * 0.45 * scale,
               y + math.sin(angle) * 0.4 * scale, random.uniform(0.9, 1.3) * scale)
        curved_tube("Natural leaf stem", [(x, y, 0.43 * scale),
                                           (x + math.cos(angle) * 0.12 * scale,
                                            y + math.sin(angle) * 0.12 * scale,
                                            0.86 * scale), end],
                    0.009 * scale, leaf, coll)
        v = Vector(end)
        for j in range(3):
            size = (0.2 - j * 0.027) * scale
            box("Broad foliage leaf", (v.x + math.cos(angle + j * 0.55) * 0.12 * scale,
                                       v.y + math.sin(angle + j * 0.55) * 0.1 * scale,
                                       v.z - j * 0.115 * scale),
                (size * 1.7, 0.012, size), leaf, coll, 0.004, angle)


def bench(coll, x, y, angle=0, upholstered=True):
    # All dimensions are in metres; local Y is the long axis.
    c = new_collection("temporary") if False else coll
    def at(lx, ly, lz):
        return (x + lx * math.cos(angle) - ly * math.sin(angle),
                y + lx * math.sin(angle) + ly * math.cos(angle), lz)
    for lx in (-0.27, 0.27):
        for ly in (-0.57, 0.57):
            rod("Bench square-section leg", at(lx, ly, 0.055), at(lx, ly, 0.44),
                0.026, black, c)
    box("Bench underframe", at(0, 0, 0.39), (0.46, 0.055, 1.44), black, c, 0.006, angle)
    box("Bench cushion", at(0, -0.14, 0.53), (0.42, 0.14, 1.02),
        upholstery if upholstered else black, c, 0.055, angle)
    box("Bench head cushion", at(0, 0.52, 0.53), (0.42, 0.14, 0.36),
        upholstery if upholstered else black, c, 0.055, angle)
    for ly in (-0.57, 0.57):
        box("Rubber bench feet", at(0, ly, 0.035), (0.66, 0.07, 0.13), rubber, c, 0.008, angle)


def weight_plate(coll, x, y, z, r, thick=0.055):
    cylinder("Chamfered calibrated weight plate", (x, y, z), r, thick,
             rubber, coll, 36, 0.008, (0, math.pi / 2, 0))
    cylinder("Steel central plate ring", (x + thick / 2 + 0.002, y, z),
             r * 0.15, 0.003, aluminium, coll, 24, 0.001, (0, math.pi / 2, 0))


def dumbbell(coll, x, y, z, r):
    rod("Knurled steel dumbbell handle", (x - 0.18, y, z), (x + 0.18, y, z),
        0.017, aluminium, coll)
    for side in (-1, 1):
        cylinder("Hexagonal rubber dumbbell head", (x + side * 0.18, y, z),
                 r, 0.095, rubber, coll, 6, 0.005, (0, math.pi / 2, 0))
        cylinder("Dumbbell end cap", (x + side * 0.23, y, z),
                 0.03, 0.004, steel_pin, coll, 16, 0, (0, math.pi / 2, 0))


def power_rack(coll, x, y):
    for px in (-0.67, 0.67):
        for py in (-0.5, 0.5):
            box("Welded power rack upright", (x + px, y + py, 1.28),
                (0.075, 2.52, 0.075), black, coll, 0.003)
            box("Power rack rubber foot", (x + px, y + py, 0.04),
                (0.22, 0.08, 0.25), rubber, coll, 0.005)
            for hole in range(10):
                cylinder("Laser-cut rack hole", (x + px + 0.04, y + py, 0.55 + hole * 0.18),
                         0.009, 0.004, steel_pin, coll, 8, 0, (0, math.pi / 2, 0))
    for py in (-0.5, 0.5):
        box("Rack top crossbeam", (x, y + py, 2.52), (1.42, 0.075, 0.075), black, coll, 0.003)
    for px in (-0.67, 0.67):
        box("Rack top side rail", (x + px, y, 2.52), (0.075, 0.075, 1.04), black, coll, 0.003)
    rod("Pull-up bar", (x - 0.7, y - 0.53, 2.38), (x + 0.7, y - 0.53, 2.38),
        0.025, steel_pin, coll)
    rod("Olympic bar shaft", (x - 1.1, y + 0.48, 1.47),
        (x + 1.1, y + 0.48, 1.47), 0.018, chrome, coll)
    for side in (-1, 1):
        for i, r in enumerate((0.23, 0.19)):
            weight_plate(coll, x + side * (0.78 + i * 0.07), y + 0.48, 1.47, r)
    bench(coll, x, y - 1.1)


def strength(coll):
    room_shell(coll, rubber, "Strength studio")
    power_rack(coll, -1.8, 2.5)
    power_rack(coll, 1.55, 2.5)
    bench(coll, 0, -2.6, math.radians(-22))
    # Steel dumbbell storage on the right wall, with individually sized weights.
    for py in (-2.75, -0.2, 2.35):
        for level, z in enumerate((0.52, 1.02)):
            box("Dumbbell rack angled shelf", (4.19, py, z - 0.07),
                (0.58, 0.065, 2.35), black, coll, 0.008)
            for j in range(4):
                dumbbell(coll, 4.14, py - 0.85 + j * 0.55, z + 0.08,
                         0.09 + 0.013 * j + 0.008 * level)
        for yy in (py - 1.05, py + 1.05):
            box("Dumbbell rack leg", (4.16, yy, 0.54),
                (0.07, 1.08, 0.07), black, coll, 0.003)
    for i, r in enumerate((0.27, 0.22, 0.18)):
        weight_plate(coll, -4.18 + i * 0.16, -2.9, r + 0.12, r)
    shelf(coll, -3.75, 5.05, 0.39, 1.7)
    folded_towels(coll, (-3.87, 4.96, 1.34))
    potted_plant(coll, -4.3, -4.15, 0.9)


def yoga_setup(coll, x, y, index):
    mat = mat_sage if index % 2 else mat_cream
    box("Textured yoga mat", (x, y, 0.033), (0.72, 0.024, 1.85), mat, coll, 0.012)
    for side in (-1, 1):
        box("Cork support block", (x + side * 0.21, y + 1.08, 0.11),
            (0.13, 0.22, 0.24), cork, coll, 0.012)
    cylinder("Linen bolster", (x, y - 1.1, 0.14), 0.12, 0.59,
             upholstery, coll, 24, 0.015, (0, math.pi / 2, 0))
    box("Folded practice blanket", (x, y - 1.35, 0.07),
        (0.52, 0.055, 0.4), towel, coll, 0.016)


def balance(coll):
    room_shell(coll, wood, "Balance studio")
    for ix, x in enumerate((-2.7, -0.15, 2.4)):
        for iy, y in enumerate((-2.2, 1.35)):
            yoga_setup(coll, x, y, ix + iy)
    # A continuous timber ballet barre follows the right wall.
    for z in (0.91, 1.18):
        rod("Continuous dance barre", (4.65, -4.7, z),
            (4.65, 4.7, z), 0.033, wood, coll)
        for y in (-3.9, -1.35, 1.2, 3.75):
            rod("Barre steel bracket", (4.65, y, z),
                (4.95, y, z), 0.017, aluminium, coll)
    shelf(coll, -3.62, 5.02, 0.41, 1.8)
    folded_towels(coll, (-3.75, 5.0, 1.37))
    potted_plant(coll, -4.2, -4.3, 1.15)
    potted_plant(coll, 4.28, 4.47, 0.8)


def reformer(coll, x, y):
    # Twin oak side rails and continuous chrome carriage tracks.
    for dx in (-0.39, 0.39):
        box("Solid oak reformer rail", (x + dx, y, 0.41),
            (0.085, 0.22, 2.61), wood, coll, 0.013)
        rod("Stainless carriage track", (x + dx, y - 1.15, 0.56),
            (x + dx, y + 1.15, 0.56), 0.013, chrome, coll)
        for dy in (-1.13, 1.13):
            box("Solid oak reformer foot", (x + dx, y + dy, 0.16),
                (0.16, 0.32, 0.18), wood, coll, 0.009)
    box("Reformer sliding carriage", (x, y, 0.55),
        (0.66, 0.13, 1.21), upholstery, coll, 0.04)
    for dx in (-0.22, 0.22):
        box("Padded shoulder rest", (x + dx, y + 0.45, 0.68),
            (0.16, 0.22, 0.18), upholstery, coll, 0.028)
    rod("Padded footbar", (x - 0.39, y - 0.97, 0.98),
        (x + 0.39, y - 0.97, 0.98), 0.04, black, coll)
    for dx in (-0.34, 0.34):
        rod("Footbar angled bracket", (x + dx, y - 1.1, 0.48),
            (x + dx, y - 0.97, 0.98), 0.017, aluminium, coll)
        curved_tube("Reformer tension rope", [(x + dx * 0.75, y + 0.32, 0.56),
                                              (x + dx, y + 0.85, 0.87),
                                              (x + dx, y + 1.31, 1.2)],
                    0.009, black, coll)
        rod("Rope pulley bracket", (x + dx, y + 1.26, 0.44),
            (x + dx, y + 1.26, 1.31), 0.018, aluminium, coll)
        cylinder("Rope pulley wheel", (x + dx, y + 1.26, 1.23),
                 0.052, 0.03, black, coll, 16, 0.002, (math.pi / 2, 0, 0))
    for i in range(5):
        rod("Colour-coded reformer spring", (x - 0.22 + i * 0.11, y - 0.55, 0.39),
            (x - 0.22 + i * 0.11, y - 1.28, 0.39), 0.006, chrome, coll)


def cable_station(coll, x, y):
    for dx in (-0.61, 0.61):
        box("Cable tower black upright", (x + dx, y, 1.26),
            (0.105, 2.5, 0.13), black, coll, 0.006)
        box("Weight stack cover", (x + dx, y + 0.1, 0.63),
            (0.39, 1.16, 0.36), black, coll, 0.016)
        for i in range(13):
            box("Individual selector weight", (x + dx, y - 0.12, 0.23 + i * 0.062),
                (0.35, 0.05, 0.18), steel_pin, coll, 0.003)
        rod("Pulley guide", (x + dx, y + 0.06, 0.34),
            (x + dx, y + 0.06, 2.3), 0.011, chrome, coll)
        cylinder("Top sheave", (x + dx, y - 0.02, 2.28),
                 0.082, 0.045, aluminium, coll, 24, 0.002, (math.pi / 2, 0, 0))
        curved_tube("Cable and handle", [(x + dx, y - 0.05, 2.28),
                                         (x + dx, y - 0.28, 1.74),
                                         (x + dx * 0.7, y - 0.5, 1.35)],
                    0.004, steel_pin, coll)
        rod("Rubber handle", (x + dx * 0.7 - 0.1, y - 0.5, 1.35),
            (x + dx * 0.7 + 0.1, y - 0.5, 1.35), 0.022, rubber, coll)
    box("Cable tower crosshead", (x, y, 2.49), (1.38, 0.11, 0.2), black, coll, 0.008)
    box("Cable tower base", (x, y, 0.12), (1.48, 0.11, 0.5), black, coll, 0.008)


def personal(coll):
    room_shell(coll, wood, "Personal training studio")
    reformer(coll, -1.15, -0.35)
    cable_station(coll, 2.45, 3.35)
    bench(coll, 2.27, -0.65, math.radians(13))
    box("Single client stretching mat", (2.6, -3.15, 0.036),
        (0.8, 0.025, 1.9), mat_sage, coll, 0.012)
    shelf(coll, -3.78, 5.02, 0.42, 1.5)
    folded_towels(coll, (-3.86, 5.0, 1.38))
    potted_plant(coll, -4.18, -4.25, 1.05)
    # Private studio curtain with real pleats, rather than a second row of mats.
    rod("Curtain ceiling track", (3.2, -4.45, 3.45), (3.2, 0.8, 3.45),
        0.017, aluminium, coll)
    for i in range(18):
        y = -4.25 + i * 0.28
        box("Linen acoustic curtain fold", (3.2 + (i % 2) * 0.08, y, 2.06),
            (0.025, 2.75, 0.31), curtain, coll, 0.012)


rooms = [
    ("Зал силы", "strength-room.glb", strength),
    ("Студия баланса", "balance-studio.glb", balance),
    ("Персональная студия", "personal-studio.glb", personal),
]
collections = []
for name, filename, build in rooms:
    collection = new_collection(name)
    build(collection)
    collections.append((name, filename, collection))

for name, filename, collection in collections:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(collection.objects))
    bpy.ops.export_scene.gltf(
        filepath=str(MEDIA / filename), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT",
        export_animations=False, export_cameras=False, export_lights=False,
    )

# A real camera and lights make the editable source useful in Blender itself.
for _, _, collection in collections[1:]:
    collection.hide_render = True
    collection.hide_viewport = True
camera_data = bpy.data.cameras.new("Interior editorial lens")
camera = bpy.data.objects.new("Interior editorial lens", camera_data)
scene.collection.objects.link(camera)
camera.location = (2.2, -8.4, 2.45)
target = Vector((0, 0.7, 1.62))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.lens = 27
scene.camera = camera
sun_data = bpy.data.lights.new("Soft courtyard sunlight", "SUN")
sun_data.energy = 2.8
sun_data.angle = math.radians(8)
sun = bpy.data.objects.new("Soft courtyard sunlight", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(25), math.radians(-30), math.radians(-35))
for y in (-2.3, 2.5):
    light_data = bpy.data.lights.new("Large interior softbox", "AREA")
    light_data.energy = 520
    light_data.shape = "RECTANGLE"
    light_data.size = 4
    light_data.size_y = 2
    lamp = bpy.data.objects.new("Large interior softbox", light_data)
    scene.collection.objects.link(lamp)
    lamp.location = (-3.6, y, 3.3)
    lamp.rotation_euler = (0, math.radians(-90), 0)

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "stride-halls.blend"))
result = {
    "blend": str(SOURCE / "stride-halls.blend"),
    "rooms": [{"name": name, "glb": str(MEDIA / filename),
               "objects": len(collection.all_objects),
               "bytes": (MEDIA / filename).stat().st_size}
              for name, filename, collection in collections],
}
