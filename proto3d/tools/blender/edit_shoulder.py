# 어깨 무게 다듬기(Blender): 쇄골·위팔·가슴 무게가 둘 넘게 섞인 정점(시험의 어깨 둘레와 같은 정의)만 골라 그 세 무리를 이웃 평균 쪽으로 고른 뒤, 정점마다 합을 1로. 다른 뼈의 무게는 그대로.
import bpy, sys, bmesh
args = sys.argv[sys.argv.index('--')+1:]; src, out = args[:2]; mode = args[2] if len(args) > 2 else 'smooth'
FACT, REP = (float(args[3]) if len(args) > 3 else 0.5), (int(args[4]) if len(args) > 4 else 3)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src)
me = bpy.data.objects['Mannequin']; vg = me.vertex_groups
if mode == 'smooth':
    for side in 'lr':
        S = [f'clavicle_{side}', f'upperarm_{side}', 'spine_03']; ids = {vg[n].index for n in S}
        sel = [v.index for v in me.data.vertices if sum(1 for g in v.groups if g.group in ids and g.weight > 0.08) >= 2]
        for v in me.data.vertices: v.select = v.index in sel
        bpy.context.view_layer.objects.active = me; bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); me.data.use_paint_mask_vertex = True
        for n in S:
            vg.active_index = vg[n].index
            bpy.ops.object.vertex_group_smooth(group_select_mode='ACTIVE', factor=FACT, repeat=REP, expand=0.0)
        bpy.ops.object.mode_set(mode='OBJECT')
        print(side, 'region verts', len(sel))
    # 합을 1로(잠금 없이)
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); me.data.use_paint_mask_vertex = False
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='BONE_DEFORM', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.selected_objects: o.select_set(False)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_animations=True, export_skins=True, export_all_influences=False)
print('exported', out, mode)
