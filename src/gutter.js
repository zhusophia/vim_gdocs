// Absolute line-number gutter beside the Docs page.
//
// Docs draws page text onto <canvas> tiles and exposes no per-line elements, so we find
// the lines by looking at the pixels: each band of ink is one row of text. Rows are
// numbered from the first body row (header and footer areas are skipped), and each number
// is drawn at its row's position, so numbers only move when the page scrolls.
// A wrapped paragraph counts one number per row, the same steps Up/Down take.
(() => {
  const NS = (window.__vimGDocs = window.__vimGDocs || {});

  const PAGE_W = 816; // page width in CSS px at 100% zoom (US Letter)
  const DEFAULT_TOP = 92; // body starts ~96px below the page top; header ink sits above this
  const BOTTOM_CUT = 90; // footer area: ignore ink below pageBottom - this

  let root;
  const pool = [];
  let lastSig = '';
  let lastCaret = null;
  let bodyTop = DEFAULT_TOP; // CSS px at 100% zoom; set precisely when the cursor is on line 1
  let scanTimer = null;
  let warned = false;

  const cache = new WeakMap(); // canvas -> { lines: [yFraction], emptyStreak }
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d', { willReadFrequently: true });

  const editor = () => document.querySelector('.kix-appview-editor');
  const warn = (msg, err) => {
    if (!warned) { warned = true; console.warn('[vim-gdocs] ' + msg, err || ''); }
  };

  function tiles() {
    const out = [];
    for (const el of document.querySelectorAll('.kix-canvas-tile-content')) {
      const c = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
      if (c && c.width > 0 && c.height > 0 && !out.includes(c)) out.push(c);
    }
    return out
      .map((c) => ({ c, r: c.getBoundingClientRect() }))
      .filter((t) => t.r.width > 50 && t.r.height > 50)
      .sort((a, b) => a.r.top - b.r.top);
  }

  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[s.length >> 1] : 0;
  };

  // Returns the vertical centers (as fractions of tile height) of the text rows on one tile.
  function scan(c, r) {
    const W = 128;
    const H = c.height;
    tmp.width = W;
    tmp.height = H;
    tctx.clearRect(0, 0, W, H);
    tctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, W, H);
    const data = tctx.getImageData(0, 0, W, H).data;

    const ink = new Uint8Array(H);
    for (let y = 0; y < H; y++) {
      let n = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = data[i + 3];
        if (!a) continue;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if ((a * (255 - lum)) / 255 > 10) n++;
      }
      ink[y] = n >= 2 ? 1 : 0;
    }

    const bandsFrom = (gap) => {
      const out = [];
      let s = -1, last = -1;
      for (let y = 0; y < H; y++) {
        if (!ink[y]) continue;
        if (s >= 0 && y - last - 1 <= gap) { last = y; continue; }
        if (s >= 0) out.push([s, last]);
        s = last = y;
      }
      if (s >= 0) out.push([s, last]);
      return out;
    };

    // First pass joins tiny gaps; then join gaps (like the dot of an "i") that are small
    // compared to a text row, without merging neighbouring rows.
    let bands = bandsFrom(1);
    const mh = median(bands.map((b) => b[1] - b[0] + 1));
    bands = bandsFrom(Math.max(1, Math.round(mh * 0.15)));

    const k = r.height / H; // canvas px -> CSS px
    const zoom = r.width / PAGE_W;
    const top = bodyTop * zoom;
    const bottom = r.height - BOTTOM_CUT * zoom;
    let centers = bands
      .filter((b) => b[1] - b[0] >= 1)
      .map((b) => ((b[0] + b[1] + 1) / 2) * k)
      .filter((y) => y >= top && y <= bottom);

    // Blank rows have no ink: fill gaps that are clearly several rows tall.
    if (centers.length > 1) {
      const diffs = [];
      for (let i = 1; i < centers.length; i++) diffs.push(centers[i] - centers[i - 1]);
      const p = median(diffs);
      const filled = [centers[0]];
      for (let i = 1; i < centers.length; i++) {
        const d = centers[i] - centers[i - 1];
        if (p > 0 && d >= p * 1.75) {
          const extra = Math.round(d / p) - 1;
          for (let j = 1; j <= extra; j++) filled.push(centers[i - 1] + (d * j) / (extra + 1));
        }
        filled.push(centers[i]);
      }
      centers = filled;
    }
    return centers.map((y) => y / r.height);
  }

  function inView(r) {
    const ed = editor();
    if (!ed) return true;
    const v = ed.getBoundingClientRect();
    return r.bottom > v.top && r.top < v.bottom;
  }

  function scanAll() {
    scanTimer = null;
    for (const { c, r } of tiles()) {
      let lines;
      try {
        lines = scan(c, r);
      } catch (err) {
        warn('could not read the page canvas; line numbers unavailable', err);
        return;
      }
      const prev = cache.get(c);
      if (!lines.length && prev && prev.lines.length) {
        // Probably not painted right now. Keep the old rows unless it stays empty.
        prev.emptyStreak++;
        if (prev.emptyStreak < 3 || !inView(r)) continue;
      }
      cache.set(c, { lines, emptyStreak: 0 });
    }
    draw();
  }

  function requestScan(delay) {
    if (scanTimer) return;
    scanTimer = setTimeout(scanAll, delay);
  }

  function readCaret() {
    const c =
      document.getElementById('kix-current-user-cursor-caret') ||
      document.querySelector('.kix-cursor-caret');
    const r = c && c.getBoundingClientRect();
    if (r && r.height > 0) lastCaret = { mid: r.top + r.height / 2, top: r.top, h: r.height };
    return lastCaret;
  }

  function draw() {
    try {
      render();
    } catch (err) {
      warn('gutter error', err);
    }
  }

  function render() {
    const ed = editor();
    const ts = tiles();
    if (!ed || !ts.length) {
      root.style.display = 'none';
      lastSig = '';
      return;
    }
    const view = ed.getBoundingClientRect();

    // Collect every known row with its number, in document order.
    const counts = [];
    for (const { c } of ts) {
      const e = cache.get(c);
      if (e && e.lines.length) counts.push(e.lines.length);
    }
    const guess = median(counts);
    const rows = [];
    let offset = 0;
    let pitch = 0;
    for (const { c, r } of ts) {
      const e = cache.get(c);
      if (!e) { offset += guess; continue; } // not scanned yet
      const ys = e.lines.map((f) => r.top + f * r.height);
      if (ys.length > 1) pitch = pitch || ys[1] - ys[0];
      ys.forEach((y, i) => rows.push({ y, n: offset + i + 1 }));
      offset += e.lines.length;
    }
    if (!rows.length) {
      root.style.display = 'none';
      lastSig = '';
      return;
    }
    if (!pitch) pitch = 16 * (ts[0].r.width / PAGE_W);
    pitch = Math.max(8, Math.min(pitch, 40));

    // Current line = row nearest the caret.
    let cur = -1;
    const caret = readCaret();
    if (caret) {
      let best = Infinity;
      for (const row of rows) {
        const d = Math.abs(row.y - caret.mid);
        if (d < best) { best = d; cur = row.n; }
      }
      if (best > pitch * 1.5) cur = -1;
    }

    const x = Math.max(2, ts[0].r.left - view.left - 38);
    const vis = rows.filter((row) => row.y + pitch > view.top && row.y - pitch < view.bottom);
    const sig = [Math.round(view.top), Math.round(view.left), Math.round(view.height), Math.round(x), cur]
      .concat(vis.map((row) => `${Math.round(row.y)}:${row.n}`))
      .join(',');
    if (sig === lastSig) return;
    lastSig = sig;

    root.style.display = 'block';
    root.style.top = view.top + 'px';
    root.style.left = view.left + 'px';
    root.style.width = view.width + 'px';
    root.style.height = view.height + 'px';

    vis.forEach((row, i) => {
      let el = pool[i];
      if (!el) {
        el = document.createElement('div');
        root.appendChild(el);
        pool.push(el);
      }
      el.style.display = 'flex';
      el.style.left = x + 'px';
      el.style.top = row.y - view.top - pitch / 2 + 'px';
      el.style.height = pitch + 'px';
      el.textContent = String(row.n);
      el.className = row.n === cur ? 'vimgd-cur' : '';
    });
    for (let i = vis.length; i < pool.length; i++) pool[i].style.display = 'none';
  }

  // The cursor is on line n (after gg or :N). On line 1 we learn where the body starts,
  // which is how header rows get excluded even when the header is tall.
  function setLine(n) {
    if (n === 1) {
      setTimeout(() => {
        const ts = tiles();
        const caret = readCaret();
        if (!ts.length || !caret) return;
        const zoom = ts[0].r.width / PAGE_W;
        const v = (caret.top - ts[0].r.top) / zoom - 2;
        if (v > 30 && v < 400) {
          bodyTop = v;
          requestScan(0);
        }
      }, 250);
    }
    poke();
  }

  function expect() { poke(); }
  function edited() { requestScan(150); }

  function poke() {
    requestAnimationFrame(draw);
    setTimeout(draw, 80);
    requestScan(150);
  }

  function init() {
    root = document.createElement('div');
    root.id = 'vimgd-gutter';
    document.body.appendChild(root);
    setInterval(draw, 150);
    setInterval(() => requestScan(0), 2000);
    window.addEventListener('resize', poke);
    document.addEventListener('scroll', () => { requestAnimationFrame(draw); requestScan(250); }, true);
    document.addEventListener('mouseup', poke, true);
    requestScan(600);
  }

  NS.gutter = { init, poke, expect, setLine, edited };
})();
