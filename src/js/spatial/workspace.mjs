// SPDX-License-Identifier: MIT
import { SceneStore, blankScene, object, uid, validateScene, parsePDB, parseSpatialCSV, transformVector, LIMITS } from './model.mjs';
import { spatialCatalog } from './registry.mjs';
import { SpatialViewport } from './viewport.mjs';
import { researchUI } from './research-ui.mjs';
import { pathTopology } from './path-solids.mjs';
import { selectedProfiles, selectedPaths } from './profiles.mjs';
import { SpatialJobs } from './jobs.mjs';
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const numeric = (id, label, value, step = 'any') => `<label>${label}<input id="${id}" type="number" value="${value}" step="${step}" required></label>`;
const download = (text, name, type = 'application/json') => { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
let session;
export async function openWorkspace(editor, mode = editor?.activeMode || 'general') {
  if (document.getElementById('spatialWorkspace')) return;
  const root = document.createElement('dialog'); root.id = 'spatialWorkspace'; root.className = 'spatial-workspace'; root.setAttribute('aria-label', '3D and research workspace');
  root.innerHTML = `<header class="spatial-header"><div><strong>Construct / 3D</strong><span>Model, explore, simulate</span></div><label>Mode<select id="s-mode">${['general', 'electrical', 'construction', 'software', 'academic'].map(m => `<option value="${m}">${m === 'academic' ? 'Research / Academic' : m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select></label><button id="s-undo">Undo</button><button id="s-redo">Redo</button><button id="s-save">Save project</button><button id="s-load">Open file</button><input type="file" id="s-file" accept=".json,.g3d,.pdb,.ent,.csv,.stl,.obj,.glb" hidden><button id="s-close" aria-label="Return to 2D editor">Back to 2D</button></header>
    <div class="spatial-layout"><aside class="spatial-library" id="s-library"><button type="button" class="spatial-pin" data-pin="library" title="Keep this panel open" aria-pressed="false"><iconify-icon icon="material-symbols:keep-outline"></iconify-icon></button><h2>1 · Add an object</h2><label id="s-subject-label">Subject<select id="s-subject"><option value="all">All subjects</option><option value="physics">Physics</option><option value="chemistry">Chemistry</option><option value="math">Math</option></select></label><label>Find an object<input id="s-search" type="search" placeholder="Wall, vector, molecule…"></label><div id="s-catalog"></div>
    <details id="s-extrude-group"><summary>Solidify closed 2D geometry</summary><p id="s-selection-state">Closed 2D geometry becomes a solid; open geometry becomes a swept path below. Both stay aligned to the 2D underlay.</p>${numeric('s-depth', 'Depth / height', 2)}${numeric('s-unit-scale', 'World units per 2D drawing unit', .01)}<button id="s-extrude">Solidify selected closed geometry</button><button id="s-draw">Draw footprint</button><button id="s-finish" hidden>Close and solidify</button><button id="s-cancel-draw" hidden>Cancel footprint</button><label>Or enter x,y pairs<textarea id="s-profile" rows="2">0,0 4,0 4,3 0,3</textarea></label><button id="s-profile-add">Solidify coordinates</button></details>
    <details id="s-route-group"><summary>Solidify open 2D geometry</summary><p>Select a line, polyline, wire or single open path in 2D. Curves are sampled into a route. Choose a rectangular sweep for walls, traces and bars, or a hollow circular sweep for pipes and conduits. This is the open-geometry counterpart of closed-profile solidification.</p><label>Sweep<select id="s-route-kind"><option value="wall">Rectangular solid</option><option value="conduit">Hollow circular solid</option></select></label><div id="s-wall-fields">${numeric('s-wall-width', 'Sweep width', .15)}${numeric('s-wall-height', 'Sweep height', 2.8)}<label>Alignment (along path direction)<select id="s-wall-align"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select></label></div><div id="s-conduit-fields" hidden>${numeric('s-conduit-diameter', 'Outer diameter', .05)}${numeric('s-conduit-thickness', 'Conduit wall thickness', .005)}</div>${numeric('s-route-elevation', 'Base elevation / conduit center elevation', 0)}<button id="s-route-add">Solidify selected open geometry</button></details>
    <details id="s-smiles-group" hidden><summary>Build from SMILES</summary><p>Type a SMILES string to generate a 3D structure, e.g. <code>CCO</code> or <code>c1ccccc1</code>.</p><label>SMILES<input id="s-smiles" placeholder="CC(=O)Oc1ccccc1C(=O)O" spellcheck="false"></label><button id="s-smiles-add">Build structure</button><p id="s-smiles-note">Geometry is a structural sketch from idealised bond lengths and angles — good for viewing, not for measuring.</p></details>
    <details><summary>Plot an equation</summary><label>z = f(x,y,t)<input id="s-equation" value="sin(sqrt(x^2+y^2)-t)" spellcheck="false"></label><div class="spatial-pair">${numeric('s-min', 'Minimum x,y', -5)}${numeric('s-max', 'Maximum x,y', 5)}</div>${numeric('s-resolution', 'Samples per axis (8–128)', 64, '1')}<button id="s-plot">Add graph</button><p>Use *, /, ^, pi, sin, cos, sqrt, exp, log, abs, min and max. Non-real samples are omitted.</p></details>
    <h2>2 · Scene</h2><p id="s-empty-hint">Nothing here yet. Pick an object above, or use <em>Open file</em> for a project, PDB, CSV, STL, OBJ, or GLB.</p><div id="s-objects" role="list" aria-label="Scene objects"></div><details id="s-scene-settings"><summary>Scene settings</summary><label>Units<select id="s-units"><option>m</option><option>mm</option><option>Å</option><option>unit</option></select></label><p>Changing units changes the label; coordinates are not converted.</p><button id="s-new">New empty scene</button><label>Scene units per mesh-file unit<input id="s-mesh-scale" type="number" value="1" step="any" min="0.000001" required></label><p>Applied by the single Open file control to STL, OBJ, and GLB. STL files carry no units.</p></details></aside>
    <main class="spatial-stage"><nav class="spatial-viewbar" aria-label="3D view controls"><button data-camera="perspective">Fit</button><button data-camera="top">Top</button><button data-camera="front">Front</button><button data-camera="side">Side</button><label><input id="s-wire" type="checkbox"> Wireframe</label><label title="Show the 2D drawing on the ground plane"><input id="s-underlay" type="checkbox"> 2D underlay</label><button id="s-underlay-refresh" hidden title="Re-read the 2D canvas">Refresh 2D</button><label>Level<select id="s-level"><option value="all">All levels</option></select></label></nav><div id="s-viewport"></div><div class="spatial-axis-key">X <span>red</span> / Y <span>green</span> / Z <span>blue · up</span></div><div class="spatial-shortcuts">G move · R rotate · S scale · E extrude selected face · H isolate · Alt+H show all · hold Space + drag to pan · double-click a mesh face</div><div class="spatial-timeline" id="s-timeline" hidden><button id="s-play">Play</button><button id="s-reset-time">Reset</button><label>Time (s)<input id="s-time" type="number" min="0" max="3600" step="0.1" value="0"></label><output id="s-clock">0.00 s</output><span id="s-stats"></span></div></main>
    <aside class="spatial-inspector" id="s-inspector"><button type="button" class="spatial-pin" data-pin="inspector" title="Keep this panel open" aria-pressed="false"><iconify-icon icon="material-symbols:keep-outline"></iconify-icon></button><h2>3 · Edit</h2><div class="spatial-transform" id="s-transform-group" hidden><button data-transform="translate">Move</button><button data-transform="rotate">Rotate</button><button data-transform="scale">Scale</button></div><form id="s-properties"><p>Select an object in the scene or viewport.</p></form><details id="s-export-group" hidden><summary>Export &amp; send</summary><label class="spatial-export">Mesh<select id="s-export-format"><option value="stl">STL — 3D printing, CAD</option><option value="obj">OBJ — modelling, rendering</option></select></label><button id="s-export-stl">Export selected</button><button id="s-export-scene">Export whole scene</button><button id="s-export-samples">Export graph samples</button><button id="s-send-samples">Send graph to Table IDE</button><p id="s-send-help">Cross-tool transfer requires the Ginexys Pro shell.</p></details><details><summary>About this mode</summary><p id="s-mode-help"></p><p class="spatial-help">Drag to orbit. Right-drag to pan. Scroll or pinch to zoom. Camera views keep perspective. Graphs use Z as height.</p></details></aside><button type="button" class="spatial-drawer-tab" data-drawer="library" id="s-tab-library" aria-expanded="false" aria-controls="s-library" title="Objects and tools"><iconify-icon icon="material-symbols:category-outline"></iconify-icon>Objects</button>
    <button type="button" class="spatial-drawer-tab" data-drawer="inspector" id="s-tab-inspector" aria-expanded="false" aria-controls="s-inspector" title="Properties and export"><iconify-icon icon="material-symbols:tune"></iconify-icon>Properties</button>
    </div><footer id="s-status" role="status" aria-live="polite">Add an object or extrude a selected 2D profile to begin.</footer>`;
  document.body.append(root); root.showModal();
  const $ = id => root.querySelector('#' + id), num = id => { const v = $(id).value.trim(); if (!v || !Number.isFinite(Number(v))) throw Error('Enter a finite number for every numeric field.'); return Number(v); };
  const status = (message, error = false) => { $('s-status').textContent = message; $('s-status').classList.toggle('error', error); };
  const store = new SceneStore(session || { ...blankScene(), mode }); let selected = null, viewport, advanced, points = [], drawing = false;
  const jobs = new SpatialJobs();
  // Assigned once the drawers exist; select() may run before that.
  let revealInspector = () => {};
  const run = fn => async e => { try { await fn(e); } catch (error) { status(error.message, true); } };
  const current = () => store.scene.objects.find(o => o.id === selected);
  const stop = () => { viewport.setPlaying(false); $('s-play').textContent = 'Play'; };
  const commit = edit => { stop(); store.commit(edit); session = store.scene; render(); };
  const add = o => { commit(s => s.objects.push(o)); select(o.id); status(`Added ${o.name}. Save scene to keep a portable copy.`); };
  try {
    viewport = new SpatialViewport($('s-viewport'), {
      error: message => status(message, true), select: (id, component, componentScope) => { if (selected !== id) select(id); advanced?.pick(component, componentScope); },
      transform: (id, values) => { try { commit(s => Object.assign(s.objects.find(o => o.id === id), values)); } catch (e) { status(e.message, true); viewport.sync(store.scene); viewport.select(selected); } },
      tick: (time, info) => { $('s-clock').textContent = time.toFixed(2) + ' s'; $('s-stats').textContent = `${info.render.calls} draws / ${info.render.triangles.toLocaleString()} triangles`; },
    });
  } catch (e) { root.remove(); throw Error(`3D could not start: ${e.message}. The 2D editor is still available.`); }
  function select(id) { selected = id; viewport.select(id); properties(); list(); $('s-transform-group').hidden = !id; if (id) revealInspector(); }
  function list() {
    $('s-objects').replaceChildren();
    for (const o of store.scene.objects) {
      const button = document.createElement('button'); button.textContent = `${o.visible ? '◉' : '○'} ${o.name}`; button.setAttribute('aria-pressed', o.id === selected); button.onclick = () => select(o.id); $('s-objects').append(button);
    }
  }
  function catalog() {
    const mode = $('s-mode').value, subject = $('s-subject').value, search = $('s-search').value.toLowerCase();
    $('s-subject-label').hidden = mode !== 'academic'; $('s-catalog').replaceChildren();
    for (const entry of spatialCatalog(editor).filter(c => c.modes.includes(mode) && (mode !== 'academic' || subject === 'all' || c.subject === subject || (!c.subject && subject === 'math')) && c.name.toLowerCase().includes(search))) {
      const b = document.createElement('button'); b.textContent = '+ ' + entry.name; b.onclick = run(() => {
        const item = entry.make();
        if (item.kind === 'molecule') {
          commit(s => { if (s.objects.length && s.units !== 'Å') throw Error('Molecule coordinates use Å. Start an empty scene or set units to Å before adding.'); s.units = 'Å'; s.objects.push(item); }); select(item.id);
        } else add(item);
      }); $('s-catalog').append(b);
    }
    $('s-mode-help').textContent = {
      general: '2D closed profiles solidify by extrusion; 2D open paths solidify by a rectangular or circular sweep. Dimensions use the scene units.',
      electrical: 'Model PCB substrates, enclosures and cut profiles. Geometry preview only: no routing, Gerber generation or CNC toolpaths.',
      construction: 'Extrude supplied plans with explicit heights. Assign levels to objects and isolate each level. Structural relationships are not inferred.',
      software: 'Explore spatial data as surfaces and wire meshes. Import XYZ CSV points, a scene JSON with indexed triangles, or plot an equation.',
      academic: 'Physics: vectors, matrix transforms and equal-mass elastic collisions. Chemistry: illustrative molecules, p-orbital lobes and PDB coordinates. Math: time-dependent surfaces. These are demonstrations, not a chemistry or engineering solver.',
    }[mode];
  }
  function properties() {
    const o = current(), form = $('s-properties');
    $('s-transform-group').hidden = !o;
    if (!o) { form.innerHTML = store.scene.objects.length ? '<p>Select an object in the scene or viewport.</p>' : '<p>Add an object first — step 1 on the left.</p>'; return; }
    form.innerHTML = `<label>Name<input id="p-name" value="${escape(o.name)}" maxlength="120"></label><label>Color<input id="p-color" type="color" value="${o.color}"></label><label><input id="p-visible" type="checkbox" ${o.visible ? 'checked' : ''}> Visible</label>${numeric('p-level', 'Level', o.level, '1')}${['position', 'rotation', 'scale'].map(key => `<fieldset><legend>${key === 'rotation' ? 'Rotation (degrees)' : key[0].toUpperCase() + key.slice(1)}</legend><div class="spatial-triple">${o[key].map((n, i) => numeric(`p-${key}-${i}`, 'XYZ'[i], Number((key === 'rotation' ? n * 180 / Math.PI : n).toFixed(5)))).join('')}</div></fieldset>`).join('')}
      ${o.kind === 'extrusion' ? numeric('p-depth', 'Depth / height', o.depth) + `<label>Profile x,y pairs<textarea id="p-points" rows="3">${escape(o.points.map(p => p.join(',')).join(' '))}</textarea></label>` : ''}
      ${['wall', 'conduit'].includes(o.kind) ? `<p>Path dimensions (${escape(store.scene.units)}). Edit existing vertices in order; IDs survive coordinate changes.</p><label>Local x,y path points (conduit: optional z)<textarea id="p-path" rows="3">${escape(o.path.map(p => p.join(',')).join(' '))}</textarea></label>${o.kind === 'wall' ? numeric('p-thickness', 'Wall thickness', o.thickness) + numeric('p-height', 'Wall height', o.height) + `<label>Alignment<select id="p-alignment">${['center', 'left', 'right'].map(a => `<option ${a === o.alignment ? 'selected' : ''}>${a}</option>`).join('')}</select></label>` : numeric('p-diameter', 'Outer diameter', o.diameter) + numeric('p-wall-thickness', 'Conduit wall thickness', o.wallThickness) + numeric('p-bend-radius', 'Bend radius (0 for angular joints)', o.bendRadius || 0)}<p>${o.topology.vertices.length} persistent vertices / ${o.topology.edges.length} segments. Mitered joints.</p>${o.source?.elementId ? `<button type="button" id="p-refresh-source">Refresh path from 2D source</button><p>Explicit refresh replaces local path edits and XY placement; dimensions and elevation stay. The vertex count must match.</p>` : ''}` : ''}
      ${o.kind === 'surface' ? `<label>z = f(x,y,t)<input id="p-equation" value="${escape(o.equation)}"></label>${numeric('p-min', 'Range minimum', o.min)}${numeric('p-max', 'Range maximum', o.max)}${numeric('p-resolution', 'Resolution', o.resolution, '1')}` : ''}
      ${o.kind === 'vector' ? `<fieldset><legend>Vector components</legend>${o.vector.map((v, i) => numeric('p-vector-' + i, 'XYZ'[i], v)).join('')}</fieldset><label>3 × 3 matrix, row-major<input id="p-matrix" value="1,0,0,0,1,0,0,0,1"></label><button type="button" id="p-transform-vector">Apply matrix to vector</button>` : ''}
      <details><summary>Equation animation</summary><p>Add an offset to the base position or rotation. Rotation offsets are in radians.</p><label>Axis<select id="p-axis">${['x', 'y', 'z', 'rx', 'ry', 'rz'].map(a => `<option ${o.animation?.axis === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label><label>Offset f(x,y,z,t)<input id="p-animation" value="${escape(o.animation?.equation || '')}" placeholder="sin(t)"></label></details><button type="submit">Apply changes</button><div class="spatial-pair"><button type="button" id="p-copy">Duplicate</button><button type="button" id="p-delete">Delete</button></div>`;
    form.onsubmit = run(e => { e.preventDefault(); commit(s => { const item = s.objects.find(v => v.id === selected); item.name = $('p-name').value; item.color = $('p-color').value; item.visible = $('p-visible').checked; item.level = num('p-level');
      for (const key of ['position', 'rotation', 'scale']) item[key] = [0, 1, 2].map(i => num(`p-${key}-${i}`) * (key === 'rotation' ? Math.PI / 180 : 1));
      if (o.kind === 'extrusion') { item.depth = num('p-depth'); item.points = $('p-points').value.trim().split(/\s+/).map(p => p.split(',').map(Number)); }
      if (['wall', 'conduit'].includes(o.kind)) {
        const path = $('p-path').value.trim().split(/\s+/).map(p => p.split(',').map(Number));
        if (path.length !== item.path.length) throw Error('Keep the existing vertex count to preserve component references. Create a new route for a different topology.');
        item.path = path;
        if (o.kind === 'wall') Object.assign(item, { thickness: num('p-thickness'), height: num('p-height'), alignment: $('p-alignment').value });
        else Object.assign(item, { diameter: num('p-diameter'), wallThickness: num('p-wall-thickness'), bendRadius: num('p-bend-radius') });
      }
      if (o.kind === 'surface') Object.assign(item, { equation: $('p-equation').value, min: num('p-min'), max: num('p-max'), resolution: num('p-resolution') });
      if (o.kind === 'vector') item.vector = [0, 1, 2].map(i => num('p-vector-' + i));
      if ($('p-animation').value.trim()) item.animation = { axis: $('p-axis').value, equation: $('p-animation').value.trim() }; else delete item.animation;
    }); status('Object updated.'); });
    if ($('p-refresh-source')) $('p-refresh-source').onclick = run(() => {
      const svg = editor?.$svgDisplay?.[0] || document.getElementById('svgDisplay');
      const el = svg?.querySelector(`[id="${CSS.escape(o.source.elementId)}"]`);
      if (!el) throw Error('The original 2D element is unavailable. The saved path remains editable.');
      const fresh = selectedPaths(editor, o.source.unitScale, store.scene.units, [el])[0];
      if (fresh.path.length !== o.path.length) throw Error('Source topology changed. Create a new route to avoid reassigning component identities.');
      commit(s => { const item = s.objects.find(v => v.id === o.id); item.path = fresh.path; item.source = fresh.source; item.position = [fresh.position[0], fresh.position[1], item.position[2]]; });
      status('Source path refreshed; dimensions, elevation and component IDs preserved.');
    });
    $('p-copy').onclick = run(() => { const copy = structuredClone(o); copy.id = uid(); for(const a of copy.annotations||[])if(a.scope==='object'&&a.target===o.id)a.target=copy.id; copy.name = o.name.slice(0, 114) + ' copy'; copy.position[0] += 1; add(copy); });
    $('p-delete').onclick = run(() => { commit(s => { s.objects = s.objects.filter(v => v.id !== selected); }); select(null); });
    advanced?.properties(o);
    if ($('p-transform-vector')) $('p-transform-vector').onclick = run(() => { const result = transformVector([0, 1, 2].map(i => num('p-vector-' + i)), $('p-matrix').value.split(/[\s,]+/).map(Number)); commit(s => { s.objects.find(v => v.id === selected).vector = result; }); });
  }
  function render() {
    if (!current()) selected = null;
    $('s-mode').value = store.scene.mode; $('s-units').value = store.scene.units;
    const oldLevel = $('s-level').value, levels = [...new Set(store.scene.objects.map(o => o.level))].sort((a, b) => a - b);
    $('s-level').innerHTML = '<option value="all">All levels</option>' + levels.map(n => `<option value="${n}">Level ${n}</option>`).join(''); $('s-level').value = levels.includes(Number(oldLevel)) && oldLevel !== 'all' ? oldLevel : 'all';
    viewport.setLevel($('s-level').value); viewport.sync(store.scene); viewport.select(selected);
    $('s-undo').disabled = !store.undoStack.length; $('s-redo').disabled = !store.redoStack.length; list(); catalog(); properties();
    // Reveal controls only once they can do something: an empty scene has nothing to
    // move, export or animate, and showing those anyway is most of the clutter.
    const objects = store.scene.objects;
    $('s-empty-hint').hidden = objects.length > 0;
    $('s-export-group').hidden = !objects.length;
    $('s-timeline').hidden = !objects.some(o => o.animation || o.trajectory || ['surface', 'collision', 'experiment'].includes(o.kind));
    if ($('s-timeline').hidden && viewport.playing) stop();
  }
  $('s-mode').onchange = run(() => commit(s => { s.mode = $('s-mode').value; }));
  $('s-units').onchange = run(() => { try { commit(s => { s.units = $('s-units').value; }); } finally { $('s-units').value = store.scene.units; } });
  $('s-subject').onchange = catalog; $('s-search').oninput = catalog;
  $('s-extrude').onclick = run(() => { const profiles = selectedProfiles(editor, num('s-unit-scale')); commit(s => profiles.forEach(p => s.objects.push(object('extrusion', p.name.slice(0, 120), { ...p, depth: num('s-depth') })))); viewport.fit(); status(`Solidified ${profiles.length} closed 2D profile(s).`); });
  $('s-route-kind').onchange = () => { const wall = $('s-route-kind').value === 'wall'; $('s-wall-fields').hidden = !wall; $('s-conduit-fields').hidden = wall; };
  $('s-route-add').onclick = run(() => {
    const kind = $('s-route-kind').value;
    const routes = selectedPaths(editor, num('s-unit-scale'), store.scene.units);
    const added = routes.map(route => object(kind, `${route.name} ${kind}`, { ...route, name: `${route.name} ${kind}`,
      position: [route.position[0], route.position[1], num('s-route-elevation')], topology: pathTopology(route.path),
      ...(kind === 'wall' ? { thickness: num('s-wall-width'), height: num('s-wall-height'), alignment: $('s-wall-align').value } : { diameter: num('s-conduit-diameter'), wallThickness: num('s-conduit-thickness') }) }));
    commit(s => s.objects.push(...added)); select(added[0].id); viewport.fit(); status(`Solidified ${added.length} open 2D route(s) as ${kind === 'wall' ? 'rectangular' : 'hollow circular'} geometry. Save project to preserve paths and calibration.`);
  });
  $('s-profile-add').onclick = run(() => { const profile = $('s-profile').value.trim().split(/\s+/).map(p => p.split(',').map(Number)); add(object('extrusion', 'Coordinate profile', { points: profile, depth: num('s-depth') })); });
  // SMILES -> structure is core intelligence: it infers connectivity and geometry
  // from a string that contains no coordinates. The forked standalone tool has no
  // window.GxChem, so the whole control stays hidden rather than failing on click.
  if (window.GxChem) {
    $('s-smiles-group').hidden = false;
    const buildSmiles = run(() => {
      const molecule = window.GxChem.fromSmiles($('s-smiles').value);
      if (molecule.atoms.length > LIMITS.atoms) throw Error('That structure exceeds the atom budget.');
      commit(s => {
        if (s.objects.length && s.units !== 'Å') throw Error('Molecules use Å. Start an empty scene or set units to Å first.');
        s.units = 'Å'; s.objects.push(object('molecule', `${molecule.formula} (from SMILES)`, { ...molecule, name: `${molecule.formula} (from SMILES)` }));
      });
      select(store.scene.objects[store.scene.objects.length - 1].id); viewport.fit();
      status(`Built ${molecule.formula}: ${molecule.atoms.length} atoms, ${molecule.bonds.length} bonds. Geometry is an idealised sketch, not a minimised conformer.`);
    });
    $('s-smiles-add').onclick = buildSmiles;
    $('s-smiles').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); buildSmiles(e); } };
  }
  $('s-plot').onclick = run(() => { add(object('surface', 'Equation graph', { equation: $('s-equation').value, min: num('s-min'), max: num('s-max'), resolution: num('s-resolution') })); viewport.fit(); });
  $('s-undo').onclick = () => { stop(); store.undo(); session = store.scene; render(); };
  $('s-redo').onclick = () => { stop(); store.redo(); session = store.scene; render(); };
  $('s-new').onclick = run(() => { commit(s => { s.objects = []; }); status('Empty scene. Undo restores the previous scene.'); });
  $('s-wire').onchange = () => viewport.setWireframe($('s-wire').checked);
  // The 2D canvas on the ground plane. Same plane, same origin, same unit scale
  // the extrusion already uses -- so a wrong scale becomes VISIBLE (the solid is
  // the wrong size next to its own source) instead of being typed blind.
  const underlay = async () => {
    if (!$('s-underlay').checked) { viewport.clearUnderlay(); $('s-underlay-refresh').hidden = true; status('2D underlay hidden.'); return; }
    try {
      const shot = await viewport.setUnderlay(editor, num('s-unit-scale'));
      $('s-underlay-refresh').hidden = false;
      status(`2D drawing shown on the ground plane at z=0: ${shot.box.w} \u00d7 ${shot.box.h} drawing units, ${shot.width.toFixed(2)} \u00d7 ${shot.height.toFixed(2)} ${store.scene.units}. Use Top for a plan view. It is a reference only \u2014 not selectable, not exported, not saved.`);
    } catch (e) { $('s-underlay').checked = false; $('s-underlay-refresh').hidden = true; throw e; }
  };
  $('s-underlay').onchange = run(underlay);
  // The underlay is a snapshot, not a live link: 2D edits do not propagate.
  $('s-underlay-refresh').onclick = run(underlay);
  // Changing the scale moves the extrusion; the reference must move with it.
  $('s-unit-scale').onchange = run(() => { if ($('s-underlay').checked) return underlay(); });
  $('s-level').onchange = () => { viewport.setLevel($('s-level').value); viewport.select(selected); };
  root.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => viewport.fit(b.dataset.camera));
  root.querySelectorAll('[data-transform]').forEach(b => b.onclick = () => { stop(); viewport.transform.setMode(b.dataset.transform); viewport.select(selected); });
  $('s-play').onclick = () => { if (drawing) return; viewport.setPlaying(!viewport.playing); $('s-play').textContent = viewport.playing ? 'Pause' : 'Play'; if (!viewport.playing) viewport.select(selected); };
  $('s-time').onchange = run(() => { stop(); viewport.setTime(num('s-time')); });
  $('s-reset-time').onclick = () => { stop(); viewport.setTime(0); viewport.sync(store.scene); viewport.select(selected); $('s-time').value = '0'; };
  $('s-save').onclick = () => { download(JSON.stringify(store.scene, null, 2), 'construct-scene.json'); status('Project saved as JSON — recipes, equations and coordinates, re-openable here. For other software use Export mesh (STL/OBJ).'); };
  // Mesh import runs in the bounded research worker: three.js loaders parse
  // untrusted geometry, and a 30-second budget plus terminate-on-cancel keeps a
  // malformed file from locking the UI thread. The buffer is TRANSFERRED, not
  // copied, so a 16 MB import does not double in memory.
  const importGeometry = async (file) => {
    const scale = num('s-mesh-scale');
    status(`Importing ${file.name}…`);
    const buffer = await file.arrayBuffer();
    const parts = await jobs.run('import', { buffer, name: file.name, scale }, [buffer]);
    // A scene at its 4 MB budget rejects the NEXT import with a message about
    // the budget, which reads as a problem with the file just chosen. Name the
    // scene as the cause while the file is still in hand.
    const existing = JSON.stringify(store.scene).length, adding = JSON.stringify(parts).length;
    if (existing + adding > LIMITS.bytes) throw Error(
      `${file.name} needs ${(adding / 1048576).toFixed(1)} MB but the scene already holds ${(existing / 1048576).toFixed(1)} MB of its 4 MB budget. `
      + `Save and start a new scene, or delete objects before importing.`);
    commit(s => {
      if (s.objects.length + parts.length > LIMITS.objects) throw Error(`Import adds ${parts.length} objects; the scene limit is ${LIMITS.objects}.`);
      // sourceVertices is an import REPORT, not scene data -- it would otherwise
      // persist into every saved project as a number nothing reads back.
      for (const { sourceVertices, degenerate, name, ...geometry } of parts) s.objects.push(object('mesh', name, geometry));
    });
    viewport.fit();
    // Supplied part names and transforms are kept; nothing is recentred and no
    // welding or repair happens, so what loads is what the file declared.
    // Loaders de-index geometry, so the shared vertices the file declared are
    // restored on the way in. Saying "nothing was welded" would be untrue, and
    // the count is the number someone checks a budget against.
    const kept = parts.reduce((n, p) => n + p.vertices.length, 0);
    const loaded = parts.reduce((n, p) => n + (p.sourceVertices || p.vertices.length), 0);
    const dropped = parts.reduce((n, p) => n + (p.degenerate || 0), 0);
    status(`Imported ${parts.length} part${parts.length > 1 ? 's' : ''} from ${file.name} at ${scale} scene unit${scale === 1 ? '' : 's'} per file unit: `
      + `${kept.toLocaleString()} vertices, ${parts.reduce((n, p) => n + p.triangles.length, 0).toLocaleString()} triangles. `
      + (loaded > kept ? `Shared vertices were restored (${loaded.toLocaleString()} unshared as loaded); n-gons are triangulated. ` : '')
      + (dropped ? `${dropped} zero-area face${dropped > 1 ? 's were' : ' was'} dropped. ` : '')
      + `Parts keep their own names and positions — nothing was recentred or repaired. `
      + `${file.name.toLowerCase().endsWith('.stl') ? 'STL carries no units or part names.' : 'Check the scale against a known dimension.'}`);
  };
  $('s-load').onclick = () => $('s-file').click();
  $('s-file').onchange = run(async () => { const file = $('s-file').files[0]; $('s-file').value = ''; if (!file) return;
    // Mesh formats are BINARY (STL, GLB) or large (OBJ), and must be branched
    // before `file.text()` -- decoding a binary STL as UTF-8 corrupts it, and
    // the 4 MB recipe budget is the wrong limit for geometry. importMesh
    // enforces its own 16 MB ceiling and the 100k vertex/triangle budget.
    if (/\.(stl|obj|glb)$/i.test(file.name)) return importGeometry(file);
    if (file.size > LIMITS.bytes) throw Error('File exceeds the 4 MB limit.'); const text = await file.text();
    if (/\.(pdb|ent)$/i.test(file.name)) { const molecule = parsePDB(text); commit(s => { if (s.objects.length && s.units !== 'Å') throw Error('PDB uses Å. Start an empty scene or set units to Å before importing.'); s.units = 'Å'; s.mode = 'academic'; s.objects.push(molecule); }); select(molecule.id);
      status(`PDB loaded: first model, ${molecule.atoms.length} atoms. ` + (molecule.inferredBonds ? `The file has no CONECT records, so the ${molecule.bonds.length} bonds shown are inferred from interatomic distance.` : `${molecule.bonds.length} bonds from CONECT records.`)); }
    else if (/\.csv$/i.test(file.name)) { const data = parseSpatialCSV(text); add(data); status('XYZ point cloud imported. Scene units apply.'); }
    else { const imported = validateScene(JSON.parse(text)); commit(s => Object.assign(s, imported)); status('Scene loaded. Undo restores the previous scene.'); }
    viewport.fit();
  });
  async function samples() {
    const o = current(); if (o?.kind !== 'surface') throw Error('Select an equation surface first.');
    const { compileExpression } = await import('./equations.mjs'), fn = compileExpression(o.equation), rows = [['x', 'y', 'z', 't']];
    // Export is capped at a 65 × 65 grid, independently of display tessellation.
    const n = Math.min(o.resolution, 64), t = viewport.time;
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { const vx = o.min + (o.max - o.min) * x / n, vy = o.min + (o.max - o.min) * y / n, z = fn({ x: vx, y: vy, t }); if (Number.isFinite(z) && Math.abs(z) <= 1e5) rows.push([vx, vy, z, t]); }
    return { schema: 'gx-equation-samples/1', equation: o.equation, units: store.scene.units, coordinates: 'local', rows };
  }
  // One handler, two scopes: `null` means the whole scene. Both formats carry
  // geometry only — no colour, no units — so the status line says so rather
  // than letting someone discover it in their slicer.
  const exportMesh = (id) => { stop();
    const format = $('s-export-format').value, whole = id == null;
    const name = `construct-${whole ? 'scene' : 'object'}.${format}`;
    download(format === 'obj' ? viewport.exportOBJ(id) : viewport.exportSTL(id),
      name, format === 'obj' ? 'model/obj' : 'model/stl');
    // A scene holding both a solid and a molecule exports the solid and drops
    // the molecule. That is the right outcome, but it must be SAID — a file
    // silently missing half the scene is the kind of thing found much later.
    const skipped = viewport.lastExportSkipped;
    status(`Exported ${whole ? 'the whole scene' : 'the selected object'} as ${format.toUpperCase()}, in scene units. `
      + `${format.toUpperCase()} carries geometry only — no colour and no unit metadata — so check scale in the receiving software.`
      + (skipped ? ` ${skipped} object${skipped > 1 ? 's were' : ' was'} left out: molecules, orbitals and vectors have no exportable surface. Save the project as JSON to keep them.` : ''));
  };
  $('s-export-stl').onclick = run(() => exportMesh(selected));
  $('s-export-scene').onclick = run(() => exportMesh(null));
  $('s-export-samples').onclick = run(async () => { const data = await samples(); download(data.rows.map(r => r.join(',')).join('\n'), 'equation-samples.csv', 'text/csv'); status('Exported local equation coordinates (before object transforms).'); });
  $('s-send-samples').onclick = run(async () => { if (!window.GxAcademicTransfer) throw Error('Open Schema in the Ginexys Pro shell to send graph samples. CSV export works standalone.'); await window.GxAcademicTransfer.send(await samples()); status('Graph samples offered to Table IDE.'); });
  const cancelDraw = () => { drawing = false; points = []; viewport.setSketch(null); $('s-finish').hidden = true; $('s-cancel-draw').hidden = true; $('s-draw').disabled = false; };
  $('s-draw').onclick = () => { stop(); drawing = true; points = []; viewport.transform.detach(); viewport.fit('top'); $('s-draw').disabled = true; $('s-finish').hidden = false; $('s-cancel-draw').hidden = false; viewport.setSketch(p => { points.push(p); $('s-profile').value = points.map(p => p.map(v => v.toFixed(3)).join(',')).join(' '); status(`${points.length} footprint points. Click Close and extrude after at least three.`); }); status('Click on the ground plane to draw a footprint.'); };
  $('s-finish').onclick = run(() => { add(object('extrusion', 'Drawn footprint', { points: structuredClone(points), depth: num('s-depth') })); cancelDraw(); });
  $('s-cancel-draw').onclick = cancelDraw;
  // Drawers: same affordance as the 2D symbol palette — an edge tab slides the
  // panel in over the stage rather than reserving a permanent column.
  const drawers = { library: $('s-library'), inspector: $('s-inspector') };
  let pinned = {};
  const setDrawer = (name, open) => {
    const panel = drawers[name], tab = $('s-tab-' + name);
    panel.classList.toggle('open', open);
    tab.classList.toggle('shifted', open);
    tab.setAttribute('aria-expanded', String(open));
    root.querySelector('.spatial-layout').classList.toggle(name + '-open', open);
    // No viewport resize: the stage is full-width and the drawer slides OVER
    // it, so the canvas never changes size. (viewport.resize is a
    // ResizeObserver, not a method — calling it would throw.)
  };
  // A pinned drawer is locked open: the tab (and any auto-close) must not shut
  // it. Unpinning is the way out, which is what "pinned" means to the user.
  // Clicking the tab of a pinned drawer unpins AND closes it, rather than doing
  // nothing: an inert control reads as broken. The pin still blocks the
  // automatic opens/closes, which is what it is for.
  const toggleDrawer = name => {
    const open = drawers[name].classList.contains('open');
    if (pinned[name] && open) { setPin(name, false); setDrawer(name, false); return; }
    setDrawer(name, !open);
  };
  for (const name of Object.keys(drawers)) $('s-tab-' + name).onclick = () => toggleDrawer(name);
  // Pinning keeps a drawer open across selections and mode changes. It is
  // remembered per browser so a layout someone deliberately chose survives a
  // reload — an unpinned drawer is a glance, a pinned one is part of the desk.
  const PIN_KEY = 'gx-spatial-pins';
  try { pinned = JSON.parse(localStorage.getItem(PIN_KEY)) || {}; } catch (_) { pinned = {}; }
  const setPin = (name, on) => {
    pinned[name] = on;
    const button = root.querySelector(`.spatial-pin[data-pin="${name}"]`);
    button.classList.toggle('is-pinned', on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Unpin this panel' : 'Keep this panel open';
    drawers[name].classList.toggle('pinned', on);
    if (on) setDrawer(name, true);
    try { localStorage.setItem(PIN_KEY, JSON.stringify(pinned)); } catch (_) {}
  };
  for (const name of Object.keys(drawers)) {
    root.querySelector(`.spatial-pin[data-pin="${name}"]`).onclick = () => setPin(name, !pinned[name]);
    if (pinned[name]) setPin(name, true);
  }
  // Selecting an object is the moment its properties matter, so open that
  // drawer once — but never re-open it after the user has closed it.
  let inspectorAutoOpened = false;
  revealInspector = () => {
    if (inspectorAutoOpened || pinned.inspector) return;
    inspectorAutoOpened = true; setDrawer('inspector', true);
  };

  const close = () => { advanced?.dispose(); session = store.scene; jobs.cancel(); viewport.dispose(); root.close(); root.remove(); document.getElementById('spatialOpenBtn')?.focus(); };
  $('s-close').onclick = close;
  root.addEventListener('cancel', e => { e.preventDefault(); if (drawing) cancelDraw(); else close(); });
  const editingText = e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
  root.addEventListener('keydown', e => {
    e.stopPropagation();
    if (editingText(e)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); stop(); e.shiftKey ? store.redo() : store.undo(); session = store.scene; render(); return; }
    if (e.code === 'Space') { e.preventDefault(); viewport.setPanMode(true); return; }
    const key=e.key.toLowerCase();
    if (key === 'escape') { viewport.transform.detach(); return; }
    if (!selected) return;
    if (key === 'g' || key === 'r' || key === 's') { e.preventDefault(); stop(); viewport.transform.setMode({g:'translate',r:'rotate',s:'scale'}[key]); viewport.select(selected); status({g:'Move',r:'Rotate',s:'Scale'}[key] + ' active. Drag a gizmo axis; Esc releases it.'); return; }
    if (key === 'e') { e.preventDefault(); try { advanced?.shortcut('extrude'); } catch (error) { status(error.message,true); } return; }
    if (key === 'h') { e.preventDefault(); if (e.altKey) { commit(s=>s.objects.forEach(v=>v.visible=true)); status('All objects shown.'); } else { commit(s=>s.objects.forEach(v=>v.visible=v.id===selected)); status('Selected object isolated. Press Alt+H to show all.'); } }
  });
  root.addEventListener('keyup', e => { if (e.code === 'Space') viewport.setPanMode(false); });
  // What the 2D canvas had selected when 3D opened. Previously this was only
  // discoverable by opening a collapsed disclosure and clicking Extrude, so the
  // common case -- drawing a square, opening 3D, finding nothing about it --
  // looked like the two environments were unrelated.
  const selection2D = (editor?._selection?.length ? editor._selection : editor?.selectedElements) || [];
  if (selection2D.length) {
    $('s-extrude-group').open = true;
    $('s-selection-state').textContent = `${selection2D.length} shape${selection2D.length > 1 ? 's' : ''} selected on the 2D canvas. Extrude closed shapes, or open Build walls / conduit from lines for physical routes.`;
    status(`${selection2D.length} 2D shape${selection2D.length > 1 ? 's are' : ' is'} selected. Use extrusion for closed shapes or wall/conduit conversion for physical routes. Turn on 2D underlay to see the drawing on the ground plane.`);
  } else {
    $('s-selection-state').textContent = 'Nothing is selected on the 2D canvas. Select closed shapes there and reopen 3D, or draw a footprint here.';
  }
  advanced = researchUI({ root, current, commit, add, select, viewport, status, scene: () => store.scene, download });
  render(); viewport.fit();
}
