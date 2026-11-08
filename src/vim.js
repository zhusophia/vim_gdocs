// Vim mode state machine. Receives trusted keydowns from the Docs input iframe.
(() => {
  const NS = (window.__vimGDocs = window.__vimGDocs || {});
  const K = () => NS.keys;

  let mode = 'normal'; // normal | insert | visual | vline | command
  let count = '';
  let op = null; // 'd' | 'c' | 'y'
  let pendingG = false;
  let register = '';

  const setMode = (m) => {
    mode = m;
    NS.ui.setMode(m);
  };
  const reset = () => {
    count = '';
    op = null;
    pendingG = false;
  };

  const MOTIONS = {
    h: 'left', H: 'left',
    l: 'right', L: 'right',
    j: 'down', J: 'down',
    k: 'up', K: 'up',
    w: 'wordFwd', b: 'wordBack', e: 'wordEnd',
    0: 'lineStart', $: 'lineEnd',
  };

  const repeat = (n, fn) => {
    for (let i = 0; i < n; i++) fn();
  };

  function runMotion(name, n, shift) {
    repeat(n, () => K().motion[name](shift));
  }

  function selectLines(n, withBreak) {
    const m = K().motion;
    // On a bullet/numbered line, erase only the text so the bullet stays.
    if (withBreak && NS.gutter.lineHasMarker()) withBreak = false;
    m.lineStart(false);
    m.lineEnd(true);
    if (n > 1) {
      repeat(n - 1, () => m.down(true));
      m.lineEnd(true);
    }
    if (withBreak) m.right(true);
  }

  // Apply operator to whatever is currently selected.
  function applyOp(o) {
    const k = K();
    // Short delay so Docs has applied the Shift+motion selection before we act on it.
    setTimeout(() => {
      k.exec('copy'); // fills the register when Docs allows it
      if (o === 'y') k.press('ArrowLeft'); // collapse to selection start
      else k.press('Backspace'); // deletes the selection (execCommand('cut') can silently do nothing)
      NS.gutter.edited();
    }, 40);
    if (o === 'c') setMode('insert');
  }

  function paste() {
    const k = K();
    if (register) {
      k.pasteText(register);
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then((t) => k.pasteText(t)).catch(() => {});
    }
  }

  function openCommand() {
    reset();
    setMode('command');
    NS.ui.openCommand(
      (value) => {
        const m = /^\s*([+-]?)(\d+)\s*$/.exec(value);
        setMode('normal');
        K().focusEditor();
        if (m) {
          const n = Math.min(parseInt(m[2], 10), 5000);
          if (m[1]) {
            // :+N / :-N move relative to the current line
            repeat(n, () => K().press(m[1] === '-' ? 'ArrowUp' : 'ArrowDown'));
            NS.gutter.expect((m[1] === '-' ? -1 : 1) * n);
          } else {
            // :N goes to line N of the document
            K().motion.docTop(false);
            repeat(Math.max(n - 1, 0), () => K().press('ArrowDown'));
            NS.gutter.setLine(Math.max(n, 1));
          }
          NS.gutter.poke();
        }
      },
      () => {
        setMode('normal');
        K().focusEditor();
      }
    );
  }

  function visualKey(e) {
    const k = e.key;
    const n = parseInt(count || '1', 10);
    const m = K().motion;
    const line = mode === 'vline';

    if (/^[1-9]$/.test(k) || (k === '0' && count)) { count += k; return; }

    if (pendingG) {
      pendingG = false;
      if (k === 'g') m.docTop(true);
      count = '';
      return;
    }
    if (k === 'g') { pendingG = true; return; }
    if (k === 'G') { m.docBottom(true); count = ''; return; }

    if (k === 'd' || k === 'c' || k === 'y' || k === 'x') {
      applyOp(k === 'x' ? 'd' : k);
      if (mode !== 'insert') setMode('normal');
      reset();
      return;
    }
    if (k === 'p') { paste(); setMode('normal'); reset(); return; }
    if (k === 'v') { collapse(); setMode(mode === 'visual' ? 'normal' : 'visual'); reset(); return; }
    if (k === 'V') { if (mode === 'vline') { collapse(); setMode('normal'); } else setMode('vline'); reset(); return; }

    const name = MOTIONS[k];
    if (name) {
      if (line && (name === 'left' || name === 'right')) { count = ''; return; }
      runMotion(name, n, true);
      if (name === 'down' || name === 'up') NS.gutter.expect((name === 'down' ? 1 : -1) * n);
      if (line && name === 'down') m.lineEnd(true);
      count = '';
    }
  }

  function collapse() {
    K().press('ArrowRight');
  }

  function normalKey(e) {
    const k = e.key;
    const m = K().motion;

    if (/^[1-9]$/.test(k) || (k === '0' && count)) { count += k; return; }
    const n = parseInt(count || '1', 10);

    if (pendingG) {
      pendingG = false;
      if (k === 'g') {
        m.docTop(!!op);
        if (op) applyOp(op);
        else NS.gutter.setLine(1);
      }
      reset();
      return;
    }

    // Operators
    if (k === 'd' || k === 'c' || k === 'y') {
      if (op === k) {
        selectLines(n, k !== 'c');
        applyOp(k);
        reset();
      } else if (!op) {
        op = k;
        // keep count for the motion
      } else {
        reset();
      }
      return;
    }

    if (k === 'g') { pendingG = true; return; }
    if (k === 'G') {
      m.docBottom(!!op);
      if (op) applyOp(op);
      reset();
      return;
    }

    const name = MOTIONS[k];
    if (name) {
      if (op) {
        runMotion(name, n, true);
        applyOp(op);
      } else {
        runMotion(name, n, false);
        if (name === 'down' || name === 'up') NS.gutter.expect((name === 'down' ? 1 : -1) * n);
      }
      reset();
      return;
    }

    if (op) { reset(); return; } // invalid motion cancels the operator

    switch (k) {
      case 'i': setMode('insert'); break;
      case 'a': m.right(false); setMode('insert'); break;
      case 'I': m.lineStart(false); setMode('insert'); break;
      case 'A': m.lineEnd(false); setMode('insert'); break;
      case 'o':
        m.lineEnd(false); K().press('Enter'); setMode('insert'); break;
      case 'O':
        m.lineStart(false); K().press('Enter'); K().press('ArrowUp'); setMode('insert'); break;
      case 'v': setMode('visual'); break;
      case 'V':
        // select from the start of the current word to the end of the row
        m.wordFwd(false); m.wordBack(false); m.lineEnd(true); setMode('vline'); break;
      case 'p': paste(); break;
      case 'u': repeat(n, () => K().undo()); break;
      case 'r': repeat(n, () => K().redo()); break;
      case ':': openCommand(); return;
      default: break;
    }
    reset();
  }

  function onKeyDown(e) {
    if (!e.isTrusted) return; // ignore our own synthetic events

    // Tell the gutter about Up/Down presses and edits so its line count stays right.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      NS.gutter.expect(e.key === 'ArrowDown' ? 1 : -1);
    }
    if (
      (mode === 'insert' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) ||
      e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete' ||
      ((e.ctrlKey || e.metaKey) && 'vxzy'.includes(e.key.toLowerCase()))
    ) {
      NS.gutter.edited();
    }

    const swallow = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    if (mode === 'command') return;

    if (e.key === 'Escape') {
      if (mode === 'insert') {
        setMode('normal');
      } else if (mode === 'visual' || mode === 'vline') {
        collapse();
        setMode('normal');
      }
      reset();
      swallow();
      NS.gutter.poke();
      return;
    }

    if (mode === 'insert') return;

    // Ctrl/Cmd/Alt combos belong to Docs (copy, paste, Ctrl+Shift+V, Ctrl+Y ...).
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
        swallow(); // would reload the page otherwise
        K().redo();
      }
      return;
    }

    // Backspace, Delete, arrows, Home/End, function keys etc. go straight to Docs.
    if (e.key.length > 1 && e.key !== 'Enter' && e.key !== 'Tab') return;

    swallow();
    if (e.key.length === 1) {
      if (mode === 'normal') normalKey(e);
      else visualKey(e);
      if ('dcxpoOur'.includes(e.key)) NS.gutter.edited();
    }
    NS.gutter.poke();
  }

  // Printable keypresses must not reach Docs outside insert mode.
  function onKeyPress(e) {
    if (e.isTrusted && mode !== 'insert' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  // Remember whatever was last copied/cut so `p` can paste it.
  function onClip(e) {
    try {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (t) register = t;
    } catch (_) {}
  }

  NS.vim = { onKeyDown, onKeyPress, onClip, getMode: () => mode, setMode };
})();
