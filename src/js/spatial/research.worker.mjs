// SPDX-License-Identifier: MIT
self.onmessage=async({data})=>{
  try {
    let result;
    if(data.operation==='import'){ const {importMesh}=await import('./mesh-import.mjs');result=await importMesh(data.input.buffer,data.input.name,data.input.scale); }
    else if(data.operation==='boolean'){const {booleanMesh}=await import('./booleans.mjs');result=await booleanMesh(data.input);}
    else if(data.operation==='planar-boolean'){const {planarBoolean}=await import('./booleans.mjs');result=await planarBoolean(data.input);}
    else if(data.operation==='volume'){const {cubeSurface}=await import('./volume.mjs');result=cubeSurface(data.input);}
    else if(data.operation==='graph'){const {graphMesh}=await import('./graphs.mjs');result=graphMesh(data.input);}
    else if(data.operation==='experiment'){ const {runExperiment}=await import('./experiments.mjs');result=runExperiment(data.input); }
    else throw Error('Unknown worker operation.');
    self.postMessage({result});
  }catch(e){self.postMessage({error:e.message});}
};
