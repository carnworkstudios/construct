// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Canworks, LLC
//
// PUBLIC CONTRACT — MIT, deliberately.
//
// Notation symbols decide nothing: they render something the user already has.
// Anyone can draw a force arrow or a benzene hexagon, so gating these defends
// nothing and costs the conversion of the researcher who came looking for them.
// The INTELLIGENCE that reads notation (SMILES -> structure, reaction
// balancing, valence checking) is the moat, and it lives in the root.
// See architecture/three-tier-architecture.md.

/* ============================================================
   Schematics Editor — Research / Academic Domain Kit

   Entries carry `svg` notation and, where the thing is genuinely
   spatial, a `solid` 3D recipe. They are NOT projections of each
   other: a benzene symbol is a hexagon with an inscribed circle,
   which is a convention, not a view of benzene's geometry.

   Reaction schemes, free-body and energy diagrams stay 2D on
   purpose — they are labelled graphs, not shapes, and a 3D
   layout for them would carry no meaning.
   ============================================================ */

(function () {
    const CLR = '#4facfe';
    const INK = 'currentColor';
    const ACC = '#d76b64';
    const W   = '1.8';
    // Element colors match the 3D viewport (viewport.mjs COLORS) so a molecule
    // reads the same in both representations.
    const O_CLR = '#d76b64', H_CLR = '#dfe6ea', N_CLR = '#5b7fc7', C_CLR = '#5a6b73';

    const sym = (id, label, group, svg, extra = {}) => ({
        id, label, group,
        defaultValue: extra.defaultValue ?? label,
        geoClass: extra.geoClass || 'annotation',
        previewViewBox: extra.viewBox || '0 0 90 55',
        svgPreview: svg, svgContent: svg,
        ...(extra.solid ? { solid: extra.solid, subject: extra.subject, modes: extra.modes } : {}),
        ...(extra.subject ? { subject: extra.subject } : {}),
    });

    const SYMBOLS = [
        // ── PHYSICS: MECHANICS ────────────────────────────────
        sym('research-vector', 'Vector', 'Physics · Mechanics',
            `<path d="M10 45 L65 10 L57 28 M65 10 L45 12" fill="none" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'physics', solid: { kind: 'vector', vector: [3, 2, 4], color: '#b27724' }, modes: ['academic'] }),
        sym('research-force', 'Force', 'Physics · Mechanics',
            `<path d="M8 32 H60 M52 24 L60 32 L52 40" fill="none" stroke="${INK}" stroke-width="2"/><text x="30" y="22" font-size="13" fill="${INK}" font-style="italic" class="sym-value">F</text>`,
            { subject: 'physics', defaultValue: 'F' }),
        sym('research-mass', 'Mass', 'Physics · Mechanics',
            `<rect x="10" y="10" width="60" height="35" fill="none" stroke="${INK}" stroke-width="2"/><text x="40" y="33" text-anchor="middle" font-size="14" fill="${INK}" font-style="italic" class="sym-value">m</text>`,
            { subject: 'physics', geoClass: 'component', defaultValue: 'm' }),
        sym('research-spring', 'Spring', 'Physics · Mechanics',
            `<path d="M6 28 H20 l5-10 8 20 8-20 8 20 8-20 5 10 H72" fill="none" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'physics', geoClass: 'component' }),
        sym('research-pivot', 'Pivot / fulcrum', 'Physics · Mechanics',
            `<path d="M40 14 L58 44 H22 Z" fill="none" stroke="${INK}" stroke-width="2"/><path d="M12 46 H68" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'physics' }),
        sym('research-incline', 'Inclined plane', 'Physics · Mechanics',
            `<path d="M8 46 H76 L8 16 Z" fill="none" stroke="${INK}" stroke-width="2"/><path d="M26 40 a16 16 0 0 0 5-11" fill="none" stroke="${ACC}" stroke-width="1.4"/><text x="34" y="43" font-size="10" fill="${ACC}">θ</text>`,
            { subject: 'physics' }),
        sym('research-collision', 'Elastic collision', 'Physics · Mechanics',
            `<circle cx="24" cy="30" r="11" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="62" cy="30" r="11" fill="none" stroke="${INK}" stroke-width="2"/><path d="M38 30 H48 M44 26 L48 30 L44 34" fill="none" stroke="${ACC}" stroke-width="1.6"/>`,
            { subject: 'physics', solid: { kind: 'collision' }, modes: ['academic'] }),

        // ── PHYSICS: FIELDS, ENERGY, GRAVITATION ──────────────
        sym('research-field-lines', 'Field lines', 'Physics · Fields',
            `<path d="M14 12 C34 24 34 36 14 48 M32 12 C52 24 52 36 32 48 M50 12 C70 24 70 36 50 48" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M60 26 l6 4 -6 4" fill="none" stroke="${INK}" stroke-width="1.6"/>`,
            { subject: 'physics' }),
        sym('research-charge', 'Point charge', 'Physics · Fields',
            `<circle cx="40" cy="28" r="13" fill="none" stroke="${INK}" stroke-width="2"/><path d="M33 28 H47 M40 21 V35" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'physics', geoClass: 'component', defaultValue: '+q' }),
        sym('research-energy-level', 'Energy levels', 'Physics · Energy',
            `<path d="M14 44 H66 M14 30 H66 M14 18 H50" stroke="${INK}" stroke-width="2"/><path d="M58 30 V44 M55 41 l3 3 3-3" fill="none" stroke="${ACC}" stroke-width="1.4"/><text x="70" y="21" font-size="10" fill="${INK}">E</text>`,
            { subject: 'physics' }),
        sym('research-wave', 'Wave', 'Physics · Energy',
            `<path d="M8 30 q9-18 18 0 t18 0 t18 0 t18 0" fill="none" stroke="${INK}" stroke-width="2"/><path d="M8 46 H62 M8 44 V48 M62 44 V48" stroke="${ACC}" stroke-width="1.2"/><text x="30" y="52" font-size="9" fill="${ACC}">λ</text>`,
            { subject: 'physics' }),
        sym('research-gravitation', 'Gravitation', 'Physics · Gravitation',
            `<circle cx="26" cy="30" r="12" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="66" cy="30" r="6" fill="none" stroke="${INK}" stroke-width="2"/><path d="M40 30 H56 M52 27 l4 3 -4 3" fill="none" stroke="${ACC}" stroke-width="1.5"/><path d="M52 30 H40 M44 27 l-4 3 4 3" fill="none" stroke="${ACC}" stroke-width="1.5"/>`,
            { subject: 'physics' }),
        sym('research-circuit-cell', 'Cell / EMF', 'Physics · Electricity',
            `<path d="M10 30 H32 M32 18 V42 M44 12 V48 M44 30 H70" fill="none" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'physics', geoClass: 'component' }),

        // ── CHEMISTRY: NOTATION ───────────────────────────────
        sym('research-molecule', 'Molecule (bent)', 'Chemistry · Structure',
            `<path d="M20 40 L40 18 L65 40" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="40" cy="18" r="9" fill="${O_CLR}"/><circle cx="20" cy="40" r="6" fill="${H_CLR}" stroke="${INK}" stroke-width=".6"/><circle cx="65" cy="40" r="6" fill="${H_CLR}" stroke="${INK}" stroke-width=".6"/>`,
            { subject: 'chemistry', solid: { kind: 'molecule', atoms: [
                { element: 'O', position: [0, 0, 0] }, { element: 'H', position: [.76, .59, 0] }, { element: 'H', position: [-.76, .59, 0] }], bonds: [[0, 1], [0, 2]] }, modes: ['academic'] }),
        sym('research-benzene', 'Benzene ring', 'Chemistry · Structure',
            `<path d="M40 10 L64 24 V48 L40 62 L16 48 V24 Z" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="40" cy="36" r="13" fill="none" stroke="${INK}" stroke-width="1.6"/>`,
            { subject: 'chemistry', viewBox: '0 0 80 72', geoClass: 'component' }),
        sym('research-bond-double', 'Double bond', 'Chemistry · Structure',
            `<path d="M12 25 H68 M12 35 H68" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'chemistry' }),
        sym('research-bond-triple', 'Triple bond', 'Chemistry · Structure',
            `<path d="M12 21 H68 M12 30 H68 M12 39 H68" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'chemistry' }),
        sym('research-atom', 'Atom / nucleus', 'Chemistry · Structure',
            `<circle cx="40" cy="28" r="7" fill="${ACC}"/><ellipse cx="40" cy="28" rx="30" ry="12" fill="none" stroke="${INK}" stroke-width="1.5"/><ellipse cx="40" cy="28" rx="30" ry="12" fill="none" stroke="${INK}" stroke-width="1.5" transform="rotate(60 40 28)"/>`,
            { subject: 'chemistry', geoClass: 'component' }),
        sym('research-orbital', 'p orbital lobes', 'Chemistry · Structure',
            `<path d="M40 28 C22 8 10 28 40 28 C70 28 58 8 40 28" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M40 28 C22 48 10 28 40 28 C70 28 58 48 40 28" fill="none" stroke="${ACC}" stroke-width="1.8"/>`,
            { subject: 'chemistry', solid: { kind: 'orbital' }, modes: ['academic'] }),
        sym('research-methane', 'Tetrahedral centre', 'Chemistry · Structure',
            `<path d="M40 30 L40 10 M40 30 L22 42 M40 30 L58 42 M40 30 L52 20" fill="none" stroke="${INK}" stroke-width="1.8"/><circle cx="40" cy="30" r="7" fill="${C_CLR}"/>`,
            { subject: 'chemistry', solid: { kind: 'molecule', atoms: [
                { element: 'C', position: [0, 0, 0] },
                ...[[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map(p => ({ element: 'H', position: p.map(n => n * .63) }))],
                bonds: [[0, 1], [0, 2], [0, 3], [0, 4]] }, modes: ['academic'] }),
        sym('research-peptide', 'Peptide backbone', 'Chemistry · Structure',
            `<path d="M8 38 L22 26 L36 38 L50 26 L64 38 L78 26" fill="none" stroke="${INK}" stroke-width="1.8"/><circle cx="22" cy="26" r="5" fill="${N_CLR}"/><circle cx="50" cy="26" r="5" fill="${N_CLR}"/><circle cx="36" cy="38" r="5" fill="${O_CLR}"/>`,
            { subject: 'chemistry', viewBox: '0 0 86 55', solid: { kind: 'molecule', atoms:
                ['N', 'C', 'C', 'O', 'N', 'C', 'C', 'O'].map((element, i) => ({ element, position: [[-3, 0, 0], [-2, 1, 0], [-1, .5, .5], [-1, -.7, .6], [0, 1.1, 1], [1.2, .5, 1.3], [2.3, 1.2, .7], [2.4, 2.4, .7]][i] })),
                bonds: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [6, 7]] }, modes: ['academic'] }),

        sym('research-lattice', 'Crystal lattice (bcc)', 'Chemistry · Structure',
            `<path d="M14 18 H58 V48 H14 Z M28 8 H72 V38 H28 M14 18 L28 8 M58 18 L72 8 M58 48 L72 38 M14 48 L28 38" fill="none" stroke="${INK}" stroke-width="1.5"/><circle cx="43" cy="28" r="5" fill="${ACC}"/>`,
            { subject: 'chemistry', viewBox: '0 0 86 58', solid: { kind: 'molecule', atoms: [
                ...[[0,0,0],[2,0,0],[0,2,0],[2,2,0],[0,0,2],[2,0,2],[0,2,2],[2,2,2]].map(p => ({ element: 'Na', position: p })),
                { element: 'Cl', position: [1, 1, 1] }],
                // Body centre to each corner: the bcc motif, drawn not inferred.
                bonds: [0,1,2,3,4,5,6,7].map(i => [8, i]) }, modes: ['academic'] }),

        // ── CHEMISTRY: REACTIONS (2D ONLY — these are graphs) ──
        sym('research-reaction-arrow', 'Reaction arrow', 'Chemistry · Reaction',
            `<path d="M8 30 H66 M58 23 L66 30 L58 37" fill="none" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'chemistry' }),
        sym('research-equilibrium', 'Equilibrium', 'Chemistry · Reaction',
            `<path d="M8 24 H66 M58 18 L66 24 M66 36 H8 M16 30 L8 36" fill="none" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'chemistry' }),
        sym('research-catalyst-arrow', 'Arrow with condition', 'Chemistry · Reaction',
            `<path d="M8 34 H66 M58 27 L66 34 L58 41" fill="none" stroke="${INK}" stroke-width="2"/><text x="34" y="24" text-anchor="middle" font-size="11" fill="${INK}" class="sym-value">cat.</text>`,
            { subject: 'chemistry', defaultValue: 'cat.' }),
        sym('research-substrate', 'Substrate / surface', 'Chemistry · Reaction',
            `<rect x="8" y="32" width="64" height="14" fill="none" stroke="${INK}" stroke-width="2"/><path d="M12 32 V26 M24 32 V26 M36 32 V26 M48 32 V26 M60 32 V26" stroke="${INK}" stroke-width="1.4"/>`,
            { subject: 'chemistry', geoClass: 'component' }),
        sym('research-flask', 'Reaction vessel', 'Chemistry · Apparatus',
            `<path d="M32 8 V26 L14 48 H66 L48 26 V8 M28 8 H52" fill="none" stroke="${INK}" stroke-width="2"/><path d="M22 40 H58" stroke="${ACC}" stroke-width="1.6"/>`,
            { subject: 'chemistry', geoClass: 'component' }),

        // ── MATH: NOTATION (2D — the gap the 3D surface never filled) ──
        sym('research-axes', 'Graph axes', 'Math · Notation',
            `<path d="M10 5 V45 H75 M5 12 L10 5 L15 12 M68 40 L75 45 L68 50" fill="none" stroke="${INK}" stroke-width="2"/>`,
            { subject: 'math' }),
        sym('research-axes-3d', 'Axes (3D)', 'Math · Notation',
            `<path d="M20 45 V8 M20 45 H76 M20 45 L4 54" fill="none" stroke="${INK}" stroke-width="2"/><text x="24" y="12" font-size="10" fill="${INK}">z</text><text x="70" y="40" font-size="10" fill="${INK}">x</text><text x="4" y="48" font-size="10" fill="${INK}">y</text>`,
            { subject: 'math', viewBox: '0 0 90 60' }),
        sym('research-equation', 'Equation', 'Math · Notation',
            `<text x="5" y="34" font-size="18" fill="${INK}" font-style="italic" class="sym-value">z = f(x,y,t)</text>`,
            { subject: 'math', defaultValue: 'z = f(x,y,t)' }),
        sym('research-integral', 'Integral', 'Math · Notation',
            `<text x="18" y="40" font-size="34" fill="${INK}" font-style="italic" class="sym-value">∫</text><text x="36" y="40" font-size="14" fill="${INK}" font-style="italic">f(x) dx</text>`,
            { subject: 'math', defaultValue: '∫ f(x) dx' }),
        sym('research-summation', 'Summation', 'Math · Notation',
            `<text x="18" y="40" font-size="30" fill="${INK}" class="sym-value">∑</text><text x="42" y="38" font-size="14" fill="${INK}" font-style="italic">aₙ</text>`,
            { subject: 'math', defaultValue: '∑ aₙ' }),
        sym('research-matrix', 'Matrix', 'Math · Notation',
            `<path d="M16 10 h-6 v36 h6 M64 10 h6 v36 h-6" fill="none" stroke="${INK}" stroke-width="1.8"/><text x="40" y="25" text-anchor="middle" font-size="11" fill="${INK}">a  b</text><text x="40" y="41" text-anchor="middle" font-size="11" fill="${INK}">c  d</text>`,
            { subject: 'math', geoClass: 'component' }),
        sym('research-number-line', 'Number line', 'Math · Notation',
            `<path d="M6 30 H74 M10 25 L6 30 L10 35 M70 25 L74 30 L70 35" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M24 25 V35 M40 25 V35 M56 25 V35" stroke="${INK}" stroke-width="1.4"/>`,
            { subject: 'math' }),
        sym('research-surface', 'Equation surface', 'Math · Notation',
            `<path d="M8 40 q18-22 36 0 t36 0" fill="none" stroke="${INK}" stroke-width="2"/><path d="M8 48 q18-22 36 0 t36 0" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".55"/>`,
            { subject: 'math', solid: { kind: 'surface', equation: 'sin(sqrt(x^2+y^2)-t)', min: -5, max: 5, resolution: 64 }, modes: ['academic', 'software', 'general'] }),
    ];

    function registerAcademic() {
        if (typeof window.editor === 'undefined' || !window.editor.registerDomainKit) return false;
        window.editor.registerDomainKit('academic', {
            label: 'Research / Academic',
            icon: 'material-symbols:science-outline',
            symbols: SYMBOLS,
            exportOptions: ['svg', 'png', 'pdf'],
        });
        return true;
    }
    window.GxAcademicKit = { SYMBOLS, register: registerAcademic };

    const start = () => { if (!registerAcademic()) { let n = 0; const t = setInterval(() => { if (registerAcademic() || ++n >= 40) clearInterval(t); }, 100); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
