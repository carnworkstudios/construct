// SPDX-License-Identifier: MIT
// Run with playwright-cli run-code from a browser open on the local platform server.
async page => {
 await page.goto(page.url().split('/').slice(0,3).join('/') + '/tools/schema-editor/');
 await page.waitForFunction(()=>window.editor?._domainKits);
 if (await page.locator('#s-close').count()) await page.locator('#s-close').click();
 await page.evaluate(() => {
  const svg=document.getElementById('svgDisplay'); if(!svg) throw Error('No canvas');
  const g=document.createElementNS('http://www.w3.org/2000/svg','g'); g.setAttribute('transform','translate(20 30) rotate(30)');
  const r=document.createElementNS('http://www.w3.org/2000/svg','rect'); r.setAttribute('width','100');r.setAttribute('height','50');r.id='spatial-test-profile';g.append(r);svg.append(g);window.editor._selection=[r];
 });
 await page.locator('#spatialOpenBtn').click(); await page.locator('#s-viewport canvas').waitFor();
 await page.locator('#s-new').click();await page.locator('#s-extrude').click();
 if(await page.locator('#s-objects button').count()!==1) throw Error(await page.locator('#s-status').innerText());
 await page.locator('#s-close').click();
 return await page.evaluate(async () => {
  const {SpatialViewport}=await import('/tools/schema-editor/src/js/spatial/viewport.mjs');
  const {object,blankScene}=await import('/tools/schema-editor/src/js/spatial/model.mjs');
  const host=document.createElement('div');host.style='position:fixed;inset:0;width:600px;height:500px;z-index:100000';document.body.append(host);
  let frames=0;const errors=[];
  const view=new SpatialViewport(host,{select(){},transform(){},tick(){frames++},error:e=>errors.push(e)});
  const atoms=Array.from({length:10000},(_,i)=>({element:'C',position:[(i%100)/5,Math.floor(i/100)/5,0]}));
  const molecule=object('molecule','Budget molecule',{atoms,bonds:[]});const start=performance.now();
  view.sync({...blankScene(),units:'Å',objects:[molecule]});view.fit();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const calls=view.renderer.info.render.calls, geometryCount=view.renderer.info.memory.geometries, createdMs=performance.now()-start;
  await new Promise(r=>setTimeout(r,200)); const before=frames;await new Promise(r=>setTimeout(r,150));const idleFrames=frames-before;
  if(calls>25||idleFrames!==0) throw Error('Unexpected rendering budget: '+calls+' calls, '+idleFrames+' idle frames');
  view.sync(blankScene());await new Promise(r=>requestAnimationFrame(r));const remaining=view.renderer.info.memory.geometries;
  if(remaining>=geometryCount) throw Error('Geometry resources were not released');
  view.dispose();host.remove(); if(errors.length) throw Error(errors.join(';'));
  return {selected2DExtrusion:true,atoms:atoms.length,calls,geometryCount,remainingAfterClear:remaining,idleFrames,creationAndFirstFrameMs:Math.round(createdMs)};
 });
}
