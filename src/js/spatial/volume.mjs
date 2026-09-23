// SPDX-License-Identifier: MIT
// Single scalar Gaussian CUBE grids. Coordinates become angstroms.
import {graphMesh} from './graphs.mjs';
export function cubeSurface({text,iso,resolution=24,name='Volumetric field'}) {
  if(typeof text!=='string'||text.length>16*1024*1024)throw Error('CUBE limit: 16 MB.');
  const lines=text.trimEnd().split(/\r?\n/),numbers=line=>(line||'').trim().split(/\s+/).map(s=>Number(s.replace(/[dD]/,'e')));
  const header=numbers(lines[2]),atomCount=header[0],origin=header.slice(1,4),axes=lines.slice(3,6).map(numbers);
  if(!Number.isInteger(atomCount)||atomCount<0||atomCount>10000||header.length<4||(header[4]!==undefined&&header[4]!==1))throw Error('Import a single scalar CUBE dataset (no multi-orbital records).');
  if(axes.length!==3||axes.some(a=>a.length!==4||!Number.isInteger(a[0])||Math.abs(a[0])<2||Math.abs(a[0])>128))throw Error('CUBE grid axes must have 2–128 samples.');
  const signs=axes.map(a=>Math.sign(a[0]));if(!signs.every(s=>s===signs[0]))throw Error('CUBE grid unit signs must agree.');
  const scale=signs[0]>0?.529177210903:1,shape=axes.map(a=>Math.abs(a[0])),basis=axes.map(a=>a.slice(1).map(v=>v*scale));
  if(shape.reduce((a,b)=>a*b,1)>262144)throw Error('CUBE grid limit: 262,144 scalar samples.');
  if(![...origin,...basis.flat()].every(Number.isFinite))throw Error('Invalid CUBE coordinates.');
  const [a,b,c]=basis,det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  if(Math.abs(det)<1e-15)throw Error('CUBE grid axes must be independent.');
  const samples=numbers(lines.slice(6+atomCount).join(' '));
  if(samples.length!==shape.reduce((a,b)=>a*b,1)||!samples.every(Number.isFinite))throw Error('CUBE scalar count does not match the grid.');
  if(!Number.isFinite(iso))throw Error('Specify a finite isovalue in the supplied field units.');
  const index=(x,y,z)=>(x*shape[1]+y)*shape[2]+z;
  const field=({x,y,z})=>{
    const p=[x,y,z].map((v,k)=>Math.max(0,Math.min(shape[k]-1,v*(shape[k]-1)))),lo=p.map((v,k)=>Math.min(shape[k]-2,Math.floor(v))),f=p.map((v,k)=>v-lo[k]);let sum=0;
    for(let i=0;i<2;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)sum+=samples[index(lo[0]+i,lo[1]+j,lo[2]+k)]*(i?f[0]:1-f[0])*(j?f[1]:1-f[1])*(k?f[2]:1-f[2]);return sum;
  };
  const mesh=graphMesh({type:'implicit',min:0,max:1,resolution,iso},field);
  mesh.vertices=mesh.vertices.map(p=>origin.map((v,k)=>v*scale+p.reduce((sum,t,j)=>sum+t*(shape[j]-1)*basis[j][k],0)));
  if(det<0)mesh.triangles=mesh.triangles.map(([a,b,c])=>[a,c,b]);
  delete mesh.graph;
  return {...mesh,field:{format:'cube',name,shape,iso,resolution,coordinateUnits:'Å',interpolation:'trilinear',sourceComments:lines.slice(0,2).map(s=>s.slice(0,200))}};
}
