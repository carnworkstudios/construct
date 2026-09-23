// SPDX-License-Identifier: MIT
// Small, bounded expression language. No eval, Function, property access or globals.
const FUNCTIONS = Object.freeze({ sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt,
  abs: Math.abs, exp: Math.exp, log: Math.log, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2 });
const BINARY = new Set(['min', 'max', 'pow', 'atan2']);
export function compileExpression(source, variables = ['x', 'y', 'z', 't']) {
  if (typeof source !== 'string' || source.length > 512) throw Error('Equation must be at most 512 characters.');
  const tokens = source.match(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_]+|\*\*|[^\s]/g) || [];
  if (tokens.length > 180) throw Error('Equation is too complex.');
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  function primary() {
    const token = take();
    if (token === '(') { const n = sum(); if (take() !== ')') throw Error('Missing closing parenthesis.'); return n; }
    if (/^(?:\d|\.\d)/.test(token || '')) {
      const n = Number(token); if (!Number.isFinite(n)) throw Error('Number is out of range.'); return () => n;
    }
    if (variables.includes(token)) return vars => vars[token] ?? 0;
    if (token === 'pi' || token === 'e') return () => token === 'pi' ? Math.PI : Math.E;
    if (Object.hasOwn(FUNCTIONS, token || '')) {
      if (take() !== '(') throw Error('Functions need parentheses.');
      const a = sum(); let b;
      if (BINARY.has(token)) { if (take() !== ',') throw Error(`${token} needs two arguments.`); b = sum(); }
      if (take() !== ')') throw Error('Unexpected function argument.');
      return vars => b ? FUNCTIONS[token](a(vars), b(vars)) : FUNCTIONS[token](a(vars));
    }
    throw Error(`Unknown equation token: ${token ?? 'end'}. Use x, y, z, t and named math functions.`);
  }
  function power() {
    const a = primary(); if (peek() === '^' || peek() === '**') { take(); const b = unary(); return v => a(v) ** b(v); } return a;
  }
  function unary() { if (peek() === '+' || peek() === '-') { const sign = take(); const a = unary(); return v => (sign === '-' ? -1 : 1) * a(v); } return power(); }
  function product() { let a = unary(); while (['*', '/'].includes(peek())) { const op = take(), l = a, b = unary(); a = v => op === '*' ? l(v) * b(v) : l(v) / b(v); } return a; }
  function sum() { let a = product(); while (['+', '-'].includes(peek())) { const op = take(), l = a, b = product(); a = v => op === '+' ? l(v) + b(v) : l(v) - b(v); } return a; }
  const fn = sum(); if (at !== tokens.length) throw Error(`Unexpected token: ${peek()}. Use * for multiplication.`);
  return fn;
}

// Each tile owns its vertices so transferable buffers can be replaced independently.
// Samples outside the real finite domain become holes, never triangles to Infinity.
export function surfaceTile(fn, { min, max, resolution }, time, row, rows = 16) {
  const end = Math.min(resolution, row + rows), width = resolution + 1;
  const positions = new Float32Array((end - row + 1) * width * 3);
  const valid = new Uint8Array(positions.length / 3);
  const vars = { x: 0, y: 0, z: 0, t: time };
  for (let j = row; j <= end; j++) for (let i = 0; i <= resolution; i++) {
    vars.x = min + (max - min) * i / resolution; vars.y = min + (max - min) * j / resolution;
    const z = fn(vars), k = (j - row) * width + i;
    valid[k] = Number.isFinite(z) && Math.abs(z) <= 1e5 ? 1 : 0;
    positions.set([vars.x, vars.y, valid[k] ? z : 0], k * 3);
  }
  const indices = [];
  for (let j = 0; j < end - row; j++) for (let i = 0; i < resolution; i++) {
    const a = j * width + i, b = a + 1, c = a + width, d = c + 1;
    if (valid[a] && valid[b] && valid[c]) indices.push(a, b, c);
    if (valid[b] && valid[d] && valid[c]) indices.push(b, d, c);
  }
  // Compute normals here so the render thread only uploads completed buffers.
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return { positions, normals, indices: new Uint32Array(indices) };
}
