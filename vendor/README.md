# Pinned 3D dependencies

- `three/`: Three.js **0.180.0**, MIT. Minified module/core plus OrbitControls and
  TransformControls. Control imports are changed from bare `three` to
  `./three.module.min.js`; no behavioral edits. See `three/LICENSE`.
- `boxwood.global.js`: `@canwork/boxwood` **1.2.1**, MIT. Unmodified published
  browser bundle. See `BOXWOOD-LICENSE`.

Files are checked in so standalone use needs no runtime CDN. Three loads lazily.
Refresh Three with `bash scripts/vendor-three.sh` from the tool root. Refresh
Boxwood by copying the published 1.2.1 `dist/boxwood.global.js` and `LICENSE` from
a locally installed package. Do not copy private platform code into this folder.
