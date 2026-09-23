// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { blankScene, object, validateScene, SceneStore } from '../src/js/spatial/model.mjs';
import { pathTopology, pathSolidMesh } from '../src/js/spatial/path-solids.mjs';
const wall = (path = [[0, 0], [2, 0]], props = {}) => object('wall', 'Wall', { path, topology: pathTopology(path), height: 2.8, thickness: .15, alignment: 'center', ...props });
const conduit = path => wall(path, { kind: 'conduit', diameter: .05, wallThickness: .005 });
const scene = (...objects) => ({ ...blankScene(), objects });
let count = 0;
function test(name, fn) { fn(); count++; console.log('✓ ' + name); }
function volume(mesh) {
  return mesh.triangles.reduce((sum, face) => {
    const [a, b, c] = face.map(i => mesh.vertices[i]);
    return sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }, 0);
}
function closed(mesh) {
  const edges = new Map();
  mesh.triangles.forEach(face => face.forEach((a, i) => {
    const b = face[(i + 1) % 3], key = [a, b].sort((x, y) => x - y).join(',');
    const entry = edges.get(key) || [0, 0]; entry[0]++; entry[1] += a < b ? 1 : -1; edges.set(key, entry);
  }));
  for (const edge of edges.values()) assert.deepEqual(edge, [2, 0], 'Every edge has two oppositely oriented faces');
  assert.equal(mesh.components.length, mesh.triangles.length);
}
test('wall has calibrated volume, height and centered thickness', () => {
  const mesh = pathSolidMesh(wall()); closed(mesh);
  assert.ok(Math.abs(volume(mesh) - 2 * .15 * 2.8) < 1e-10);
  assert.equal(Math.max(...mesh.vertices.map(v => v[1])), .075);
  assert.equal(Math.max(...mesh.vertices.map(v => v[2])), 2.8);
});
test('joined wall and hollow conduit are closed with positive volume', () => {
  for (const make of [wall, conduit]) for (const path of [[[0,0],[2,0],[2,2]], [[0,0],[2,0],[2,-2]], [[0,0],[1,0],[2,0]]]) {
    const o = make(path); validateScene(scene(o)); const mesh = pathSolidMesh(o); closed(mesh); assert.ok(volume(mesh) > 0);
  }
  const mesh = pathSolidMesh(conduit([[0,0],[2,0]]));
  const expected = 2 * 12 * Math.sin(Math.PI / 12) * (.025 ** 2 - .02 ** 2);
  assert.ok(Math.abs(volume(mesh) - expected) < 1e-10, 'Tube volume excludes hollow bore');
});
test('a conduit section stays circular through a corner', () => {
  // The miter frame is deliberately LONGER than unit so a wall keeps constant
  // thickness through a corner. Used as a radius it stretches a swept circular
  // section by the same factor, so a round pipe left a 90-degree corner as a
  // 1.41:1 ellipse -- closed, positive-volume and wrong, which is why the
  // existing closure test did not see it.
  const sides = 24, o = conduit([[0, 0], [2, 0], [2, 2]]);
  const mesh = pathSolidMesh(o);
  o.path.forEach((centre, i) => {
    // Each path point owns an outer ring of `sides` vertices followed by an
    // inner ring of the same size.
    for (const [ring, radius] of [[0, o.diameter / 2], [sides, o.diameter / 2 - o.wallThickness]]) {
      const start = i * sides * 2 + ring;
      for (const v of mesh.vertices.slice(start, start + sides)) {
        const measured = Math.hypot(v[0] - centre[0], v[1] - centre[1], v[2]);
        assert.ok(Math.abs(measured - radius) < 1e-12,
          `ring ${i} at radius ${radius} measured ${measured} -- the section is not circular`);
      }
    }
  });
});
test('left and right wall alignments follow path direction', () => {
  for (const [alignment, lo, hi] of [['left', 0, .15], ['right', -.15, 0]]) {
    const ys = pathSolidMesh(wall(undefined, { alignment })).vertices.map(p => p[1]);
    assert.equal(Math.min(...ys), lo); assert.equal(Math.max(...ys), hi);
  }
});
test('invalid paths and dimensions cannot enter a project', () => {
  for (const p of [[[0,0],[0,0]], [[0,0],[2,0],[0,0]], [[0,0],[2,2],[0,2],[2,0]], [[0,0],[Infinity,1]]]) assert.throws(() => validateScene(scene(wall(p))));
  for (const props of [{ thickness: 0 }, { height: NaN }, { topology: { vertices: ['same','same'], edges: ['edge'] } }, { alignment: 'auto' }, { topology: { vertices: 'ab', edges: 'c' } }]) assert.throws(() => validateScene(scene(wall(undefined, props))));
  assert.throws(() => validateScene(scene({ ...conduit([[0,0],[2,0]]), wallThickness: .03 })));
});
test('dimensions preserve component IDs through save, undo, redo and rejected edits', () => {
  const o = wall(), store = new SceneStore(scene(o));
  store.commit(s => { s.objects[0].height = 4; s.objects[0].path[1][0] = 3; });
  assert.deepEqual(store.scene.objects[0].topology, o.topology);
  assert.deepEqual(validateScene(JSON.parse(JSON.stringify(store.scene))), store.scene);
  store.undo(); assert.equal(store.scene.objects[0].height, 2.8);
  assert.throws(() => store.commit(s => { s.objects[0].thickness = -1; }));
  store.redo(); assert.equal(store.scene.objects[0].height, 4);
  assert.deepEqual(pathSolidMesh(store.scene.objects[0]).components, pathSolidMesh(o).components);
});
test('legacy scenes migrate and old schema cannot claim new path features', () => {
  const old = { ...scene(object('box', 'Old box')), schema: 'gx-spatial/1' };
  const next = validateScene(old); assert.equal(next.schema, 'gx-spatial/2'); assert.deepEqual(next.objects, old.objects); assert.equal(old.schema, 'gx-spatial/1');
  assert.throws(() => validateScene({ ...scene(wall()), schema: 'gx-spatial/1' }));
});
test('calibration cannot be silently relabeled and aggregate path work is bounded', () => {
  const source = { elementId: 'wall-1', revision: 'r1', unitScale: .005, units: 'm' };
  const o = wall(undefined, { source }); validateScene(scene(o));
  assert.throws(() => validateScene({ ...scene(o), units: 'mm' }));
  const long = Array.from({ length: 128 }, (_, i) => [i, 0]);
  assert.throws(() => validateScene(scene(...Array.from({ length: 17 }, () => wall(long)))), /path budget/);
});
console.log(`Path solids: ${count} checks passed.`);
