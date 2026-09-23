// SPDX-License-Identifier: MIT
import { compileExpression } from './equations.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const VARIABLES=['x','y','z','t','vx','vy','vz','mass'];
export function validateExperiment(model) {
  if(!model||!['particles','kinetics'].includes(model.kind))throw Error('Choose a particle or mass-action kinetics model.');
  if(!finite(model.dt)||model.dt<=0||!finite(model.duration)||model.duration<=0||Math.ceil(model.duration/model.dt)>100000)throw Error('Use positive duration/timestep, at most 100000 integration steps.');
  if(!Number.isInteger(model.sampleEvery)||model.sampleEvery<1||Math.ceil(model.duration/model.dt/model.sampleEvery)>2000)throw Error('Recording is limited to 2001 frames. Increase sampleEvery.');
  if(model.kind==='particles') {
    if(!Array.isArray(model.bodies)||!model.bodies.length||model.bodies.length>16||!model.bodies.every(b=>finite(b.mass)&&b.mass>0&&finite(b.radius)&&b.radius>0&&vec(b.position)&&vec(b.velocity)))throw Error('Use 1–16 bodies with positive mass/radius and finite position/velocity.');
    if(!vec(model.gravity)||!finite(model.restitution)||model.restitution<0||model.restitution>1||!Array.isArray(model.force)||model.force.length!==3)throw Error('Specify gravity, XYZ force equations and restitution from 0 to 1.');
    if(model.planes!==undefined&&(!Array.isArray(model.planes)||model.planes.length>16||!model.planes.every(p=>vec(p.normal)&&Math.hypot(...p.normal)>1e-8&&finite(p.offset)&&model.bodies.every(b=>p.normal.reduce((s,n,k)=>s+n*b.position[k],0)-p.offset>=b.radius*Math.hypot(...p.normal)-1e-8))))throw Error('Use up to 16 planes whose positive half-spaces contain the initial spheres.');
    model.force.forEach(f=>compileExpression(f,VARIABLES));
    if(model.boundary){const b=model.boundary;if(!['reflect','periodic'].includes(b.kind)||!vec(b.min)||!vec(b.max)||b.min.some((v,i)=>v>=b.max[i])||model.bodies.some(p=>p.position.some((v,i)=>v-p.radius<b.min[i]||v+p.radius>b.max[i])))throw Error('Boundary must contain every initial sphere.');}
  } else {
    if(!Array.isArray(model.species)||!model.species.length||model.species.length>32||new Set(model.species).size!==model.species.length||!model.species.every(s=>/^[A-Za-z][A-Za-z0-9_]{0,20}$/.test(s))||!Array.isArray(model.initial)||model.initial.length!==model.species.length||!model.initial.every(n=>finite(n)&&n>=0))throw Error('Kinetics requires unique species names and nonnegative initial concentrations.');
    if(!Array.isArray(model.reactions)||!model.reactions.length||model.reactions.length>64)throw Error('Use 1–64 mass-action reactions.');
    for(const r of model.reactions)if(!finite(r.forward)||r.forward<0||!finite(r.reverse)||r.reverse<0||![r.reactants,r.products].every(v=>Array.isArray(v)&&v.length===model.species.length&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=10)&&v.some(n=>n>0)))throw Error('Reaction stoichiometry and nonnegative forward/reverse rates are required.');
  }
}
function rk4(y,t,dt,f){const a=f(y,t),b=f(y.map((n,i)=>n+dt*a[i]/2),t+dt/2),c=f(y.map((n,i)=>n+dt*b[i]/2),t+dt/2),d=f(y.map((n,i)=>n+dt*c[i]),t+dt);return y.map((n,i)=>n+dt*(a[i]+2*b[i]+2*c[i]+d[i])/6);}
export function runExperiment(model) {
  validateExperiment(model);const rows=[],frames=[],times=[],start=performance.now();
  const force=model.kind==='particles'?model.force.map(f=>compileExpression(f,VARIABLES)):null;
  let y=model.kind==='particles'?model.bodies.flatMap(b=>[...b.position,...b.velocity]):[...model.initial];
  const derivative=(values,t)=>{
    if(model.kind==='kinetics') {
      const dy=values.map(()=>0);
      for(const r of model.reactions){const rate=r.forward*r.reactants.reduce((p,n,i)=>p*Math.max(0,values[i])**n,1)-r.reverse*r.products.reduce((p,n,i)=>p*Math.max(0,values[i])**n,1);dy.forEach((_,i)=>dy[i]+=(r.products[i]-r.reactants[i])*rate);}return dy;
    }
    return model.bodies.flatMap((b,i)=>{const [x,y,z,vx,vy,vz]=values.slice(i*6,i*6+6),vars={x,y,z,vx,vy,vz,t,mass:b.mass};return [vx,vy,vz,...force.map((f,k)=>f(vars)/b.mass+model.gravity[k])];});
  };
  const record=t=>{
    times.push(t);
    if(model.kind==='kinetics'){rows.push([t,...y]);return;}
    frames.push(model.bodies.map((_,i)=>y.slice(i*6,i*6+3)));
    let kinetic=0,potential=0,power=0;
    model.bodies.forEach((b,i)=>{const [x,yv,z,vx,vy,vz]=y.slice(i*6,i*6+6);kinetic+=.5*b.mass*(vx*vx+vy*vy+vz*vz);potential-=b.mass*(x*model.gravity[0]+yv*model.gravity[1]+z*model.gravity[2]);const vars={x,y:yv,z,vx,vy,vz,t,mass:b.mass};power+=force.reduce((s,f,k)=>s+f(vars)*[vx,vy,vz][k],0);});
    rows.push([t,kinetic,potential,kinetic+potential,power]);
  };
  const contacts=()=>{
    // Sequential sphere impulses. Explicit discrete collision model, not continuous collision detection.
    for(let i=0;i<model.bodies.length;i++)for(let j=i+1;j<model.bodies.length;j++){
      const a=model.bodies[i],b=model.bodies[j],d=[0,1,2].map(k=>y[j*6+k]-y[i*6+k]);
      if(model.boundary?.kind==='periodic')d.forEach((v,k)=>{const size=model.boundary.max[k]-model.boundary.min[k];d[k]=v-Math.round(v/size)*size;});
      const length=Math.hypot(...d),r=a.radius+b.radius;if(length>=r)continue;
      const n=length>1e-10?d.map(v=>v/length):[1,0,0],inverse=1/a.mass+1/b.mass;
      const speed=n.reduce((s,v,k)=>s+v*(y[j*6+k+3]-y[i*6+k+3]),0),impulse=speed<0?-(1+model.restitution)*speed/inverse:0;
      n.forEach((v,k)=>{y[i*6+k]-=v*(r-length)/(a.mass*inverse);y[j*6+k]+=v*(r-length)/(b.mass*inverse);y[i*6+k+3]-=v*impulse/a.mass;y[j*6+k+3]+=v*impulse/b.mass;});
    }
    for(const plane of model.planes||[]){const length=Math.hypot(...plane.normal),normal=plane.normal.map(v=>v/length),offset=plane.offset/length;model.bodies.forEach((body,i)=>{const distance=normal.reduce((s,n,k)=>s+n*y[i*6+k],0)-offset;if(distance>=body.radius)return;const speed=normal.reduce((s,n,k)=>s+n*y[i*6+k+3],0);normal.forEach((n,k)=>{y[i*6+k]+=n*(body.radius-distance);if(speed<0)y[i*6+k+3]-=(1+model.restitution)*speed*n;});});}
    if(model.boundary)model.bodies.forEach((b,i)=>{const box=model.boundary;for(let k=0;k<3;k++){const index=i*6+k,min=box.min[k],max=box.max[k];if(box.kind==='periodic')y[index]=min+((y[index]-min)%(max-min)+(max-min))%(max-min);else{if(y[index]<min+b.radius){y[index]=min+b.radius;y[index+3]=Math.abs(y[index+3])*model.restitution;}if(y[index]>max-b.radius){y[index]=max-b.radius;y[index+3]=-Math.abs(y[index+3])*model.restitution;}}}});
  };
  record(0);let t=0,step=0;
  while(t<model.duration-1e-12){const dt=Math.min(model.dt,model.duration-t);y=rk4(y,t,dt,derivative);t+=dt;step++;
    if(!y.every(Number.isFinite)||y.some(n=>Math.abs(n)>1e8))throw Error('Integration diverged. Reduce timestep or revise the model.');
    if(model.kind==='kinetics'){if(y.some(n=>n< -1e-8))throw Error('Negative concentration: reduce timestep.');y=y.map(n=>Math.max(0,n));}else contacts();
    if(step%model.sampleEvery===0||t>=model.duration-1e-12)record(t);
    if(performance.now()-start>25000)throw Error('Simulation exceeded the execution budget.');
  }
  return {schema:'gx-experiment-result/1',solver:'rk4-sphere-impulse/1',model:structuredClone(model),times,frames,
    columns:model.kind==='particles'?['time_s','kinetic_J','gravity_potential_J','K_plus_Ug_J','applied_power_W']:['time_s',...model.species],rows,
    notes:model.kind==='particles'?'SI units. Potential includes gravity only; discrete sphere collisions may tunnel at large timesteps.':'Concentrations use mol/L; rate constant dimensions follow reaction order. Mass-action model, not reaction prediction.'};
}
export const particleExample=()=>({kind:'particles',dt:.005,duration:5,sampleEvery:5,gravity:[0,0,-9.81],force:['0','0','0'],restitution:.8,boundary:{kind:'reflect',min:[-5,-5,0],max:[5,5,10]},bodies:[{mass:1,radius:.25,position:[0,0,4],velocity:[1,0,0]}]});
export const kineticsExample=()=>({kind:'kinetics',dt:.01,duration:10,sampleEvery:10,species:['A','B'],initial:[1,0],reactions:[{reactants:[1,0],products:[0,1],forward:1,reverse:.5}]});
