import bpy, sys, json
src, out = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
R = {'objects': [], 'armatures': {}, 'meshes': {}, 'actions': [a.name for a in bpy.data.actions]}
for o in bpy.data.objects:
    R['objects'].append({'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None, 'scale': list(o.scale), 'rot': list(o.rotation_quaternion) if o.rotation_mode=='QUATERNION' else list(o.rotation_euler)})
    if o.type == 'ARMATURE':
        a = o.data; R['armatures'][o.name] = [{'name': b.name, 'parent': b.parent.name if b.parent else None, 'head': [round(x,4) for x in b.head_local], 'tail': [round(x,4) for x in b.tail_local], 'roll_axisZ': [round(x,3) for x in b.z_axis]} for b in a.bones]
    if o.type == 'MESH':
        m = o.data; R['meshes'][o.name] = {'verts': len(m.vertices), 'groups': len(o.vertex_groups), 'mods': [x.type for x in o.modifiers]}
json.dump(R, open(out, 'w'), indent=1)
print('objects', len(R['objects']), 'arm', {k: len(v) for k, v in R['armatures'].items()}, 'meshes', R['meshes'], 'actions', len(R['actions']))
