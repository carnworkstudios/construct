// SPDX-License-Identifier: MIT
async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,m)=>{if(!v)throw Error(m);};
 await page.setViewportSize({width:1500,height:1000});await page.waitForFunction(()=>window.editor);
 await page.addScriptTag({url:'/assets/schema-editor/chem/research.js'});
 await page.locator('#spatialOpenBtn').click();await page.locator('#s-viewport canvas').waitFor();await page.locator('#s-tab-library').click();
 await page.getByRole('button',{name:'+ Parametric block',exact:true}).click();
 await page.locator('#r-bake').click();await page.locator('#r-scope').selectOption('object');
 await page.locator('#s-viewport canvas').dblclick({position:{x:750,y:400}});await page.waitForFunction(()=>document.querySelector('#r-scope')?.value==='face');
 await page.locator('#r-scope').selectOption('vertex');
 check(!(await page.locator('#r-import').count()),'A second mesh importer is still visible.');
 check(await page.locator('.spatial-shortcuts').innerText().then(t=>t.includes('G move')&&t.includes('Space')),'Direct-manipulation shortcut help is missing.');
 await page.locator('#r-highlight').click();check(await page.locator('#r-highlight').innerText().then(t=>t==='Clear highlight'),'Highlight is not a toggle.');
 await page.locator('#r-highlight').click();check(await page.locator('#r-highlight').innerText().then(t=>t==='Highlight target'),'Highlight cannot be cleared.');
 await page.locator('#r-label').fill('Corner A');await page.locator('#r-tags').fill('reference, model');await page.locator('#r-label-add').click();
 check(await page.locator('#r-label-list').innerText().then(t=>t.includes('Corner A')),'Label not saved');
 await page.locator('#r-edit-value').fill('0.7,0.5,0.5');await page.locator('#r-move').click();
 check(!(await page.locator('#s-status').innerText()).includes('Invalid'),'Vertex edit failed');
 await page.locator('#r-scope').selectOption('face');await page.locator('#r-edit-value').fill('.2');await page.locator('#s-viewport canvas').press('e');
 await page.waitForFunction(()=>document.querySelector('#s-status').textContent.includes('Face extruded.'));
 await page.locator('#s-viewport canvas').press('g');check((await page.locator('#s-status').innerText()).includes('Move active.'),'G did not activate move.');
 await page.locator('#s-undo').click();await page.locator('#s-redo').click();
 await page.locator('#r-feature').evaluate(e=>e.open=true);await page.locator('#r-feature-add').click();
 check(await page.locator('#s-objects button').count()===2,'Parametric feature failed: '+await page.locator('#s-status').innerText());
 await page.locator('#r-feature-edit').evaluate(e=>e.closest('details').open=true);
 const recipe=JSON.parse(await page.locator('#r-feature-edit').inputValue());recipe.parameters.Width=6;await page.locator('#r-feature-edit').fill(JSON.stringify(recipe));await page.locator('#r-feature-apply').click();
 await page.locator('#r-pattern-add').click();check(await page.locator('#s-objects button').count()===3,'Dependent pattern failed');
 await page.locator('#r-plane').evaluate(e=>e.open=true);await page.locator('#r-normal').fill('1,0,0');await page.locator('#r-plane-add').click();
 check(await page.locator('#s-objects button').count()===4,'Vertical plane failed');
 await page.locator('#r-experiment').evaluate(e=>e.open=true);await page.locator('#r-run').click();
 await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===5);
 await page.locator('#s-play').click();await page.waitForFunction(()=>parseFloat(document.querySelector('#s-clock').textContent)>.2);await page.locator('#s-play').click();
 check(await page.locator('#r-results-export').isVisible(),'Experiment results missing');
 const download=page.waitForEvent('download');await page.locator('#r-results-export').click();check((await download).suggestedFilename()==='experiment-results.csv','CSV results missing');
 await page.locator('#r-model-kind').selectOption('kinetics');await page.locator('#r-run').click();await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===6);
 await page.locator('#r-graph').evaluate(e=>e.open=true);await page.locator('#r-graph-add').click();await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===7);
 await page.screenshot({path:'.playwright-cli/construct-research-proof.png'});
 check(!errors.length,errors.join('; '));return{passed:true,objects:7,errors};
}
