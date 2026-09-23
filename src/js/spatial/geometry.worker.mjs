// SPDX-License-Identifier: MIT
// Version the worker contract dependency to avoid mixing cached tile formats.
import { compileExpression, surfaceTile } from './equations.mjs?v=1';
// One bounded request at a time; the host replaces this worker when a document changes.
self.onmessage = ({ data }) => {
  try {
    const { request, id, equation, min, max, resolution, time } = data;
    if (!Number.isInteger(resolution) || resolution < 8 || resolution > 128 ||
        ![min, max, time].every(Number.isFinite) || min >= max || max - min > 20000) throw Error('Invalid graph domain.');
    const fn = compileExpression(equation);
    for (let row = 0; row < resolution; row += 16) {
      const tile = surfaceTile(fn, { min, max, resolution }, time, row);
      self.postMessage({ request, id, row, ...tile }, [tile.positions.buffer, tile.normals.buffer, tile.indices.buffer]);
    }
    self.postMessage({ request, id, done: true });
  } catch (e) { self.postMessage({ request: data.request, id: data.id, error: e.message }); }
};
