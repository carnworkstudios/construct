// SPDX-License-Identifier: MIT
import { OBJLoader } from '../../../vendor/three/OBJLoader.js';
import { STLLoader } from '../../../vendor/three/STLLoader.js';
import { GLTFLoader } from '../../../vendor/three/GLTFLoader.js';
import * as T from '../../../vendor/three/three.module.min.js';
const MAX = 100000;
// Loaders hand back DE-INDEXED geometry: OBJLoader triangulates an n-gon and
// emits 3 unshared vertices per triangle, so a 24k-vertex quad model arrives as
// 220k vertices. Measuring the budget against that number rejects models far
// under it, so vertices are welded back to unique positions FIRST and the limit
// applied to the real mesh. Welding is exact-position only: it restores the
// sharing the file already declared and never merges positions the file kept
// apart, so it is not the "explicit weld" operation the architecture reserves
// for changing topology on request.
export function geometryData(geometry, matrix = new T.Matrix4()) {
  const attribute = geometry.getAttribute('position');
  if (!attribute) throw Error('Mesh carries no vertex positions.');
  const index = geometry.index, count = index ? index.count : attribute.count;
  if (count % 3) throw Error('Only bounded triangle meshes can be imported.');
  if (count / 3 > MAX) throw Error(`Mesh has ${Math.floor(count / 3)} triangles, over the ${MAX} limit. Decimate it before importing.`);

  const vertices = [], triangles = [], unique = new Map(), p = new T.Vector3();
  const place = i => {
    p.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
    // Match exact positions; the stored coordinate stays unchanged.
    const key = `${p.x},${p.y},${p.z}`;
    let at = unique.get(key);
    if (at === undefined) { at = vertices.length; unique.set(key, at); vertices.push(p.toArray()); }
    return at;
  };
  // Welding collapses a zero-area face -- three corners on two positions -- into
  // a triangle with a repeated index, which the scene model rejects outright.
  // Delivered assets legitimately carry these (Kenney's city kit has 34 in one
  // building), and they render nothing either way, so they are DROPPED and
  // counted rather than failing an otherwise sound import.
  let degenerate = 0;
  for (let i = 0; i < count; i += 3) {
    const f = [0, 1, 2].map(j => place(index ? index.getX(i + j) : i + j));
    if (new Set(f).size < 3) { degenerate++; continue; }
    if (matrix.determinant() < 0) f.reverse();
    triangles.push(f);
  }
  if (!triangles.length) throw Error('Every face in this mesh is degenerate (zero area). Nothing could be imported.');
  if (vertices.length > MAX) throw Error(`Mesh has ${vertices.length} vertices, over the ${MAX} limit. Decimate it before importing.`);
  return { vertices, triangles, sourceVertices: count, degenerate };
}
function gltfDocument(buffer) {
  const data = new DataView(buffer);
  if(data.byteLength<20||data.getUint32(0,true)!==0x46546c67||data.getUint32(4,true)!==2||data.getUint32(8,true)!==buffer.byteLength)throw Error('Expected a complete glTF 2 GLB file.');
  const length=data.getUint32(12,true);
  if(data.getUint32(16,true)!==0x4e4f534a||length>buffer.byteLength-20)throw Error('GLB JSON chunk is invalid.');
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  if((json.buffers||[]).some(b=>b.uri)||(json.images||[]).length)throw Error('Import geometry-only GLB without image or external resources. Textured assets need an explicit resource import.');
  if(json.skins?.length||json.animations?.length||json.extensionsRequired?.length)throw Error('Bake skins, animations and compressed extensions to static geometry before import.');
  if((json.accessors||[]).some(a=>!Number.isInteger(a.count)||a.count<0||a.count>MAX*3)||(json.nodes||[]).length>4096||(json.meshes||[]).length>256)throw Error('GLB allocation budget exceeded. Decimate the geometry before importing.');
  if((json.buffers||[]).some(b=>!Number.isInteger(b.byteLength)||b.byteLength<0||b.byteLength>16*1024*1024))throw Error('GLB buffer budget exceeded.');
  return json;
}
export async function importMesh(buffer, filename, scale=1) {
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>16*1024*1024||!Number.isFinite(scale)||scale<=0||scale>1e10)throw Error('Mesh import is limited to 16 MB with a positive unit scale.');
  const extension=filename.split('.').pop().toLowerCase(), result=[];
  let root;
  if(extension==='stl') {
    // A loader fed a file that is not the format it expects throws from deep
    // inside its own parsing -- "Offset is outside the bounds of the DataView"
    // names a DataView, not the file the user chose. Say which file failed and
    // what was expected instead.
    if(buffer.byteLength>=84){const count=new DataView(buffer).getUint32(80,true),prefix=new TextDecoder().decode(buffer.slice(0,80));if(buffer.byteLength===84+count*50||!/^\s*solid/i.test(prefix)){if(count>MAX||84+count*50>buffer.byteLength)throw Error(`${filename} has an oversized or incomplete binary STL triangle table.`);}}
    let geometry;
    try { geometry=new STLLoader().parse(buffer); }
    catch { throw Error(`${filename} is not readable as STL. Check it is a binary or ASCII STL and not renamed from another format.`); }
    try { result.push({ name:filename.slice(0,120),...geometryData(geometry,new T.Matrix4().makeScale(scale,scale,scale)) }); } finally {geometry.dispose();}
  } else {
    if(extension==='obj') {
      const text=new TextDecoder().decode(buffer);let faces=0;for(const line of text.split(/\r?\n/)){if(/^\s*f\s/.test(line)){faces+=Math.max(0,line.trim().split(/\s+/).length-3);if(faces>MAX)throw Error(`${filename} exceeds the ${MAX} triangle import budget.`);}}
      try { root=new OBJLoader().parse(text); }
      catch { throw Error(`${filename} is not readable as OBJ. Material and texture references are ignored; the file must contain vertex and face data.`); }
    }
    else if(extension==='glb') { gltfDocument(buffer); try { root=(await new GLTFLoader().parseAsync(buffer,'')).scene; } catch(e) { throw Error(`${filename} is not readable as GLB: ${e.message}`); } }
    else throw Error('Supported mesh imports are STL, OBJ and static geometry GLB.');
    try {
      root.updateMatrixWorld(true);
      root.traverse(node=> {
        if(!node.isMesh)return;
        if(node.isSkinnedMesh||node.morphTargetInfluences?.length)throw Error('Bake deformed geometry before import.');
        const matrix=new T.Matrix4().makeScale(scale,scale,scale).multiply(node.matrixWorld);
        result.push({name:(node.name||filename).slice(0,120),...geometryData(node.geometry,matrix)});
      });
    } finally { root.traverse(node=>{node.geometry?.dispose(); for(const m of (Array.isArray(node.material)?node.material:[node.material]))m?.dispose();}); }
  }
  // "no meshes" and "too large" are different problems with different fixes;
  // one message covering both leaves the user guessing which they have.
  if(!result.length)throw Error(`${filename} parsed but contains no triangle geometry. Point clouds, curves and empty groups cannot be imported as meshes.`);
  const vertices=result.reduce((n,o)=>n+o.vertices.length,0), triangles=result.reduce((n,o)=>n+o.triangles.length,0);
  if(result.length>256||vertices>MAX||triangles>MAX)throw Error(`${filename} holds ${result.length} parts, ${vertices} vertices and ${triangles} triangles, over the limit of 256 parts and ${MAX} of each. Decimate it or import fewer parts.`);
  return result;
}
