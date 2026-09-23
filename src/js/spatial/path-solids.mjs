// SPDX-License-Identifier: MIT
import { pipePath, pipeMesh } from './pipe-geometry.mjs';
import { validateOpenings, wallWithOpenings } from './wall-openings.mjs';
// Bounded, explicit planar sweeps. No route inference or automatic repair.
export const PATH_LIMIT = 128;
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6;
export function pathTopology(points) {
  return {
    vertices: points.map(() => crypto.randomUUID()),
    edges: points.slice(1).map(() => crypto.randomUUID()),
  };
}
export function validatePathSolid(o) {
  const p = o.path;
  if (!Array.isArray(p) || p.length < 2 || p.length > PATH_LIMIT || !p.every(v => Array.isArray(v) && (v.length === 2 || (o.kind==='conduit' && v.length===3)) && v.every(finite))) throw Error('Use 2–128 finite x,y path points.');
  if (!Array.isArray(o.topology?.vertices) || !Array.isArray(o.topology?.edges)) throw Error('Path component identities must be arrays.');
  const ids = [...(o.topology?.vertices || []), ...(o.topology?.edges || [])];
  if (o.topology?.vertices?.length !== p.length || o.topology?.edges?.length !== p.length - 1 || ids.some(id => typeof id !== 'string' || !id.length || id.length > 80) || new Set(ids).size !== ids.length) throw Error('Invalid path component identities.');
  const positive = n => finite(n) && n >= .001 && n <= 10000;
  if (o.kind === 'wall' && (!positive(o.thickness) || !positive(o.height) || !['center', 'left', 'right'].includes(o.alignment))) throw Error('Wall thickness and height must be 0.001–10000; choose center, left or right alignment.');
  if (o.kind === 'conduit' && (!positive(o.diameter) || !positive(o.wallThickness) || o.wallThickness >= o.diameter / 2)) throw Error('Conduit needs a positive diameter and wall thickness smaller than its radius.');
  if (o.source !== undefined) {
    const s = o.source;
    if (!s || typeof s.elementId !== 'string' || s.elementId.length > 160 || typeof s.revision !== 'string' || s.revision.length > 20000 || !finite(s.unitScale) || s.unitScale <= 0 || s.unitScale > 10000 || !['m', 'mm', 'Å', 'unit'].includes(s.units)) throw Error('Invalid source calibration.');
  }
  if(o.kind==='wall' && o.openings)validateOpenings(o);
  if(o.kind==='conduit' && (o.bendRadius || p.some(v=>v.length===3))) { if(o.bendRadius!==undefined && (!finite(o.bendRadius)||o.bendRadius<0||o.bendRadius>10000))throw Error('Invalid bend radius.');pipePath(o);return null; }
  return offsets(p);
}
// Miter vectors are perpendicular to each segment and shared by adjacent rings.
export function offsets(path) {
  const normals = path.slice(1).map((b, i) => {
    const a = path[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1e-8) throw Error('Path contains duplicate consecutive points.');
    return [-dy / length, dx / length];
  });
  return path.map((_, i) => {
    if (i === 0) return normals[0];
    if (i === path.length - 1) return normals.at(-1);
    const a = normals[i - 1], b = normals[i], denominator = 1 + a[0] * b[0] + a[1] * b[1];
    if (denominator < .125) throw Error('Path turns too sharply for a bounded miter. Add a gentler corner.');
    return [(a[0] + b[0]) / denominator, (a[1] + b[1]) / denominator];
  });
}
export function pathFootprint(o, frames = offsets(o.path)) {
  const width = o.kind === 'wall' ? o.thickness : o.diameter;
  const left = o.kind === 'wall' && o.alignment === 'left' ? width : o.kind === 'wall' && o.alignment === 'right' ? 0 : width / 2;
  const side = distance => o.path.map((p, i) => [p[0] + frames[i][0] * distance, p[1] + frames[i][1] * distance]);
  return [...side(left), ...side(left - width).reverse()];
}
// A swept circular section stays CIRCULAR through a corner; only its plane
// turns. The miter frame is deliberately longer than unit so a wall keeps a
// constant thickness through a corner, which is right for an offset footprint
// and wrong for a radial sweep -- used as a radius it stretched the section by
// the miter factor, so a round pipe left a 90-degree corner as a 1.41:1 ellipse.
// The direction is kept, the length dropped, and the section is placed on the
// unit normal plus world Z.
function sectionFrame(frames) {
  return frames.map(([x, y]) => {
    const length = Math.hypot(x, y);
    return length < 1e-8 ? [1, 0] : [x / length, y / length];
  });
}

export function pathSolidMesh(o) {
  const frames = validatePathSolid(o), vertices = [], triangles = [], components = [];
  if(o.kind==='wall' && o.openings?.length)return wallWithOpenings(o,frames);
  if(o.kind==='conduit' && frames===null)return pipeMesh(o);
  const quad = (a, b, c, d, id) => { triangles.push([a, b, c], [a, c, d]); components.push(id, id); };
  if (o.kind === 'wall') {
    const left = o.alignment === 'left' ? o.thickness : o.alignment === 'right' ? 0 : o.thickness / 2;
    o.path.forEach((p, i) => {
      for (const [side, z] of [[left, 0], [left - o.thickness, 0], [left - o.thickness, o.height], [left, o.height]]) vertices.push([p[0] + frames[i][0] * side, p[1] + frames[i][1] * side, z]);
    });
    for (let i = 0; i < o.path.length - 1; i++) for (let j = 0; j < 4; j++) quad(i * 4 + j, i * 4 + (j + 1) % 4, (i + 1) * 4 + (j + 1) % 4, (i + 1) * 4 + j, `${o.topology.edges[i]}:side${j}`);
    quad(3, 2, 1, 0, `${o.topology.vertices[0]}:cap`);
    const end = vertices.length - 4; quad(end, end + 1, end + 2, end + 3, `${o.topology.vertices.at(-1)}:cap`);
  } else {
    const sides = 24, stride = sides * 2, unit = sectionFrame(frames);
    o.path.forEach((p, i) => {
      for (const radius of [o.diameter / 2, o.diameter / 2 - o.wallThickness]) for (let j = 0; j < sides; j++) {
        const angle = j * Math.PI * 2 / sides, across = radius * Math.cos(angle);
        vertices.push([p[0] + unit[i][0] * across, p[1] + unit[i][1] * across, radius * Math.sin(angle)]);
      }
    });
    for (let i = 0; i < o.path.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * stride + j, b = i * stride + (j + 1) % sides;
      quad(a, b, b + stride, a + stride, `${o.topology.edges[i]}:outer`);
      quad(a + sides, a + sides + stride, b + sides + stride, b + sides, `${o.topology.edges[i]}:inner`);
    }
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides, end = (o.path.length - 1) * stride;
      quad(j, j + sides, next + sides, next, `${o.topology.vertices[0]}:cap`);
      quad(end + j, end + next, end + next + sides, end + j + sides, `${o.topology.vertices.at(-1)}:cap`);
    }
  }
  if (o.kind === 'wall') triangles.forEach(face => face.reverse());
  return { vertices, triangles, components };
}
