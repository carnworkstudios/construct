// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Canworks, LLC
//
// ONE registry, TWO optional representations.
//
// A domain kit entry may carry `svg` (2D notation) and/or `solid` (a 3D recipe).
// They are deliberately NOT projections of each other: the benzene SYMBOL is a
// hexagon with an inscribed circle, which is a notational convention, not a
// rendering of benzene's geometry. Deriving one from the other produces a
// drawing no chemist reads, so an entry simply declares whichever it has.
//
// The 2D symbol picker shows every entry; the 3D workspace shows only entries
// with a `solid`. Adding a thing is one edit in one place either way.
import { object } from './model.mjs';
import { CATALOG } from './catalog.mjs';

// A `solid` is a plain recipe, not a Three.js object: the workspace owns
// construction, so a kit never needs the 3D engine loaded to declare one.
const SOLID_KINDS = new Set(['box', 'sphere', 'cylinder', 'surface', 'vector', 'molecule', 'orbital', 'collision', 'mesh']);

export function solidToEntry(symbol) {
  const solid = symbol.solid;
  if (!solid || !SOLID_KINDS.has(solid.kind)) return null;
  const { kind, ...props } = solid;
  return {
    id: symbol.id,
    name: symbol.label || symbol.id,
    subject: symbol.subject,
    modes: symbol.modes || ['academic'],
    make: () => object(kind, symbol.label || symbol.id, structuredClone(props)),
  };
}

// Kit-contributed solids extend the built-in CATALOG, keyed by id. Where both
// define an id the built-in entry WINS: it is the 3D-native recipe, and its
// name is written for a 3D object list ("Water molecule") rather than for a
// symbol palette ("Molecule (bent)"). A kit only ever ADDS solids the built-in
// catalog does not already carry, so the two can never disagree on screen.
export function spatialCatalog(editor) {
  const kits = editor?._domainKits || {};
  const merged = new Map();
  for (const kit of Object.values(kits))
    for (const symbol of kit?.symbols || []) {
      const entry = solidToEntry(symbol);
      if (entry) merged.set(entry.id, entry);
    }
  for (const entry of CATALOG) merged.set(entry.id, entry);
  return [...merged.values()];
}
