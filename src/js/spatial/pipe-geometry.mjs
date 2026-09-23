// SPDX-License-Identifier: MIT
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(v,k)=>v.map(n=>n*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>{const length=Math.hypot(...v);if(length<1e-9)throw Error('Conduit contains a degenerate segment or reversal.');return scale(v,1/length);};
export function pipePath(o) {
 const points=o.path.map(p=>[p[0],p[1],p[2]||0]),radius=o.bendRadius||0,result=[{point:points[0],edge:o.topology.edges[0]}];
 for(let i=1;i<points.length-1;i++){
  const p=points[i],a=norm(sub(p,points[i-1])),b=norm(sub(points[i+1],p)),theta=Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
  if(theta>Math.PI-.01)throw Error('Conduit cannot reverse direction at a single vertex.');
  if(!radius||theta<1e-5){result.push({point:p,edge:o.topology.edges[i]});continue;}
  const distance=radius*Math.tan(theta/2);
  if(distance>=Math.min(Math.hypot(...sub(p,points[i-1])),Math.hypot(...sub(points[i+1],p)))/2)throw Error('Bend radius is too large for adjacent route segments.');
  const center=add(p,scale(norm(sub(b,a)),radius/Math.cos(theta/2))),start=sub(sub(p,scale(a,distance)),center),axis=norm(cross(a,b)),steps=Math.max(2,Math.ceil(theta/(Math.PI/18)));
  for(let j=0;j<=steps;j++){const angle=theta*j/steps;const v=add(add(scale(start,Math.cos(angle)),scale(cross(axis,start),Math.sin(angle))),scale(axis,dot(axis,start)*(1-Math.cos(angle))));result.push({point:add(center,v),edge:o.topology.edges[i-1]});}
 }
 result.push({point:points.at(-1),edge:o.topology.edges.at(-1)});if(result.length>512)throw Error('Curved conduit exceeds 512 sampled rings. Simplify the path.');return result;
}
export function pipeMesh(o) {
 const samples=pipePath(o),vertices=[],triangles=[],components=[],sides=24,stride=48;let normal;
 samples.forEach((sample,i)=>{
  const tangent=norm(i===0?sub(samples[1].point,sample.point):i===samples.length-1?sub(sample.point,samples[i-1].point):add(norm(sub(sample.point,samples[i-1].point)),norm(sub(samples[i+1].point,sample.point))));
  normal=normal?sub(normal,scale(tangent,dot(normal,tangent))):cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[1,0,0]);normal=norm(normal);const binormal=norm(cross(tangent,normal));
  for(const radius of [o.diameter/2,o.diameter/2-o.wallThickness])for(let j=0;j<sides;j++){const angle=j*Math.PI*2/sides;vertices.push(add(sample.point,add(scale(normal,radius*Math.cos(angle)),scale(binormal,radius*Math.sin(angle)))));}
 });
 const quad=(a,b,c,d,id)=>{triangles.push([a,b,c],[a,c,d]);components.push(id,id);};
 for(let i=0;i<samples.length-1;i++)for(let j=0;j<sides;j++){const a=i*stride+j,b=i*stride+(j+1)%sides;quad(a,b,b+stride,a+stride,`${samples[i].edge}:outer`);quad(a+sides,a+sides+stride,b+sides+stride,b+sides,`${samples[i].edge}:inner`);}
 for(let j=0;j<sides;j++){const next=(j+1)%sides,end=(samples.length-1)*stride;quad(j,j+sides,next+sides,next,`${o.topology.vertices[0]}:cap`);quad(end+j,end+next,end+next+sides,end+j+sides,`${o.topology.vertices.at(-1)}:cap`);}
 return {vertices,triangles,components};
}
