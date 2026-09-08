# 📐 Schema Editor

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)

A high-performance, browser-native vector design environment specifically optimized for **Electrical Schematics**, **Software Architecture**, and **Architectural Floorplans**.

![Schema Editor Demo](./assets/schema-demo.gif)

## 💡 Why Schema Editor?

Most web-based drawing tools are either generic (Figma/Canva) or overly complex legacy CAD ports. **Schema Editor** bridges the gap: it provides the precision and domain-specific logic of engineering software with the speed and accessibility of a modern web app.

### The "Magic" Features:
*   **🔌 Intelligent Manhattan Routing**: Automatic orthogonal wiring that stays clean as you move components.
*   **🔍 Real-Time Wire Tracing**: Instantly highlight the complete connectivity path of any signal or net.
*   **🏗 Domain-Specific Kits**: Pre-built, high-quality symbol libraries for Electrical (PCB/Circuit), Software (UML/ERD/FSM), and Construction (AEC/Floorplans).
*   **🚀 Zero Dependencies**: Built entirely with Vanilla JS and SVG. No heavy frameworks, no virtual DOM overhead—just pure performance.
*   **🎮 3D View Transformation**: Native Tilt, Yaw, and Perspective controls for interactive diagram presentations.

---

## 🛠 Features at a Glance

*   **Touch-Optimized Canvas**: Smooth pan/zoom with multi-touch and stylus support.
*   **Precision Snapping**: Intelligent grid and object snapping for pixel-perfect engineering.
*   **Layer Management**: Full control over visibility, locking, and stacking order.
*   **Measurement System**: Calibrated system supporting both Metric and Imperial units.
*   **Multi-Format Export**: Save as SVG, PDF, HPGL, JSON, or export netlists directly to [Table IDE](https://github.com/carnworkstudios/table-ide).

---

## 📚 Domain Modes

### ⚡ Electrical & PCB
Focus on connectivity. Specialized symbols for passive components, ICs, and connectors. Built-in logic for Netlist generation and BOM export.

### ◈ Software Design
Build UML diagrams, ERDs, and State Machines. Features auto-routing for sequence diagrams and Mermaid-compatible export.

### 🏗 Construction & AEC
Precision tools for architectural layouts. Includes symbols for walls, openings, MEP (Mechanical/Electrical/Plumbing), and site utilities.

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
