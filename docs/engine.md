# GinexysEngine — Standalone Engine Reference

`GinexysEngine` is the computation layer extracted from Construct and exposed as a standalone namespace. The engines below run independently of the diagram UI — no SVG canvas, no editor state required.

```js
window.GinexysEngine = {
  PDFGeometryEngine, // vector topology engine  — worker-safe
  KDTree2D,          // 2D spatial index        — worker-safe
  QuadTree2D,        // 2D spatial partitioning — worker-safe
  CameraMatrix,      // pan/zoom/rotate math    — worker-safe
  version: '1.1.0'
}
```

The primary use case is **document intelligence**: extracting structured data (wires, components, connection graphs, table grids) from raw PDF vector streams or SVG files. `PDFGeometryEngine` is the workhorse; the spatial indexes and camera math are its supporting cast.

**Loading**

```html
<!-- browser -->
<script src="src/js/core/kdTree.js"></script>
<script src="src/js/core/quadTree.js"></script>
<script src="src/js/core/cameraMatrix.js"></script>
<script src="src/js/core/geometry-engine.standalone.js"></script>
<script src="src/js/core/engine.js"></script>

<!-- web worker -->
importScripts('kdTree.js', 'geometry-engine.standalone.js', 'engine.js');
```

---

## PDFGeometryEngine  *(worker-safe)*

A four-phase topology pipeline that takes raw vector element descriptors and returns a structured connection graph. Designed for analyzing engineering diagrams, circuit schematics, floorplans, and table grids extracted from PDFs or SVG files.

### The problem it solves

PDF renderers shatter continuous lines into dozens of 2–3 point segments. SVG files mix path geometry with transform stacks. Neither format gives you "this is a wire connecting component A to component B." PDFGeometryEngine normalizes raw geometry into a topology graph you can reason about.

```
Phase 1 — Transform baking   Flatten nested SVG transforms to page-space (DOMMatrix/DOMPoint)
Phase 2 — Collinear merge    Group fragmented segments by angle + axis band, merge chains
Phase 3 — Classification     Score each element: linearity/circularity → wire/component/connector
Phase 4 — Topology + graph   KDTree2D vertex snapping, port discovery, adjacency graph
```

### Constructor

```js
const engine = new GinexysEngine.PDFGeometryEngine({
  eps:          8,    // vertex snap tolerance in px (default 8)
  linTolerance: 0.82, // linearity threshold for wires (default 0.82)
  cirTolerance: 0.75, // circularity threshold for components (default 0.75)
});
```

### Descriptor contract

The engine accepts an array of plain JS descriptor objects — no SVG DOM elements. Each descriptor maps to one SVG element:

```js
const descriptor = {
  id:        'el-001',                    // unique string ID
  tagName:   'path',                      // 'path'|'line'|'polyline'|'circle'|'rect'|'ellipse'|'g'
  cmds:      [...],                       // path command array (for tagName='path')
  pts:       [x1, y1, x2, y2],           // point array (for line/polyline)
  bbox:      { x, y, width, height },    // pre-computed bounding box
  attrs: {
    stroke:           '#000',
    fill:             'none',
    'stroke-width':   '1',
    'class':          'wire',             // optional CSS class
    'data-geo-class': 'component',        // optional explicit class hint
    'data-symbol':    'resistor',         // optional symbol type
  },
  transform: 'matrix(1,0,0,1,10,20)'     // SVG transform string, or null
};
```

> **Note:** You do not need to provide `cmds`, `pts`, and `bbox` manually when working with a live SVG. Use `PDFGeometryEngine.serialize(svgEl)` to walk the DOM and produce the descriptor array automatically.

### analyze(descriptors)

The main entry point. Runs all four phases and returns a structured result.

```js
const result = engine.analyze(descriptors);

// result shape:
{
  wires:      Wire[],         // classified wire elements with topology scores
  components: Component[],    // classified component elements
  connectors: Connector[],    // junction/crossing points
  ports:      Port[],         // connection endpoints
  graph:      AdjacencyGraph,
  tableRules: Wire[],         // subset of wires likely to be table grid lines
}
```

**Wire object**

```js
{
  id:        string,
  pts:       number[],  // [x1,y1, x2,y2, ...]  baked to page-space
  linearity: number,    // 0–1, how straight the path is
  length:    number,    // total arc length in px
  width:     number,    // stroke-width
  angle:     number,    // dominant angle in degrees [0, 180)
}
```

**AdjacencyGraph object**

```js
{
  nodes: {
    [id]: { type: 'wire'|'component'|'port', refs: string[] }
  },
  edges: [
    { from: string, to: string, via: 'port'|'junction' }
  ],
  junctions: Port[]
}
```

### getTableRuleCandidates(wires)

Filters a wire array to those matching the table grid line heuristic: **linearity ≥ 0.88, stroke-width ≤ 2, length > 20px**. The output is the hand-off to a lattice reconstructor.

```js
const tableRules = engine.getTableRuleCandidates(result.wires);
// → Wire[] — only the likely horizontal/vertical grid rules
```

### PDFGeometryEngine.serialize(svgEl) — static

Main-thread helper. Walks a live SVG DOM element and produces the descriptor array for `analyze()`. Handles transform extraction, path command pre-parsing, and bounding box computation. Run this on the main thread, then transfer the descriptor array to a worker.

```js
// Main thread
const svgEl = document.querySelector('#diagram svg');
const descriptors = GinexysEngine.PDFGeometryEngine.serialize(svgEl);

// Transfer to worker
worker.postMessage({ descriptors });

// Worker
self.onmessage = function (e) {
  const engine = new GinexysEngine.PDFGeometryEngine();
  const result = engine.analyze(e.data.descriptors);
  self.postMessage(result);
};
```

### Collinear segment merger

PDF.js operator streams regularly shatter a single line into 20–50 tiny segments. `analyze()` runs `_mergeCollinearSegments` automatically before classification. The merger:

1. Scores each segment — discards non-linear candidates (linearity < 0.88)
2. Normalizes angle to `[0, π)` and computes an axis band key (horizontal, vertical, or diagonal bucket)
3. Groups by `(angleBucket, axisBand)` — segments that are parallel *and* co-linear land in the same group
4. Sorts by primary axis coordinate and merges chains where the gap between consecutive segments is ≤ `joinTolerance` (default 3px)
5. On horizontal merges: spans full X range, averages Y to absorb micro-drift

**Tuning parameters**

```js
{
  joinTolerance: 3,  // max gap (px) between collinear segments to merge
  bandTolerance: 2,  // max perpendicular drift (px) within the same axis band
  angleTol:      1,  // angle bucket size in degrees
}
```

---

## KDTree2D  *(worker-safe)*

A 2D k-d tree for fast spatial queries. Used internally by PDFGeometryEngine for vertex snapping and port discovery.

### API

```js
const tree = new GinexysEngine.KDTree2D();

tree.insert(x, y, payload);

tree.rangeQuery(cx, cy, radius);
// → [{ x, y, data: payload }, ...]

tree.nearest(x, y);
// → { x, y, data: payload } | null
```

### Example — vertex snapping

```js
const snapTree = new GinexysEngine.KDTree2D();

result.wires.forEach(function (w) {
  snapTree.insert(w.pts[0], w.pts[1], { wireId: w.id, end: 'start' });
  const last = w.pts.length - 2;
  snapTree.insert(w.pts[last], w.pts[last + 1], { wireId: w.id, end: 'end' });
});

// Find all wire endpoints within 8px of a target
const nearby = snapTree.rangeQuery(targetX, targetY, 8);
// → [{ x, y, data: { wireId, end } }, ...]
```

---

## QuadTree2D  *(worker-safe)*

A 2D quadtree for spatial partitioning. Used by the editor canvas for viewport culling and overlap detection.

```js
const qt = new GinexysEngine.QuadTree2D({ x: 0, y: 0, width: 2000, height: 2000 });

qt.insert({ x: 10, y: 10, width: 50, height: 50 }, payload);

qt.retrieve({ x: 0, y: 0, width: 100, height: 100 });
// → payload[]

qt.query(px, py);
// → payload[]
```

---

## CameraMatrix  *(browser · main-thread)*

Pan/zoom/rotate math for SVG canvas views. Manages the current camera transform and converts between screen-space and world-space coordinates.

```js
const cam = new GinexysEngine.CameraMatrix();

cam.pan(dx, dy);
cam.zoom(factor, originX, originY);  // zoom toward a point
cam.rotateTo(angleDeg);

cam.screenToWorld(sx, sy);  // → { x, y }
cam.worldToScreen(wx, wy);  // → { x, y }

cam.toCSSMatrix();  // → 'matrix(s,0,0,s,tx,ty)'
```

> CameraMatrix uses `DOMMatrix` for all math and is technically worker-safe, but its primary use is setting CSS transforms on DOM elements. In practice it runs on the main thread.

---

## Related

- [Getting Started](getting-started.md)
- [Features](features.md)
- [Modes](modes.md)
- [TafneEngine Reference](../../table-formatter/docs/engine.md)
