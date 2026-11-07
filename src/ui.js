// Mode indicator + ':' command bar. No innerHTML: Docs enforces Trusted Types.
(() => {
  const NS = (window.__vimGDocs = window.__vimGDocs || {});
  const LABELS = { normal: 'NORMAL', insert: 'INSERT', visual: 'VISUAL', vline: 'VISUAL', command: 'COMMAND' };

  let modeEl, cmdEl, cmdInput, handlers = null;

  function init() {
    modeEl = document.createElement('div');
    modeEl.id = 'vimgd-mode';
    document.body.appendChild(modeEl);

    cmdEl = document.createElement('div');
    cmdEl.id = 'vimgd-cmd';
    const prompt = document.createElement('span');
    prompt.textContent = ':';
    cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.spellcheck = false;
    cmdInput.autocomplete = 'off';
    cmdEl.append(prompt, cmdInput);
    document.body.appendChild(cmdEl);

    // Keep Docs' own shortcuts from reacting to typing in the bar.
    for (const type of ['keypress', 'keyup', 'input']) {
      cmdInput.addEventListener(type, (e) => e.stopPropagation());
    }
    cmdInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape' || (e.key === 'Backspace' && cmdInput.value === '')) {
        e.preventDefault();
        finish(false);
      }
    });
    cmdInput.addEventListener('blur', () => finish(false));
  }

  function setMode(mode) {
    if (modeEl) modeEl.textContent = LABELS[mode] || mode.toUpperCase();
  }

  function openCommand(onSubmit, onCancel) {
    handlers = { onSubmit, onCancel };
    cmdInput.value = '';
    cmdEl.classList.add('vimgd-open');
    setTimeout(() => cmdInput.focus(), 0);
  }

  function finish(submit) {
    if (!handlers) return;
    const h = handlers;
    handlers = null; // set first so the blur from closing doesn't fire twice
    const value = cmdInput.value;
    cmdEl.classList.remove('vimgd-open');
    if (submit) h.onSubmit(value);
    else h.onCancel();
  }

  NS.ui = { init, setMode, openCommand };
})();
