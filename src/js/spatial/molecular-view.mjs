// SPDX-License-Identifier: MIT
import * as T from '../../../vendor/three/three.module.min.js';
const colors={H:'#e6ecf0',C:'#526672',O:'#dc5d55',N:'#4c82d7',S:'#d6b43a',P:'#c48a48',F:'#6fbf73',Cl:'#5fae5f',Br:'#a2543a',I:'#8b5fb0'};
const radii={H:1.2,C:1.7,N:1.55,O:1.52,F:1.47,P:1.8,S:1.8,Cl:1.75};
export function polymerSegments(o) {
  const atoms=o.atoms.filter(a=>a.atomName==='CA'||a.atomName==='P');const result=[];
  for(let i=1;i<atoms.length;i++) {
    const a=atoms[i-1],b=atoms[i];
    if(a.chainId!==b.chainId||a.atomName!==b.atomName||Number(b.residueNumber)-Number(a.residueNumber)>1||Math.hypot(...a.position.map((v,k)=>v-b.position[k]))>(a.atomName==='P'?9:5))continue;
    result.push({a,b});
  }return result;
}
export function buildMolecule(group,o,material) {
  o={...o,atoms:o.atoms.map((a,index)=>({...a,index}))};
  const updates=[];group.userData.updateAtoms=positions=>{o.atoms.forEach((a,i)=>a.position=positions[i]);updates.forEach(fn=>fn());};
  const mode=o.representation||'ball-stick',dummy=new T.Object3D(),color=new T.Color();
  const batches=(items,geometry,place)=>{for(let start=0;start<items.length;start+=512){const chunk=items.slice(start,start+512),mesh=new T.InstancedMesh(geometry(),material('#ffffff'),chunk.length);mesh.userData.atomIds=[];mesh.userData.residueIds=[];
    const update=()=>{chunk.forEach((item,i)=>{dummy.position.set(0,0,0);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);const meta=place(item,dummy);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.set(meta.color));mesh.userData.atomIds.push(meta.atom);mesh.userData.residueIds.push(meta.residue);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();};update();updates.push(update);group.add(mesh);}};
  if(['backbone','cartoon'].includes(mode)) {
    const segments=polymerSegments(o);
    batches(segments,()=>mode==='cartoon'?new T.BoxGeometry(1,1,1):new T.CylinderGeometry(1,1,1,8),({a,b},d)=>{const delta=new T.Vector3(...b.position).sub(new T.Vector3(...a.position));d.position.copy(new T.Vector3(...a.position)).addScaledVector(delta,.5);d.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());const type=b.secondary||'coil';d.scale.set(mode==='cartoon'?(type==='sheet'?1.4:type==='helix'?1:.3):.2,delta.length(),mode==='cartoon'?.16:.2);return{color:type==='helix'?'#d36c70':type==='sheet'?'#dab447':'#568ab0',atom:b.id,residue:b.residueId};});
    return;
  }
  if(mode!=='sticks')batches(o.atoms,()=>new T.SphereGeometry(1,12,8),(a,d)=>{d.position.set(...a.position);d.scale.setScalar(mode==='space-fill'?(radii[a.element]||1.7):a.element==='H'?.22:.36);return{color:colors[a.element]||'#a875bd',atom:a.id||`a${a.index}`,residue:a.residueId};});
  if(mode==='space-fill')return;
  const bonds=[];o.bonds.forEach(([a,b],i)=>{const count=Math.min(3,Math.ceil(o.bondOrders?.[i]||1));for(let j=0;j<count;j++)bonds.push({a,b,offset:(j-(count-1)/2)*.19});});
  batches(bonds,()=>new T.CylinderGeometry(.07,.07,1,6),({a,b,offset},d)=>{const start=new T.Vector3(...o.atoms[a].position),delta=new T.Vector3(...o.atoms[b].position).sub(start);const side=new T.Vector3().crossVectors(delta,Math.abs(delta.z)<delta.length()*.9?new T.Vector3(0,0,1):new T.Vector3(1,0,0)).normalize();d.position.copy(start).addScaledVector(delta,.5).addScaledVector(side,offset);d.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());d.scale.set(1,delta.length(),1);return{color:'#91a2ac',atom:o.atoms[a].id||`a${a}`,residue:o.atoms[a].residueId};});
}
