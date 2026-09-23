// SPDX-License-Identifier: MIT
import * as T from '../../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../../vendor/three/OrbitControls.js';
import { TransformControls } from '../../../vendor/three/TransformControls.js';
import { compileExpression } from './equations.mjs';
import { collisionPositions } from './model.mjs';
import { buildMolecule } from './molecular-view.mjs';
import { annotationPosition, components, planarFaces, planarFaceOf } from './editing.mjs';
import { pathSolidMesh } from './path-solids.mjs';
import { captureUnderlay } from './underlay.mjs';
// CPK-family colors, muted to sit against the light viewport ground. Elements
// outside this set fall back to purple rather than guessing a shade.
const COLORS = { H: '#e6ecf0', C: '#526672', O: '#dc5d55', N: '#4c82d7', S: '#d6b43a', P: '#c48a48',
  F: '#6fbf73', Cl: '#5fae5f', Br: '#a2543a', I: '#8b5fb0', B: '#c98f7a', Si: '#9199a0',
  Na: '#8f62c4', K: '#7d55b5', Mg: '#5aa86a', Ca: '#7f9aa5', Fe: '#c07235', Zn: '#7a8b99', Se: '#c4a03a' };
const dispose = root => root.traverse(n => { n.geometry?.dispose(); if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose()); n.dispose?.(); });

export class SpatialViewport {
  constructor(host, callbacks) {
    this.host = host; this.callbacks = callbacks; this.groups = new Map(); this.recipes = new Map(); this.time = 0; this.playing = false; this.wireframe = false; this.level = 'all'; this.queue = []; this.request = 0;
    this.scene = new T.Scene(); this.scene.background = new T.Color('#e4eaed');
    this.camera = new T.PerspectiveCamera(45, 1, .01, 100000); this.camera.up.set(0, 0, 1); this.camera.position.set(12, -16, 12);
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); this.renderer.domElement.setAttribute('aria-label', '3D scene. Drag to orbit, right-drag to pan, scroll to zoom.'); this.renderer.domElement.tabIndex = 0;
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.addEventListener('change', () => this.invalidate());
    this.transform = new TransformControls(this.camera, this.renderer.domElement); this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', e => { this.controls.enabled = !e.value; this.dragging = e.value; });
    this.transform.addEventListener('change', () => this.invalidate());
    this.transform.addEventListener('mouseUp', () => {
      const g = this.transform.object;
      if (g) callbacks.transform(g.userData.id, { position: g.position.toArray(), rotation: [g.rotation.x, g.rotation.y, g.rotation.z], scale: g.scale.toArray() });
    });
    this.scene.add(new T.HemisphereLight(0xffffff, 0x788c96, 2)); const light = new T.DirectionalLight(0xffffff, 2); light.position.set(6, -8, 12); this.scene.add(light);
    this.grid = new T.GridHelper(40, 40, 0x6b929f, 0xbdcdd3); this.grid.rotation.x = Math.PI / 2; this.scene.add(this.grid);
    this.scene.add(new T.AxesHelper(5));
    this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2();
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', e => { this.down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (e.button || this.dragging || this.transform.axis || !this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return;
      const r = canvas.getBoundingClientRect(); this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (this.sketch) {
        const point = this.raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), 0), new T.Vector3());
        if (point) {
          this.sketchPoints.push(point.clone()); this.sketch([point.x, point.y]);
          if (this.sketchLine) { this.scene.remove(this.sketchLine); dispose(this.sketchLine); }
          this.sketchLine = new T.Line(new T.BufferGeometry().setFromPoints(this.sketchPoints), new T.LineBasicMaterial({ color: '#bf6f25' })); this.scene.add(this.sketchLine); this.invalidate();
        }
        return;
      }
      const hit = this.raycaster.intersectObjects([...this.groups.values()].filter(g => g.visible), true)[0];
      let node = hit?.object; while (node && !node.userData.id) node = node.parent;
      let component=null;
      if(hit && node) {
        const recipe=this.recipes.get(node.userData.id),scope=this.pickScope||'object';
        if(recipe?.kind==='mesh' && ['vertex','edge','face','planar'].includes(scope)) {
          const fi=(hit.object.userData.faceStart||0)+hit.faceIndex,face=recipe.triangles[fi];
          if(scope==='planar')component=planarFaceOf(recipe,fi);
          else if(scope==='face')component=recipe.faceIds?.[fi]||`f${fi}`;
          else if(face) {
            const local=node.worldToLocal(hit.point.clone());
            if(scope==='vertex')component=face.map(i=>({id:recipe.vertexIds?.[i]||`v${i}`,d:local.distanceTo(new T.Vector3(...recipe.vertices[i]))})).sort((a,b)=>a.d-b.d)[0].id;
            else component=components(recipe,'edge').filter(e=>face.some(i=>(recipe.vertexIds?.[i]||`v${i}`)===e.id.split('/')[0]) && face.some(i=>(recipe.vertexIds?.[i]||`v${i}`)===e.id.split('/')[1])).sort((a,b)=>local.distanceTo(new T.Vector3(...a.position))-local.distanceTo(new T.Vector3(...b.position)))[0]?.id;
          }
        } else if(recipe?.kind==='molecule' && hit.instanceId!==undefined) {
          const atomId=hit.object.userData.atomIds?.[hit.instanceId],atom=recipe.atoms.find((a,i)=>(a.id||`a${i}`)===atomId);
          component=scope==='atom'?atomId:scope==='residue'?atom?.residueId:scope==='chain'?atom?.chainId:null;
        } else if(recipe?.path && ['vertex','edge'].includes(scope)) {
          const local=node.worldToLocal(hit.point.clone());component=components(recipe,scope).sort((a,b)=>local.distanceTo(new T.Vector3(...a.position))-local.distanceTo(new T.Vector3(...b.position)))[0]?.id;
        }
      }
      callbacks.select(node?.userData.id || null,component);
    });
    canvas.addEventListener('dblclick', e => {
      if (this.sketch || this.dragging || e.button) return;
      const r = canvas.getBoundingClientRect(); this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects([...this.groups.values()].filter(g => g.visible), true)[0];
      let node = hit?.object; while (node && !node.userData.id) node = node.parent;
      const recipe = node && this.recipes.get(node.userData.id);
      if (hit && node && recipe?.kind === 'mesh' && hit.faceIndex != null) {
        const index = (hit.object.userData.faceStart || 0) + hit.faceIndex;
        // Double-click means the flat side, not the triangle under the cursor.
        const planar = planarFaceOf(recipe, index);
        if (planar) callbacks.select(node.userData.id, planar, 'planar');
        else callbacks.select(node.userData.id, recipe.faceIds?.[index] || `f${index}`, 'face');
      }
    });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.setPlaying(false); callbacks.error('Graphics context lost. Close and reopen 3D to restore the scene.'); });
    this.resize = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.invalidate(); }); this.resize.observe(host);
    this.visibility = () => { this.lastFrame = 0; if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; } else this.invalidate(); };
    document.addEventListener('visibilitychange', this.visibility);
    try { this.resetWorker(); } catch (e) { this.dispose(); throw e; }
    this.controls.update();
  }
  resetWorker() {
    this.worker?.terminate(); this.queue = []; this.busy = false;
    this.worker = new Worker(new URL('./geometry.worker.mjs?v=1', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const g = this.groups.get(data.id);
      if (data.request !== this.currentRequest || !g) return;
      if (data.error) this.callbacks.error(data.error);
      else if (!data.done) {
        if (!(data.positions instanceof Float32Array) || !(data.normals instanceof Float32Array) || !(data.indices instanceof Uint32Array) || data.normals.length !== data.positions.length) {
          this.worker.terminate(); this.queue = []; this.busy = false;
          this.callbacks.error('Graph worker assets are out of date. Reload the editor to update them.'); return;
        }
        let tile = g.children.find(c => c.userData.row === data.row);
        let geometry = tile?.geometry;
        if (geometry && geometry.attributes.position.array.length === data.positions.length && geometry.index.array.length === data.indices.length) {
          for (const [name, values] of [['position', data.positions], ['normal', data.normals]]) { geometry.attributes[name].array.set(values); geometry.attributes[name].needsUpdate = true; }
          geometry.index.array.set(data.indices); geometry.index.needsUpdate = true;
        } else {
          geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(data.positions, 3).setUsage(T.DynamicDrawUsage)); geometry.setAttribute('normal', new T.BufferAttribute(data.normals, 3).setUsage(T.DynamicDrawUsage)); geometry.setIndex(new T.BufferAttribute(data.indices, 1).setUsage(T.DynamicDrawUsage));
          if (tile) { tile.geometry.dispose(); tile.geometry = geometry; }
          else { tile = new T.Mesh(geometry, this.material(this.recipes.get(data.id).color)); tile.userData.row = data.row; g.add(tile); }
        }
        geometry.computeBoundingSphere();
        this.invalidate();
      }
      if (data.done || data.error) { this.busy = false; this.nextJob(); }
    };
    this.worker.onerror = () => { this.busy = false; this.queue = []; this.callbacks.error('Graph worker could not start. Serve the editor over HTTP and allow same-origin workers.'); };
  }
  material(color, extras = {}) { return new T.MeshStandardMaterial({ color, roughness: .7, metalness: .05, side: T.DoubleSide, wireframe: this.wireframe, ...extras }); }
  setSketch(callback) {
    this.sketch = callback; this.sketchPoints = []; this.controls.enableRotate = !callback;
    if (this.sketchLine) { this.scene.remove(this.sketchLine); dispose(this.sketchLine); this.sketchLine = null; }
    this.renderer.domElement.style.cursor = callback ? 'crosshair' : ''; this.invalidate();
  }
  mesh(geometry, color, extras) { return new T.Mesh(geometry, this.material(color, extras)); }
  build(o) {
    const g = new T.Group(); g.userData.id = o.id;
    if (o.kind === 'box') g.add(this.mesh(new T.BoxGeometry(1, 1, 1), o.color));
    if (o.kind === 'sphere') g.add(this.mesh(new T.SphereGeometry(1, 24, 16), o.color));
    if (o.kind === 'cylinder') { const m = this.mesh(new T.CylinderGeometry(.5, .5, 1, 24), o.color); m.rotation.x = Math.PI / 2; g.add(m); }
    if (o.kind === 'extrusion') {
      const shape = new T.Shape(o.points.map(p => new T.Vector2(...p))); shape.closePath();
      shape.holes = (o.holes || []).map(loop => { const hole=new T.Path(loop.map(p=>new T.Vector2(...p))); hole.closePath(); return hole; });
      g.add(this.mesh(new T.ExtrudeGeometry(shape, { depth: o.depth, bevelEnabled: false, steps: 1 }), o.color));
    }
    if (['wall', 'conduit'].includes(o.kind)) {
      const data = pathSolidMesh(o);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(data.triangles.flatMap(face => face.flatMap(i => data.vertices[i])), 3));
      geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      const mesh = this.mesh(geometry, o.color);
      mesh.userData.components = data.components; // faceIndex -> persistent, object-scoped component ID
      g.add(mesh);
    }
    if (o.kind === 'vector') {
      const v = new T.Vector3(...o.vector), length = v.length(); g.add(new T.ArrowHelper(v.normalize(), new T.Vector3(), length, o.color, Math.min(.4, length * .2), Math.min(.2, length * .1)));
    }
    if (o.kind === 'plane') {
      const mesh=this.mesh(new T.PlaneGeometry(o.size,o.size),o.color,{transparent:true,opacity:.45});
      const n=new T.Vector3(...o.normal),length=n.length();n.normalize();mesh.position.copy(n).multiplyScalar(o.offset/length);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);g.add(mesh);
    }
    if (o.kind==='experiment' && o.experiment.kind==='particles') {
      for(const b of o.experiment.bodies)g.add(this.mesh(new T.SphereGeometry(b.radius,16,12),o.color));
      for(const plane of o.experiment.planes||[]){const normal=new T.Vector3(...plane.normal),length=normal.length();normal.normalize();const mesh=this.mesh(new T.PlaneGeometry(10,10),'#78909c',{side:T.DoubleSide,transparent:true,opacity:.3});mesh.position.copy(normal.clone().multiplyScalar(plane.offset/length));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);g.add(mesh);}
    }
    if (o.kind === 'molecule') buildMolecule(g,o,c=>this.material(c));
    if (o.kind === 'mesh') {
      const triangles = o.triangles.length > 0, data = triangles ? o.triangles : o.vertices;
      for (let start = 0; start < data.length; start += 4096) {
        const chunk = data.slice(start, start + 4096);
        const positions = new Float32Array(triangles ? chunk.flatMap(face => face.flatMap(i => o.vertices[i])) : chunk.flat());
        const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3)); geometry.computeBoundingSphere();
        if (triangles) { geometry.computeVertexNormals(); const mesh=this.mesh(geometry,o.color);mesh.userData.faceStart=start;g.add(mesh); }
        else g.add(new T.Points(geometry, new T.PointsMaterial({ color: o.color, size: 3, sizeAttenuation: false })));
      }
    }
    if (o.kind === 'orbital') for (const sign of [-1, 1]) { const m = this.mesh(new T.SphereGeometry(1, 24, 16), sign < 0 ? '#db9561' : '#658cca', { transparent: true, opacity: .6 }); m.scale.set(.65, .65, 1.2); m.position.z = sign * 1.2; g.add(m); }
    if (o.kind === 'collision') for (const color of ['#168ca3', '#cd8841']) g.add(this.mesh(new T.SphereGeometry(.5, 24, 16), color));
    return g;
  }
  molecule(g, o) {
    const dummy = new T.Object3D(), color = new T.Color();
    // 512-instance tiles bound draw/pick work and give frustum culling useful bounds.
    for (let start = 0; start < o.atoms.length; start += 512) {
      const atoms = o.atoms.slice(start, start + 512);
      const mesh = new T.InstancedMesh(new T.SphereGeometry(1, 12, 8), this.material('#ffffff'), atoms.length);
      atoms.forEach((a, i) => { dummy.position.set(...a.position); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(a.element === 'H' ? .22 : .36); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(COLORS[a.element] || '#a875bd')); });
      mesh.computeBoundingSphere(); g.add(mesh);
    }
    for (let start = 0; start < o.bonds.length; start += 512) {
      const bonds = o.bonds.slice(start, start + 512); const mesh = new T.InstancedMesh(new T.CylinderGeometry(.08, .08, 1, 6), this.material('#91a2ac'), bonds.length);
      bonds.forEach(([a, b], i) => { const p = new T.Vector3(...o.atoms[a].position), q = new T.Vector3(...o.atoms[b].position), delta = q.clone().sub(p);
        dummy.position.copy(p).add(q).multiplyScalar(.5); dummy.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize()); dummy.scale.set(1, delta.length(), 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.computeBoundingSphere(); g.add(mesh);
    }
  }
  sync(scene) {
    this.labelsDirty=true;
    if(this.selectionMarker){this.scene.remove(this.selectionMarker);dispose(this.selectionMarker);this.selectionMarker=null;}
    this.transform.detach(); this.resetWorker();
    const ids = new Set(scene.objects.map(o => o.id));
    for (const [id, g] of this.groups) if (!ids.has(id)) { this.scene.remove(g); dispose(g); this.groups.delete(id); this.recipes.delete(id); }
    for (const o of scene.objects) {
      let g = this.groups.get(o.id); const old = this.recipes.get(o.id);
      const geometryKey = v => JSON.stringify(v && Object.fromEntries(Object.entries(v).filter(([k]) => !['name', 'position', 'rotation', 'scale', 'visible', 'level', 'animation', 'annotations', 'sourceText', 'sourceFeature', 'sourceRecipe', 'scenario', 'runManifest', 'importInfo', 'field', 'graph', 'booleanRecipe', 'feature', 'geometryRevision'].includes(k))));
      if (!g || geometryKey(old) !== geometryKey(o)) {
        if (g) { this.scene.remove(g); dispose(g); }
        g = this.build(o); this.groups.set(o.id, g); this.scene.add(g);
      }
      this.recipes.set(o.id, structuredClone(o));
      g.position.set(...o.position); g.rotation.set(...o.rotation); g.scale.set(...o.scale);
      g.userData.animation = o.animation ? { ...o.animation, fn: compileExpression(o.animation.equation) } : null;
      g.visible = o.visible && (this.level === 'all' || o.level === Number(this.level));
      if (o.kind === 'surface') this.queue.push(o.id);
    }
    this.nextJob(); this.evaluate(); this.invalidate();
  }
  nextJob() {
    if (this.busy || !this.queue.length || this.disposed) return;
    const id = this.queue.shift(), o = this.recipes.get(id); if (!o) return this.nextJob();
    this.busy = true; this.currentRequest = ++this.request;
    this.worker.postMessage({ request: this.currentRequest, id, equation: o.equation, min: o.min, max: o.max, resolution: o.resolution, time: this.time });
  }
  select(id) { this.transform.detach(); const g = this.groups.get(id); if (g?.visible && !this.playing) this.transform.attach(g); this.invalidate(); }
  setPanMode(value) { this.controls.mouseButtons.LEFT = value ? T.MOUSE.PAN : T.MOUSE.ROTATE; this.renderer.domElement.style.cursor = value ? 'grab' : ''; }
  setPlaying(value) { this.playing = value; this.lastFrame = 0; if (value) this.transform.detach(); this.invalidate(); }
  setTime(value) { this.time = Math.max(0, Math.min(3600, value)); this.evaluate(); this.queueGraphs(); this.invalidate(); }
  queueGraphs() { for (const [id, o] of this.recipes) if (o.kind === 'surface' && this.groups.get(id).visible && !this.queue.includes(id)) this.queue.push(id); this.nextJob(); }
  evaluate() {
    for (const [id, g] of this.groups) {
      const o = this.recipes.get(id); if (!g.visible) continue;
      if(o.kind==='molecule' && o.trajectory && g.userData.updateAtoms){const frame=Math.min(o.trajectory.frames.length-1,Math.floor(this.time*24));g.userData.updateAtoms(o.trajectory.frames[frame]);}
      if (o.kind==='experiment' && o.experiment.kind==='particles') {
        const r=o.result;let index=r.times.findIndex(t=>t>=this.time);if(index<0)index=r.times.length-1;const prev=Math.max(0,index-1),span=r.times[index]-r.times[prev],alpha=span?Math.min(1,Math.max(0,(this.time-r.times[prev])/span)):0;
        g.children.slice(0,o.experiment.bodies.length).forEach((mesh,i)=>mesh.position.set(...r.frames[prev][i].map((v,k)=>v+(r.frames[index][i][k]-v)*alpha)));
      }
      if (o.kind === 'collision') collisionPositions(this.time).forEach((p, i) => g.children[i].position.set(...p));
      const a = g.userData.animation;
      if (a) { const v = a.fn({ x: o.position[0], y: o.position[1], z: o.position[2], t: this.time }); if (Number.isFinite(v) && Math.abs(v) <= 1e6) {
        if (a.axis.startsWith('r')) g.rotation[a.axis[1]] = o.rotation['xyz'.indexOf(a.axis[1])] + v;
        else g.position[a.axis] = o.position['xyz'.indexOf(a.axis)] + v;
      } }
    }
  }
  setWireframe(value) { this.wireframe = value; for (const g of this.groups.values()) g.traverse(n => { if (n.material && 'wireframe' in n.material) n.material.wireframe = value; }); this.invalidate(); }
  setLevel(value) { this.level = value; for (const [id, g] of this.groups) { const o = this.recipes.get(id); g.visible = o.visible && (value === 'all' || o.level === Number(value)); } this.transform.detach(); this.invalidate(); }
  /**
   * Show the 2D drawing on the ground plane, or clear it.
   *
   * A BACKDROP, not an object: added to `scene` directly and never to `groups`,
   * so the raycaster (which only tests `groups`) cannot pick it, the transform
   * gizmo cannot grab it, export cannot see it and the scene JSON never carries
   * it. It is the same category of thing as the grid and the axes.
   *
   * Rasterized rather than traced as vectors: a texture reproduces everything
   * the canvas can draw -- text, filters, gradients -- where line geometry would
   * silently drop them. For a ground-plane reference, fidelity to what was
   * actually drawn beats crispness under magnification.
   */
  async setUnderlay(editor, unitScale) {
    this.clearUnderlay();
    if (!editor) return null;
    const shot = captureUnderlay(editor, unitScale);
    const texture = await this.rasterize(shot);
    // A dispose() during the await leaves nothing to attach to, and adding to a
    // torn-down scene leaks the texture.
    if (this.disposed) { texture.dispose(); return null; }
    texture.colorSpace = T.SRGBColorSpace;
    const material = new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: .85,
      // Lit materials would shade the drawing by the scene lights; a drawing has
      // no surface normal worth shading. DoubleSide so it reads from below too.
      side: T.DoubleSide, depthWrite: false });
    this.underlay = new T.Mesh(new T.PlaneGeometry(shot.width, shot.height), material);
    this.underlay.position.set(...shot.position);
    // Just under z=0 with a polygon offset: coplanar with the grid and with any
    // footprint drawn at z=0, which would otherwise z-fight.
    // Slightly BELOW the grid and drawn AFTER it. renderOrder -1 drew the
    // underlay first, and the grid -- opaque and depth-writing at z=0 -- then
    // painted straight over it, so the plane was present, textured and
    // correctly placed but never visible. Ordering after the grid with
    // depthWrite off lets the drawing read through the grid lines instead.
    this.underlay.position.z = -0.002;
    this.underlay.renderOrder = 1;
    this.scene.add(this.underlay);
    this.invalidate();
    return shot;
  }
  clearUnderlay() {
    if (!this.underlay) return;
    this.scene.remove(this.underlay);
    this.underlay.material.map?.dispose(); this.underlay.material.dispose(); this.underlay.geometry.dispose();
    this.underlay = null; this.invalidate();
  }
  // Blob URL rather than a data: URI -- a large drawing exceeds practical data:
  // limits, and the URL is revoked either way.
  rasterize({ markup, box }) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      // Cap the texture so a large page cannot allocate an unbounded one.
      const scale = Math.min(2, 2048 / Math.max(box.w, box.h));
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(box.w * scale)); canvas.height = Math.max(1, Math.round(box.h * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          const texture = new T.CanvasTexture(canvas);
          texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          resolve(texture);
        } catch (e) { reject(Error('The 2D drawing could not be rasterized: ' + e.message)); }
        finally { URL.revokeObjectURL(url); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(Error('The 2D drawing could not be rendered as an image. Fonts or images loaded from another origin are the usual cause.')); };
      image.src = url;
    });
  }
  fit(view = 'perspective') {
    const box = new T.Box3(); for (const g of this.groups.values()) if (g.visible) box.expandByObject(g);
    const center = box.isEmpty() ? new T.Vector3() : box.getCenter(new T.Vector3()); const size = box.isEmpty() ? 10 : Math.max(2, box.getSize(new T.Vector3()).length());
    const direction = { top: [0, -.001, 1], front: [0, -1, .001], side: [1, 0, .001], perspective: [1, -1.4, 1] }[view];
    this.controls.target.copy(center); this.camera.position.copy(center).add(new T.Vector3(...direction).normalize().multiplyScalar(size * 1.6)); this.camera.near = Math.max(.001, size / 10000); this.camera.far = Math.max(1000, size * 100); this.camera.updateProjectionMatrix(); this.controls.update(); this.invalidate();
  }
  /**
   * The meshes a mesh export may take, and how many triangles they carry.
   *
   * `id` selects one object; passing null takes the whole visible scene, which
   * is what someone sending a model to a slicer or a renderer almost always
   * wants — exporting a six-part assembly one file at a time is not an export.
   *
   * Helpers are skipped by construction: `this.groups` holds only real objects,
   * so the grid, axes and transform gizmo are never walked.
   *
   * InstancedMesh is refused rather than silently dropped. Molecules and
   * orbitals draw their atoms and lobes as instances — a file that quietly
   * omitted every atom would look like a successful export of an empty shell.
   */
  _exportMeshes(id) {
    const groups = id == null
      ? [...this.groups.values()].filter(g => g.visible)
      : [this.groups.get(id)];
    if (!groups[0]) throw Error(id == null ? 'Nothing to export. Add an object first.' : 'Select an object to export.');
    const meshes = []; let count = 0, instanced = false, skipped = 0;
    for (const group of groups) {
      group.updateWorldMatrix(true, true);
      let had = false, lost = false;
      group.traverse(node => {
        if (node.isInstancedMesh) { instanced = true; lost = true; return; }
        if (node.isMesh) { had = true; count += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3; meshes.push(node); }
      });
      if (lost && !had) skipped++;
    }
    // Read by the caller to report what did not make it into the file.
    this.lastExportSkipped = skipped;
    if (!count) {
      throw Error(instanced
        ? 'Mesh export covers solid geometry. Molecules, orbitals and vectors are drawn as instanced or helper geometry and carry no exportable surface — save the project as JSON to keep them.'
        : 'Nothing exportable here. Mesh export covers primitives, extrusions, surfaces and triangle meshes.');
    }
    if (count > 200000) throw Error(`Mesh export handles up to 200000 triangles; this is ${count}. Reduce surface resolution or export one object at a time.`);
    return { meshes, count, instanced };
  }

  /**
   * Triangles in world space, as [a,b,c] vertex triples.
   *
   * The vectors are FRESH per triangle, not reused scratch objects. A pooled
   * version is faster and is correct for a consumer that finishes with each
   * triangle before asking for the next (STL does), but silently wrong for one
   * that collects them — `[...triangles]` would hand back N copies of the same
   * three vectors, i.e. the last triangle N times. Correctness over the
   * allocation, and 200k triangles is the ceiling anyway.
   */
  *_triangles(meshes) {
    for (const mesh of meshes) {
      const positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
      for (let i = 0; i < (index?.count || positions.count); i += 3) {
        const tri = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
        tri.forEach((v, j) => v.fromBufferAttribute(positions, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
        yield tri;
      }
    }
  }

  /**
   * Wavefront OBJ — text, widely readable, and unlike STL it keeps objects
   * separate (`o` groups) instead of fusing everything into one triangle soup.
   *
   * Vertices are written per object rather than deduplicated across the file;
   * an exact-match weld would change shared-edge topology in ways a user did
   * not ask for, and every consumer of OBJ handles duplicate vertices.
   */
  exportOBJ(id) {
    const { meshes } = this._exportMeshes(id);
    const lines = ['# Exported by Ginexys Construct', '# Units are scene units; OBJ carries no unit metadata.'];
    let base = 1;
    for (const mesh of meshes) {
      const name = (mesh.parent?.userData?.id || mesh.uuid).replace(/\s+/g, '_');
      lines.push(`o ${name}`);
      const tris = [...this._triangles([mesh])];
      for (const [a, b, c] of tris) for (const v of [a, b, c]) lines.push(`v ${v.x} ${v.y} ${v.z}`);
      for (let i = 0; i < tris.length; i++) lines.push(`f ${base + i * 3} ${base + i * 3 + 1} ${base + i * 3 + 2}`);
      base += tris.length * 3;
    }
    return lines.join('\n') + '\n';
  }

  exportSTL(id) {
    const { meshes, count } = this._exportMeshes(id);
    const bytes = new ArrayBuffer(84 + count * 50), data = new DataView(bytes); data.setUint32(80, count, true); let offset = 84;
    const normal = new T.Vector3(), edge = new T.Vector3();
    for (const [a, b, c] of this._triangles(meshes)) {
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      for (const v of [normal, a, b, c]) for (const value of [v.x, v.y, v.z]) { data.setFloat32(offset, value, true); offset += 4; }
      offset += 2;
    }
    return bytes;
  }
  updateLabels() {
    if(!this.labelLayer){this.labelLayer=document.createElement('div');this.labelLayer.className='spatial-labels';this.host.append(this.labelLayer);this.labelsDirty=true;}
    if(this.labelsDirty){
      this.labelsDirty=false;this.labelLayer.replaceChildren();this.labelRecords=[];
      for(const [id,o]of this.recipes)for(const a of o.annotations||[]){
        if(!a.visible||!a.text||this.labelRecords.length>=64)continue;const position=annotationPosition(o,a);if(!position)continue;
        const span=document.createElement('span');span.textContent=a.text;this.labelLayer.append(span);
        const atomIndices=o.kind==='molecule'?o.atoms.flatMap((atom,i)=>(a.scope==='atom'&&(atom.id||`a${i}`)===a.target)||(a.scope==='residue'&&atom.residueId===a.target)||(a.scope==='chain'&&atom.chainId===a.target)?[i]:[]):[];
        this.labelRecords.push({id,o,a,position,span,atomIndices});
      }
    }
    const occupied=[];
    for(const item of this.labelRecords){const group=this.groups.get(item.id);if(!group?.visible){item.span.hidden=true;continue;}
      let point=item.position;
      if(item.o.trajectory&&item.atomIndices.length){const frame=item.o.trajectory.frames[Math.min(item.o.trajectory.frames.length-1,Math.floor(this.time*24))];point=[0,1,2].map(k=>item.atomIndices.reduce((s,i)=>s+frame[i][k]/item.atomIndices.length,0));}
      const p=group.localToWorld(new T.Vector3(...point)).project(this.camera),x=(p.x+1)*this.host.clientWidth/2,y=(1-p.y)*this.host.clientHeight/2;
      item.span.hidden=p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1||occupied.some(q=>Math.abs(q[0]-x)<90&&Math.abs(q[1]-y)<22);
      if(!item.span.hidden){occupied.push([x,y]);item.span.style.left=`${x}px`;item.span.style.top=`${y}px`;}
    }
  }
  _clearOverlay(name) { const overlay=this[name]; if (!overlay) return; this.scene.remove(overlay); dispose(overlay); this[name]=null; }
  _componentOverlay(id, scope, target, color) {
    const group=this.groups.get(id), recipe=this.recipes.get(id); if (!group || !recipe || !target) return null;
    const material=new T.MeshBasicMaterial({color,transparent:true,opacity:.28,depthTest:false,side:T.DoubleSide});
    const lineMaterial=new T.LineBasicMaterial({color,depthTest:false,linewidth:2});
    const localPoint=p=>group.localToWorld(new T.Vector3(...p));
    if (scope === 'object') { const box=new T.Box3().setFromObject(group); return box.isEmpty() ? null : new T.Box3Helper(box,color); }
    if (recipe.kind === 'mesh') {
      const vertexIndex=(recipe.vertexIds||[]).indexOf(target);
      if (scope === 'vertex' && vertexIndex >= 0) {
        const size=new T.Box3().setFromObject(group).getSize(new T.Vector3()).length() || 1;
        const marker=new T.Mesh(new T.SphereGeometry(Math.max(.025,size*.012),16,12),new T.MeshBasicMaterial({color,depthTest:false})); marker.position.copy(localPoint(recipe.vertices[vertexIndex])); return marker;
      }
      if (scope === 'edge') {
        const ids=target.split('/'), positions=ids.map(v=>(recipe.vertexIds||[]).indexOf(v)).filter(v=>v>=0).map(i=>localPoint(recipe.vertices[i]));
        if (positions.length===2) return new T.Line(new T.BufferGeometry().setFromPoints(positions),lineMaterial);
      }
      if (scope === 'planar') {
        const group=planarFaces(recipe).groups.find(g=>g.id===target);
        if (group) {
          const points=group.triangles.flatMap(t=>recipe.triangles[t].map(i=>localPoint(recipe.vertices[i])));
          const geometry=new T.BufferGeometry().setFromPoints(points);
          geometry.setIndex(points.map((_,i)=>i));
          const mesh=new T.Mesh(geometry,material), overlay=new T.Group(); overlay.add(mesh);
          // Outline the group's boundary only, so interior seams stay hidden.
          const counts=new Map();
          for(const t of group.triangles){const f=recipe.triangles[t];for(let i=0;i<3;i++){const k=[f[i],f[(i+1)%3]].sort((a,b)=>a-b).join(',');counts.set(k,(counts.get(k)||0)+1);}}
          for(const [k,n] of counts){ if(n!==1) continue; const [a,b]=k.split(',').map(Number);
            overlay.add(new T.Line(new T.BufferGeometry().setFromPoints([localPoint(recipe.vertices[a]),localPoint(recipe.vertices[b])]),lineMaterial)); }
          return overlay;
        }
      }
      if (scope === 'face') {
        const index=(recipe.faceIds||[]).indexOf(target), face=recipe.triangles[index];
        if (face) { const geometry=new T.BufferGeometry().setFromPoints(face.map(i=>localPoint(recipe.vertices[i]))); geometry.setIndex([0,1,2]); const mesh=new T.Mesh(geometry,material); const edge=new T.LineLoop(new T.BufferGeometry().setFromPoints(face.map(i=>localPoint(recipe.vertices[i]))),lineMaterial); const overlay=new T.Group(); overlay.add(mesh,edge); return overlay; }
      }
    }
    const component=components(recipe,scope).find(v=>v.id===target);
    if (component) { const size=new T.Box3().setFromObject(group).getSize(new T.Vector3()).length() || 1; const marker=new T.Mesh(new T.SphereGeometry(Math.max(.025,size*.012),16,12),new T.MeshBasicMaterial({color,depthTest:false})); marker.position.copy(localPoint(component.position)); return marker; }
    return null;
  }
  setComponentSelection(id, scope, target) { this._clearOverlay('selectionOverlay'); this.selectionKey=`${id}/${scope}/${target||''}`; const overlay=this._componentOverlay(id,scope,target,'#ff9f1c'); if(overlay){overlay.renderOrder=99;this.selectionOverlay=overlay;this.scene.add(overlay);} this.invalidate(); }
  toggleComponentHighlight(id, scope, target) { const key=`${id}/${scope}/${target||''}`; if(this.highlightKey===key){this._clearOverlay('highlightOverlay');this.highlightKey=null;this.invalidate();return false;} this._clearOverlay('highlightOverlay');const overlay=this._componentOverlay(id,scope,target,'#18b9d1');if(!overlay)return false;overlay.renderOrder=98;this.highlightOverlay=overlay;this.highlightKey=key;this.scene.add(overlay);this.invalidate();return true; }
  bake(id) {
    const o=this.recipes.get(id),group=this.groups.get(id);if(!o||!group||['molecule','vector','experiment'].includes(o.kind))throw Error('Select a static solid or sampled surface to make an editable mesh.');
    const vertices=[],triangles=[],lookup=new Map();group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
    group.traverse(n=>{if(!n.isMesh)return;const matrix=inverse.clone().multiply(n.matrixWorld),p=n.geometry.getAttribute('position'),idx=n.geometry.index,count=idx?idx.count:p.count;
      for(let i=0;i<count;i+=3){const face=[];for(let j=0;j<3;j++){const v=new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(matrix).toArray();const key=v.map(x=>x.toFixed(7)).join(',');if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(v);}face.push(lookup.get(key));}if(new Set(face).size===3)triangles.push(face);}
    });return {vertices,triangles};
  }
  invalidate() { if (!this.frame && !document.hidden && !this.disposed) this.frame = requestAnimationFrame(now => this.render(now)); }
  render(now) {
    this.frame = 0;
    if (this.playing) { if (this.lastFrame) this.time = Math.min(3600, this.time + Math.min(.05, (now - this.lastFrame) / 1000)); this.lastFrame = now; this.evaluate(); if (!this.lastGraph || now - this.lastGraph > 100) { if (!this.busy) this.queueGraphs(); this.lastGraph = now; } if (this.time >= 3600) this.playing = false; }
    this.updateLabels();
    this.renderer.render(this.scene, this.camera); this.callbacks.tick(this.time, this.renderer.info);
    if (this.playing) this.invalidate();
  }
  dispose() {
    this.disposed = true; this.clearUnderlay(); cancelAnimationFrame(this.frame); this.worker?.terminate(); this.resize.disconnect(); document.removeEventListener('visibilitychange', this.visibility);
    this.labelLayer?.remove(); this._clearOverlay('selectionOverlay'); this._clearOverlay('highlightOverlay');
    this.transform.dispose(); this.controls.dispose(); dispose(this.scene); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
