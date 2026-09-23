// SPDX-License-Identifier: MIT
import {compileExpression} from './equations.mjs';
export function graphMesh(model, suppliedField=null) {
  const {min,max,resolution:n}=model;
  if(!Number.isFinite(min)||!Number.isFinite(max)||min>=max||Math.max(Math.abs(min),Math.abs(max))>10000||!Number.isInteger(n)||n<8||n>48)throw Error('Use finite bounds and 8–48 samples per axis.');
  const vertices=[],triangles=[],value=(fn,vars)=>{const v=fn(vars);if(!Number.isFinite(v)||Math.abs(v)>1e5)throw Error('Equation is undefined or unbounded in this domain.');return v;};
  if(model.type==='parametric') {
    if(!Array.isArray(model.equations)||model.equations.length!==3)throw Error('Parametric surface needs XYZ expressions in u,v,t.');
    const f=model.equations.map(s=>compileExpression(s,['u','v','t']));
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const vars={u:min+(max-min)*i/n,v:min+(max-min)*j/n,t:model.time||0};vertices.push(f.map(fn=>value(fn,vars)));}
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;triangles.push([a,b,c],[b,d,c]);}
  }else if(model.type==='implicit'){
    const fn=suppliedField||compileExpression(model.equation),iso=Number(model.iso||0),step=(max-min)/n;
    if(!Number.isFinite(iso))throw Error('Isovalue must be finite.');
    const index=(x,y,z)=>(z*(n+1)+y)*(n+1)+x,values=new Float64Array((n+1)**3);
    for(let z=0;z<=n;z++)for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)values[index(x,y,z)]=value(fn,{x:min+x*step,y:min+y*step,z:min+z*step,t:model.time||0})-iso;
    const offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],edges=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
    const unique=new Map(),vertex=(a,b,pa,pb,va,vb)=>{const key=a<b?`${a}/${b}`:`${b}/${a}`;if(!unique.has(key)){const f=va/(va-vb);unique.set(key,vertices.length);vertices.push(pa.map((v,k)=>v+(pb[k]-v)*f));}return unique.get(key);};
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const corners=offsets.map(([dx,dy,dz])=>({id:index(x+dx,y+dy,z+dz),p:[min+(x+dx)*step,min+(y+dy)*step,min+(z+dz)*step],v:values[index(x+dx,y+dy,z+dz)]}));
      for(const tet of tetra){const c=tet.map(i=>corners[i]),crossings=[];
        for(const[a,b]of edges)if((c[a].v<0)!==(c[b].v<0))crossings.push(vertex(c[a].id,c[b].id,c[a].p,c[b].p,c[a].v,c[b].v));
        if(crossings.length<3)continue;
        // Order intersection polygon around its normal, then orient toward increasing field.
        const pts=crossings.map(i=>vertices[i]),center=[0,1,2].map(k=>pts.reduce((s,p)=>s+p[k]/pts.length,0));
        const eps=step*.01,gradient=[0,1,2].map(k=>{const a=[...center],b=[...center];a[k]+=eps;b[k]-=eps;return fn({x:a[0],y:a[1],z:a[2],t:model.time||0})-fn({x:b[0],y:b[1],z:b[2],t:model.time||0});});
        const norm=Math.hypot(...gradient);if(norm<1e-12)continue;const normal=gradient.map(v=>v/norm),u=pts[0].map((v,k)=>v-center[k]),v=[normal[1]*u[2]-normal[2]*u[1],normal[2]*u[0]-normal[0]*u[2],normal[0]*u[1]-normal[1]*u[0]];
        crossings.sort((a,b)=>{const angle=id=>Math.atan2(vertices[id].reduce((s,p,k)=>s+(p-center[k])*v[k],0),vertices[id].reduce((s,p,k)=>s+(p-center[k])*u[k],0));return angle(a)-angle(b);});
        triangles.push([crossings[0],crossings[1],crossings[2]]);if(crossings.length===4)triangles.push([crossings[0],crossings[2],crossings[3]]);
        if(triangles.length>100000||vertices.length>100000)throw Error('Isosurface exceeds geometry budget. Reduce resolution.');
      }
    }
  }else throw Error('Unknown graph type.');
  if(!vertices.length)throw Error('No surface crosses this domain/isovalue.');return {vertices,triangles,graph:structuredClone(model)};
}
