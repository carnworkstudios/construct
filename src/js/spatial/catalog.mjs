// SPDX-License-Identifier: MIT
// Built-in 3D recipes. Ids are shared with the academic kit
// (src/js/domains/academicKit.js) so a kit entry carrying a `solid` REPLACES
// its twin here rather than appearing beside it as a duplicate.
import { object } from './model.mjs';
export const CATALOG = [
  { id: 'box', name: 'Parametric block', modes: ['general', 'electrical', 'construction', 'software'], make: () => object('box', 'Block', { position: [0, 0, .5] }) },
  { id: 'sphere', name: 'Sphere', modes: ['general', 'academic', 'software'], make: () => object('sphere', 'Sphere', { position: [0, 0, 1] }) },
  { id: 'cylinder', name: 'Cylinder / column', modes: ['general', 'construction', 'electrical'], make: () => object('cylinder', 'Column', { scale: [.5, .5, 3], position: [0, 0, 1.5] }) },
  { id: 'pcb', name: 'PCB substrate', modes: ['electrical'], make: () => object('box', 'PCB substrate (geometry only)', { scale: [10, 7, .16], color: '#278765', position: [0, 0, .08] }) },
  { id: 'wall', name: 'Wall', modes: ['construction'], make: () => object('box', 'Wall', { scale: [6, .2, 3], position: [0, 0, 1.5], color: '#829ca4' }) },
  { id: 'slab', name: 'Floor slab', modes: ['construction'], make: () => object('box', 'Floor slab', { scale: [8, 6, .2], position: [0, 0, -.1], color: '#a7b6bc' }) },
  { id: 'research-surface', name: 'Equation surface', modes: ['academic', 'software', 'general'], make: () => object('surface', 'Wave surface', { equation: 'sin(sqrt(x^2+y^2)-t)', min: -5, max: 5, resolution: 64 }) },
  { id: 'research-vector', name: 'Physics vector', subject: 'physics', modes: ['academic'], make: () => object('vector', 'Vector', { vector: [3, 2, 4], color: '#b27724' }) },
  { id: 'research-collision', name: 'Elastic collision', subject: 'physics', modes: ['academic'], make: () => object('collision', 'Equal-mass elastic collision') },
  { id: 'research-molecule', name: 'Water molecule', subject: 'chemistry', modes: ['academic'], make: () => object('molecule', 'Water (illustrative coordinates)', { atoms: [
    { element: 'O', position: [0, 0, 0] }, { element: 'H', position: [.76, .59, 0] }, { element: 'H', position: [-.76, .59, 0] }], bonds: [[0, 1], [0, 2]] }) },
  { id: 'research-methane', name: 'Tetrahedral methane', subject: 'chemistry', modes: ['academic'], make: () => object('molecule', 'Methane (illustrative coordinates)', { atoms: [
    { element: 'C', position: [0, 0, 0] }, ...[[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map(position => ({ element: 'H', position: position.map(n => n * .63) }))], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]] }) },
  { id: 'research-peptide', name: 'Peptide backbone', subject: 'chemistry', modes: ['academic'], make: () => object('molecule', 'Peptide backbone (schematic)', {
    atoms: ['N', 'C', 'C', 'O', 'N', 'C', 'C', 'O'].map((element, i) => ({ element, position: [[-3, 0, 0], [-2, 1, 0], [-1, .5, .5], [-1, -.7, .6], [0, 1.1, 1], [1.2, .5, 1.3], [2.3, 1.2, .7], [2.4, 2.4, .7]][i] })), bonds: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [6, 7]] }) },
  { id: 'research-orbital', name: 'p orbital lobes', subject: 'chemistry', modes: ['academic'], make: () => object('orbital', 'p orbital (schematic phase lobes)') },
];
