// SPDX-License-Identifier: MIT
// One bounded heavy task per workspace. Cancellation terminates parsing/WASM work.
export class SpatialJobs {
  constructor(){this.sequence=0;}
  cancel(){if(this.worker){this.worker.terminate();this.worker=null;clearTimeout(this.timer);this.reject?.(Error('Task cancelled.'));this.reject=null;}}
  run(operation,input,transfer=[]){
    this.cancel(); const revision=++this.sequence;
    return new Promise((resolve,reject)=>{
      this.reject=reject;const worker=this.worker=new Worker(new URL('./research.worker.mjs',import.meta.url),{type:'module'});
      const finish=(error,result)=>{if(revision!==this.sequence)return;clearTimeout(this.timer);worker.terminate();this.worker=null;this.reject=null;error?reject(Error(error)):resolve(result);};
      this.timer=setTimeout(()=>finish('Task exceeded the 30 second execution budget.'),30000);
      worker.onmessage=({data})=>finish(data.error,data.result);worker.onerror=e=>finish(e.message||'Worker failed.');worker.postMessage({operation,input},transfer);
    });
  }
}
