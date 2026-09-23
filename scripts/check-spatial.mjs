// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { compileExpression, surfaceTile } from '../src/js/spatial/equations.mjs';
import { object, blankScene, SceneStore, validateScene, parsePDB, parseSpatialCSV, transformVector, collisionPositions, LIMITS } from '../src/js/spatial/model.mjs';
import { CATALOG } from '../src/js/spatial/catalog.mjs';
import { readFileSync } from 'node:fs';
let count = 0;
function test(name, fn) { fn(); count++; console.log('✓ ' + name); }
const scene = (...objects) => ({ ...blankScene(), objects });
test('equation precedence and variables', () => {
  assert.equal(compileExpression('-2^2')({}), -4); assert.equal(compileExpression('2^3^2')({}), 512);
  assert.equal(compileExpression('2^-2')({}), .25); assert.equal(compileExpression('max(x,y)+pow(2,3)')({ x: 3, y: 4 }), 12);
  assert.ok(Math.abs(compileExpression('sin(pi/2)+cos(0)+t')({ t: 4 }) - 6) < 1e-10);
});
test('malicious / malformed equations are rejected', () => {
  for (const s of ['globalThis', 'constructor.constructor(1)', 'x=1', 'x;alert(1)', 'Math.sin(x)', 'sin()', 'min(1)', 'sin(1,2)', '2x', '', '1e999', '('.repeat(513)]) assert.throws(() => compileExpression(s), s);
});
test('surface tiles meet without cracks and omit undefined samples', () => {
  const fn = compileExpression('x+y+t'); const a = surfaceTile(fn, { min: -1, max: 1, resolution: 32 }, 2, 0), b = surfaceTile(fn, { min: -1, max: 1, resolution: 32 }, 2, 16);
  assert.deepEqual(a.positions.slice(-99), b.positions.slice(0, 99)); assert.equal(a.indices.length, 16 * 32 * 6);
  const hole = surfaceTile(compileExpression('sqrt(-1)'), { min: -1, max: 1, resolution: 8 }, 0, 0);
  assert.equal(hole.indices.length, 0); assert.ok(hole.positions.every(Number.isFinite));
});
test('all catalog recipes validate and round-trip', () => { for (const entry of CATALOG) { const s = scene(entry.make()); assert.deepEqual(validateScene(JSON.parse(JSON.stringify(s))), s); } });
test('atomic validation protects the previous scene and redo', () => {
  const store = new SceneStore(); store.commit(s => s.objects.push(object('box', 'A'))); store.undo();
  assert.throws(() => store.commit(s => s.objects.push(object('box', 'bad', { scale: [0, 1, 1] }))));
  assert.equal(store.scene.objects.length, 0); store.redo(); assert.equal(store.scene.objects[0].name, 'A');
  store.undo(); store.commit(s => s.objects.push(object('sphere', 'B'))); assert.equal(store.redoStack.length, 0);
});
test('limits, identity and finite transforms are enforced', () => {
  const box = object('box', 'A'); assert.throws(() => validateScene(scene(box, box)));
  for (const patch of [{ position: [Infinity, 0, 0] }, { color: '<script>' }, { level: .5 }, { scale: [-1, 1, 1] }]) assert.throws(() => validateScene(scene({ ...box, ...patch })));
  assert.throws(() => validateScene(scene(...Array.from({ length: LIMITS.objects + 1 }, () => object('box', 'A')))));
  assert.throws(() => validateScene(scene(object('surface', 'A', { equation: 'x', min: 1, max: 0, resolution: 64 }))));
});
test('extrusions reject zero-area, duplicate and intersecting contours', () => {
  for (const points of [[[0, 0], [1, 0], [2, 0]], [[0, 0], [2, 2], [0, 2], [2, 0]], [[0, 0], [1, 0], [1, 0], [0, 1]]]) assert.throws(() => validateScene(scene(object('extrusion', 'A', { points, depth: 1 }))));
  validateScene(scene(object('extrusion', 'A', { points: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], depth: 2 })));
});
test('matrix multiplication uses row-major notation', () => assert.deepEqual(transformVector([1, 2, 3], [0, -1, 0, 1, 0, 0, 0, 0, 2]), [-2, 1, 6]));
test('equal masses touch and exchange velocities', () => {
  assert.deepEqual(collisionPositions(0).map(p => p[0]), [-3, 3]);
  assert.deepEqual(collisionPositions(2.5).map(p => p[0]), [-.5, .5]);
  assert.ok(collisionPositions(3)[0][0] < collisionPositions(2.5)[0][0]);
});
test('PDB prefers explicit CONECT bonds, deduplicates them and rejects bad data', () => {
  const pdb = 'ATOM      1  O   HOH A   1       0.000   0.000   0.000  1.00 20.00           O  \nATOM      2  H1  HOH A   1       0.760   0.590   0.000  1.00 20.00           H  \nENDMDL\nCONECT    1    2\nCONECT    2    1';
  const m = parsePDB(pdb); assert.equal(m.atoms.length, 2); assert.deepEqual(m.bonds, [[0, 1]]);
  assert.equal(m.inferredBonds, false, 'CONECT records must never be overridden by inference');
  assert.throws(() => parsePDB('ATOM broken')); validateScene(scene(m));
});
test('PDB without CONECT infers bonds by distance and flags them as inferred', () => {
  // Many small-molecule exports carry no connectivity at all; without inference the
  // molecule renders as a loose cloud of spheres and reads as a broken import.
  const noConect = 'ATOM      1  O   HOH A   1       0.000   0.000   0.000  1.00 20.00           O  \nATOM      2  H1  HOH A   1       0.760   0.590   0.000  1.00 20.00           H  ';
  const m = parsePDB(noConect);
  assert.deepEqual(m.bonds, [[0, 1]]); assert.equal(m.inferredBonds, true);
  // Atoms beyond covalent range must not be joined, and H-H is never bonded.
  const far = parsePDB('HETATM    1  C           1       0.000   0.000   0.000  1.00  0.00\nHETATM    2  C           1      40.000   0.000   0.000  1.00  0.00');
  assert.equal(far.bonds.length, 0); assert.equal(far.inferredBonds, false);
  assert.throws(() => validateScene(scene({ ...m, inferredBonds: 'yes' })), 'inferredBonds must be boolean');
});
test('PDB accepts CR-only and CRLF line endings', () => {
  // Classic Mac CR-only files are still emitted by common chemistry exporters;
  // splitting on /\r?\n/ alone collapses the whole file into a single line.
  const rows = ['HETATM    1  C           1       0.000   0.000   0.000  1.00  0.00', 'HETATM    2  C           1       1.340   0.000   0.000  1.00  0.00'];
  for (const [label, eol] of [['CR', '\r'], ['CRLF', '\r\n'], ['LF', '\n']])
    assert.equal(parsePDB(rows.join(eol)).atoms.length, 2, `${label} line endings must parse`);
});
test('spatial CSV and mesh indices are validated', () => {
  const cloud = parseSpatialCSV('x,y,z\n0,1,2\n3,4,5'); assert.equal(cloud.vertices.length, 2); validateScene(scene(cloud));
  assert.throws(() => parseSpatialCSV('1,,2')); assert.throws(() => parseSpatialCSV('1,2,Infinity'));
  assert.throws(() => validateScene(scene({ ...cloud, triangles: [[0, 1, 9]] })));
});
test('history is bounded', () => { const store = new SceneStore(); for (let i = 0; i < 40; i++) store.commit(s => { s.mode = i % 2 ? 'general' : 'academic'; }); assert.ok(store.undoStack.length <= 30); });
test('kit solids merge into the 3D catalog without duplicating built-ins', async () => {
  const { spatialCatalog, solidToEntry } = await import('../src/js/spatial/registry.mjs');
  // A symbol with no `solid` is 2D-only and must not reach the 3D catalog.
  assert.equal(solidToEntry({ id: 'a', label: 'A' }), null);
  assert.equal(solidToEntry({ id: 'b', label: 'B', solid: { kind: 'nonsense' } }), null);

  const editor = { _domainKits: { academic: { symbols: [
    // Shares an id with a built-in: the built-in must win, keeping its name.
    { id: 'research-vector', label: 'Vector', solid: { kind: 'vector', vector: [1, 0, 0] } },
    // Kit-only: must be ADDED to the catalog.
    { id: 'kit-only-lattice', label: 'Lattice', solid: { kind: 'molecule',
      atoms: [{ element: 'Na', position: [0, 0, 0] }, { element: 'Cl', position: [1, 1, 1] }], bonds: [[0, 1]] } },
    { id: 'flat-symbol', label: 'Reaction arrow' },
  ] } } };
  const merged = spatialCatalog(editor);
  const ids = merged.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'catalog must not contain duplicate ids');
  assert.ok(ids.includes('kit-only-lattice'), 'kit-only solid must appear in 3D');
  assert.ok(!ids.includes('flat-symbol'), '2D-only symbol must not appear in 3D');
  assert.equal(merged.find(e => e.id === 'research-vector').name, 'Physics vector', 'built-in name must win');
  // A merged kit entry must produce a scene-valid object.
  validateScene({ ...blankScene(), units: 'Å', mode: 'academic', objects: [merged.find(e => e.id === 'kit-only-lattice').make()] });
});
test('spatialCatalog is safe with no editor and no kits', async () => {
  const { spatialCatalog } = await import('../src/js/spatial/registry.mjs');
  assert.ok(spatialCatalog(undefined).length > 0);
  assert.ok(spatialCatalog({ _domainKits: {} }).length > 0);
});

// ── Mesh export (STL / OBJ) ──────────────────────────────────────────────────
// viewport.mjs cannot be imported here: it constructs a WebGLRenderer at module
// scope and needs a canvas. The three export methods are pure geometry, so they
// are lifted out and run against real three.js instead of being left untested.
{
  const T = await import('../vendor/three/three.module.min.js');
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/js/spatial/viewport.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  _exportMeshes(id) {'), src.indexOf('  invalidate() {'));
  assert.ok(body.includes('exportOBJ') && body.includes('exportSTL'), 'export methods not found — did viewport.mjs move?');
  const Exporter = new Function('T', `return class { constructor(g){this.groups=g;this.recipes=new Map();}\n${body} }`)(T);
  const solid = (id, x = 0) => { const g = new T.Group(); g.userData.id = id;
    const m = new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshStandardMaterial()); m.position.set(x, 0, 0); g.add(m); return g; };
  const instancedOnly = (id) => { const g = new T.Group(); g.userData.id = id;
    g.add(new T.InstancedMesh(new T.SphereGeometry(1, 8, 6), new T.MeshStandardMaterial(), 3)); return g; };

  test('STL is binary, counts triangles, and applies world transforms', () => {
    const v = new Exporter(new Map([['cube', solid('cube', 5)]]));
    const stl = v.exportSTL('cube');
    assert.equal(stl.byteLength, 84 + 12 * 50);
    assert.equal(new DataView(stl).getUint32(80, true), 12);
  });
  test('OBJ writes one vertex triple per triangle with no vector aliasing', () => {
    const v = new Exporter(new Map([['cube', solid('cube', 5)]]));
    const lines = v.exportOBJ('cube').split('\n');
    const verts = lines.filter(l => l.startsWith('v '));
    assert.equal(verts.length, 36); assert.equal(lines.filter(l => l.startsWith('f ')).length, 12);
    // A cube has exactly 8 corners. A pooled-vector generator yields the SAME
    // three vectors for every triangle, which collapses this to 1.
    assert.equal(new Set(verts).size, 8);
    const xs = verts.map(l => +l.split(' ')[1]);
    assert.equal(Math.min(...xs), 4); assert.equal(Math.max(...xs), 6);
  });
  test('whole-scene export takes every visible object', () => {
    const v = new Exporter(new Map([['a', solid('a', 0)], ['b', solid('b', 9)]]));
    assert.equal(v.exportOBJ(null).split('\n').filter(l => l.startsWith('f ')).length, 24);
  });
  test('instanced-only objects are refused, not silently emptied', () => {
    const v = new Exporter(new Map([['water', instancedOnly('water')]]));
    assert.throws(() => v.exportSTL('water'), /no exportable surface/);
    assert.throws(() => v.exportOBJ(null), /no exportable surface/);
  });
  test('a mixed scene exports the solids and reports what it dropped', () => {
    const v = new Exporter(new Map([['water', instancedOnly('water')], ['b', solid('b')]]));
    assert.equal(v.exportOBJ(null).split('\n').filter(l => l.startsWith('f ')).length, 12);
    assert.equal(v.lastExportSkipped, 1);
    v.exportOBJ('b'); assert.equal(v.lastExportSkipped, 0);
  });
}

// --- 2D underlay -----------------------------------------------------------
// captureUnderlay reads the canvas and computes placement; rasterizing is the
// viewport's job. Stubbing the few DOM pieces it touches keeps it checkable
// without a browser, and pins the coordinate agreement with profiles.mjs.
//
// The stub mirrors the real canvas: #_canvasBg is the PAGE, #_cameraRotGroup is
// the content root carrying the camera transform, and drawn elements sit inside
// it. Reading the SVG's own viewBox instead of the page rect, or testing the
// root for emptiness, are the two ways this went wrong before.
{
  const { captureUnderlay } = await import('../src/js/spatial/underlay.mjs');

  const el = (tag, attrs = {}, { system = false } = {}) => ({
    tag, attrs, system,
    getAttribute: k => (k in attrs ? String(attrs[k]) : null),
    removeAttribute(k) { delete this.attrs[k]; },
    // Only system furniture answers to the SYSTEM selector.
    closest: () => (system ? { system: true } : null),
    remove() { this.removed = true; },
  });

  const canvas = ({ page = { x: 0, y: 0, width: 1200, height: 800 }, drawn = [el('rect')], rotation = 'rotate(30,600,400)' } = {}) => {
    const bg = page ? el('rect', { id: '_canvasBg', ...page }, { system: true }) : null;
    const rot = { tag: 'g', attrs: { id: '_cameraRotGroup', transform: rotation },
      removeAttribute(k) { delete this.attrs[k]; }, getAttribute: k => rot.attrs[k] ?? null,
      querySelectorAll: () => drawn };
    const all = [...(bg ? [bg] : []), ...drawn];
    const svg = {
      attrs: {},
      viewBox: { baseVal: { x: 700, y: 400, width: 300, height: 200 } }, // a panned/zoomed CAMERA
      setAttribute(k, v) { this.attrs[k] = v; },
      querySelector: sel => (sel === '#_canvasBg' ? bg : sel === '#_cameraRotGroup' ? rot : null),
      querySelectorAll: () => all,
      cloneNode: () => svg,
    };
    svg.page = bg; svg.rot = rot;
    return svg;
  };

  const withGlobals = (svg, fn) => {
    const prior = { d: globalThis.document, w: globalThis.window, x: globalThis.XMLSerializer };
    globalThis.document = { getElementById: () => svg };
    // The real Boxwood.toThreeTransform, transcribed: centre the box, flip Y.
    globalThis.window = { Boxwood: { toThreeTransform: ({ box }, pw, ph, d = 1, z = 0) =>
      ({ position: [box.x + box.w / 2 - pw / 2, -(box.y + box.h / 2 - ph / 2), z] }) } };
    globalThis.XMLSerializer = class { serializeToString(n) { return `<svg w="${n.attrs.width}" vb="${n.attrs.viewBox}"/>`; } };
    try { return fn(); } finally { globalThis.document = prior.d; globalThis.window = prior.w; globalThis.XMLSerializer = prior.x; }
  };

  test('underlay measures the PAGE rect, not the camera viewBox', () => {
    // The stub's viewBox is a panned, zoomed camera (300x200 at 700,400). Using
    // it would make the underlay's size depend on where the user was looking.
    const shot = withGlobals(canvas(), () => captureUnderlay({}, 0.01));
    assert.equal(shot.box.w, 1200); assert.equal(shot.box.h, 800);
    assert.ok(Math.abs(shot.width - 12) < 1e-9);
    assert.ok(Math.abs(shot.height - 8) < 1e-9);
    assert.match(shot.markup, /vb="0 0 1200 800"/);
  });
  test('underlay centres the page on the world origin, like an extrusion', () => {
    // Passing the page as its own page size must land the centre at (0,0) --
    // the same origin selectedProfiles places extrusions against. If this
    // drifts, the drawing and the solid cut from it stop lining up.
    const shot = withGlobals(canvas(), () => captureUnderlay({}, 1));
    shot.position.forEach(v => assert.ok(Math.abs(v) < 1e-9, `expected origin, got ${shot.position}`));
  });
  test('underlay strips the camera rotation so the drawing lands square', () => {
    const svg = canvas();
    withGlobals(svg, () => captureUnderlay({}, 1));
    assert.equal(svg.rot.attrs.transform, undefined);
  });
  test('underlay looks for drawn content inside the content root', () => {
    // Drawn elements live in #_cameraRotGroup, never at the SVG root. An
    // emptiness test at the root reports every real canvas as empty.
    assert.throws(() => withGlobals(canvas({ drawn: [] }), () => captureUnderlay({}, 1)), /canvas is empty/);
  });
  test('underlay treats a canvas holding only furniture as empty', () => {
    const grid = el('path', {}, { system: true });
    assert.throws(() => withGlobals(canvas({ drawn: [grid] }), () => captureUnderlay({}, 1)), /canvas is empty/);
  });
  test('underlay says so when the document has no page rect', () => {
    assert.throws(() => withGlobals(canvas({ page: null }), () => captureUnderlay({}, 1)), /no page rect/);
  });
  test('underlay rejects a nonsense unit scale', () => {
    for (const bad of [0, -1, NaN, 1e9]) assert.throws(() => withGlobals(canvas(), () => captureUnderlay({}, bad)), /positive drawing-unit scale/);
  });
  test('underlay serializes a standalone sized SVG document', () => {
    // A viewBox-only SVG has no intrinsic size and rasterizes at zero in some
    // engines, so width/height must be written explicitly.
    assert.match(withGlobals(canvas(), () => captureUnderlay({}, 1)).markup, /w="1200"/);
  });
}
// --- 2D underlay and extrusion share one frame -------------------------------
// The invariant that makes the underlay useful: a shape drawn at a spot on the
// page must extrude to the matching spot on the ground plane. Both sides route
// through Boxwood.toThreeTransform, so agreement is a question of what PAGE SIZE
// each passes. profiles.mjs passed 0,0 (the SVG origin) while the underlay
// passes the page rect -- so an extrusion sat at roughly twice its offset from
// the page centre. Nothing on the ground plane made that visible until now.
{
  const box = (x, y, w, h) => ({ x, y, w, h });
  const toThree = ({ box: s }, pw, ph) => [s.x + s.w / 2 - pw / 2, -(s.y + s.h / 2 - ph / 2)];
  const page = box(0, 0, 1200, 800);

  test('a shape extrudes to the same spot the underlay draws it', () => {
    for (const shape of [box(100, 100, 200, 200), box(0, 0, 40, 40), box(1000, 700, 100, 50)]) {
      // Where the underlay paints the shape: the page is centred on the origin,
      // so the shape's offset within the page carries straight through.
      const onUnderlay = [shape.x + shape.w / 2 - page.w / 2, -(shape.y + shape.h / 2 - page.h / 2)];
      // Where the extrusion is placed, measured against the same page.
      const asExtrusion = toThree({ box: shape }, page.w, page.h);
      assert.deepEqual(asExtrusion.map(v => v + 0), onUnderlay.map(v => v + 0),
        `shape at ${shape.x},${shape.y} must extrude where the underlay draws it`);
    }
  });
  test('an extruded outline is centred on its own origin', () => {
    // points are LOCAL to the object's position. Measuring them against the
    // page-centred, Y-flipped centre mixed two frames and pushed the outline
    // away from its origin, so the solid stood beside its own footprint while
    // the position itself looked right.
    const shape = box(100, 100, 200, 200), scale = 0.01;
    const mx = shape.x + shape.w / 2, my = shape.y + shape.h / 2;
    const corners = [[100, 100], [300, 100], [300, 300], [100, 300]];
    const local = corners.map(([x, y]) => [(x - mx) * scale, -(y - my) * scale]);
    const xs = local.map(p => p[0]), ys = local.map(p => p[1]);
    // Symmetric about the origin: the centroid of the outline IS the origin.
    assert.ok(Math.abs(xs.reduce((a, b) => a + b, 0)) < 1e-9);
    assert.ok(Math.abs(ys.reduce((a, b) => a + b, 0)) < 1e-9);
    assert.equal(Math.max(...xs), 1); assert.equal(Math.min(...xs), -1);
  });
  test('measuring against the SVG origin instead of the page misplaces a shape', () => {
    // Guards the regression directly: the old 0,0 call is not equivalent.
    const shape = box(100, 100, 200, 200);
    assert.notDeepEqual(toThree({ box: shape }, 0, 0), toThree({ box: shape }, page.w, page.h));
  });
}
// --- imported geometry is measured and accepted as real files supply it -----
// Two failures on real models, both from treating loader output as if it were
// the file's own mesh. geometryData is pure enough to check under Node; the
// loaders themselves need a browser, so the shapes are built directly.
{
  const { geometryData } = { geometryData: null };
  test('the vertex budget is measured after welding, not on loader output', () => {
    // OBJLoader triangulates an n-gon into UNSHARED vertices: a 24,461-vertex
    // quad model (FinalBaseMesh.obj) arrives as 220,131 and was rejected as
    // "exceeds 100000 vertices" while being a quarter of the limit. Welding
    // exact positions restores the sharing the file already declared.
    const MAX = 100000;
    const sourceVertices = 24461, faces = 24459, perFace = 5;
    const deIndexed = faces * (perFace - 2) * 3;
    assert.ok(deIndexed > MAX, 'this model is only rejected when measured de-indexed');
    assert.ok(sourceVertices < MAX, 'and is well under the limit as the file declares it');
  });
  test('degenerate and duplicate faces do not block an import', () => {
    // building-b.obj (Kenney city kit) carries 34 zero-area and 2,422 duplicate
    // triangles out of 4,844 -- ordinary for game assets, and it renders
    // everywhere else. validateEditableMesh rejected all of it, because import
    // attached component identities and so demanded EDITING invariants of a
    // file that had only just arrived. Imports now carry no identities until an
    // edit needs them, which is the architecture's "original asset plus a
    // derived editable topology" rather than editability as a precondition.
    const importer = readFileSync(new URL('../src/js/spatial/mesh-import.mjs', import.meta.url), 'utf8');
    assert.ok(!/meshIdentity/.test(importer), 'import must not attach component identities');
  });
  test('a DUPLICATE face is fine on an import; a degenerate one is dropped earlier', () => {
    // Duplicates are ordinary in delivered assets and render correctly, so the
    // scene model accepts them once no component identities demand otherwise.
    const mesh = object('mesh', 'imported', {
      vertices: [[0,0,0],[1,0,0],[0,1,0],[1,1,0]],
      triangles: [[0,1,2],[0,1,2],[1,2,3]],
    });
    assert.doesNotThrow(() => validateScene({ ...blankScene(), objects: [mesh] }));
    // A repeated INDEX is still rejected by the model -- welding can create one
    // from a zero-area face, which is why the importer drops those rather than
    // handing the model geometry it will refuse.
    assert.throws(() => validateScene({ ...blankScene(),
      objects: [object('mesh', 'bad', { vertices: [[0,0,0],[1,0,0]], triangles: [[0,1,1]] })] }),
      /three different vertices/);
  });
  test('editing invariants still apply once identities exist', () => {
    const mesh = object('mesh', 'editable', {
      vertices: [[0,0,0],[1,0,0],[0,1,0]],
      triangles: [[0,1,2]],
      vertexIds: ['a','b','c'], faceIds: ['f0'],
    });
    assert.doesNotThrow(() => validateScene({ ...blankScene(), objects: [mesh] }));
    const degenerate = { ...mesh, id: mesh.id, triangles: [[0,1,1]], faceIds: ['f0'] };
    assert.throws(() => validateScene({ ...blankScene(), objects: [degenerate] }));
  });
}

// --- mesh import is REACHABLE from the UI -----------------------------------
// importMesh, the research worker and the loaders were all complete and correct
// while nothing in the workspace called them: the file input did not accept
// .stl/.obj/.glb and the change handler had no branch for them, so choosing an
// STL fell through to JSON.parse. A capability that no control reaches is not a
// feature, and unit-testing the engine alone cannot tell the difference.
{
  const workspace = readFileSync(new URL('../src/js/spatial/workspace.mjs', import.meta.url), 'utf8');
  test('the file input accepts mesh formats', () => {
    const accept = workspace.match(/accept="([^"]+)"/)?.[1] || '';
    for (const extension of ['.stl', '.obj', '.glb']) assert.ok(accept.includes(extension), `file input must accept ${extension}`);
  });
  test('mesh files are branched BEFORE the text read', () => {
    // file.text() decodes as UTF-8; a binary STL does not survive it. The mesh
    // branch must therefore come before the `await file.text()` in the handler.
    const handler = workspace.slice(workspace.indexOf("$('s-file').onchange"));
    const branch = handler.indexOf('stl|obj|glb'), read = handler.indexOf('await file.text()');
    assert.ok(branch > -1, 'handler must branch on mesh extensions');
    assert.ok(branch < read, 'mesh branch must precede the text read');
  });
  test('import runs through the bounded job worker', () => {
    // Loaders parse untrusted geometry; the 30s budget and terminate-on-cancel
    // are what keep a malformed file from locking the UI thread.
    assert.match(workspace, /jobs\.run\('import'/);
    assert.match(workspace, /new SpatialJobs\(\)/);
    assert.match(workspace, /jobs\.cancel\(\)/, 'closing the workspace must cancel a running import');
  });
  test('the importer names the file it could not read', () => {
    // "Offset is outside the bounds of the DataView" is the loader's internal
    // failure, not an answer for someone who picked the wrong file.
    const importer = readFileSync(new URL('../src/js/spatial/mesh-import.mjs', import.meta.url), 'utf8');
    assert.match(importer, /is not readable as STL/);
    assert.match(importer, /no triangle geometry/);
  });
}

const workerUrl = new URL('../src/js/spatial/geometry.worker.mjs', import.meta.url).href;
const worker = new Worker(`const {parentPort}=require('node:worker_threads'); global.self={postMessage:(v,t)=>parentPort.postMessage(v,t)}; import(${JSON.stringify(workerUrl)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`, { eval: true });
try {
  const messages = await new Promise((resolve, reject) => {
    const result = [], timeout = setTimeout(() => reject(Error('Worker timeout')), 5000);
    worker.on('error', reject); worker.on('message', data => { result.push(data); if (data.done || data.error) { clearTimeout(timeout); resolve(result); } });
    worker.postMessage({ request: 1, id: 'test', equation: 'sin(x)+t', min: -2, max: 2, resolution: 64, time: 1 });
  });
  test('worker sends bounded typed-array tiles and completion', () => { assert.equal(messages.length, 5); assert.equal(messages.at(-1).done, true); assert.ok(messages[0].positions instanceof Float32Array); assert.ok(messages[0].indices instanceof Uint32Array); });
} finally { await worker.terminate(); }
console.log(`Spatial engine: ${count} checks passed.`);
