// SPDX-License-Identifier: MIT
// Explicit rectangular openings partition a wall into cells; shared internal faces cancel.
export function validateOpenings(o) {
  if(!Array.isArray(o.openings)||o.openings.length>16)throw Error('Use at most 16 openings per wall.');
  const ids=new Set();
  for(const h of o.openings){const edge=o.topology.edges.indexOf(h.edge),length=edge<0?0:Math.hypot(...o.path[edge+1].map((v,k)=>v-o.path[edge][k]));
    if(typeof h.id!=='string'||ids.has(h.id)||edge<0||![h.start,h.width,h.sill,h.height].every(Number.isFinite)||h.start<=0||h.width<=0||h.start+h.width>=length||h.sill<0||h.height<=0||h.sill+h.height>=o.height)throw Error('Openings need an existing segment, positive dimensions, and clearance from wall ends/top. Sill 0 creates a doorway.');ids.add(h.id);
  }
}
export function wallWithOpenings(o,frames) {
  validateOpenings(o);const vertices=[],triangles=[],components=[],lookup=new Map(),faces=new Map();
  const point=p=>{const key=p.map(n=>n.toFixed(9)).join(',');if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(p);}return lookup.get(key);};
  const face=(positions,component)=>{const ids=positions.map(point),key=[...ids].sort((a,b)=>a-b).join(',');if(faces.has(key))faces.delete(key);else faces.set(key,{ids,component});};
  const left=o.alignment==='left'?o.thickness:o.alignment==='right'?0:o.thickness/2;
  const z=[...new Set([0,o.height,...o.openings.flatMap(h=>[h.sill,h.sill+h.height])])].sort((a,b)=>a-b);
  for(let i=0;i<o.path.length-1;i++){
    const a=o.path[i],b=o.path[i+1],length=Math.hypot(...b.map((v,k)=>v-a[k])),holes=o.openings.filter(h=>h.edge===o.topology.edges[i]);
    const x=[...new Set([0,length,...holes.flatMap(h=>[h.start,h.start+h.width])])].sort((a,b)=>a-b);
    const ring=(distance,height)=>{const t=distance/length;return [left,left-o.thickness].map(side=>[a[0]+frames[i][0]*side+(b[0]+frames[i+1][0]*side-a[0]-frames[i][0]*side)*t,a[1]+frames[i][1]*side+(b[1]+frames[i+1][1]*side-a[1]-frames[i][1]*side)*t,height]);};
    for(let j=0;j<x.length-1;j++)for(let k=0;k<z.length-1;k++){
      const mid=(x[j]+x[j+1])/2,high=(z[k]+z[k+1])/2;
      if(holes.some(h=>mid>h.start&&mid<h.start+h.width&&high>h.sill&&high<h.sill+h.height))continue;
      const lowA=ring(x[j],z[k]),highA=ring(x[j],z[k+1]),lowB=ring(x[j+1],z[k]),highB=ring(x[j+1],z[k+1]);
      const p=[lowA[0],lowA[1],highA[1],highA[0],lowB[0],lowB[1],highB[1],highB[0]],id=o.topology.edges[i];
      for(let side=0;side<4;side++)face([p[side],p[(side+1)%4],p[(side+1)%4+4],p[side+4]].reverse(),`${id}:side${side}`);
      face([p[3],p[2],p[1],p[0]].reverse(),`${id}:reveal`);face([p[4],p[5],p[6],p[7]].reverse(),`${id}:reveal`);
    }
  }
  for(const {ids,component}of faces.values()){triangles.push([ids[0],ids[1],ids[2]],[ids[0],ids[2],ids[3]]);components.push(component,component);}
  return {vertices,triangles,components};
}
