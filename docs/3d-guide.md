# Construct / 3D — what it actually does

A working tour of the 3D workspace: every object kind, what each one is for,
where the sharp edges are, and what is genuinely missing.

Open it with the **3D workspace** button in the 2D editor toolbar. Nothing 3D
loads until you press it — no Three.js, no WebGL context, no worker.

---

## 1. The mental model

The scene is **a list of recipes, not a pile of geometry**.

```js
{ schema: 'gx-spatial/1', units: 'm', mode: 'general', objects: [ … ] }
```

Every object is a small JSON record — `kind`, `position`, `rotation`, `scale`,
`color`, `level`, plus whatever that kind needs (an equation, a profile, a list
of atoms). Geometry is *rebuilt from the recipe* whenever the recipe changes.

This is why:

- **Save project** writes ~2 KB of JSON for a scene with a million triangles.
  The equation is saved, not its tessellation.
- **Editing an equation re-meshes**; editing a position does not. The dirty
  check (`geometryKey`, `viewport.mjs:145`) deliberately excludes `position`,
  `rotation`, `scale`, `visible`, `level` and `animation` — move an object and
  Construct moves the existing Three.js group instead of rebuilding it.
- **Undo is scene-level.** `SceneStore.commit` clones, mutates, re-validates,
  and only then swaps — so an edit that fails validation leaves *no* trace.
  History is capped at 30 entries or 8 MB, whichever comes first.
- **Nothing is inferred.** Validation rejects; it never repairs.

The budget ceilings (`model.mjs:3`): 256 objects, 10 000 atoms, 20 000 bonds,
2 048 profile points, 4 MB scene, 8 equation surfaces, 100 000 mesh vertices.

---

## 2. The object kinds

Ten kinds. They fall into three families.

### Solids — exportable geometry

| Kind | Made by | Notes |
|---|---|---|
| `box` | Parametric block, PCB substrate, Wall, Floor slab | Unit cube; `scale` *is* the dimension |
| `sphere` | Sphere | Unit radius |
| `cylinder` | Cylinder / column | Rotated to Z-up on construction |
| `extrusion` | Solidify a profile | Closed 2D outline, optional holes, + depth |
| `surface` | Plot an equation | z = f(x,y,t), worker-tessellated |
| `mesh` | CSV import, scene JSON | Triangles, or a point cloud if `triangles` is empty |

These are the kinds STL/OBJ export can see.

### Research — illustrative, not solvable

| Kind | What it is | Honest limitation |
|---|---|---|
| `molecule` | Atoms + bonds, CPK-coloured | Coordinates are *illustrative* or imported — no force field, no minimisation |
| `orbital` | Two scaled, tinted lobes | A schematic of phase, not a wavefunction |
| `vector` | An `ArrowHelper` | Carries a 3×3 matrix transform tool |
| `collision` | Two spheres, equal-mass 1D elastic | Closed-form (`collisionPositions`), 8-second loop, not a physics engine |

Molecules and orbitals draw as `InstancedMesh`. **This is why they cannot be
exported as STL/OBJ** — and the exporter says so rather than writing an empty
file.

### The unit-scale trap

Molecules force `units: 'Å'` and **refuse to join a non-Å scene**. That is
deliberate: a 2 Å water molecule beside a 6 m wall is not a scene anyone wants.
Start an empty scene for chemistry.

---

## 3. Equation surfaces — the most capable feature, and the most under-sold

### What the language is

A hand-written recursive-descent parser (`equations.mjs`). **No `eval`, no
`Function`, no property access, no globals.** It compiles to a closure tree.

- Variables: `x`, `y`, `z`, `t`
- Constants: `pi`, `e`
- Operators: `+ - * /`, `^` or `**` (right-associative), unary minus
- Unary: `sin cos tan asin acos atan sqrt abs exp log floor ceil`
- Binary: `min(a,b) max(a,b) pow(a,b) atan2(a,b)`
- Limits: 512 characters, 180 tokens

Bad input gets a *specific* error — `Unexpected token: 2. Use * for
multiplication.` for `2x`, not a generic parse failure.

### Your question: can you generate any plane from equations?

**Any surface that is a height field — yes.** `z = f(x, y, t)`, sampled on a
square grid over `[min, max]²`. That covers a great deal:

```
0*x                          flat ground plane
0.5*x + 0.2*y                inclined plane
sin(x)*cos(y)                egg crate
sin(sqrt(x^2+y^2)-t)         radial travelling wave (the default)
exp(-(x^2+y^2)/4)            gaussian bump
sqrt(max(0, 9-x^2-y^2))      upper hemisphere, radius 3
atan2(y,x)                   helicoid / phase ramp
abs(x)+abs(y)                pyramid
floor(x)+floor(y)            stepped terrain
```

**But not arbitrary parametric surfaces — and this is the real limit.** Because
the domain is a grid in x and y with exactly one z per (x, y), a height field
*cannot* represent:

- a **full sphere** (two z values per xy — you get the top hemisphere only)
- a **cylinder** or any vertical wall (infinite slope)
- a **torus**, a Möbius strip, a Klein bottle
- anything self-overlapping, or any closed surface

The `sqrt(max(0, 9-x^2-y^2))` trick gives a dome, not a sphere. `max(0, …)`
avoids the hole, at the cost of a flat skirt at the equator.

> **Gap.** A genuine parametric mode — `x = f(u,v,t), y = g(u,v,t), z = h(u,v,t)`
> over a `u,v` grid — would need three compiled expressions instead of one and a
> different tile loop, but the *entire* rest of the pipeline (parser, worker,
> tiling, hole handling, normals, export) already generalises. Spheres, tori,
> helices, tubes and ruled surfaces all become expressible. This is the single
> highest-leverage addition to the 3D workspace.
>
> Cylindrical (`z = f(r, θ)`) would be a smaller variant of the same change.

### How tessellation works, and why it stays responsive

Surfaces are meshed in a **Web Worker** (`geometry.worker.mjs`), in **16-row
tiles**, streamed back as transferable `Float32Array`s. Each tile owns its
vertices so buffers can be swapped independently, and normals are computed
worker-side so the render thread only ever uploads finished data.

Non-real or exploding samples (`NaN`, `Infinity`, `|z| > 1e5`) become **holes** —
that grid cell emits no triangles. So `log(x)` renders only where `x > 0`
instead of shooting to infinity. That is why `sqrt(1-x^2-y^2)` shows a clean
disc with nothing outside the unit circle.

Resolution is 8–128 samples per axis; at most 8 surfaces per scene.

### Export graph samples

**Export graph samples** writes the (x, y, z, t) grid as CSV, capped at 65×65
*independently of display resolution*, evaluated at the current time, in **local
coordinates before object transforms**. **Send graph to Table IDE** does the
same over the cross-tool bridge — Pro shell only.

---

## 4. Extrusion — you're right that it isn't intuitive

Three routes in, all under the library's closed-geometry solidification controls:

1. **Extrude 2D selection** — select closed shapes on the 2D canvas *before*
   opening 3D, then press this.
2. **Draw footprint** — click points on the ground plane in the 3D viewport.
   Switches the camera to Top, disables orbit, draws an orange guide line, then
   **Close and extrude**.
3. **Enter x,y pairs** — type `0,0 4,0 4,3 0,3` into the textarea.

### The profile rules, which are strict

`validateProfile` (`model.mjs:59`) rejects, in this order: duplicate consecutive
points; **self-intersecting edges** (full O(n²) segment-pair test, including
collinear touching); zero enclosed area. It does **not** care about winding.

So: a simple closed outline. A figure-eight, a bowtie, or a path that touches
itself is refused. A hand-drawn footprint has no hole editor, but a 2D Boolean
subtraction can produce an outer contour plus one or more interior contours. Those
interior contours are retained as extrusion holes.

From the 2D canvas, `selectedProfiles` accepts `rect`, `polygon`, `circle`,
`ellipse`, and closed paths. Construct Boolean paths may contain multiple
contours so subtraction holes survive the 2D-to-3D handoff. Open lines,
polylines, wires, and open paths take the complementary sweep workflow, where
they create rectangular or hollow circular solids rather than filled profiles.

### The handoff is explicit

You're right, and the seam is structural:

- **The 3D workspace is a `<dialog>` opened over the 2D editor.** The underlay,
  closed-profile extrusion, and open-route sweep all use the same XY-to-XYZ
  conversion, so the drawing and its resulting geometry occupy the same place.
- **The selection is read once, on click.** `selectedProfiles` reads
  `editor._selection` at the moment you press *Extrude 2D selection*. There is
  no live link. Change the 2D shape afterwards and the extrusion does not
  follow — the extrusion owns a *copy* of the points.
- **The error only fires after you're in 3D.** "Select closed shapes on the 2D
  canvas first, then reopen 3D" is accurate, but you only see it *after*
  opening 3D, discovering the collapsed `<details>`, and clicking. The cost of
  the mistake is a full round trip.
- **`World units per 2D drawing unit` defaults to `.01`** with no indication of
  what your drawing's units are. Get it wrong and the extrusion is 100× off.
- **Traffic is one-way.** 3D → 2D does not exist at all. No projection, no
  section, no plan view export back to the canvas.
- **It's buried.** Extrusion is the main modelling verb for construction and
  electrical modes, and it is inside a closed disclosure below the catalog.

> **Gaps, in order of payoff:**
> 1. Surface the 2D selection state *in the 3D panel* — "3 closed shapes
>    selected" or "nothing selected in 2D", live, before the click.
> 2. Offer extrude **from the 2D canvas** — a context action on a closed
>    selection that opens 3D with the extrusion already made.
> 3. Keep the source element id on the extrusion so a re-extrude can update in
>    place rather than adding a duplicate.
> 4. Derive the unit scale from the drawing's own declared units instead of
>    a bare `.01`.

---

## 4a. The 2D underlay — your drawing on the ground plane

**View bar → `2D underlay`.** The 2D canvas is drawn on the z=0 plane. Press
**Top** and you are looking at your drawing; orbit away and the solids stand up
out of it.

### Why this works at all

The two environments have always shared a coordinate system. The 2D canvas is an
x,y plane; the 3D ground is the z=0 x,y plane — `viewport.mjs` rotates the grid
`Math.PI / 2` precisely so plan coordinates *are* X/Y with Z as up. The
conversion is `Boxwood.toThreeTransform`: centre the box, flip Y (SVG's Y grows
down, the world's grows up), drop it at z=0.

That function was already load-bearing — `profiles.mjs` uses it to place every
extrusion. So the underlay and the solids cut from it are placed by **the same
code against the same origin**, which is why they line up rather than merely
looking close. A check pins it: passing the box as its own page size must land
the centre at (0, 0), and if that drifts the drawing and its extrusion separate.

Note what Boxwood does and does not do here. It converts coordinates; it does
not render. It is a layout and geometry library — boxes, routing, snapping,
hit-testing — with converters *to* Pixi and Three transforms. It will tell you
where a box belongs in 3D, and never puts anything in a scene. The rendering
gap was the actual missing piece, not the math.

### It is a backdrop, not an object

The plane is added to `scene` directly and **never to `groups`**, which has
consequences worth stating because they are the whole design:

- **Not selectable.** The raycaster only tests `groups`.
- **Not transformable.** The gizmo can never grab it.
- **Not exported.** STL/OBJ walk `groups`.
- **Not saved.** It never enters the scene JSON.
- **Costs no object slot.** The 256-object budget is untouched.

It belongs to the same category as the grid and the axes: scene furniture. It
sits at z = −0.001 with `renderOrder = -1` and `depthWrite: false`, so a
footprint drawn at z=0 does not z-fight with it, and it uses an *unlit*
material — a drawing has no surface normal worth shading.

### Raster, not traced vectors

The canvas is serialized, rasterized through a blob URL, and applied as a
`CanvasTexture`, capped at 2048 px on its long edge.

A vector trace would be crisper under magnification but would silently drop
text, filters and gradients — including the `glow` filter in the editor's own
`<defs>`. For a ground-plane reference, fidelity to *what you actually drew*
beats crispness. The trade is real: zoom far in and the underlay softens.

Three things the serializer handles, each because the alternative fails quietly:

- **Styles must travel with the markup.** A rasterized SVG is isolated from page
  CSS, so an inline `<svg>` would render unstyled.
- **`width`/`height` are written explicitly.** A viewBox-only SVG has no
  intrinsic size and rasterizes to nothing in some engines.
- **Non-`data:` `<image>` elements are dropped.** A texture cannot fetch;
  an external href resolves against the blob URL and leaves a hole.

Editor chrome (selection boxes, handles, marquee) is stripped, so the backdrop
shows the drawing and not the state of your selection when you opened 3D.

### It makes the unit scale visible

This is the quiet win. `World units per 2D drawing unit` defaults to `.01` and
was previously typed blind — get it wrong and the extrusion is 100× off with
nothing on screen to say so. With the drawing on the ground plane a wrong scale
is *immediately* obvious: the solid is plainly the wrong size next to its own
source. Changing the scale re-places the underlay, so the reference stays honest.

The status line reports both extents — drawing units and world units — on every
toggle.

### It is a snapshot, not a live link

Edit the 2D canvas and the underlay is stale until you press **Refresh 2D**.
An empty canvas is refused with a message saying so, rather than showing a blank
plane that reads as a broken feature.

> **Gaps.** No live link (a MutationObserver on the canvas would close it). No
> per-level underlay, so a multi-storey building shows one plan for all levels.
> Opacity is fixed at 0.85. And it remains one-way: still no 3D → 2D projection.

## 5. Animation — why `sin(t)` did nothing

### The feature

Per object, under *Equation animation* in the inspector: an **axis** (`x`, `y`,
`z`, `rx`, `ry`, `rz`) and an **offset expression** `f(x, y, z, t)`. Each frame,
`evaluate()` (`viewport.mjs:168`) computes the offset and **adds it to the base
transform**:

```js
if (a.axis.startsWith('r')) g.rotation[a.axis[1]] = o.rotation[…] + v;
else                        g.position[a.axis]    = o.position[…] + v;
```

It is an *offset*, so the object always returns to its authored position when
the expression is zero. `x`, `y`, `z` in the expression are the object's **base
position**, not the current one — so the motion cannot feed back on itself, and
`sin(t + x)` gives you a phase offset by position, which is how you build a wave
across several objects.

Non-finite or `|v| > 1e6` results are skipped, leaving the object where it was
rather than teleporting it to `NaN`.

### The bug you hit

**Typing `sin(t)` and pressing Play does nothing — and you are not doing it
wrong.** There are three distinct traps, and most people hit all of them:

**(a) The animation is not saved until you press *Apply changes*.**
The `<input>` is read only inside the form's submit handler
(`workspace.mjs:81`). Typing `sin(t)` and clicking Play never writes
`item.animation` at all. Worse — the *Equation animation* disclosure sits
**above** the submit button, so the control you need is visually separate from
the one you typed into.

**(b) The Play button may not be on screen.**
The timeline is hidden unless the scene already contains an animation, a
surface, or a collision (`workspace.mjs:99`):

```js
$('s-timeline').hidden = !objects.some(o => o.animation || ['surface','collision'].includes(o.kind));
```

So with a single box: no animation saved (trap a) → timeline hidden → no Play
button. If you did find a Play button, you had a surface in the scene, and you
were pressing Play on *that*.

**(c) The axis defaults to `x`.**
The `<select>` has no placeholder, so a bare `sin(t)` slides the object ±1 unit
along X. On a 6 m wall at default zoom that is a subtle wobble, easily read as
"nothing happened".

### The sequence that does work

1. Select the object.
2. Open **Equation animation**.
3. Set **Axis** — pick `z` for something obvious.
4. Type `sin(t)` (or `2*sin(t)` to see it clearly).
5. **Press *Apply changes*.** ← the step that actually saves it
6. The timeline appears at the bottom of the viewport. Press **Play**.

You can also scrub the **Time (s)** field directly without playing.

> **Gaps.** (1) Apply the animation on blur, or move the submit button, or put
> an *Apply* inside the disclosure. (2) Show the timeline whenever a scene has
> *any* object, disabled with "add an animation or a surface" — a control that
> vanishes is unfindable. (3) Echo the computed offset live ("z +0.84 at
> t=1.0") so a wrong axis is visible immediately. (4) Offer one-click presets —
> spin, bob, orbit — since the three traps compound for a first-time user.

### Time, playback and interaction

- Time is clamped to **0–3600 s**, and playback **stops at 3600**.
- Each frame advances by at most **0.05 s** regardless of elapsed wall time, so
  a stall slows the animation rather than making it jump.
- Surfaces re-tessellate during playback, **throttled to 100 ms** and skipped
  while the worker is busy — so `sin(sqrt(x^2+y^2)-t)` animates without
  queueing an unbounded backlog.
- **Playing detaches the transform gizmo.** You cannot drag an object while
  time is running — deliberate, since the animation would fight you for the
  transform. Every edit calls `stop()` first.
- Rendering is **on-demand** (`invalidate()`), not a free-running loop. A still
  scene costs nothing; hiding the tab cancels the frame entirely.

---

## 6. Import and export

### In

| Format | Becomes | Notes |
|---|---|---|
| `.json` / `.g3d` | Full scene | Re-validated on load; `.g3d` is the legacy name of the same JSON |
| `.pdb` / `.ent` | `molecule` | **First model only**; altLoc A or blank; forces Å + academic mode |
| `.csv` | `mesh` point cloud | `x,y,z` rows, optional header, up to 100 000 |
| SMILES | `molecule` | Pro only — needs `window.GxChem`, control is hidden otherwise |

**PDB bond inference:** many small-molecule exports carry no `CONECT` records.
Rather than render a loose cloud of spheres, bonds are derived from covalent
radii + 0.45 Å tolerance via uniform-grid binning (linear, not O(n²)), and the
result is **flagged `inferredBonds`** — the status line says the bonds were
inferred rather than read. Coordinates are centred on the centroid.

Failed parses get a **diagnosis, not a shrug**: `coordinateHint` detects mmCIF
(`data_`/`_atom_site`), SDF/MOL (`V2000`/`$$$$`), and ATOM records whose
coordinate columns are misaligned, and names the actual problem.

### Out

| Action | Format | Keeps |
|---|---|---|
| Save project | JSON | Everything — recipes, equations, animations, coordinates |
| Export selected / whole scene | STL or OBJ | Triangles in world space, no colour, no units |
| Export graph samples | CSV | Equation grid at current t, local coordinates |
| Send graph to Table IDE | — | Pro shell only |

STL is binary (84-byte header + 50 bytes/triangle). OBJ is text and **keeps
objects separate as `o` groups** — prefer it for multi-part scenes; STL fuses
everything into one triangle soup. Ceiling is 200 000 triangles.

Neither format carries units or colour. A mixed scene exports its solids and
**reports what it dropped** rather than silently shipping half a model.

> **Gaps.** No GLB/glTF (the format most 3D pipelines actually want, and the
> only common one carrying colour and units). No STEP or any CAD B-rep, so
> "geometry preview only" in electrical mode is literal — nothing here feeds a
> real CAD tool losslessly. No G-code, and none is planned: that is a slicer's
> job, not a modeller's.

---

## 7. Modes, levels and the viewport

**Modes** filter the catalog and rewrite the help text: `general`, `electrical`,
`construction`, `software`, `academic`. In academic mode a *Subject* filter
appears (physics / chemistry / math). Modes do **not** change what is allowed —
only what is offered.

**Levels** are an integer per object plus a filter in the view bar. Isolating a
level hides the rest and detaches the gizmo. There is no structural inference —
a level is a label, not a storey with semantics.

**The catalog is extensible without touching the 3D code.** A domain kit entry
carrying a `solid` recipe appears in the 3D catalog; one carrying `svg` appears
in the 2D palette; an entry may carry both, and they are deliberately *not*
projections of each other (`registry.mjs` — the benzene symbol is a hexagon with
an inscribed circle, which is notation, not geometry). Built-in `CATALOG`
entries win on id collision.

**Viewport:** drag to orbit, right-drag to pan, scroll/pinch to zoom. Fit, Top,
Front, Side all keep perspective. **Z is up** — set explicitly, and the grid is
rotated to match, so plan coordinates are X/Y and height is Z. Click to select,
with a 4-pixel drag threshold so a small mouse slip during an orbit doesn't
change selection. Wireframe toggles every material in place.

Two side panels are **drawers** that slide over the stage — the canvas never
resizes. Each has a **pin** that locks it open, remembered in `localStorage`.
The inspector auto-opens on your first selection and never re-opens after you
close it.

---

## 8. The honest summary of what's missing

Ordered by how much each would change the tool.

1. **Parametric surfaces** — `x,y,z = f(u,v,t)`. Unlocks spheres, tori, tubes,
   helices, ruled surfaces. The parser, worker and tiling already generalise;
   this is the biggest capability per unit of work. *(§3)*
2. **A real 2D↔3D relationship** — the underlay (§4a) now puts the drawing and
   the solids in one place, which was the worst of it. Still missing: live
   selection feedback, extrude initiated from the canvas, re-extrude in place,
   a live-updating underlay, and any path back from 3D to 2D. *(§4, §4a)*
3. **Animation that works on first contact** — apply-on-blur, a timeline that
   is present-but-disabled rather than absent, live offset feedback. *(§5)*
4. **glTF/GLB export** — the format with colour and units, which STL and OBJ
   both lack. *(§6)*
5. **Boolean operations** — no union, difference or intersection anywhere. For
   construction and electrical work (a wall with a window, an enclosure with a
   cutout) this is the most conspicuous absence in the solid modelling.
6. **Measurement** — no dimensions, no distance or angle readout, no snapping.
   Coordinates are typed, never measured.
7. **Assembly structure** — objects are a flat list. No parenting, no groups,
   no instancing, no constraints. A six-part assembly moves one part at a time.
8. **Cylindrical/polar surfaces** — `z = f(r, θ)`; a small variant of (1).
9. **SMILES stereochemistry** — `@`/`@@` parse but do not affect coordinates,
   so enantiomers render identically.
