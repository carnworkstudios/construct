#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail
spatial_vendor_tmp=$(mktemp -d)
trap 'rm -rf "$spatial_vendor_tmp"' EXIT
npm pack three@0.180.0 --pack-destination "$spatial_vendor_tmp" --silent
python3 - "$spatial_vendor_tmp" <<'PY'
from pathlib import Path
import sys, tarfile, shutil
folder = Path(sys.argv[1])
with tarfile.open(folder / 'three-0.180.0.tgz') as archive:
    for name in ['build/three.module.min.js', 'build/three.core.min.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/controls/TransformControls.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/OBJLoader.js', 'examples/jsm/loaders/STLLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE']:
        content = archive.extractfile('package/' + name).read().decode()
        if 'examples/' in name:
            content = content.replace("from 'three'", "from './three.module.min.js'").replace("'../utils/BufferGeometryUtils.js'", "'./BufferGeometryUtils.js'")
        target = Path('vendor/three') / Path(name).name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
PY
