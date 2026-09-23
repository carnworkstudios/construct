// SPDX-License-Identifier: MIT
import * as T from '../../../vendor/three/three.module.min.js';
import { compileExpression } from './equations.mjs';
import { pathSolidMesh } from './path-solids.mjs';
const number=(value,parameters)=>{const n=typeof value==='number'?value:compileExpression(value,Object.keys(parameters))(parameters);if(!Number.isFinite(n)||Math.abs(n)>1e5)throw Error('Feature parameter is out of range.');return n;};
export function solveSketch(sketch,parameters={}) {
  if(!sketch||!Array.isArray(sketch.points)||sketch.points.length<3||sketch.points.length>32||!sketch.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('A constrained profile needs 3–32 XY points.');
  const constraints=sketch.constraints||[];if(!Array.isArray(constraints)||constraints.length>64)throw Error('Sketch constraint limit: 64.');
  const residual=y=>constraints.flatMap(c=>{
    const indices=c.points||[];if(!indices.every(i=>Number.isInteger(i)&&i>=0&&i<sketch.points.length))throw Error('Constraint references an unknown point.');
    const p=indices.map(i=>[y[i*2],y[i*2+1]]),value=c.value===undefined?0:number(c.value,parameters);
    if(c.type==='fixed'&&p.length===1&&Array.isArray(c.position)&&c.position.length===2)return p[0].map((v,k)=>v-number(c.position[k],parameters));
    if(p.length!==2)throw Error('This constraint needs two point indices.');
    const dx=p[1][0]-p[0][0],dy=p[1][1]-p[0][1];
    if(c.type==='horizontal')return [dy];if(c.type==='vertical')return [dx];if(c.type==='distance'){if(value<=0)throw Error('Distance must be positive.');return [Math.hypot(dx,dy)-value];}
    if(c.type==='coincident')return [dx,dy];if(c.type==='dx')return [dx-value];if(c.type==='dy')return [dy-value];throw Error('Unknown sketch constraint.');
  });
  let y=sketch.points.flat();if(!constraints.length)return sketch.points.map(p=>[...p]);
  for(let iteration=0;iteration<60;iteration++){
    const r=residual(y);if(r.every(v=>Math.abs(v)<1e-7))return Array.from({length:y.length/2},(_,i)=>y.slice(i*2,i*2+2));
    if(!r.every(Number.isFinite))throw Error('Sketch constraint is nonfinite.');
    const n=y.length,columns=y.map((v,j)=>{const next=[...y],h=1e-5*Math.max(1,Math.abs(v));next[j]+=h;return residual(next).map((v,i)=>(v-r[i])/h);});
    const a=Array.from({length:n},(_,i)=>Array.from({length:n+1},(_,j)=>j===n?-columns[i].reduce((s,v,k)=>s+v*r[k],0):columns[i].reduce((s,v,k)=>s+v*columns[j][k],0)+(i===j?1e-6:0)));
    for(let i=0;i<n;i++){let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;[a[i],a[pivot]]=[a[pivot],a[i]];const d=a[i][i];if(Math.abs(d)<1e-14)throw Error('Sketch constraints are singular.');for(let k=i;k<=n;k++)a[i][k]/=d;for(let j=0;j<n;j++)if(j!==i){const f=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=f*a[i][k];}}
    y=y.map((v,i)=>v+a[i][n]);
  }
  throw Error('Sketch constraints did not converge. Check conflicting dimensions or add anchors.');
}
function geometryMesh(g){const p=g.getAttribute('position'),index=g.index,vertices=[],triangles=[];for(let i=0;i<p.count;i++)vertices.push([p.getX(i),p.getY(i),p.getZ(i)]);const n=index?index.count:p.count;for(let i=0;i<n;i+=3)triangles.push([0,1,2].map(j=>index?index.getX(i+j):i+j));g.dispose();return {vertices,triangles};}
export function sourceMesh(o){
  if(o.kind==='mesh')return {vertices:o.vertices,triangles:o.triangles};
  if(o.kind==='wall'||o.kind==='conduit')return pathSolidMesh(o);
  let g;
  if(o.kind==='box')g=new T.BoxGeometry(1,1,1);
  if(o.kind==='sphere')g=new T.SphereGeometry(1,24,16);
  if(o.kind==='cylinder'){g=new T.CylinderGeometry(.5,.5,1,24);g.rotateX(Math.PI/2);}
  if(o.kind==='extrusion'){const shape=new T.Shape(o.points.map(p=>new T.Vector2(...p)));shape.closePath();shape.holes=(o.holes||[]).map(loop=>{const hole=new T.Path(loop.map(p=>new T.Vector2(...p)));hole.closePath();return hole;});g=new T.ExtrudeGeometry(shape,{depth:o.depth,bevelEnabled:false});}
  if(!g)throw Error('This feature needs an explicit solid or mesh source.');return geometryMesh(g);
}
function generated(o,objects){const f=o.feature,p=f.parameters||{};
  if(Object.keys(p).length>32||!Object.entries(p).every(([k,v])=>/^[A-Za-z_]{1,24}$/.test(k)&&typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10000))throw Error('Use up to 32 finite named feature parameters.');
  if(f.op==='extrude'){
    const points=solveSketch(f.sketch,p),depth=number(f.depth,p);if(depth<=0||depth>10000)throw Error('Extrusion depth must be positive.');
    const shape=new T.Shape(points.map(v=>new T.Vector2(...v)));shape.closePath();return geometryMesh(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false}));
  }
  if(f.op==='revolve'){
    const profile=solveSketch(f.sketch,p),segments=f.segments||48,angle=number(f.angle??(Math.PI*2),p);if(!Number.isInteger(segments)||segments<8||segments>128||angle<=0||angle>Math.PI*2||profile.some(v=>v[0]<0))throw Error('Revolve needs nonnegative radii, 8–128 segments and angle up to 2π.');
    const g=new T.LatheGeometry(profile.map(v=>new T.Vector2(...v)),segments,0,angle);g.rotateX(Math.PI/2);return geometryMesh(g);
  }
  if(f.op==='loft'){
    if(!Array.isArray(f.profiles)||f.profiles.length<2||f.profiles.length>16)throw Error('Loft needs 2–16 matching profiles.');
    const profiles=f.profiles.map(s=>({points:solveSketch(s,p),z:number(s.z,p)})),n=profiles[0].points.length;if(profiles.some(s=>s.points.length!==n))throw Error('Loft profiles need matching vertex counts.');
    const vertices=profiles.flatMap(s=>s.points.map(v=>[...v,s.z])),triangles=[];
    for(let i=0;i<profiles.length-1;i++)for(let j=0;j<n;j++){const k=(j+1)%n;triangles.push([i*n+j,i*n+k,(i+1)*n+k],[i*n+j,(i+1)*n+k,(i+1)*n+j]);}
    for(const [layer,reverse]of [[0,true],[profiles.length-1,false]]){const cap=T.ShapeUtils.triangulateShape(profiles[layer].points.map(p=>new T.Vector2(...p)),[]);for(const face of cap)triangles.push((reverse?[...face].reverse():face).map(v=>v+layer*n));}
    return {vertices,triangles};
  }
  if(f.op==='pattern'){
    const source=objects.get(f.inputs?.[0]);if(!source)throw Error('Pattern source is missing.');const count=number(f.count,p),step=f.step?.map(v=>number(v,p));if(!Number.isInteger(count)||count<1||count>64||step?.length!==3)throw Error('Pattern needs 1–64 copies and XYZ step.');
    const mesh=sourceMesh(source),vertices=[],triangles=[],matrix=new T.Matrix4().compose(new T.Vector3(...source.position),new T.Quaternion().setFromEuler(new T.Euler(...source.rotation)),new T.Vector3(...source.scale));
    if(mesh.vertices.length*count>100000||mesh.triangles.length*count>100000)throw Error('Pattern exceeds geometry budget.');
    for(let i=0;i<count;i++){const offset=vertices.length;vertices.push(...mesh.vertices.map(v=>new T.Vector3(...v).applyMatrix4(matrix).addScaledVector(new T.Vector3(...step),i).toArray()));triangles.push(...mesh.triangles.map(t=>t.map(v=>v+offset)));}return {vertices,triangles};
  }
  throw Error('Unknown feature operation.');
}
export function regenerateFeatures(scene,previous) {
  const objects=new Map(scene.objects.map(o=>[o.id,o])),before=new Map((previous?.objects||[]).map(o=>[o.id,o])),state=new Map(),changed=new Set();
  const visit=o=>{if(state.get(o.id)===1)throw Error('Feature dependency cycle.');if(state.get(o.id)===2)return;state.set(o.id,1);
    if(o.feature){const inputs=o.feature.inputs||[];if(!Array.isArray(inputs)||inputs.length>8)throw Error('Invalid feature input list.');for(const id of inputs){const source=objects.get(id);if(!source)throw Error('A dependent feature still references the object being removed.');visit(source);}
      const old=before.get(o.id),dirty=!old||JSON.stringify(old.feature)!==JSON.stringify(o.feature)||inputs.some(id=>changed.has(id));
      if(dirty){const mesh=generated(o,objects),sameTopology=old&&old.feature.op===o.feature.op&&old.vertices.length===mesh.vertices.length&&JSON.stringify(old.triangles)===JSON.stringify(mesh.triangles)&&JSON.stringify(old.feature.inputs||[])===JSON.stringify(inputs);Object.assign(o,mesh);delete o.vertexIds;delete o.faceIds; o.geometryRevision=(old?.geometryRevision||0)+1;
        // Dimension-only regeneration retains identities; topology changes orphan old anchors.
        o.vertexIds=sameTopology&&old.vertexIds?[...old.vertexIds]:o.vertices.map((_,i)=>`g${o.geometryRevision}v${i}`);o.faceIds=sameTopology&&old.faceIds?[...old.faceIds]:o.triangles.map((_,i)=>`g${o.geometryRevision}f${i}`);o.generated=true;changed.add(o.id);}
    }else if(JSON.stringify(o)!==JSON.stringify(before.get(o.id)))changed.add(o.id);
    if(JSON.stringify(o)!==JSON.stringify(before.get(o.id)))changed.add(o.id);
    state.set(o.id,2);
  };scene.objects.forEach(visit);
}
export const featureExample=()=>({op:'extrude',parameters:{Width:4,Height:3,Depth:2},depth:'Depth',sketch:{points:[[0,0],[4,0],[4,3],[0,3]],constraints:[{type:'fixed',points:[0],position:[0,0]},{type:'horizontal',points:[0,1]},{type:'vertical',points:[1,2]},{type:'horizontal',points:[2,3]},{type:'vertical',points:[3,0]},{type:'dx',points:[0,1],value:'Width'},{type:'dy',points:[1,2],value:'Height'}]}});
