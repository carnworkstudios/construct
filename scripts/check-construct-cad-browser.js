// SPDX-License-Identifier: MIT
// playwright-cli -s=construct-cad run-code --filename=tools/schema-editor/scripts/check-construct-cad-browser.js
async page => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const check = (value, message) => { if (!value) throw Error(message); };
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.waitForFunction(() => window.editor && window.GxPathGeo);
  const result = await page.evaluate(async () => {
    const e = window.editor, root = e._contentRoot, NS = e.SVG_NS;
    const rect = (id, x, y=100, width=160, height=120) => { const el=document.createElementNS(NS,'rect'); el.id=id; el.setAttribute('x',x);el.setAttribute('y',y);el.setAttribute('width',width);el.setAttribute('height',height);el.setAttribute('fill','#168ca3');el.setAttribute('stroke','#102c3a');root.append(el);return el; };
    const before = root.querySelectorAll('*').length;
    e.setActiveTool('wire',{silent:true}); e._drawStyle.fill='#ff0000';
    e._wireClick({x:80,y:80});e._wireClick({x:220,y:80});e._wireCommit();
    const wire=e._selection[0];
    if(wire.getAttribute('fill')!=='none') throw Error('Wire accepted a fill.');
    if(document.querySelector('#prop-fill-group')?.style.display!=='none') throw Error('Wire exposed fill controls.');
    e.clearSelection(); const a=rect('cad-a',100),b=rect('cad-b',180);e.selectEl(a);e.selectEl(b,true);
    await e._runPlanarBoolean('union');const union=e._selection[0];
    if(union.tagName.toLowerCase()!=='path'||union.getAttribute('data-closed-profile')!=='true'||!/[zZ]\s*$/.test(union.getAttribute('d')))throw Error('Union did not create a closed profile.');
    if(union.getAttribute('fill')==='none')throw Error('Closed Boolean profile lost its fill.');
    e.clearSelection();const c=rect('cad-c',400),d=rect('cad-d',450,135,60,50);e.selectEl(c);e.selectEl(d,true);await e._runPlanarBoolean('subtract');
    const subtract=e._selection[0];if(subtract.getAttribute('fill-rule')!=='evenodd')throw Error('Subtraction does not preserve hole-capable fill rule.');
    if((subtract.getAttribute('d').match(/[Mm]/g)||[]).length<2)throw Error('Subtraction did not retain its interior profile.');
    return { before, after:root.querySelectorAll('*').length, wireFill:wire.getAttribute('fill'), unionFill:union.getAttribute('fill'), unionD:union.getAttribute('d'), subtractD:subtract.getAttribute('d') };
  });
  check(result.wireFill === 'none', 'Wire fill regression'); check(result.unionFill !== 'none', 'Closed profile fill regression');
  await page.locator('#spatialOpenBtn').click(); await page.locator('#s-viewport canvas').waitFor();
  await page.locator('#s-tab-library').click(); await page.locator('#s-extrude-group').evaluate(el => el.open = true);
  await page.locator('#s-extrude').click();
  await page.waitForFunction(() => document.querySelectorAll('#s-objects button').length === 1);
  await page.locator('#s-plot').evaluate(el => el.closest('details').open = true);
  await page.locator('#s-plot').click(); await page.waitForFunction(() => document.querySelectorAll('#s-objects button').length === 2);
  await page.locator('#s-objects button').nth(1).click();
  check(await page.locator('#r-bake').isVisible(), 'Sampled surface cannot be made editable.');
  await page.locator('#r-bake').click();
  await page.locator('#r-scope').waitFor();
  await page.locator('#r-scope').selectOption({ label: 'vertex' });
  check(await page.locator('#r-move').isVisible(), 'Editable surface has no vertex edit control.');
  check(!errors.length, errors.join('; '));
  await page.screenshot({ path: '.playwright-cli/construct-cad-proof.png' });
  return { passed:true, ...result, objects:await page.locator('#s-objects button').count(), errors };
}
