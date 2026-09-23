# 3D and Research / Academic workspace

Open **3D workspace** from any Construct mode. The 2D canvas stays intact.
Research / Academic also has a 2D palette with Physics, Chemistry and Math
notation. Its browser route is `/tools/schema-editor/academic/`.

## Work with a model

The panels follow three numbered steps: **1 Add an object** (left), **2 Scene**
(the object list below it) and **3 Edit** (right). Controls that cannot yet do
anything stay hidden rather than disabled: transform handles and the properties
form appear once an object is selected, Export & send once the scene has an
object, and the timeline only when something is time-dependent (an equation
surface, a collision, or an object with an equation animation). Less common
tools — profile extrusion, equation plotting and scene settings — sit in
collapsed disclosures so the default screen stays small.

- Find a primitive in the object library. Click the object in the viewport or
  scene list to select it. Use Move, Rotate and Scale handles, or edit exact
  coordinates in Properties and click Apply changes.
- Draw a footprint on the ground plane and choose Close and extrude. Alternatively,
  enter `x,y` pairs separated by spaces. Edit the resulting profile and depth in
  Properties. A manually drawn footprint must be a simple outline without
  self-intersections.
- To solidify a drawing, select closed shapes in the 2D editor first. In 3D, enter
  world units per drawing unit and depth, then choose **Solidify selected closed
  geometry**. Supported: rectangles, polygons, circles, ellipses, closed paths,
  and Construct Boolean results. Compound Boolean paths retain their interior
  contours as extrusion holes. Curves are tessellated; source transforms are
  preserved.
- Select open lines, polylines, wires, or a single open path and choose
  **Solidify open 2D geometry** to sweep a rectangular or hollow circular solid.
  Open geometry is a stroke-only route in 2D; it does not receive a fill.
- Assign integer levels in Properties and use the Level selector to isolate them.
  Levels are visibility groups; set elevation explicitly with Position Z.
- Fit, Top, Front and Side reposition the perspective camera. Drag to orbit,
  right-drag to pan, scroll/pinch to zoom. Z is up. Wireframe shows triangle edges.
- Save scene downloads a `.g3d` JSON recipe; Open scene restores it. Undo/redo
  covers document edits and file loads. Closing/reopening 3D retains the current
  scene in the tab. **Save before reloading or closing the browser**: there is no
  disk autosave, and the 3D scene is separate from the SVG document.
- Export selected STL saves transformed triangle geometry, including the current
  animation pose. STL has no unit metadata. Check scale and watertightness in your
  downstream CAD/CAM application. Point clouds, vectors and instanced molecules
  are not STL solids. This is not a CNC toolpath or Gerber exporter.

Changing the Units selector changes the label only. It does not rescale numbers.
PDB and molecule examples require Å; mixing them into a differently labeled scene
is rejected. The PCB preset is a geometry template, not a board routing tool.
Construction extrusion uses heights you supply, not inferred structural relations.

## Physics

Vectors have editable components. Apply a 3×3 row-major matrix to a vector, e.g.
`0,-1,0,1,0,0,0,0,1` rotates it around Z. The collision example is an exact
one-dimensional equal-mass elastic collision embedded in 3D: radius 0.5, initial
centers ±3, speeds ±1, contact at t=2.5. It repeats every eight seconds. It is not
a general rigid-body solver. The scene's selected unit labels distance; time is s.

## Chemistry

The Research / Academic symbol kit carries notation for physics (vectors,
forces, springs, fields, energy levels, gravitation), chemistry (structures,
bonds, reaction arrows, equilibria, apparatus) and math (axes, integrals,
summation, matrices, number lines). Symbols that describe something genuinely
spatial also carry a 3D recipe and appear in the 3D object catalog; reaction
schemes, free-body and energy diagrams stay 2D on purpose, because they are
labelled graphs rather than shapes.

Water and methane use illustrative coordinates. The peptide example is a
schematic backbone. The p-orbital example shows two phase-colored lobes; it is
not an electron-density isosurface or quantum calculation.

Open a PDB/ENT file to view proteins or peptides. LF, CRLF and classic CR-only
files are all accepted. The first model and blank/A alternate conformations are
used. Atom coordinates are centered for navigation.

Explicit CONECT records are used whenever the file has them. Many small-molecule
exports carry none at all, so when CONECT is absent (and the file is under 2000
atoms) bonds are inferred from interatomic distance against covalent radii, and
the status bar says so. Inferred connectivity is a display aid, not read data:
it is flagged on the object as `inferredBonds`. Bond orders, missing residues
and secondary structure are still never inferred. Atom colors: H light gray,
C gray, O red, N blue, S yellow, P brown, other elements purple.

## Build from SMILES

Available on the Ginexys platform only: SMILES carries no coordinates, so
turning `CC(=O)Oc1ccccc1C(=O)O` into atoms in space means inferring
connectivity, implicit hydrogens and geometry. That is document intelligence,
not rendering, so it is injected rather than bundled — the standalone tool
hides the control and PDB/CSV import still work.

The result is a structural SKETCH: bond lengths are typical values, angles are
idealised by hybridisation, and rings are laid out as regular polygons and then
relaxed apart. It is not energy-minimised, so it is right for looking at a
molecule and wrong for measuring one. Stereochemistry (`@`/`@@`) is parsed and
preserved but not yet applied to coordinates.

## Math and animation

Plot `z = f(x,y,t)`. Example: `sin(sqrt(x^2+y^2)-t)`. X and Y share the configured
minimum/maximum range. Resolution is 8–128 subdivisions per axis. Functions:
`sin cos tan asin acos atan sqrt abs exp log floor ceil min max pow atan2`.
Constants: `pi e`. Operators: `+ - * / ^ **`, parentheses. Multiplication must be
explicit (`2*x`). Exponentiation is right-associative. `log` is the natural log.
JavaScript syntax and property access are not accepted.

Play advances time, Pause holds it, Reset returns to zero. Time can be entered
explicitly (0–3600 seconds). Property animation adds an expression offset to the
base X/Y/Z position or RX/RY/RZ rotation; rotation offsets use radians, while
static rotation fields use degrees. Undefined or excessive offsets retain the
last finite pose. Non-real/nonfinite graph samples or |z| > 100000 are holes.
Discontinuities between finite samples are not analytically detected.

Export graph samples downloads local XYZ/t CSV (up to 65×65 points, excluding
holes), before object transforms. In the hosted Pro shell, Send graph to Table
IDE sends the same sample grid plus the equation in the caption via the existing
pointer transport. This is a one-way sample transfer, not a live formula binding.

## Software spatial data

Open CSV with exactly three numeric columns (`x,y,z`, optional header) for a
point cloud. For a triangle mesh, put a `mesh` object in a scene JSON with
`vertices: [[x,y,z], ...]` and `triangles: [[i,j,k], ...]` (zero-based indices).
An empty triangle array means a point cloud. Units use the scene label. There is
no automatic triangulation or repair of input data.

## Performance and verification

Three.js 0.180.0 and Boxwood 1.2.1 are pinned, MIT-licensed, and vendored inside
the tool. They load only on first opening 3D. No 3D dependency is fetched from a
CDN. Boxwood maps explicit 2D coordinates; it is not a 3D physics engine.

An ID-indexed recipe store is authoritative. GPU objects are disposable views.
Graphs and their normals run in a module worker and transfer 16-row typed-array
tiles. Animation reuses GPU buffers while topology sizes stay unchanged. Molecules
use 512-instance chunks; imported spatial data uses 4096-element chunks. Chunks
have independent bounds for frustum culling. Buffers and GPU resources are
explicitly disposed on replacement and close. Camera movement redraws on demand;
only Play drives an animation loop, and hidden tabs pause time. Graph updates
are capped at 10 requests per second with one job in flight; pixel ratio is
capped at 1.75. These are bounded in-memory scenes, not out-of-core streaming.

Limits: 4 MB serialized recipe input, 256 objects, eight surfaces, 10000 atoms,
20000 bonds, 100000 imported vertices/triangles, 2048 points per outline, and
200000 triangles per STL. History is limited to 30 entries and approximately
8 MB of serialized recipes. These are allocation/work limits, not measured
peak-browser-RAM guarantees; JS objects, undo and GPU buffers add overhead.

Run `node scripts/check-spatial.mjs` from the tool root. From the platform root,
`npm run check:spatial` also verifies cross-tool policy. Browser regression:
start a local HTTP server, then run the supplied Playwright script (see its header).
WebGL2 and module workers are required. VS Code webview support is not verified.

## Walls and conduit from 2D routes (2026-09-21)

Select lines or polylines in 2D, open **3D**, and set **World units per 2D drawing
unit** under **Extrude a profile**. For example, 400 drawing units representing
2 meters use `0.005` in a meter scene. Open **Build walls / conduit from lines**,
choose a wall or hollow conduit, enter dimensions and elevation, then choose
**Build selected routes**. Only physical routes should be converted; schematic
connectivity is not a physical layout. Defaults are convenient for meter scenes;
all entered dimensions use the current scene units.

Walls support center/left/right alignment along the path, thickness and height.
Conduit supports outer diameter and wall thickness. Elevation means wall base or
conduit center. Consecutive segments share mitered corners. Sharp reversals,
self-intersections and intersecting offset outlines are rejected atomically.
Separate selected routes remain separate objects: automatic T/X junction merging,
rounded elbows, openings and bend-radius constraints are not implemented.

Properties lets you edit each existing path coordinate, dimensions, object
transforms and level. Keep the vertex count and order: vertices, segments and
generated surfaces retain object-scoped component IDs through dimension edits,
undo/redo and save/load. This is path-coordinate editing, not a general mesh
vertex/edge/face editor or constraint solver. Vertex insertion and removal need
explicit topology operations in a subsequent stage.

For a source element with an SVG ID, **Refresh path from 2D source** explicitly
re-reads its geometry and XY placement using the saved calibration. It preserves
elevation, dimensions, rotation and scale. Refresh replaces local path edits and
requires the same vertex count/order; it does not write back to SVG or infer
correspondence after source topology changes. The source drawing must be open;
the saved path stays usable when it is absent. Project files do not embed the
source SVG. Source links identify elements in the current drawing, so confirm
you have the original drawing open before refreshing a loaded project.

Scenes now save as `gx-spatial/2`, and existing `gx-spatial/1` files migrate on
read without changing their objects. New files cannot be opened by old readers
that only accept v1. Linked routes retain calibration units and prevent silent
scene-unit relabeling. The limit is 128 vertices per route and 2048 across all
routes. Recipes persist; generated render meshes are rebuilt. STL/OBJ exports
include the resulting wall and hollow-conduit surfaces, not the editable recipe.

## Modeling and research controls

The Library contains parametric features, equation surfaces, scalar-field import
and experiments. Inspect contains component selection, labels, direct edits and
feature dimensions. These controls are available in all modes; mode selects the
relevant catalog and vocabulary.

### From plans to solids

Select lines, polylines or a single open SVG path in 2D, then use **Build walls /
conduit from lines**. Declare the drawing scale first. Open curves are sampled
into 128 points; this is an approximation, not analytic CAD curvature. A physical
route is required: a schematic connection does not determine real-world length.
Walls have thickness, height, alignment and elevation. Inspect adds rectangular
doors/windows by segment, distance along the segment, width, sill and height.
Openings must clear corners and the wall top. Separate intersecting walls are
not automatically joined.

Conduit paths accept XYZ points for risers and an optional bend radius. Tight
bends are rejected when adjacent segments cannot accommodate their tangent
length. Level filters and object elevation let users separate storeys or systems.

### Mesh and parametric editing

Import STL, OBJ or static geometry-only GLB with declared units. GLB skins,
animations, textures, external resources and compressed extensions are rejected.
Use **Make editable mesh** for primitive solids. Select a vertex, edge or face in
Inspect or in the viewport; move vertices numerically, split/collapse edges, or
extrude/inset triangular faces. Invalid direct edits fail without changing the
saved scene. Object move/scale/rotate controls remain available.

Feature recipes support constrained sketches, extrusion, revolve, loft and
patterns that reference another object. Named dimensions have numeric controls;
advanced constraints remain available in the recipe editor. Changes regenerate
dependent patterns atomically. Cycles, missing inputs and inconsistent constraints
are rejected. Dimension changes preserve component IDs when generated topology
is unchanged. Topology changes orphan old label anchors rather than attaching
them to different components. Detach a feature for direct mesh editing.

**Solid Boolean** runs union, subtraction or intersection through Manifold WASM
in a worker. It creates a result and hides its sources; **Show all objects**
restores them. Boolean results are snapshots, not automatically regenerated
features. This is a triangle-mesh modeler, not an exact B-rep CAD kernel; general
fillets/chamfers, CNC toolpaths and fabrication tolerances are not supplied.

### Labels and scientific views

Labels and tags attach to objects, mesh components, path components, or molecular
atoms/residues/chains. Filter the component selector, highlight a target, and save
its label. Unresolved anchors are listed in Inspect. Visible labels follow object
transforms and molecular playback. At most 64 labels are projected at once, with
overlap suppression. Isolate/show actions currently operate on whole objects.

Molecules support ball-and-stick, sticks, space-fill, backbone and cartoon views.
PDB chain/residue/atom records and HELIX/SHEET assignments are retained; gaps are
not connected blindly. Cartoon rendering uses supplied assignments rather than
predicting secondary structure. The PDB reader uses the first model and its
supported alternate-location policy. Source PDB text is preserved.

CUBE import displays a supplied single scalar field as an isosurface. Select an
isovalue in the file's field units; import positive and negative values separately
for signed orbital lobes. Grid coordinates are converted to angstroms. Arbitrary
independent grid axes are supported, using trilinear resampling and marching
tetrahedra. Limits: 16 MB, 262,144 scalar samples, 128 samples per input axis;
the displayed surface is sampled at 24 cells per axis. Multi-orbital datasets
must be separated first. Generated mesh snapshots retain field metadata, not the
original volume. The importer follows the [CUBE layout](https://paulbourke.org/dataformats/cube/).

### Equations, physics and chemistry

Parametric XYZ(u,v,t), implicit f(x,y,z,t)=iso, plane equations and existing
height-field graphs are supported. Parametric/implicit surfaces are snapshots at
a supplied time. Object equation animation and height-field animation remain
available. Explicit recorded particle and molecular trajectories have playback.

Particle experiments integrate SI force equations with fixed-step RK4. Edit mass,
radius, initial position/velocity, duration and force components in the simple
controls; advanced JSON adds multiple bodies and boundaries. Optional
`planes: [{normal: [0, 1, 1], offset: 0}]` creates an inclined collision plane
whose allowed half-space is `normal · position >= offset`. All initial spheres
must fit. Sphere and plane contacts use discrete impulses with restitution.
Large timesteps can miss collisions. These are particle experiments, not general
rigid-body, electromagnetic or structural-analysis solvers.

Results include kinetic energy, gravity potential energy and applied-force power.
K + Ug excludes potential energy of arbitrary user forces. Select an observable
to plot it, export CSV, or send results to Table IDE through the existing Pro
transfer. Kinetics integrates an explicit reversible mass-action network with
supplied stoichiometry, concentrations and rate constants; it does not infer
chemical feasibility or constants.

Optional molecular preparation, reactions, protein mutation, OpenMM trajectories,
mmCIF conversion, chemical balancing and exact polynomial/rational verification
use the [local scientific service](../../../backend/research/README.md). Its
private adapter is injected by the platform shell. Standalone public builds keep
all browser modeling and explicit experiment tools without that adapter.

### Performance and current limits

Static scenes render only when invalidated; playback requests frames while
running. Molecules use instanced geometry. Import, graph, Boolean and experiment
jobs run in cancellable workers with a 30-second budget. Scientific service jobs
run in disposable local subprocesses with a 90-second budget. Meshes are split
into render chunks; volume grids and geometry are bounded before allocation where
possible. No scientific calculation runs in the animation callback.

Projects still use bounded JSON snapshots and undo history. Large trajectory
streaming, IndexedDB asset-backed history, automatic cross-object wall junctions,
subcomponent visibility, exact CAD fillets, comprehensive reaction prediction and
bidirectional live Table IDE equation bindings remain outside this implementation.

OpenMM runs also expose recorded potential and kinetic energy in Inspect, with
plots, CSV and Table IDE transfer. Molecular time axes use ps and energies use
kJ/mol; they are kept distinct from the SI particle experiment columns.
