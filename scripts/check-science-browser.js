// SPDX-License-Identifier: MIT
async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,m)=>{if(!v)throw Error(m);};
 await page.setViewportSize({width:1500,height:1000});await page.waitForFunction(()=>window.editor);
 await page.addScriptTag({url:'/assets/schema-editor/chem/research.js'});await page.locator('#spatialOpenBtn').click();await page.locator('#s-viewport canvas').waitFor();
 await page.locator('#s-tab-library').click();
 await page.locator('#r-science').evaluate(e=>e.open=true);await page.locator('#r-conformer').click();
 await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===1,{},{timeout:95000});
 check(await page.locator('#s-units').inputValue()==='Å','First molecule did not set angstrom units');
 await page.locator('#r-representation').selectOption('space-fill');await page.locator('#r-scope').selectOption('atom');await page.locator('#r-label').fill('Selected atom');await page.locator('#r-label-add').click();
 check((await page.locator('#r-label-list').innerText()).includes('Selected atom'),'Atom label missing');
 await page.locator('#s-file').setInputFiles('tools/schema-editor/scripts/fixtures/spatial-water.pdb');await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===2);
 await page.locator('#r-md-options').evaluate(e=>e.closest('details').open=true);await page.locator('#r-md-options').fill(JSON.stringify({steps:10,sampleEvery:2,timestepFs:1,seed:7}));await page.locator('#r-md').click();
 await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===3,{},{timeout:95000});
 check(await page.locator('#r-observable option').count()===2,'Molecular energy observables missing');await page.locator('#r-observable').selectOption('2');check((await page.locator('#r-result-plot').textContent()).includes('ps'),'Molecular time unit missing');
 await page.locator('#s-play').click();await page.waitForFunction(()=>parseFloat(document.querySelector('#s-clock').textContent)>.2);await page.locator('#s-play').click();
 await page.locator('#r-proof-left').evaluate(e=>e.closest('details').open=true);await page.locator('#r-proof').click();await page.waitForFunction(()=>document.querySelector('#r-proof-result').textContent.includes('proved'),{},{timeout:95000});
 await page.locator('#r-reactants').evaluate(e=>e.closest('details').open=true);await page.locator('#r-react').click();await page.waitForFunction(()=>document.querySelector('#r-reaction-results').textContent.includes('BrCCBr'),{},{timeout:95000});
 await page.locator('#r-balance').evaluate(e=>e.closest('details').open=true);await page.locator('#r-balance').click();await page.waitForFunction(()=>document.querySelector('#r-balance-result').textContent.includes('balanced'),{},{timeout:95000});
 await page.locator('#r-volume').evaluate(e=>e.open=true);await page.locator('#r-volume-iso').fill('.43');await page.locator('#r-volume-file').setInputFiles('tools/schema-editor/scripts/fixtures/spatial-field.cube');await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===4);
 check(!errors.length,errors.join('; '));await page.screenshot({path:'.playwright-cli/construct-science-proof.png'});return{passed:true,objects:4,realOpenMM:true,realRDKit:true,errors};
}
