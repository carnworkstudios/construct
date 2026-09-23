# 📐 Construct

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)

A browser-native CAD, diagramming, and scientific-modeling workspace for turning
2D plans, routes, and profiles into inspectable 3D geometry. Construct supports
electrical schematics and PCB layouts, software architecture diagrams, construction
plans, spatial data, and Research / Academic work in physics, chemistry, and math.

![Construct Demo](./assets/schema-demo.gif)

## 💡 Why Construct?

Most web-based drawing tools are either generic (Figma/Canva) or overly complex legacy CAD ports. **Construct** bridges the gap: it provides the precision and domain-specific logic of engineering software with the speed and accessibility of a modern web app.

### What makes Construct useful

* **One 2D-to-3D geometry model**: closed profiles can be filled, combined, and extruded; open lines, polylines, and wires can be swept into physical routes such as walls or conduit.
* **2D and 3D Boolean operations**: Union, Subtract, and Intersect create closed planar profiles in 2D and robust mesh results in 3D. Interior contours are retained as extrusion holes.
* **Parametric and direct modeling**: create primitives, extrusions, path solids, constrained features, and imported meshes; then transform objects or edit mesh vertices, edges, and faces.
* **Engineering-aware drawing**: Manhattan routing, wire tracing, netlists, BOMs, calibrated measurement, snapping, layers, and domain symbol kits.
* **Research / Academic workspace**: equation surfaces and animation, vector and matrix views, collision demonstrations, PDB/CUBE/CSV/STL/OBJ import, molecule and orbital views, labels, and graph-sample transfer to Table IDE.
* **Browser-native performance**: the 2D editor stays light; Three.js, Manifold WASM, and workers load only when 3D is opened. Vendored dependencies keep the workspace self-contained without a CDN.

---

## 🛠 Features at a Glance

* **CAD drawing rules**: open geometry is stroke-only; closed geometry owns fills and can become a profile, Boolean result, or 3D solid.
* **Precision canvas**: pan, zoom, touch/stylus input, grid and object snapping, layers, locking, grouping, and calibrated metric or imperial measurements.
* **3D scene tools**: camera views, 2D underlay, wireframe, levels, scene save/load, STL/OBJ export, and bounded undo/redo.
* **Model inspection**: labels and tags can target objects, mesh components, path components, and molecular atoms, residues, or chains.
* **Cross-tool work**: export SVG, PDF, HPGL, JSON, netlists, BOMs, graph samples, SQL DDL, Mermaid, and XState; send structured data to [Table IDE](https://github.com/carnworkstudios/table-ide) where available.

---

## 📚 Domain Modes

### ⚡ Electrical & PCB
Draw connectivity with specialized components, routing, trace mode, netlists, and BOM export. Physical wire routes can become rectangular or circular 3D runs; closed PCB-like outlines can become substrates or other extruded geometry.

### ◈ Software Design
Build UML diagrams, ERDs, state machines, and sequence diagrams with routing and Mermaid-compatible export. Import or create spatial data as point clouds and meshes, then inspect it in wireframe or edit its components.

### 🏗 Construction & AEC
Turn plan geometry into 3D. Closed floor plans and footprints extrude into solids; open routes sweep into aligned walls or hollow conduit. Use levels, elevation, openings, 2D underlay alignment, and editable meshes to inspect a plan in space.

### 🧪 Research / Academic
Use the academic kit for physics, chemistry, and math notation in 2D, then explore models in 3D. Plot and animate safe `z = f(x,y,t)` equations, view vectors and matrix transforms, demonstrate elastic collisions, inspect PDB proteins and peptides, display molecular styles and orbitals, import CUBE scalar fields, and label significant structures.

## 📐 How 2D becomes 3D

Construct interprets the canvas as the XY plane and uses Z for elevation. This
makes a drawing a source of geometry rather than a disconnected picture:

1. Draw a **closed profile** such as a polygon, circle, closed path, or 2D Boolean result. Apply a fill if useful, then solidify it as an extrusion. Subtractions retain interior voids.
2. Draw an **open route** such as a line, polyline, or wire. It remains unfilled in 2D and can be swept into a rectangular or hollow circular solid in 3D.
3. Place the original drawing on the 3D underlay, inspect the result from any camera angle, and bake supported procedural geometry to edit vertices, edges, and faces.

See the [3D guide](docs/3d-guide.md) for object types, limits, performance design,
and scientific scope. The [workspace guide](docs/spatial-workspace.md) documents
the interactive controls and supported import formats.

---

## 🏁 Getting Started

### Quick Start
1.  Clone the repository:
    ```bash
    git clone https://github.com/carnworkstudios/schema-editor.git
    ```
2.  Open `index.html` in any modern browser.
3.  For a full experience with file loading, use a local server:
    ```bash
    npx http-server ./src
    ```

### Requirements
*   A modern web browser (Chrome, Firefox, Safari, or Edge).
*   No build step required. Just code and run.

---

## 🤝 Contributing

We love contributors! Whether you're adding a new symbol to a domain kit or optimizing the routing engine, your help is welcome.

1.  Check the [Issues](https://github.com/carnworkstudios/schema-editor/issues) for "good first issue" tags.
2.  Read our [Contributing Guide](docs/CONTRIBUTING.md).
3.  Join the discussion in the [Discussions](https://github.com/carnworkstudios/schema-editor/discussions) tab.

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 GINEXYS
