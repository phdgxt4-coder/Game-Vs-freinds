#!/usr/bin/env python3
"""Converts the Sketchfab map for three.js r160 and extracts world-space collision triangles.
- Replaces KHR_materials_pbrSpecularGlossiness (removed from three.js) with pbrMetallicRoughness.
- Writes <out>.glb and <out>.collision.json ({tris:[x0,y0,z0,x1,y1,z1,x2,y2,z2,...], bounds}).
Usage: python3 tools/convert_map.py in.glb out_basename"""
import json, struct, sys
import numpy as np

def read_glb(path):
    d = open(path, 'rb').read(); off = 12; js = bn = None
    while off < len(d):
        n, t = struct.unpack('<II', d[off:off + 8]); c = d[off + 8:off + 8 + n]; off += 8 + n
        if t == 0x4E4F534A: js = json.loads(c)
        elif t == 0x004E4942: bn = c
    return js, bn

def write_glb(path, js, bn):
    j = json.dumps(js, separators=(',', ':')).encode(); j += b' ' * (-len(j) % 4)
    bn = bn + b'\0' * (-len(bn) % 4)
    total = 12 + 8 + len(j) + 8 + len(bn)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A) + j)
        f.write(struct.pack('<II', len(bn), 0x004E4942) + bn)

def accessor(js, bn, i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    ct = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    size = np.dtype(ct).itemsize; stride = bv.get('byteStride') or size * n
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0); cnt = a['count']
    out = np.empty((cnt, n), ct)
    for k in range(n):
        idx = base + np.arange(cnt) * stride + k * size
        out[:, k] = np.frombuffer(b''.join(bn[o:o + size] for o in idx), dtype=ct) if cnt < 0 else np.frombuffer(bn, dtype=np.uint8)[idx[:, None] + np.arange(size)].copy().view(ct).reshape(cnt)
    return out

def local_matrix(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    m = np.eye(4)
    if 'scale' in n: m = np.diag([*n['scale'], 1]) @ m
    if 'rotation' in n:
        x, y, z, w = n['rotation']
        r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        m = np.block([[r, np.zeros((3, 1))], [np.zeros((1, 3)), 1]]) @ m
    if 'translation' in n: t = np.eye(4); t[:3, 3] = n['translation']; m = t @ m
    return m

def find_spawns(t):
    """Spawn pads = thin (<0.3 m) boxes with a ~3x3 m footprint (12-triangle components). Team by side of the map (z<0 -> team 0)."""
    parent = {}
    def f(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    key = lambda p: tuple(np.round(p, 2))
    for tr in t:
        ks = [key(p) for p in tr]
        for k in ks[1:]: parent[f(k)] = f(ks[0])
    comp = {}
    for i, tr in enumerate(t): comp.setdefault(f(key(tr[0])), []).append(i)
    out = []
    for ids in comp.values():
        pts = t[ids].reshape(-1, 3); mn, mx = pts.min(0), pts.max(0); sz = mx - mn
        if len(ids) == 12 and sz[1] < 0.3 and 2.5 < sz[0] < 3.5 and 2.5 < sz[2] < 3.5:
            c = (mn + mx) / 2
            out.append({'x': round(float(c[0]), 2), 'y': round(float(mx[1]), 2), 'z': round(float(c[2]), 2), 'team': 0 if c[2] < 0 else 1})
    return sorted(out, key=lambda o: (o['team'], o['x']))

def main(src, out):
    js, bn = read_glb(src)
    # 1) material conversion
    for m in js['materials']:
        sg = m.get('extensions', {}).pop('KHR_materials_pbrSpecularGlossiness', None)
        if not m.get('extensions'): m.pop('extensions', None)
        if sg:
            pbr = {'metallicFactor': 0.0, 'roughnessFactor': 0.85}
            if 'diffuseFactor' in sg: pbr['baseColorFactor'] = sg['diffuseFactor']
            if 'diffuseTexture' in sg: pbr['baseColorTexture'] = sg['diffuseTexture']
            m['pbrMetallicRoughness'] = pbr
    js.pop('extensionsRequired', None); js.pop('extensionsUsed', None)
    write_glb(out + '.glb', js, bn)
    # 2) world-space triangles
    tris = []
    def walk(i, parent):
        n = js['nodes'][i]; w = parent @ local_matrix(n)
        if 'mesh' in n:
            flip = np.linalg.det(w[:3, :3]) < 0
            for pr in js['meshes'][n['mesh']]['primitives']:
                if pr.get('mode', 4) != 4: continue
                p = accessor(js, bn, pr['attributes']['POSITION']).astype(float)
                p = (np.c_[p, np.ones(len(p))] @ w.T)[:, :3]
                idx = accessor(js, bn, pr['indices'])[:, 0].astype(int) if 'indices' in pr else np.arange(len(p))
                t = p[idx].reshape(-1, 3, 3)
                if flip: t = t[:, [0, 2, 1]]
                tris.append(t)
        for c in n.get('children', []): walk(c, w)
    for r in js['scenes'][js.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    t = np.concatenate(tris)
    json.dump({'tris': np.round(t.reshape(-1), 3).tolist(), 'bounds': [np.round(t.reshape(-1, 3).min(0), 3).tolist(), np.round(t.reshape(-1, 3).max(0), 3).tolist()], 'spawns': find_spawns(t)}, open(out + '.collision.json', 'w'), separators=(',', ':'))
    return t

if __name__ == '__main__':
    t = main(sys.argv[1], sys.argv[2]); print(len(t), 'triangles')
