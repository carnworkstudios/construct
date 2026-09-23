// SPDX-License-Identifier: MIT
// The 2D drawing, on the 3D ground plane.
//
// The two environments have always shared a coordinate system: the 2D canvas is
// an x,y plane and the 3D ground is the z=0 x,y plane (the grid is rotated
// Math.PI/2 in viewport.mjs so plan coordinates ARE X/Y with Z up). What was
// missing was not the math but a way to SEE it, so a drawing and the solids
// extruded from it never appeared in the same place.
//
// Boxwood.toThreeTransform performs the conversion -- centre the box, flip Y
// (SVG's Y grows down, the world's grows up), drop it at z=0. profiles.mjs
// already relies on it for extrusion placement, so the two environments'
// agreement on coordinates is established here rather than invented.
//
// The result is a BACKDROP, not an object: the viewport adds it to the scene
// directly and never to `groups`, so it cannot be picked, selected, exported or
// saved, and does not consume one of the 256 object slots. It belongs to the
// same category as the grid and the axes.

// Editor infrastructure, not artwork. #_canvasBg is the page rect itself (drawn
// separately as the ground), #_cameraRotGroup is the camera, #_gridLayer is the
// editor's own grid -- the 3D viewport already has one, and two grids at
// different scales on the same plane read as a rendering fault.
const SYSTEM = '#_gridLayer, #_gridDefs, #_canvasBg, [data-se-system="true"], .snap-guide, .draw-preview, .selection-handle-group, .selection-box, .selection-handle, .gx-marquee';

// A serialized snapshot of the canvas plus its placement on the ground plane.
// Rasterizing is the viewport's job; this stays free of WebGL and the DOM's
// image pipeline so it can be checked directly.
export function captureUnderlay(editor, unitScale = 1) {
  if (!Number.isFinite(unitScale) || unitScale <= 0 || unitScale > 10000) throw Error('Enter a positive drawing-unit scale.');
  const svg = editor?.$svgDisplay?.[0] || document.getElementById('svgDisplay');
  if (!svg) throw Error('No 2D canvas found to show.');

  // #_canvasBg IS the page -- the printable area, what fitToView frames and what
  // the exporter crops to. The SVG's own viewBox is the CAMERA: it changes as
  // you pan and zoom, so using it would make the underlay's size and position
  // depend on where you happened to be looking when you opened 3D.
  const box = pageBox(svg);
  if (!box) throw Error('This canvas has no page rect yet. Draw something on the canvas first, then show it here.');

  // Drawn content lives in #_cameraRotGroup (svgEditor's `_contentRoot`), not at
  // the SVG root, so an emptiness test at the root always looked empty.
  const content = svg.querySelector('#_cameraRotGroup') || svg;
  if (!drawn(content)) throw Error('The 2D canvas is empty. Draw something first, then show it here.');

  // Boxwood owns the screen-to-world convention; passing the page as both the
  // element and the page size centres the drawing on the world origin, which is
  // the same origin extrusions are placed against.
  const placed = globalThis.window?.Boxwood?.toThreeTransform
    ? globalThis.window.Boxwood.toThreeTransform({ box }, box.w, box.h, 1, 0)
    : { position: [0, 0, 0] };

  return {
    markup: serialize(svg, box),
    // Width/height in world units, and the centre the plane sits on.
    width: box.w * unitScale,
    height: box.h * unitScale,
    position: [placed.position[0] * unitScale, placed.position[1] * unitScale, 0],
    box,
  };
}

// The page rect, read the same way wiringDiagram._pageViewBox reads it so the
// underlay, the exporter and fitToView all agree on what "the page" is.
function pageBox(svg) {
  const bg = svg.querySelector('#_canvasBg');
  if (!bg) return null;
  const x = parseFloat(bg.getAttribute('x')) || 0, y = parseFloat(bg.getAttribute('y')) || 0;
  const w = parseFloat(bg.getAttribute('width')), h = parseFloat(bg.getAttribute('height'));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

// Something the user drew, as opposed to editor furniture. A canvas holding only
// a page rect and a grid is empty in the sense that matters here.
function drawn(root) {
  for (const node of root.querySelectorAll('rect,circle,ellipse,line,polyline,polygon,path,text,image,use')) {
    if (!node.closest(SYSTEM)) return true;
  }
  return false;
}

// A standalone SVG document: an inline <svg> inherits page CSS, and a texture
// is rasterized in isolation, so styling has to travel with the markup or the
// underlay renders unstyled. Width/height are set explicitly because an SVG
// with only a viewBox has no intrinsic size and rasterizes at 0 in some engines.
function serialize(svg, box) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // The page rect, not the camera -- so the underlay shows the page whatever the
  // editor happens to be zoomed to.
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  clone.setAttribute('width', box.w);
  clone.setAttribute('height', box.h);
  // The camera's rotation is baked into #_cameraRotGroup as an SVG transform.
  // Left in place it would rotate the drawing against the 3D axes, so a canvas
  // viewed at an angle would land skewed on the ground plane.
  const rot = clone.querySelector('#_cameraRotGroup');
  if (rot) rot.removeAttribute('transform');
  // Editor furniture would otherwise be baked into the backdrop as if drawn.
  clone.querySelectorAll(SYSTEM).forEach(n => n.remove());
  // A texture cannot fetch: an external href resolves against the blob URL and
  // fails silently, leaving a hole. Dropping them keeps the rest intact.
  for (const node of clone.querySelectorAll('image')) {
    const href = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
    if (!/^data:/i.test(href)) node.remove();
  }
  return new XMLSerializer().serializeToString(clone);
}
