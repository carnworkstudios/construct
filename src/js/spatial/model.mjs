// SPDX-License-Identifier: MIT
import { regenerateFeatures } from './features.mjs';
import { validateEditableMesh } from './editing.mjs';
import { validateExperiment } from './experiments.mjs';
import { validatePathSolid, pathFootprint } from './path-solids.mjs';
import { compileExpression } from './equations.mjs';
export const LIMITS = Object.freeze({ objects: 256, atoms: 10000, bonds: 20000, points: 2048, bytes: 4 * 1024 * 1024, history: 30 });
export const KINDS = ['box', 'sphere', 'cylinder', 'extrusion', 'surface', 'vector', 'molecule', 'orbital', 'collision', 'mesh', 'wall', 'conduit', 'plane', 'experiment'];
export const uid = () => globalThis.crypto.randomUUID();
export function object(kind, name, props = {}) {
  return { id: uid(), kind, name, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#168ca3', level: 0, visible: true, ...props };
}
export const blankScene = () => ({ schema: 'gx-spatial/2', units: 'm', mode: 'general', objects: [] });
const finite = (v, lo = -1e6, hi = 1e6) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(n => finite(n));
export function validateScene(input) {
  if (!input || !['gx-spatial/1', 'gx-spatial/2'].includes(input.schema) || !Array.isArray(input.objects)) throw Error('Expected a gx-spatial/1 or gx-spatial/2 scene.');
  if (JSON.stringify(input).length > LIMITS.bytes) throw Error('Scene exceeds the 4 MB recipe budget.');
  if (input.objects.length > LIMITS.objects) throw Error(`Scene limit: ${LIMITS.objects} objects.`);
  const ids = new Set(); let atoms = 0, bonds = 0, surfaces = 0, vertices = 0, triangles = 0, pathPoints = 0;
  const scene = { schema: 'gx-spatial/2', units: input.units, mode: input.mode, objects: [] };
  if (!['m', 'mm', 'Å', 'unit'].includes(scene.units) || !['general', 'electrical', 'construction', 'software', 'academic'].includes(scene.mode)) throw Error('Unknown units or mode.');
  for (const source of input.objects) {
    const o = structuredClone(source);
    if (!o || typeof o.id !== 'string' || o.id.length > 80 || ids.has(o.id) || !KINDS.includes(o.kind)) throw Error('Invalid object identity.');
    ids.add(o.id);
    if (typeof o.name !== 'string' || o.name.length > 120 || !/^#[0-9a-f]{6}$/i.test(o.color) || typeof o.visible !== 'boolean') throw Error('Invalid object appearance.');
    if (![o.position, o.rotation, o.scale].every(vector) || o.scale.some(v => v <= 0 || v > 10000) || !Number.isInteger(o.level) || Math.abs(o.level) > 1000) throw Error('Invalid object transform or level.');
    if (o.annotations !== undefined) {
      if (Array.isArray(o.annotations) && new Set(o.annotations.map(a=>a?.id)).size!==o.annotations.length) throw Error('Annotation IDs must be unique within an object.');
      if (!Array.isArray(o.annotations) || o.annotations.length > 256 || !o.annotations.every(a=>a && typeof a.id==='string' && a.id.length<=80 && ['object','vertex','edge','face','planar','atom','residue','chain'].includes(a.scope) && typeof a.target==='string' && a.target.length<=200 && typeof a.text==='string' && a.text.length<=160 && Array.isArray(a.tags) && a.tags.length<=16 && a.tags.every(t=>typeof t==='string' && t.length<=40) && typeof a.visible==='boolean')) throw Error('Invalid annotations (256 per object, 160 characters per label).');
    }
    if (o.kind==='plane' && (!vector(o.normal) || Math.hypot(...o.normal)<1e-8 || !finite(o.offset) || !finite(o.size,.001,10000))) throw Error('Plane needs a nonzero normal, finite offset and positive size.');
    if (o.kind==='experiment') {
      validateExperiment(o.experiment);
      const r=o.result;
      if(!r || r.schema!=='gx-experiment-result/1' || !Array.isArray(r.times) || r.times.length>2001 || !r.times.length || !r.times.every((v,i)=>finite(v,0,1e6) && (!i||v>r.times[i-1])) || !Array.isArray(r.rows) || r.rows.length!==r.times.length || !r.rows.every(row=>Array.isArray(row)&&row.length<=33&&row.every(n=>finite(n,-1e8,1e8))))throw Error('Invalid experiment result.');
      if(!Array.isArray(r.columns)||r.columns.length<2||r.columns.length>33||!r.columns.every(c=>typeof c==='string'&&c.length>0&&c.length<=120)||new Set(r.columns).size!==r.columns.length||!r.rows.every((row,i)=>row.length===r.columns.length&&row[0]===r.times[i]))throw Error('Experiment columns and times must match recorded rows.');
      if(o.experiment.kind==='particles' && (!Array.isArray(r.frames)||r.frames.length!==r.times.length||!r.frames.every(f=>Array.isArray(f)&&f.length===o.experiment.bodies.length&&f.every(vector))))throw Error('Invalid trajectory frames.');
    }
    if (o.animation) {
      if (!['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(o.animation.axis)) throw Error('Unknown animation axis.');
      compileExpression(o.animation.equation);
    }
    if (['wall', 'conduit'].includes(o.kind)) {
      if (input.schema === 'gx-spatial/1') throw Error('Path solids require gx-spatial/2.');
      const frames = validatePathSolid(o);
      pathPoints += o.path.length;
      if (pathPoints > LIMITS.points) throw Error(`Scene path budget: ${LIMITS.points} vertices.`);
      if(frames)validateProfile(pathFootprint(o, frames));
      if (o.source && o.source.units !== scene.units) throw Error('Source calibration units must match the scene.');
    }
    if (o.kind === 'extrusion') {
      if (!Array.isArray(o.points) || o.points.length < 3 || o.points.length > LIMITS.points || !o.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => finite(v)))) throw Error('Invalid extrusion profile.');
      if (!finite(o.depth, 0.001, 10000)) throw Error('Extrusion depth must be between 0.001 and 10000.');
      validateProfile(o.points);
      if (o.holes !== undefined) {
        if (!Array.isArray(o.holes) || o.holes.length > 32 || o.holes.some(loop => !Array.isArray(loop) || loop.length < 3 || loop.length > LIMITS.points || !loop.every(p => Array.isArray(p) && p.length === 2 && p.every(v => finite(v))))) throw Error('Invalid extrusion holes.');
        o.holes.forEach(validateProfile);
      }
    }
    if (o.kind === 'surface') {
      if (++surfaces > 8) throw Error('Scene limit: eight graph surfaces.');
      compileExpression(o.equation);
      if (!finite(o.min, -10000, 10000) || !finite(o.max, -10000, 10000) || o.min >= o.max || !Number.isInteger(o.resolution) || o.resolution < 8 || o.resolution > 128) throw Error('Invalid graph range or resolution (8–128).');
    }
    if (o.kind === 'vector' && (!vector(o.vector) || Math.hypot(...o.vector) < 1e-8)) throw Error('A vector needs three finite components and nonzero length.');
    if (o.kind === 'mesh') {
      if (!Array.isArray(o.vertices) || !o.vertices.length || !o.vertices.every(vector) || !Array.isArray(o.triangles)) throw Error('Mesh requires finite XYZ vertices and a triangle list (empty for a point cloud).');
      vertices += o.vertices.length; triangles += o.triangles.length;
      if (vertices > 100000 || triangles > 100000) throw Error('Spatial data exceeds 100000 vertices or triangles.');
      if (!o.triangles.every(t => Array.isArray(t) && t.length === 3 && new Set(t).size === 3 && t.every(i => Number.isInteger(i) && i >= 0 && i < o.vertices.length))) throw Error('Triangle indices must reference three different vertices.');
      if((o.vertexIds || o.faceIds) && !o.generated) validateEditableMesh(o);
    }
    if (o.kind === 'molecule') {
      if (!Array.isArray(o.atoms) || !Array.isArray(o.bonds) || !o.atoms.length) throw Error('Molecule has no atoms.');
      atoms += o.atoms.length; bonds += o.bonds.length;
      if (atoms > LIMITS.atoms || bonds > LIMITS.bonds) throw Error('Molecular budget exceeded (10000 atoms / 20000 bonds).');
      if (!o.atoms.every(a => typeof a.element === 'string' && /^[A-Z][a-z]?$/.test(a.element) && vector(a.position))) throw Error('Invalid atom.');
      if (!o.bonds.every(b => Array.isArray(b) && b.length === 2 && b.every(i => Number.isInteger(i) && i >= 0 && i < o.atoms.length) && b[0] !== b[1])) throw Error('Invalid bond.');
      if(o.trajectory){const t=o.trajectory;if(!Array.isArray(t.times)||t.times.length>201||!t.times.length||!t.times.every((v,i)=>finite(v,0,1e6)&&(!i||v>t.times[i-1]))||!Array.isArray(t.frames)||t.frames.length!==t.times.length||t.frames.length*o.atoms.length>200000||!t.frames.every(f=>Array.isArray(f)&&f.length===o.atoms.length&&f.every(vector)))throw Error('Invalid molecular trajectory.');if(t.energies!==undefined&&(!Array.isArray(t.energies)||t.energies.length!==t.times.length||!t.energies.every((row,i)=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite)&&row[0]===t.times[i])))throw Error('Invalid molecular energy records.');}
      if(o.representation && !['ball-stick','sticks','space-fill','backbone','cartoon'].includes(o.representation))throw Error('Unknown molecular representation.');
      if(o.bondOrders && (!Array.isArray(o.bondOrders)||o.bondOrders.length!==o.bonds.length||!o.bondOrders.every(n=>[1,1.5,2,3].includes(n))))throw Error('Bond orders must correspond to bonds.');
      if(o.atoms.some(a=>a.id!==undefined && (typeof a.id!=='string'||a.id.length>80)))throw Error('Invalid atom identity.');
      if(o.atoms.filter(a=>a.id).length && new Set(o.atoms.map(a=>a.id)).size!==o.atoms.length)throw Error('Atom identities must be unique.');
      if ('inferredBonds' in o && typeof o.inferredBonds !== 'boolean') throw Error('inferredBonds must be a boolean.');
    }
    scene.objects.push(o);
  }
  return scene;
}

export function validateProfile(points) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let area = 0;
  const on = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-9 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8) throw Error('Profile contains duplicate consecutive points.');
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) throw Error('Profile edges intersect. Use a simple closed outline.');
    }
  }
  if (Math.abs(area) < 1e-8) throw Error('Profile must enclose a nonzero area.');
}

export class SceneStore {
  constructor(scene = blankScene()) { this.scene = validateScene(scene); this.undoStack = []; this.redoStack = []; }
  commit(edit) {
    const next = structuredClone(this.scene); edit(next); regenerateFeatures(next,this.scene); const valid = validateScene(next);
    if (JSON.stringify(valid) === JSON.stringify(this.scene)) return;
    this.undoStack.push(this.scene);
    // Cap history by both entry count and approximate serialized bytes.
    while (this.undoStack.length > LIMITS.history || this.undoStack.reduce((n, s) => n + JSON.stringify(s).length, 0) > LIMITS.bytes * 2) this.undoStack.shift();
    this.scene = valid; this.redoStack = [];
  }
  undo() { if (this.undoStack.length) { this.redoStack.push(this.scene); this.scene = this.undoStack.pop(); } }
  redo() { if (this.redoStack.length) { this.undoStack.push(this.scene); this.scene = this.redoStack.pop(); } }
}

// Fixed-column PDB coordinates. CONECT records when present; otherwise distance-inferred
// bonds flagged via inferredBonds so the UI can label them as derived, not read.
export function parsePDB(text) {
  if (text.length > LIMITS.bytes) throw Error('PDB is larger than 4 MB.');
  // Accept LF, CRLF and classic CR-only files (many chemistry exporters still emit CR).
  const lines = text.split(/\r\n|\r|\n/);
  const atoms = [], serials = new Map(), rawBonds = []; let firstModel = false, segment = 0;
  for (const line of lines) {
    if (line.startsWith('MODEL ')) { if (firstModel) break; firstModel = true; }
    if (line.startsWith('ENDMDL')) break;
    if (line.startsWith('TER')) segment++;
    if (/^(ATOM  |HETATM)/.test(line)) {
      if (![' ', 'A', ''].includes(line.slice(16, 17))) continue;
      const element = (line.slice(76, 78).trim() || line.slice(12, 14).trim().replace(/\d/g, '')).toLowerCase();
      const normalized = element.charAt(0).toUpperCase() + element.slice(1);
      const position = [30, 38, 46].map(i => Number(line.slice(i, i + 8).trim() || 'NaN'));
      if (!vector(position) || !/^[A-Z][a-z]?$/.test(normalized)) throw Error('PDB contains invalid atom coordinates or elements.');
      const serial = Number(line.slice(6, 11)), chain = line.slice(21,22).trim(), residueNumber = line.slice(22,26).trim(), insertion = line.slice(26,27).trim();
      if (serials.has(serial)) throw Error('Duplicate PDB atom serial in the selected model.');
      serials.set(serial, atoms.length); atoms.push({ id: `pdb:${serial}`, element: normalized, position,
        atomName: line.slice(12,16).trim(), residueName: line.slice(17,20).trim(), residueNumber, insertion, chain,
        chainId: `chain:${chain}:${segment}`, residueId: `res:${chain}:${segment}:${residueNumber}:${insertion}`,
        altLoc: line.slice(16,17).trim(), occupancy: Number(line.slice(54,60).trim() || 1), record: line.slice(0,6).trim() });
      if (atoms.length > LIMITS.atoms) throw Error('PDB exceeds 10000 atoms.');
    }
  }
  // CONECT is normally after ENDMDL, so read connectivity in a separate pass.
  for (const line of lines) if (line.startsWith('CONECT')) {
    const ids = line.slice(6).match(/.{1,5}/g)?.map(Number) || [];
    for (const target of ids.slice(1)) if (serials.has(ids[0]) && serials.has(target)) rawBonds.push([serials.get(ids[0]), serials.get(target)].sort((a, b) => a - b));
    if (rawBonds.length > LIMITS.bonds * 2) throw Error('PDB exceeds the bond budget.');
  }
  if (!atoms.length) throw Error(coordinateHint(lines));
  let bonds = [...new Set(rawBonds.filter(([a, b]) => a !== b).map(b => b.join(',')))].map(b => b.split(',').map(Number));
  // Many small-molecule exports carry no CONECT records at all. Without bonds the
  // molecule renders as a loose cloud of spheres, which reads as a broken import.
  // Derive them from interatomic distance and mark the result as inferred, so the
  // UI can say so rather than presenting guessed connectivity as if it were read.
  let inferredBonds = false;
  if (!bonds.length && atoms.length > 1 && atoms.length <= 2000) { bonds = inferBonds(atoms); inferredBonds = bonds.length > 0; }
  const center = atoms.reduce((c, a) => c.map((v, i) => v + a.position[i] / atoms.length), [0, 0, 0]);
  atoms.forEach(a => { a.position = a.position.map((v, i) => v - center[i]); });
  const secondary = [];
  for (const line of lines) {
    if (line.startsWith('HELIX ')) secondary.push({ kind: 'helix', chain: line.slice(19,20).trim(), start: Number(line.slice(21,25)), end: Number(line.slice(33,37)) });
    if (line.startsWith('SHEET ')) secondary.push({ kind: 'sheet', chain: line.slice(21,22).trim(), start: Number(line.slice(22,26)), end: Number(line.slice(33,37)) });
  }
  for (const a of atoms) a.secondary = secondary.find(s=>s.chain===a.chain && Number(a.residueNumber)>=s.start && Number(a.residueNumber)<=s.end)?.kind || 'coil';
  return object('molecule', 'Imported PDB (first model)', { atoms, bonds, inferredBonds, coordinateOrigin: center, representation: 'ball-stick', sourceFormat: 'pdb', sourceText: text });
}

// Covalent radii (Angstrom) for the elements common in small-molecule PDB files.
const COVALENT = { H: .31, C: .76, N: .71, O: .66, F: .57, P: 1.07, S: 1.05, Cl: 1.02, Br: 1.2, I: 1.39, B: .84, Si: 1.11, Se: 1.2 };
// A pair is bonded when its separation is within tolerance of the sum of covalent
// radii. Uniform-grid binning keeps this linear rather than O(n^2) on large inputs.
function inferBonds(atoms, tolerance = .45) {
  const radius = a => COVALENT[a.element] ?? .77, cell = 2.6, bins = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  atoms.forEach((a, i) => { const k = key(...a.position.map(v => Math.floor(v / cell))); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(i); });
  const bonds = [];
  atoms.forEach((a, i) => {
    const [bx, by, bz] = a.position.map(v => Math.floor(v / cell));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      for (const j of bins.get(key(bx + dx, by + dy, bz + dz)) || []) {
        if (j <= i) continue;
        const b = atoms[j], limit = radius(a) + radius(b) + tolerance;
        const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
        // .4 rejects duplicate/overlapping coordinates; H never bonds to H.
        if (d > .4 && d <= limit && !(a.element === 'H' && b.element === 'H')) bonds.push([i, j]);
      }
  });
  return bonds.length > LIMITS.bonds ? [] : bonds;
}

// Say WHY nothing parsed instead of implying the file is empty.
function coordinateHint(lines) {
  if (lines.some(l => /^(ATOM|HETATM)/.test(l))) return 'Found ATOM/HETATM records, but their coordinate columns could not be read. PDB coordinates must sit in fixed columns 31-54.';
  if (lines.some(l => /^(data_|_atom_site)/.test(l))) return 'This looks like an mmCIF file, not a PDB file. Export it as PDB and try again.';
  if (lines.some(l => /V[23]000|\$\$\$\$/.test(l))) return 'This looks like an SDF/MOL file, not a PDB file. Export it as PDB and try again.';
  return 'No ATOM or HETATM records found. Check that this is a PDB coordinate file.';
}

export function transformVector(v, matrix) {
  if (!vector(v) || !Array.isArray(matrix) || matrix.length !== 9 || !matrix.every(n => finite(n))) throw Error('Enter nine finite matrix values, row by row.');
  return [0, 1, 2].map(r => v.reduce((sum, n, c) => sum + n * matrix[r * 3 + c], 0));
}

export function parseSpatialCSV(text) {
  if (text.length > LIMITS.bytes) throw Error('CSV exceeds 4 MB.');
  const lines = text.trim().split(/\r?\n/); if (/^\s*x\s*,\s*y\s*,\s*z\s*$/i.test(lines[0])) lines.shift();
  if (!lines.length || lines.length > 100000) throw Error('CSV needs 1–100000 XYZ rows.');
  const vertices = lines.map((line, i) => {
    const fields = line.split(',').map(s => s.trim());
    if (fields.length !== 3 || fields.some(s => !s.length) || !vector(fields.map(Number))) throw Error(`Invalid XYZ data on row ${i + 1}. Use three numeric columns: x,y,z.`);
    return fields.map(Number);
  });
  return object('mesh', 'Spatial point cloud', { vertices, triangles: [] });
}

// Exact equal-mass 1D elastic collision, embedded in 3D; radius .5, speed 1.
export function collisionPositions(t) {
  const time = ((t % 8) + 8) % 8;
  const distance = time <= 2.5 ? 3 - time : 0.5 + (time - 2.5);
  return [[-distance, 0, 0.5], [distance, 0, 0.5]];
}
