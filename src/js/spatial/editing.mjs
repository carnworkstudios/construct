// SPDX-License-Identifier: MIT
const id = () => crypto.randomUUID();
export const sub = (a, b) => a.map((n, i) => n - b[i]);
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const normal = (a, b, c) => { const v = cross(sub(b,a),sub(c,a)), length = Math.hypot(...v); if (length < 1e-10) throw Error('Face has zero area.'); return v.map(n => n/length); };
export function meshIdentity(o) {
  o.vertexIds ||= o.vertices.map((_, i) => `v${i}`);
  o.faceIds ||= o.triangles.map((_, i) => `f${i}`);
  return o;
}
export function meshEdges(o) {
  const ids = o.vertexIds || o.vertices.map((_, i) => `v${i}`), edges = new Map();
  o.triangles.forEach((f, face) => f.forEach((a, i) => {
    const b = f[(i+1)%3], key = [ids[a], ids[b]].sort().join('/');
    if (!edges.has(key)) edges.set(key, { id: key, vertices: [a,b], faces: [] });
    edges.get(key).faces.push(face);
  })); return [...edges.values()];
}
export function validateEditableMesh(o) {
  meshIdentity(o);
  for (const [ids, length] of [[o.vertexIds,o.vertices.length],[o.faceIds,o.triangles.length]]) {
    if (!Array.isArray(ids) || ids.length !== length || ids.some(v=>typeof v !== 'string' || !v.length || v.length>80) || new Set(ids).size!==ids.length) throw Error('Invalid mesh component identities.');
  }
  const faces = new Set();
  for (const face of o.triangles) {
    normal(...face.map(i=>o.vertices[i]));
    const key = [...face].sort((a,b)=>a-b).join(','); if (faces.has(key)) throw Error('Duplicate mesh face.'); faces.add(key);
  }
  if (meshEdges(o).some(e=>e.faces.length>2)) throw Error('Edit would create a non-manifold edge.');
}
export function editMesh(o, operation, target, value) {
  meshIdentity(o);
  const faceIndex = o.faceIds.indexOf(target), vertexIndex = o.vertexIds.indexOf(target);
  const edge = meshEdges(o).find(e=>e.id===target);
  if (operation === 'move') {
    if (vertexIndex<0 || !Array.isArray(value) || value.length!==3 || !value.every(Number.isFinite)) throw Error('Select a vertex and enter finite XYZ coordinates.');
    o.vertices[vertexIndex]=value;
  } else if (operation === 'extrude' || operation === 'inset') {
    if (faceIndex<0 || !Number.isFinite(value) || (operation==='extrude' && Math.abs(value)<1e-6) || (operation==='inset' && (value<=0 || value>=1))) throw Error('Select a face; use a nonzero extrusion or inset fraction between 0 and 1.');
    const face=o.triangles[faceIndex], n=normal(...face.map(i=>o.vertices[i])), center=[0,1,2].map(k=>face.reduce((s,i)=>s+o.vertices[i][k]/3,0));
    const added=face.map(index=> {
      const v=o.vertices[index]; o.vertices.push(v.map((x,k)=>operation==='extrude'?x+n[k]*value:x+(center[k]-x)*value)); o.vertexIds.push(id()); return o.vertices.length-1;
    });
    o.triangles[faceIndex]=added;
    face.forEach((a,i)=>{ const j=(i+1)%3,b=face[j]; o.triangles.push([a,b,added[j]],[a,added[j],added[i]]); o.faceIds.push(id(),id()); });
  } else if (operation === 'extrudePlanar' || operation === 'insetPlanar') {
    const { groups } = planarFaces(o), g = groups.find(v => v.id === target);
    const extruding = operation === 'extrudePlanar';
    if (!g || !Number.isFinite(value) || (extruding && Math.abs(value) < 1e-6) || (!extruding && (value <= 0 || value >= 1))) throw Error('Select a planar face; use a nonzero extrusion or inset fraction between 0 and 1.');
    const inner = new Set(g.triangles);
    // Boundary edges have exactly one triangle inside the group; they get side walls.
    const boundary = meshEdges(o).filter(e => e.faces.filter(f => inner.has(f)).length === 1);
    const ring = [...new Set(g.triangles.flatMap(t => o.triangles[t]))];
    const center = [0,1,2].map(k => ring.reduce((s,i) => s + o.vertices[i][k]/ring.length, 0));
    // Record each boundary edge's direction in its own triangle before remapping.
    const walls = boundary.map(e => {
      const face = o.triangles[e.faces.find(f => inner.has(f))];
      const [a,b] = e.vertices, k = face.indexOf(a);
      return face[(k+1)%3] === b ? [a,b] : [b,a];
    });
    const moved = new Map();
    for (const i of ring) {
      const v = o.vertices[i];
      o.vertices.push(v.map((x,k) => extruding ? x + g.normal[k]*value : x + (center[k]-x)*value));
      o.vertexIds.push(id()); moved.set(i, o.vertices.length-1);
    }
    for (const t of g.triangles) o.triangles[t] = o.triangles[t].map(i => moved.get(i));
    // The cap moved off the boundary ring, so each wall spans the edge as the
    // cap wound it: a -> b along the base, then back along the lifted copies.
    for (const [a,b] of walls) {
      o.triangles.push([a,b,moved.get(b)],[a,moved.get(b),moved.get(a)]); o.faceIds.push(id(),id());
    }
  } else if (operation === 'split') {
    if (!edge) throw Error('Select an edge to split.');
    const [a,b]=edge.vertices, mid=o.vertices.length; o.vertices.push(o.vertices[a].map((v,i)=>(v+o.vertices[b][i])/2)); o.vertexIds.push(id());
    for (const index of edge.faces) {
      const face=o.triangles[index];
      const k=face.findIndex((v,i)=>(v===a && face[(i+1)%3]===b)||(v===b && face[(i+1)%3]===a));
      const x=face[k],y=face[(k+1)%3],z=face[(k+2)%3]; o.triangles[index]=[x,mid,z]; o.triangles.push([mid,y,z]); o.faceIds.push(id());
    }
  } else if (operation === 'collapse') {
    if (!edge) throw Error('Select an edge to collapse.');
    const [a,b]=edge.vertices; o.vertices[a]=o.vertices[a].map((v,i)=>(v+o.vertices[b][i])/2);
    const faces=[], ids=[];
    o.triangles.forEach((f,i)=>{ const next=f.map(v=>v===b?a:v); if(new Set(next).size===3){ faces.push(next.map(v=>v>b?v-1:v)); ids.push(o.faceIds[i]); } });
    if (!faces.length) throw Error('Collapse would remove every face.');
    o.vertices.splice(b,1);o.vertexIds.splice(b,1);o.triangles=faces;o.faceIds=ids;
  } else throw Error('Unknown mesh edit.');
  validateEditableMesh(o);
}
export function editPath(o, operation, target) {
  const vs=o.topology.vertices, es=o.topology.edges;
  if(operation==='split') {
    const i=es.indexOf(target); if(i<0) throw Error('Select a path segment.');
    o.path.splice(i+1,0,o.path[i].map((v,k)=>(v+o.path[i+1][k])/2)); vs.splice(i+1,0,id()); es.splice(i,1,id(),id());
    if(o.openings?.some(p=>p.edge===target)) throw Error('Remove openings on this segment before splitting it.');
  } else {
    const i=vs.indexOf(target); if(i<0 || o.path.length<=2) throw Error('A path needs at least two vertices.');
    const removed=es.slice(Math.max(0,i-1),Math.min(es.length,i+1));
    if(o.openings?.some(p=>removed.includes(p.edge))) throw Error('Remove attached openings before deleting this vertex.');
    o.path.splice(i,1);vs.splice(i,1);
    if(i===0)es.shift();else if(i===vs.length)es.pop();else es.splice(i-1,2,id());
  }
  // Topology changed explicitly; correspondence with the 2D source is now detached.
  delete o.source;
}
export function components(o, scope='object') {
  if(scope==='object')return [{id:o.id,name:o.name,position:[0,0,0]}];
  if(o.kind==='mesh') {
    const vi=o.vertexIds||o.vertices.map((_,i)=>`v${i}`), fi=o.faceIds||o.triangles.map((_,i)=>`f${i}`);
    if(scope==='vertex')return o.vertices.map((p,i)=>({id:vi[i],name:`Vertex ${i+1}`,position:p}));
    if(scope==='face')return o.triangles.map((f,i)=>({id:fi[i],name:`Face ${i+1}`,position:[0,1,2].map(k=>f.reduce((s,v)=>s+o.vertices[v][k]/3,0))}));
    if(scope==='planar')return planarFaces(o).groups.map((g,i)=>{const vs=[...new Set(g.triangles.flatMap(t=>o.triangles[t]))];return {id:g.id,name:`Planar face ${i+1} (${g.triangles.length} tri)`,position:[0,1,2].map(k=>vs.reduce((s,v)=>s+o.vertices[v][k]/vs.length,0))};});
    if(scope==='edge')return meshEdges(o).map((e,i)=>({id:e.id,name:`Edge ${i+1}`,position:[0,1,2].map(k=>(o.vertices[e.vertices[0]][k]+o.vertices[e.vertices[1]][k])/2)}));
  }
  if(o.path) {
    if(scope==='vertex')return o.path.map((p,i)=>({id:o.topology.vertices[i],name:`Path vertex ${i+1}`,position:[p[0],p[1],p[2]||0]}));
    if(scope==='edge')return o.path.slice(1).map((p,i)=>({id:o.topology.edges[i],name:`Path segment ${i+1}`,position:[(p[0]+o.path[i][0])/2,(p[1]+o.path[i][1])/2,((p[2]||0)+(o.path[i][2]||0))/2]}));
  }
  if(o.kind==='molecule') {
    if(scope==='atom')return o.atoms.map((a,i)=>({id:a.id||`a${i}`,name:`${a.atomName||a.element} ${a.residueName||''} ${a.residueNumber||''} ${a.chain||''}`.trim(),position:a.position}));
    if(scope==='residue'||scope==='chain') {
      const groups=new Map();o.atoms.forEach(a=>{ const key=scope==='residue'?a.residueId:a.chainId;if(!key)return;const g=groups.get(key)||{id:key,name:scope==='residue'?`${a.residueName} ${a.residueNumber}${a.insertion||''} · ${a.chain||'blank chain'}`:`Chain ${a.chain||'blank'}`,points:[]};g.points.push(a.position);groups.set(key,g);});
      return [...groups.values()].map(g=>({id:g.id,name:g.name,position:[0,1,2].map(k=>g.points.reduce((s,p)=>s+p[k]/g.points.length,0))}));
    }
  }
  return [];
}
export function annotationPosition(o,a) {
  if(a.scope==='object')return a.target===o.id?[0,0,0]:null;
  if(o.kind==='mesh'){
    const vertex=id=>o.vertexIds?o.vertexIds.indexOf(id):/^v[0-9]+$/.test(id)?Number(id.slice(1)):-1;
    let indices=[];
    if(a.scope==='vertex')indices=[vertex(a.target)];
    if(a.scope==='edge'){indices=a.target.split('/').map(vertex);if(indices.length!==2||!o.triangles.some(t=>t.includes(indices[0])&&t.includes(indices[1])))return null;}
    if(a.scope==='face'){const index=o.faceIds?o.faceIds.indexOf(a.target):/^f[0-9]+$/.test(a.target)?Number(a.target.slice(1)):-1;indices=o.triangles[index]||[];}
    if(a.scope==='planar'){const g=planarFaces(o).groups.find(v=>v.id===a.target);indices=g?[...new Set(g.triangles.flatMap(t=>o.triangles[t]))]:[];}
    if(!indices.length||indices.some(i=>!o.vertices[i]))return null;return [0,1,2].map(k=>indices.reduce((s,i)=>s+o.vertices[i][k]/indices.length,0));
  }
  return components(o,a.scope).find(c=>c.id===a.target)?.position || null;
}

// Grouping costs a full traversal, so cache it. Edits mutate these arrays in
// place, so the key samples contents rather than trusting array identity.
const planarCache = new WeakMap();
const planarKey = (o, tolerance) => {
  let sum = 0;
  for (let i = 0; i < o.vertices.length; i += 1) { const v = o.vertices[i]; sum = (sum + (v[0] + v[1] * 3 + v[2] * 7) * (i + 1)) % 1e12; }
  return `${o.vertices.length}|${o.triangles.length}|${o.faceIds.length}|${sum}|${tolerance}`;
};

// Triangles sharing an edge and a normal within tolerance form one planar face.
export function planarFaces(o, tolerance = 1e-4) {
  meshIdentity(o);
  const key = planarKey(o, tolerance), cached = planarCache.get(o);
  if (cached && cached.key === key) return cached.result;
  const normals = o.triangles.map(f => { try { return normal(...f.map(i => o.vertices[i])); } catch { return null; } });
  const adjacency = new Map();
  for (const e of meshEdges(o)) for (const a of e.faces) for (const b of e.faces) if (a !== b) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push(b);
  }
  const group = new Array(o.triangles.length).fill(-1), groups = [];
  for (let seed = 0; seed < o.triangles.length; seed++) {
    if (group[seed] >= 0 || !normals[seed]) continue;
    const index = groups.length, members = [], stack = [seed];
    group[seed] = index;
    while (stack.length) {
      const face = stack.pop(); members.push(face);
      for (const next of adjacency.get(face) || []) {
        if (group[next] >= 0 || !normals[next]) continue;
        const dot = normals[face].reduce((s, n, k) => s + n * normals[next][k], 0);
        if (1 - dot > tolerance) continue;
        group[next] = index; stack.push(next);
      }
    }
    groups.push({ id: o.faceIds[members[0]], triangles: members.sort((a, b) => a - b), normal: normals[seed] });
  }
  const result = { groups, group };
  planarCache.set(o, { key, result });
  return result;
}

// The planar face a triangle belongs to, or the triangle's own id.
export function planarFaceOf(o, triangleIndex) {
  const { groups, group } = planarFaces(o), index = group[triangleIndex];
  return index >= 0 ? groups[index].id : (o.faceIds || [])[triangleIndex] || null;
}
