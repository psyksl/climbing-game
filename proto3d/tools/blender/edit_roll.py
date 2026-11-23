# 왼손·왼손가락 뼈의 roll을 30° 바꾼다(뼈의 자리·방향은 그대로, 지역 축만 돈다). 메시와 무게는 그대로
import bpy, sys, math
src, out = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src)
arm = bpy.data.objects['Armature']; bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
n = 0
for eb in arm.data.edit_bones:
    if eb.name == 'hand_l' or (eb.name.endswith('_l') and eb.name.split('_')[0] in ('index', 'middle', 'ring', 'pinky', 'thumb')): eb.roll += math.radians(30); n += 1
bpy.ops.object.mode_set(mode='OBJECT'); print('rolled', n)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_animations=True, export_skins=True)
print('exported', out)
