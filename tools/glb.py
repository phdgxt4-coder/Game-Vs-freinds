"""Minimal GLB reader (positions/indices/UV + node transforms). Used by the asset pipeline scripts."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(path):
    d = open(path, 'rb').read()
    off, js, binc = 12, None, None
    while off < len(d):
        n, t = struct.unpack('<II', d[off:off + 8]); c = d[off + 8:off + 8 + n]
        if t == 0x4E4F534A: js = json.loads(c)
        elif t == 0x004E4942: binc = c
        off += 8 + n
    return js, binc

def accessor(js, binc, i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', nc * dt.itemsize)
    if stride == nc * dt.itemsize:
        arr = np.frombuffer(binc, dtype=dt, count=a['count'] * nc, offset=base).reshape(a['count'], nc)
    else:
        arr = np.ndarray((a['count'], nc), dtype=dt, buffer=binc, offset=base, strides=(stride, dt.itemsize))
    return arr.astype(np.float64) if a.get('normalized') is None and dt == np.float32 else arr

def node_matrix(n):
    if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
    t = np.array(n.get('translation', [0, 0, 0])); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
    return M

def mesh_instances(js, binc):
    """Yield (node_name, mesh_index, primitive_index, world_positions[N,3], indices[M,3], material_index)."""
    out = []
    def walk(ni, parent):
        n = js['nodes'][ni]; M = parent @ node_matrix(n)
        if 'mesh' in n:
            for pi, pr in enumerate(js['meshes'][n['mesh']]['primitives']):
                p = accessor(js, binc, pr['attributes']['POSITION'])
                P = (np.c_[p, np.ones(len(p))] @ M.T)[:, :3]
                idx = accessor(js, binc, pr['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in pr else np.arange(len(p)).reshape(-1, 3)
                out.append((n.get('name'), n['mesh'], pi, P, idx, pr.get('material')))
        for c in n.get('children', []): walk(c, M)
    for r in js['scenes'][js.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return out
