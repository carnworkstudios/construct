// SPDX-License-Identifier: MIT
// The academic kit is notation: every symbol must render standalone and every
// `solid` must be a recipe the 3D model layer accepts.
global.window = {}; global.document = { readyState: 'complete', addEventListener() {} };
require('../src/js/domains/academicKit.js');
const assert = require('node:assert');
const SYMBOLS = global.window.GxAcademicKit.SYMBOLS;
let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; } catch (e) { failures.push(`${name}: ${e.message}`); } };

test('every symbol has the fields the picker reads', () => {
  for (const s of SYMBOLS) {
    assert.ok(/^research-[a-z0-9-]+$/.test(s.id), `bad id: ${s.id}`);
    assert.ok(s.label && s.group, `${s.id} needs a label and group`);
    assert.ok(s.svgPreview && s.svgContent, `${s.id} needs preview and content`);
    assert.ok(/^0 0 \d+ \d+$/.test(s.previewViewBox), `${s.id} needs a viewBox`);
  }
});

test('ids are unique', () => {
  const ids = SYMBOLS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('svg is well-formed enough to inline', () => {
  for (const s of SYMBOLS) {
    const open = (s.svgContent.match(/<[a-z]/g) || []).length;
    const close = (s.svgContent.match(/(\/>|<\/[a-z])/g) || []).length;
    assert.equal(open, close, `${s.id}: ${open} tags opened, ${close} closed`);
    assert.ok(!/\bon[a-z]+=/i.test(s.svgContent), `${s.id} must not carry inline event handlers`);
  }
});

test('subjects are ones the 3D subject filter offers', () => {
  for (const s of SYMBOLS) if (s.subject) assert.ok(['physics', 'chemistry', 'math'].includes(s.subject), `${s.id}: ${s.subject}`);
});

test('every solid is a kind the scene model knows', () => {
  const KINDS = ['box', 'sphere', 'cylinder', 'extrusion', 'surface', 'vector', 'molecule', 'orbital', 'collision', 'mesh'];
  for (const s of SYMBOLS.filter(s => s.solid)) {
    assert.ok(KINDS.includes(s.solid.kind), `${s.id}: unknown kind ${s.solid.kind}`);
    if (s.solid.kind === 'molecule') {
      assert.ok(s.solid.atoms.length, `${s.id} has no atoms`);
      for (const a of s.solid.atoms) {
        assert.ok(/^[A-Z][a-z]?$/.test(a.element), `${s.id}: bad element ${a.element}`);
        assert.ok(a.position.length === 3 && a.position.every(Number.isFinite), `${s.id}: bad position`);
      }
      for (const [x, y] of s.solid.bonds) {
        assert.ok(Number.isInteger(x) && Number.isInteger(y) && x !== y, `${s.id}: bad bond`);
        assert.ok(x < s.solid.atoms.length && y < s.solid.atoms.length, `${s.id}: bond out of range`);
      }
    }
  }
});

test('the kit covers the subjects it claims', () => {
  for (const subject of ['physics', 'chemistry', 'math'])
    assert.ok(SYMBOLS.filter(s => s.subject === subject).length >= 5, `${subject} has too few symbols`);
});

console.log(`\nacademic kit: ${passed}/${passed + failures.length} (${SYMBOLS.length} symbols, ${SYMBOLS.filter(s => s.solid).length} with 3D)`);
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('PASS — symbols render standalone, ids are unique, and every 3D\n       recipe is a kind the scene model accepts.');
