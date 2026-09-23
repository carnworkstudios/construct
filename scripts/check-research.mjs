// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {object,blankScene,SceneStore,validateScene,parsePDB} from '../src/js/spatial/model.mjs';
import {meshIdentity,editMesh,editPath,components,annotationPosition,planarFaces,planarFaceOf} from '../src/js/spatial/editing.mjs';
import {particleExample,kineticsExample,runExperiment} from '../src/js/spatial/experiments.mjs';
import {featureExample,solveSketch} from '../src/js/spatial/features.mjs';
import {pathTopology,pathSolidMesh} from '../src/js/spatial/path-solids.mjs';
import {importMesh} from '../src/js/spatial/mesh-import.mjs';
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('✓ '+name);};
const tetra=()=>object('mesh','Tetrahedron',meshIdentity({vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],triangles:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]}));
const scene=(...objects)=>({...blankScene(),objects});
await test('component edits preserve labels and undo; deleted edges orphan rather than retarget',()=>{
 const o=tetra(),store=new SceneStore(scene(o)),edge=components(o,'edge')[0];o.annotations=[{id:'label',scope:'edge',target:edge.id,text:'Boundary',tags:['sample'],visible:true}];
 const ids=o.vertexIds.slice();editMesh(o,'split',edge.id);assert.deepEqual(o.vertexIds.slice(0,4),ids);assert.equal(annotationPosition(o,o.annotations[0]),null);validateScene(scene(o));
 store.commit(s=>editMesh(s.objects[0],'extrude','f0',.2));assert.equal(store.scene.objects[0].vertices.length,7);store.undo();assert.equal(store.scene.objects[0].vertices.length,4);
 const inset=tetra();editMesh(inset,'inset','f0',.2);validateScene(scene(inset));assert.throws(()=>editMesh(tetra(),'inset','f0',1));
});
await test('explicit path topology operations retain surviving vertices',()=>{const path=[[0,0],[2,0],[2,2]],o=object('wall','Wall',{path,topology:pathTopology(path),thickness:.15,height:3,alignment:'center'}),old=o.topology.vertices.slice();editPath(o,'split',o.topology.edges[0]);assert.equal(o.topology.vertices[2],old[1]);editPath(o,'remove',o.topology.vertices[1]);assert.deepEqual(o.topology.vertices,old);validateScene(scene(o));});
await test('door opening removes expected wall volume',()=>{
 const path=[[0,0],[4,0]],o=object('wall','Wall',{path,topology:pathTopology(path),thickness:.2,height:3,alignment:'center'});o.openings=[{id:'door',edge:o.topology.edges[0],start:1,width:1,sill:0,height:2}];validateScene(scene(o));const m=pathSolidMesh(o);
 const volume=m.triangles.reduce((s,f)=>{const[a,b,c]=f.map(i=>m.vertices[i]);return s+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;},0);assert.ok(Math.abs(volume-2)<1e-8);
});
await test('constraint dimensions regenerate dependent patterns; cycles and conflicts are atomic',()=>{
 const f=featureExample();assert.ok(Math.abs(solveSketch(f.sketch,{...f.parameters,Width:7})[1][0]-7)<1e-6);
 const store=new SceneStore();const source=object('mesh','Feature',{vertices:[[0,0,0]],triangles:[],feature:f});store.commit(s=>s.objects.push(source));const pattern=object('mesh','Pattern',{vertices:[[0,0,0]],triangles:[],feature:{op:'pattern',inputs:[source.id],count:2,step:[6,0,0]}});store.commit(s=>s.objects.push(pattern));
 const stableIds=[...store.scene.objects[0].vertexIds];store.commit(s=>s.objects[0].feature.parameters.Depth=5);assert.deepEqual(store.scene.objects[0].vertexIds,stableIds);assert.equal(Math.max(...store.scene.objects[1].vertices.map(v=>v[2])),5);
 const before=JSON.stringify(store.scene);assert.throws(()=>store.commit(s=>s.objects[0].feature.inputs=[pattern.id]),/cycle/);assert.equal(JSON.stringify(store.scene),before);
 const conflict=structuredClone(f.sketch);conflict.constraints.push({type:'dx',points:[0,1],value:100});assert.throws(()=>solveSketch(conflict,f.parameters),/converge/);
});
await test('RK4 agrees with analytic free fall and records energy/power',()=>{const model=particleExample();delete model.boundary;model.duration=1;model.bodies[0].velocity=[0,0,0];const result=runExperiment(model),end=result.frames.at(-1)[0];assert.ok(Math.abs(end[2]-(4-9.81/2))<1e-7);assert.ok(Math.abs(result.rows.at(-1)[3]-result.rows[0][3])<1e-7);validateScene(scene(object('experiment','Fall',{experiment:model,result})));});
await test('reversible kinetics converges to the supplied equilibrium ratio',()=>{const m=kineticsExample(),r=runExperiment(m);assert.ok(Math.abs(r.rows.at(-1)[1]-1/3)<1e-5);assert.ok(r.rows.every(row=>Math.abs(row[1]+row[2]-1)<1e-10));});
await test('PDB retains atom/residue/chain identity and original coordinate origin',()=>{const pdb='ATOM      1  CA  ALA A  12       1.000   2.000   3.000  1.00 20.00           C  \nATOM      2  C   ALA A  12       2.000   2.000   3.000  1.00 20.00           C  ';const m=parsePDB(pdb);assert.equal(m.atoms[0].atomName,'CA');assert.equal(m.atoms[0].residueName,'ALA');assert.equal(components(m,'residue').length,1);assert.deepEqual(m.coordinateOrigin,[1.5,2,3]);validateScene(scene(m));});
await test('OBJ imports maintain named groups and declared scale',async()=>{const text='o triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';const parts=await importMesh(new TextEncoder().encode(text).buffer,'triangle.obj',.001);assert.equal(parts[0].name,'triangle');assert.equal(parts[0].vertices[1][0],.001);assert.equal(parts[0].triangles.length,1);});
await test('3D conduit risers and rounded bends generate bounded geometry',()=>{const path=[[0,0,0],[3,0,0],[3,0,3]],o=object('conduit','Riser',{path,topology:pathTopology(path),diameter:.1,wallThickness:.01,bendRadius:.3});validateScene(scene(o));const mesh=pathSolidMesh(o);assert.ok(mesh.vertices.length>3*48);assert.ok(mesh.vertices.every(p=>p.every(Number.isFinite)));assert.throws(()=>validateScene(scene({...o,bendRadius:10})),/radius/);});
await test('worker Boolean subtract produces a closed half cube',async()=>{const {booleanMesh}=await import('../src/js/spatial/booleans.mjs');const result=await booleanMesh({a:object('box','A'),b:object('box','B',{position:[.5,0,0]}),operation:'subtract'});assert.equal(result.triangles.length,12);assert.equal(Math.max(...result.vertices.map(v=>v[0])),0);assert.equal(result.booleanRecipe.sourceRevisions[0].length,64);});
await test('planar Boolean returns closed loops for union, subtraction and intersection',async()=>{const {planarBoolean}=await import('../src/js/spatial/booleans.mjs');const a=[[0,0],[2,0],[2,2],[0,2]],b=[[1,0],[3,0],[3,2],[1,2]];for(const operation of ['union','subtract','intersect']){const result=await planarBoolean({a,b,operation});assert.ok(result.loops.length);assert.ok(result.loops.every(loop=>loop.length>=3&&loop.every(p=>p.every(Number.isFinite))));}});
await test('extrusions preserve Boolean holes as planar profile data',()=>{const outer=[[0,0],[4,0],[4,4],[0,4]],hole=[[1,1],[3,1],[3,3],[1,3]];validateScene(scene(object('extrusion','Cut profile',{points:outer,holes:[hole],depth:1})));assert.throws(()=>validateScene(scene(object('extrusion','Bad hole',{points:outer,holes:[[[1,1],[1,1],[2,2]]],depth:1}))),/duplicate|zero-area|Invalid/);});
await test('CUBE fields preserve supplied coordinates and reject truncated data',async()=>{
 const {cubeSurface}=await import('../src/js/spatial/volume.mjs');const text='field\nscalar\n0 1 2 3\n-2 1 0 0\n-2 0 2 0\n-2 0 0 3\n0 0 0 0 1 1 1 1';
 const mesh=cubeSurface({text,iso:.43,resolution:8});assert.ok(mesh.vertices.length);assert.ok(mesh.vertices.every(p=>Math.abs(p[0]-1.43)<1e-10));assert.ok(mesh.vertices.every(p=>p[1]>=2&&p[1]<=4&&p[2]>=3&&p[2]<=6));assert.throws(()=>cubeSurface({text:text.slice(0,-2),iso:.43}),/count/);
});
await test('imported experiment metadata and duplicate annotation IDs are rejected',()=>{
 const model=particleExample(),result=runExperiment(model);delete result.columns;assert.throws(()=>validateScene(scene(object('experiment','Invalid',{experiment:model,result}))),/columns/);
 const o=tetra(),a={id:'same',scope:'object',target:o.id,text:'Label',tags:[],visible:true};o.annotations=[a,a];assert.throws(()=>validateScene(scene(o)),/unique/);
});
await test('inclined plane contact reflects normal velocity and preserves elastic energy',()=>{const m=particleExample();delete m.boundary;m.gravity=[0,0,0];m.restitution=1;m.duration=.6;m.sampleEvery=1;m.bodies[0].position=[0,0,1];m.bodies[0].velocity=[0,0,-2];m.planes=[{normal:[0,1,1],offset:0}];const r=runExperiment(m);assert.ok(r.frames.at(-1)[0][1]>.3);assert.ok(Math.abs(r.rows.at(-1)[1]-r.rows[0][1])<1e-8);assert.ok(r.frames.every(f=>f[0][1]+f[0][2]>=.25*Math.SQRT2-1e-8));});
const unitCube=()=>object('mesh','Cube',meshIdentity({
 vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
 triangles:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]}));
// Signed volume via the divergence theorem; a consistently wound closed solid is positive.
const volume=o=>o.triangles.reduce((s,f)=>{const [a,b,c]=f.map(i=>o.vertices[i]);
 return s+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;},0);
// Every directed edge appears once and its reverse exists.
const openEdges=o=>{const seen=new Map();
 for(const f of o.triangles)for(let i=0;i<3;i++){const k=f[i]+'>'+f[(i+1)%3];seen.set(k,(seen.get(k)||0)+1);}
 let bad=0;for(const [k,n] of seen){if(n!==1)bad++;const [a,b]=k.split('>');if(!seen.has(b+'>'+a))bad++;}return bad;};
const topFace=o=>planarFaces(o).groups.find(g=>g.normal[2]>.99);
await test('coplanar triangles group into one planar face; curvature does not merge',()=>{
 const cube=unitCube(),{groups}=planarFaces(cube);
 assert.equal(groups.length,6);assert.ok(groups.every(g=>g.triangles.length===2));
 assert.equal(components(cube,'planar').length,6);
 const top=topFace(cube);assert.ok(top.triangles.every(t=>planarFaceOf(cube,t)===top.id));
 const N=24,cv=[],ct=[];
 for(let j=0;j<N;j++){const a=j*2*Math.PI/N;cv.push([Math.cos(a),Math.sin(a),0],[Math.cos(a),Math.sin(a),2]);}
 cv.push([0,0,0],[0,0,2]);const B=2*N;
 for(let j=0;j<N;j++){const k=(j+1)%N;ct.push([2*j,2*k,2*k+1],[2*j,2*k+1,2*j+1],[B,2*k,2*j],[B+1,2*j+1,2*k+1]);}
 const sizes=planarFaces(meshIdentity({vertices:cv,triangles:ct})).groups.map(g=>g.triangles.length).sort((a,b)=>b-a);
 assert.deepEqual(sizes.slice(0,2),[N,N]);
});
await test('planar extrude and inset keep the solid closed and change volume by the cap',()=>{
 for(const d of [2,.5,-.25]){const o=unitCube();editMesh(o,'extrudePlanar',topFace(o).id,d);
  assert.ok(Math.abs(volume(o)-(1+d))<1e-9);assert.equal(openEdges(o),0);validateScene(scene(o));}
 const inset=unitCube();editMesh(inset,'insetPlanar',topFace(inset).id,.25);
 assert.ok(Math.abs(volume(inset)-1)<1e-9);assert.equal(openEdges(inset),0);
 const stacked=unitCube();editMesh(stacked,'extrudePlanar',topFace(stacked).id,1);editMesh(stacked,'extrudePlanar',topFace(stacked).id,1);
 assert.ok(Math.abs(volume(stacked)-3)<1e-9);assert.equal(openEdges(stacked),0);
 const o=unitCube();assert.throws(()=>editMesh(o,'extrudePlanar',topFace(o).id,0),/nonzero/);
 assert.throws(()=>editMesh(unitCube(),'insetPlanar',topFace(unitCube()).id,1.5),/fraction/);
 assert.throws(()=>editMesh(unitCube(),'extrudePlanar','missing',1),/planar face/);
});
await test('planar annotations resolve to the face centroid and orphan cleanly',()=>{
 const cube=unitCube(),top=topFace(cube);
 const position=annotationPosition(cube,{scope:'planar',target:top.id});
 assert.ok(Math.abs(position[2]-1)<1e-9);
 assert.equal(annotationPosition(cube,{scope:'planar',target:'gone'}),null);
 cube.annotations=[{id:'cap',scope:'planar',target:top.id,text:'Top',tags:[],visible:true}];validateScene(scene(cube));
});
console.log(`Research: ${checks} checks passed.`);
