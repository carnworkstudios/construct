// SPDX-License-Identifier: MIT
// No Three.js download/parse, WebGL context, worker or animation loop until requested.
(function () {
  const base = new URL('.', document.currentScript.src);
  let loading;
  async function open() {
    const button = document.getElementById('spatialOpenBtn'); if (button.disabled) return;
    button.disabled = true;
    try {
      if (!loading) loading = (async () => {
        if (!window.Boxwood) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = new URL('../../../vendor/boxwood.global.js', base); script.onload = resolve; script.onerror = () => { script.remove(); reject(Error('Could not load the local Boxwood engine.')); }; document.head.append(script); });
        return import(new URL('workspace.mjs', base));
      })().catch(e => { loading = null; throw e; });
      const module = await loading; await module.openWorkspace(window.editor);
    } catch (e) { if (window.editor?.showToast) window.editor.showToast(e.message, 'error'); else alert(e.message); }
    finally { button.disabled = false; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('spatialOpenBtn')?.addEventListener('click', open);
    // Academic symbols live in src/js/domains/academicKit.js and register themselves.
  });
})();
