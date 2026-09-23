// SPDX-License-Identifier: MIT
// From platform root, serve on localhost, then:
// playwright-cli -s=spatial open http://localhost:5510/tools/schema-editor/
// playwright-cli -s=spatial run-code --filename=tools/schema-editor/scripts/check-spatial-browser.js
async page => {
 const failures = []; const check = (ok, msg) => { if (!ok) failures.push(msg); };
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(page.url().split('/').slice(0,3).join('/') + '/tools/schema-editor/academic/');
 await page.waitForFunction(() => window.editor?.activeMode === 'academic' && window.editor?._domainKits?.academic);
 check(await page.locator('#symbolPalette').innerText().then(t => t.toLowerCase().includes('physics') && t.toLowerCase().includes('chemistry') && t.toLowerCase().includes('math')), 'Academic palette missing');
 check(!(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('three.module')))), 'Three loaded before request');
 await page.locator('#spatialOpenBtn').click(); await page.locator('#s-viewport canvas').waitFor();
 await page.getByRole('button', {name:'+ Equation surface',exact:true}).click();
 await page.waitForFunction(() => /[1-9][0-9,]* triangles/.test(document.getElementById('s-stats').textContent));
 check(await page.locator('#s-objects button').count()===1,'Graph missing');
 await page.locator('#p-equation').fill('sin(x)+cos(y)+t'); await page.locator('#s-properties button[type=submit]').click();
 await page.locator('#s-play').click(); await page.waitForFunction(() => parseFloat(document.getElementById('s-clock').textContent)>.2); await page.locator('#s-play').click();
 const paused=await page.locator('#s-clock').innerText();
 await page.locator('#s-wire').check(); check(await page.locator('#s-clock').innerText()===paused,'Pause advanced clock');
 await page.locator('#p-level').fill('2'); await page.locator('#s-properties button[type=submit]').click(); await page.locator('#s-level').selectOption('2');
 await page.locator('#p-equation').fill('window.alert(1)'); await page.locator('#s-properties button[type=submit]').click();
 check(await page.locator('#s-status').innerText().then(t=>t.includes('Unknown equation')),'Unsafe equation accepted');
 await page.locator('#s-undo').click(); await page.locator('#s-redo').click(); check(await page.locator('#p-equation').inputValue()==='sin(x)+cos(y)+t','Invalid edit polluted history');
 const graphDownload=page.waitForEvent('download'); await page.locator('#s-export-samples').click(); const csv=await graphDownload; check(csv.suggestedFilename()==='equation-samples.csv','Graph CSV missing');
 const downloadPromise=page.waitForEvent('download'); await page.locator('#s-save').click(); const dl=await downloadPromise; const path=await dl.path();
 await page.locator('#s-new').click(); check(await page.locator('#s-objects button').count()===0,'Clear failed');
 await page.locator('#s-file').setInputFiles(path); await page.waitForFunction(()=>document.querySelectorAll('#s-objects button').length===1);
 await page.locator('#s-new').click(); await page.getByRole('button',{name:'+ Water molecule',exact:true}).click();
 check(await page.locator('#s-units').inputValue()==='Å','Molecule unit wrong');
 await page.locator('#s-new').click(); await page.locator('#s-profile-add').click();
 await page.locator('#p-depth').fill('3'); await page.locator('#s-properties button[type=submit]').click();
 check(await page.locator('#p-depth').inputValue()==='3','Extrusion reshape failed');
 const stlDownload=page.waitForEvent('download'); await page.locator('#s-export-stl').click(); check((await stlDownload).suggestedFilename()==='schema-object.stl','STL missing');
 await page.locator('#s-new').click(); await page.locator('#s-draw').click();
 const canvas=await page.locator('#s-viewport canvas').boundingBox();
 for (const [x,y] of [[.4,.4],[.6,.4],[.6,.6]]) await page.mouse.click(canvas.x+canvas.width*x,canvas.y+canvas.height*y);
 await page.locator('#s-finish').click(); check(await page.locator('#s-objects button').count()===1,'Footprint drawing failed');
 await page.locator('#s-new').click();
 await page.locator('#s-file').setInputFiles('tools/schema-editor/scripts/fixtures/spatial-points.csv');
 await page.waitForFunction(()=>document.querySelector('#s-objects').textContent.includes('point cloud'));

 await page.locator('#s-close').click(); check(await page.locator('#spatialWorkspace').count()===0,'Close failed');
 await page.locator('#spatialOpenBtn').click(); await page.locator('#s-viewport canvas').waitFor();
 check(await page.locator('#s-objects button').count()===1,'Reopen lost scene');
 await page.setViewportSize({width:390,height:844});
 check(await page.locator('#s-close').isVisible(),'Mobile close missing');
 check(await page.evaluate(()=>document.getElementById('spatialWorkspace').scrollWidth<=innerWidth),'Mobile horizontal overflow');
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'.playwright-cli/schema-spatial-proof.png'});
 check(errors.length===0,'Browser errors: '+errors.join('; '));
 if (failures.length) throw Error(failures.join('; ')); return {failures,errors,passed:true};
}
