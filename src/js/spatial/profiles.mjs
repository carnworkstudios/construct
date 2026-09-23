// SPDX-License-Identifier: MIT
// Explicit selected geometry only: no structural inference from a drawing.
// Closed profiles and open routes deliberately share this module: 2D is the
// plan view, while Construct decides whether a selected primitive becomes a
// filled solid or a swept path in 3D.
function localClosedLoops(el) {
  const tag = el.tagName?.toLowerCase(); let points;
  if (tag === 'rect') {
    const x = el.x.baseVal.value, y = el.y.baseVal.value, w = el.width.baseVal.value, h = el.height.baseVal.value;
    if (el.rx.baseVal.value || el.ry.baseVal.value) throw Error('Convert rounded rectangles to a closed path before Boolean or extrusion.');
    points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  } else if (tag === 'polygon') points = Array.from(el.points, p => [p.x, p.y]);
  else if (tag === 'circle' || tag === 'ellipse') {
    const cx = el.cx.baseVal.value, cy = el.cy.baseVal.value, rx = (el.r || el.rx).baseVal.value, ry = (el.r || el.ry).baseVal.value;
    points = Array.from({ length: 96 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 48), cy + ry * Math.sin(i * Math.PI / 48)]);
  } else if (tag === 'path') {
    const d = el.getAttribute('d') || '';
    const parsed = window.GxPathGeo?.parse?.(d)?.subpaths;
    if (el.hasAttribute('data-construct-boolean') && parsed?.length) {
      if (parsed.some(s => !s.closed || s.points.length < 4)) throw Error('Boolean profile has an invalid contour.');
      return parsed.map(s => s.points.slice(0, -1).map(p => [p.x, p.y]));
    }
    if ((d.match(/m/gi) || []).length !== 1 || !/z\s*$/i.test(d)) throw Error('Use a single closed path. Compound paths and holes need separate profiles.');
    const length = el.getTotalLength(); points = Array.from({ length: 128 }, (_, i) => { const p = el.getPointAtLength(length * i / 128); return [p.x, p.y]; });
  } else throw Error('Closed geometry supports rectangles, polygons, circles, ellipses and single closed paths. Ungroup symbols first.');
  return [points];
}

const area = points => points.reduce((sum,p,i) => { const q=points[(i+1)%points.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0)/2;
const contains = (point, loop) => loop.reduce((inside,p,i) => { const q=loop[(i+1)%loop.length]; return ((p[1]>point[1]) !== (q[1]>point[1])) && point[0] < (q[0]-p[0])*(point[1]-p[1])/(q[1]-p[1])+p[0] ? !inside : inside; },false);
function profileGroups(loops) {
  const nodes=loops.map((points,i)=>({points,i,area:Math.abs(area(points)),parent:null,depth:0}));
  for(const node of nodes){const parents=nodes.filter(other=>other!==node&&other.area>node.area&&contains(node.points[0],other.points)).sort((a,b)=>a.area-b.area);node.parent=parents[0]||null;}
  const depth=node=>node.parent?depth(node.parent)+1:0;nodes.forEach(node=>node.depth=depth(node));
  return nodes.filter(node=>node.depth%2===0).map(node=>({points:node.points,holes:nodes.filter(child=>child.parent===node&&child.depth%2===1).map(child=>child.points)}));
}

export function closedCanvasProfiles(elements) {
  if (!elements?.length) throw Error('Select one or more closed 2D shapes.');
  return Array.from(elements).map(el => {
    const matrix = artworkMatrix(el);
    const loops = localClosedLoops(el).map(loop => loop.map(([x, y]) => { const p = new DOMPoint(x, y).matrixTransform(matrix); return [p.x, p.y]; }));
    if (loops.some(points => points.length < 3 || points.some(p => !p.every(Number.isFinite)))) throw Error('Selected profile has invalid coordinates.');
    return { id: el.id || '', name: el.getAttribute('data-label') || el.id || '2D profile', loops };
  });
}

export function selectedProfiles(editor, unitScale) {
  const selection = Array.from(editor?._selection?.length ? editor._selection : editor?.selectedElements || []);
  if (!selection.length) throw Error('Select closed shapes on the 2D canvas first, then reopen 3D.');
  if (!Number.isFinite(unitScale) || unitScale <= 0 || unitScale > 10000) throw Error('Enter a positive drawing-unit scale.');
  const profiles = [];
  // The page rect is the frame both this and the underlay measure against. A
  // document without one falls back to the SVG origin, which is what this did
  // before the underlay existed to reveal the difference.
  const root = selection[0]?.ownerSVGElement;
  const bg = root?.querySelector('#_canvasBg');
  const page = bg && Number.isFinite(parseFloat(bg.getAttribute('width')))
    ? { w: parseFloat(bg.getAttribute('width')), h: parseFloat(bg.getAttribute('height')) }
    : { w: 0, h: 0 };
  for (const profile of closedCanvasProfiles(selection)) for (const group of profileGroups(profile.loops)) {
    const points = group.points, allPoints=[...points,...group.holes.flat()];
    const xs = allPoints.map(p => p[0]), ys = allPoints.map(p => p[1]); const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    // Boxwood owns screen-to-world centering; world uses Z up, X/Y plan coordinates.
    // Centre on the PAGE, not the SVG origin: the page rect (#_canvasBg) is the
    // shared frame the 2D underlay is also placed against, so an extrusion lands
    // where its source shape sits on the drawing. Passing 0,0 here measured
    // against the SVG origin instead, which put every extrusion at roughly twice
    // its offset from the page centre -- invisible while nothing else was on the
    // ground plane to compare it to.
    const mapped = window.Boxwood.toThreeTransform({ box }, page.w, page.h, 1, 0);
    const cx = mapped.position[0], cy = mapped.position[1];
    // Points are LOCAL to the object's origin, so they must be measured against
    // the shape's own centre in SVG coordinates -- not against cx/cy, which are
    // already page-centred AND Y-flipped. Subtracting a world-frame centre from
    // a raw SVG coordinate mixed two frames and pushed the outline away from the
    // origin it is drawn around, so the solid stood beside its own footprint.
    const mx = box.x + box.w / 2, my = box.y + box.h / 2;
    profiles.push({
      name: profile.name,
      points: points.map(([x, y]) => [(x - mx) * unitScale, -(y - my) * unitScale]),
      holes: group.holes.map(loop => loop.map(([x,y]) => [(x-mx)*unitScale, -(y-my)*unitScale])),
      position: [cx * unitScale, cy * unitScale, 0],
    });
  }
  return profiles;
}

// Coordinate extraction is relative to the artwork frame, never the camera.
export function artworkMatrix(el) {
  const frame = el.closest('#_cameraRotGroup') || el.ownerSVGElement;
  const a = frame.getCTM(), b = el.getCTM();
  if (!a || !b) throw Error('The selected drawing is not available.');
  return a.inverse().multiply(b);
}

export function selectedPaths(editor, unitScale, units, elements) {
  const selection = elements || Array.from(editor?._selection?.length ? editor._selection : editor?.selectedElements || []);
  if (!selection.length) throw Error('Select a physical line or polyline route on the 2D canvas first.');
  if (!Number.isFinite(unitScale) || unitScale <= 0 || unitScale > 10000) throw Error('Enter a positive drawing-unit scale.');
  return selection.map(el => {
    const tag = el.tagName?.toLowerCase(); let points;
    if (tag === 'line') points = [[el.x1.baseVal.value, el.y1.baseVal.value], [el.x2.baseVal.value, el.y2.baseVal.value]];
    else if (tag === 'polyline') points = Array.from(el.points, p => [p.x, p.y]);
    else if(tag==='path'){
      const d=el.getAttribute('d')||'';if((d.match(/m/gi)||[]).length!==1||/z/i.test(d))throw Error('Use one open path for a route; split closed or compound paths first.');
      const length=el.getTotalLength();if(!Number.isFinite(length)||length<=0)throw Error('The route has no measurable length.');
      points=Array.from({length:128},(_,i)=>{const p=el.getPointAtLength(length*i/127);return [p.x,p.y];});
    }else throw Error('Wall/conduit conversion accepts lines, polylines and single open paths. Trace schematic connections as physical routes first.');
    if (points.length < 2 || points.length > 128) throw Error('Use a route with 2–128 points.');
    const matrix = artworkMatrix(el);
    points = points.map(([x, y]) => { const p = new DOMPoint(x, y).matrixTransform(matrix); return [p.x, p.y]; });
    const bg = el.ownerSVGElement.querySelector('#_canvasBg');
    const w = parseFloat(bg?.getAttribute('width')) || 0, h = parseFloat(bg?.getAttribute('height')) || 0;
    const box = { x: Math.min(...points.map(p => p[0])), y: Math.min(...points.map(p => p[1])) };
    box.w = Math.max(...points.map(p => p[0])) - box.x; box.h = Math.max(...points.map(p => p[1])) - box.y;
    const placed = window.Boxwood.toThreeTransform({ box }, w, h, 1, 0);
    return {
      name: (el.getAttribute('data-label') || el.id || '2D route').slice(0, 110),
      path: points.map(([x, y]) => [(x - box.x - box.w / 2) * unitScale, -(y - box.y - box.h / 2) * unitScale]),
      position: [placed.position[0] * unitScale, placed.position[1] * unitScale, 0],
      source: { elementId: el.id || '', revision: JSON.stringify({ points, w, h }), unitScale, units },
    };
  });
}
