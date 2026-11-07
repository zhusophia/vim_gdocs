// Sends synthetic key/clipboard events into Google Docs' hidden text-input iframe.
// Runs in the page's MAIN world so Docs sees the keyCode values we set.
(() => {
  const NS = (window.__vimGDocs = window.__vimGDocs || {});
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

  const KEYS = {
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
    ArrowUp: { code: 'ArrowUp', keyCode: 38 },
    ArrowRight: { code: 'ArrowRight', keyCode: 39 },
    ArrowDown: { code: 'ArrowDown', keyCode: 40 },
    Home: { code: 'Home', keyCode: 36 },
    End: { code: 'End', keyCode: 35 },
    Backspace: { code: 'Backspace', keyCode: 8 },
    Delete: { code: 'Delete', keyCode: 46 },
    Enter: { code: 'Enter', keyCode: 13 },
    z: { code: 'KeyZ', keyCode: 90 },
    y: { code: 'KeyY', keyCode: 89 },
  };

  function frame() {
    return document.querySelector('iframe.docs-texteventtarget-iframe');
  }

  function frameDoc() {
    const f = frame();
    try {
      return (f && f.contentDocument) || null;
    } catch (_) {
      return null;
    }
  }

  function target() {
    const d = frameDoc();
    if (!d) return null;
    return d.querySelector('[contenteditable="true"]') || d.body;
  }

  function press(key, mods = {}) {
    const t = target();
    const info = KEYS[key];
    if (!t || !info) return;
    const init = {
      key,
      code: info.code,
      keyCode: info.keyCode,
      which: info.keyCode,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: !!mods.shift,
      ctrlKey: !!mods.ctrl,
      altKey: !!mods.alt,
      metaKey: !!mods.meta,
    };
    for (const type of ['keydown', 'keyup']) {
      const ev = new KeyboardEvent(type, init);
      if (ev.keyCode !== info.keyCode) {
        Object.defineProperty(ev, 'keyCode', { get: () => info.keyCode });
        Object.defineProperty(ev, 'which', { get: () => info.keyCode });
      }
      t.dispatchEvent(ev);
    }
  }

  const L = 'ArrowLeft', R = 'ArrowRight', U = 'ArrowUp', D = 'ArrowDown';
  const word = isMac ? { alt: true } : { ctrl: true };
  const cmd = isMac ? { meta: true } : { ctrl: true };
  const w = (s) => ({ ...word, shift: s });
  const c = (s) => ({ ...cmd, shift: s });

  // Each motion takes `s` = extend the selection (Shift held).
  const motion = {
    left: (s) => press(L, { shift: s }),
    right: (s) => press(R, { shift: s }),
    up: (s) => press(U, { shift: s }),
    down: (s) => press(D, { shift: s }),
    wordBack: (s) => press(L, w(s)),
    wordFwd: (s) => {
      if (isMac) {
        // Alt+Right stops at word ends on Mac: go two ends forward, then back to that word's start.
        press(R, w(s)); press(R, w(s)); press(L, w(s));
      } else {
        press(R, w(s));
      }
    },
    wordEnd: (s) => {
      if (isMac) {
        press(R, w(s));
      } else {
        // Ctrl+Right lands on the next word's start; step back over the gap.
        press(R, { shift: s }); press(R, w(s)); press(L, { shift: s });
      }
    },
    lineStart: (s) => (isMac ? press(L, c(s)) : press('Home', { shift: s })),
    lineEnd: (s) => (isMac ? press(R, c(s)) : press('End', { shift: s })),
    docTop: (s) => (isMac ? press(U, c(s)) : press('Home', c(s))),
    docBottom: (s) => (isMac ? press(D, c(s)) : press('End', c(s))),
  };

  function undo() {
    press('z', cmd);
  }

  function redo() {
    if (isMac) press('z', { meta: true, shift: true });
    else press('y', { ctrl: true });
  }

  // 'copy' or 'cut' on the current Docs selection. Docs handles the clipboard itself.
  function exec(command) {
    const d = frameDoc();
    if (!d) return false;
    try {
      return d.execCommand(command);
    } catch (_) {
      return false;
    }
  }

  function pasteText(text) {
    const t = target();
    if (!t || !text) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  function focusEditor() {
    const f = frame();
    const t = target();
    try {
      if (f && f.contentWindow) f.contentWindow.focus();
      if (t) t.focus();
    } catch (_) {}
  }

  NS.keys = { isMac, frame, frameDoc, target, press, motion, undo, redo, exec, pasteText, focusEditor };
})();
