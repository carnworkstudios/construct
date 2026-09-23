// SPDX-License-Identifier: MIT
import Module from '../../../vendor/manifold/manifold.js';
import * as T from '../../../vendor/three/three.module.min.js';
import { sourceMesh } from './features.mjs';
export async function booleanMesh({a,b,operation}) {
  if(!['union','subtract','intersect'].includes(operation))throw Error('Choose union, subtract or intersect.');
  const wasm=await Module({locateFile:name=>new URL('../../../vendor/manifold/'+name,import.meta.url).href});wasm.setup();const solids=[];
  try {
    for(const object of [a,b]) {
      const data=sourceMesh(object);if(data.vertices.length>100000||data.triangles.length>100000)throw Error('Boolean input exceeds geometry budget.');
      const matrix=new T.Matrix4().compose(new T.Vector3(...object.position),new T.Quaternion().setFromEuler(new T.Euler(...object.rotation)),new T.Vector3(...object.scale));
      const properties=new Float32Array(data.vertices.flatMap(v=>new T.Vector3(...v).applyMatrix4(matrix).toArray()));
      const mesh=new wasm.Mesh({numProp:3,vertProperties:properties,triVerts:new Uint32Array(data.triangles.flat())});mesh.merge();
      const solid=wasm.Manifold.ofMesh(mesh);solids.push(solid);if(solid.status()!=='NoError')throw Error('Boolean needs closed, consistently oriented manifold solids.');
    }
    const result=operation==='union'?solids[0].add(solids[1]):operation==='subtract'?solids[0].subtract(solids[1]):solids[0].intersect(solids[1]);solids.push(result);
    const mesh=result.getMesh();if(!mesh.triVerts.length)throw Error('Boolean result is empty.');if(mesh.triVerts.length/3>100000||mesh.vertProperties.length/mesh.numProp>100000)throw Error('Boolean result exceeds geometry budget.');
    const vertices=[],triangles=[];for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)vertices.push(Array.from(mesh.vertProperties.slice(i,i+3)));for(let i=0;i<mesh.triVerts.length;i+=3)triangles.push(Array.from(mesh.triVerts.slice(i,i+3)));
    return {vertices,triangles,booleanRecipe:{operation,inputs:[a.id,b.id],sourceRevisions:await Promise.all([a,b].map(async o=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(o))))).map(n=>n.toString(16).padStart(2,'0')).join('')))}};
  } finally {solids.forEach(s=>s.delete());}
}

// A 2D Boolean uses exactly the same robust Manifold kernel as the 3D command.
// The selected profiles are made into unit-height solids, then only the top-cap
// boundary is returned. This avoids a separate, subtly different polygon engine
// for the plan view. Holes/disconnected islands are represented as loops and
// rendered by SVG's evenodd fill rule.
export async function planarBoolean({a,b,operation}) {
  const solid = points => ({ id: crypto.randomUUID(), kind: 'extrusion', points, depth: 1, position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
  const result = await booleanMesh({ a: solid(a), b: solid(b), operation });
  const z = Math.max(...result.vertices.map(v => v[2])), epsilon = Math.max(1e-7, Math.abs(z) * 1e-7);
  const edges = new Map();
  for (const face of result.triangles) {
    if (!face.every(i => Math.abs(result.vertices[i][2] - z) <= epsilon)) continue;
    for (let i=0;i<3;i++) {
      const from=face[i], to=face[(i+1)%3], key=[from,to].sort((x,y)=>x-y).join('/');
      const entry=edges.get(key)||{count:0,from,to};entry.count++;edges.set(key,entry);
    }
  }
  const boundary=[...edges.values()].filter(e=>e.count===1);
  if (!boundary.length) throw Error('Boolean result has no planar boundary.');
  const next=new Map(); boundary.forEach(e=>{ const list=next.get(e.from)||[];list.push(e.to);next.set(e.from,list); });
  const unused=new Set(boundary.map(e=>`${e.from}/${e.to}`)), loops=[];
  while (unused.size) {
    const first=unused.values().next().value, [startText]=first.split('/'), start=Number(startText);let current=start, loop=[];
    for (let guard=0;guard<=boundary.length;guard++) {
      loop.push(result.vertices[current].slice(0,2));
      const to=(next.get(current)||[]).find(candidate=>unused.has(`${current}/${candidate}`));
      if (to===undefined) break;
      unused.delete(`${current}/${to}`);current=to;
      if (current===start) break;
    }
    if (current!==start || loop.length<3) throw Error('Boolean boundary could not be reconstructed.');
    loops.push(loop);
  }
  return { loops, booleanRecipe: result.booleanRecipe };
}
