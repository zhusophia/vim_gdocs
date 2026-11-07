// Bootstrap: wait for the Docs input iframe, attach listeners, start the UI.
(() => {
  const NS = (window.__vimGDocs = window.__vimGDocs || {});
  if (NS.started) return;
  NS.started = true;

  let attachedDoc = null;

  function attach() {
    const d = NS.keys.frameDoc();
    if (!d || d === attachedDoc) return;
    attachedDoc = d;
    d.addEventListener('keydown', NS.vim.onKeyDown, true);
    d.addEventListener('keypress', NS.vim.onKeyPress, true);
    d.addEventListener('copy', NS.vim.onClip);
    d.addEventListener('cut', NS.vim.onClip);
  }

  function start() {
    NS.ui.init();
    NS.gutter.init();
    NS.vim.setMode('normal');
    attach();
    setInterval(attach, 500); // Docs may replace the iframe
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
