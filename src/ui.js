// Shared pieces of Cairn's on-page UI: element building, the cairn icon,
// rock shapes, the toast message, and the shadow root everything lives in.
// The shadow root keeps claude.ai's styles and Cairn's styles apart.

(() => {
  const Cairn = (globalThis.Cairn ??= {});
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TOAST_MS = 4500;
  const TOAST_AFTER_HOVER_MS = 2500;

  // Hand-drawn stone outlines, stretched to each rock's width.
  const ROCKS = [
    'M4 6 C10 1 30 2 52 1 C72 0 90 2 96 6 C100 10 98 16 90 18 C70 20 40 19 18 19 C6 19 0 12 4 6 Z',
    'M2 9 C3 3 20 1 45 2 C68 3 88 0 95 5 C99 9 97 17 86 18 C60 20 30 18 12 18 C4 17 1 13 2 9 Z',
    'M6 4 C18 0 44 3 64 1 C82 0 97 4 98 10 C99 16 92 19 74 18 C50 17 26 20 10 17 C2 15 1 8 6 4 Z',
    'M3 7 C8 2 26 3 40 2 C60 1 84 3 94 6 C100 9 96 18 84 18 C62 19 36 17 16 19 C5 19 0 13 3 7 Z',
    'M5 5 C14 1 34 1 56 3 C76 4 92 1 97 7 C100 12 95 18 80 19 C58 20 30 17 12 18 C3 18 1 10 5 5 Z',
  ];

  // The icon: three stones in Deep teal, light to dark.
  const ICON = [
    ['M25 9 C28 4 37 3 41 7 C45 11 42 16 34 16.5 C27 17 22 13.5 25 9 Z', '#A6CBC5'],
    ['M16 26 C19 20 40 19.5 46.5 22.5 C52 25.5 49 32.5 35 33 C22 33.5 13 31 16 26 Z', '#5E9890'],
    ['M8 46 C10 39 47 36.5 55 41 C61 45 57 54.5 34 55 C15 55.5 5.5 52 8 46 Z', '#33625C'],
  ];

  // el('button', { class: 'x', onclick: fn, text: 'Hi' }, ...children)
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else if (name === 'text') node.textContent = value;
      else node.setAttribute(name, value === true ? '' : value);
    }
    node.append(...children.flat().filter((child) => child != null && child !== false));
    return node;
  }

  function svg(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

  function cairnIcon(size = 16) {
    return svg(
      'svg',
      { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': 'true' },
      ...ICON.map(([d, fill]) => svg('path', { d, fill }))
    );
  }

  function rock(shape, width, height = 11) {
    return svg(
      'svg',
      { width, height, viewBox: '0 0 100 20', preserveAspectRatio: 'none', 'aria-hidden': 'true', class: 'cairn-rock' },
      svg('path', { d: ROCKS[shape % ROCKS.length] })
    );
  }

  function chevron(direction) {
    const d = direction === 'up' ? 'M4 10L8 6L12 10' : 'M4 6L8 10L12 6';
    return svg(
      'svg',
      { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
      svg('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    );
  }

  // Resolves once panel.css has loaded into the shadow root. Sizes and
  // shades are measured from it, so drawing waits for it (see whenStyled).
  let stylesReady = Promise.resolve();

  // <div id="cairn-root"> on claude.ai's page, with a shadow root inside.
  // Returns the layer inside the shadow root that Cairn's UI is added to.
  function layer() {
    let host = document.getElementById('cairn-root');
    if (!host) {
      host = el('div', { id: 'cairn-root' });
      // Until panel.css loads, keep everything invisible and out of the page's
      // layout; otherwise Cairn's buttons flash up unstyled for a moment.
      host.style.cssText = 'position: fixed; inset: 0; visibility: hidden; pointer-events: none;';
      const stylesheet = el('link', { rel: 'stylesheet', href: chrome.runtime.getURL('src/panel.css') });
      stylesReady = new Promise((resolve) => {
        stylesheet.addEventListener('load', () => {
          host.removeAttribute('style'); // panel.css's own :host rules take over
          resolve();
        }, { once: true });
        // Without its styles Cairn would look broken, so it stays hidden.
        stylesheet.addEventListener('error', () => console.warn('[Cairn] Couldn’t load panel.css; Cairn stays hidden.'), { once: true });
      });
      host.attachShadow({ mode: 'open' }).append(stylesheet, el('div', { class: 'cairn-layer' }));
      setTheme(host);
    }
    if (!host.isConnected) document.body.append(host);
    return host.shadowRoot.querySelector('.cairn-layer');
  }

  const whenStyled = (callback) => stylesReady.then(callback);

  function setTheme(host = document.getElementById('cairn-root')) {
    if (host) host.dataset.theme = Cairn.page.isDarkMode() ? 'dark' : 'light';
  }

  function removeAll() {
    document.getElementById('cairn-root')?.remove();
  }

  let toastTimer;
  function toast(...content) {
    layer().querySelector('.cairn-toast')?.remove();
    clearTimeout(toastTimer);
    const node = el('div', { class: 'cairn-toast', role: 'status' }, cairnIcon(16), ...content);
    layer().append(node);
    const hide = () => node.remove();
    const hideAfter = (ms) => {
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hide, ms);
    };
    node.addEventListener('mouseenter', () => clearTimeout(toastTimer));
    node.addEventListener('mouseleave', () => hideAfter(TOAST_AFTER_HOVER_MS));
    hideAfter(TOAST_MS);
    return { node, hide, hideAfter };
  }

  // Swap a label for a text box; calls onDone(newName) on Enter or blur,
  // or onDone(null) on Escape.
  function editInPlace(label, current, onDone) {
    const input = el('input', { class: 'cairn-rename', value: current, maxlength: '48', 'aria-label': 'Bookmark name' });
    let finished = false;
    const finish = (keep) => {
      if (finished) return;
      finished = true;
      onDone(keep ? input.value.trim() || null : null);
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  // ---- Cairn shading, shared by the right panel and the Reply list --------

  const SHADE_VARS = ['--shade-0', '--shade-1', '--shade-2', '--shade-3', '--shade-4']; // top → bottom, from panel.css
  const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.trim().slice(i, i + 2), 16));
  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  // The shade colors from panel.css, or null while it's still loading.
  function shadeStops(element) {
    const style = getComputedStyle(element);
    if (!style.getPropertyValue(SHADE_VARS[0]).trim()) return null;
    return SHADE_VARS.map((name) => toRgb(style.getPropertyValue(name)));
  }

  // Color at t (0 = top, 1 = bottom) along the shade stops.
  function shadeAt(stops, t) {
    const scaled = t * (stops.length - 1);
    const i = Math.min(Math.floor(scaled), stops.length - 2);
    const mix = scaled - i;
    const [r, g, b] = stops[i].map((channel, c) => Math.round(channel + (stops[i + 1][c] - channel) * mix));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Where a row sits in a window of `visible` rows anchored to the bottom of
  // its scrolling list: 0 = the top slot, 1 = the bottom slot. Changes
  // smoothly as the list scrolls, so sizes and shades can follow it.
  function windowPosition(list, row, visible, step) {
    const windowTop = list.getBoundingClientRect().bottom - visible * step;
    const box = row.getBoundingClientRect();
    return clamp01((box.top + box.height / 2 - windowTop - step / 2) / ((visible - 1) * step));
  }

  // Size settings are written { top, base, curve }: the size at the top of
  // the window, at the base, and how fast it grows (>1 grows faster near the
  // base). t runs 0 (top) to 1 (base).
  const sizeAt = ({ top, base, curve }, t) => top + (base - top) * t ** curve;

  // A list showing `visible` rows at a time that scrolls smoothly. Every
  // scroll frame, each row's stone (.cairn-rock) is sized by stoneSize(row, t)
  // → { width, height? } and shaded by its place in the window, so the
  // visible stones always stack like a cairn. With fewer rows than the
  // window holds, the full range is spread over them instead (two places get
  // the lightest, smallest stone on top and the darkest, biggest below).
  // onCounts(above, below, scrollable) reports rows scrolled out of view.
  function stoneWindow(list, { visible, stoneSize, onCounts }) {
    const rows = () => [...list.children];
    const rowStep = () => {
      const [first, second] = rows();
      return second ? second.offsetTop - first.offsetTop : first?.offsetHeight ?? 0;
    };

    // Make the window exactly `visible` rows tall (no partial row peeking).
    function fit() {
      const all = rows();
      if (!all.length) return;
      const step = rowStep();
      const shown = Math.min(visible, all.length);
      list.style.maxHeight = `${step * shown - (step - all[0].offsetHeight)}px`;
    }

    function shape() {
      const all = rows();
      if (!all.length) return;
      const step = rowStep();
      const stops = shadeStops(list);
      const spread = all.length < visible;
      for (const [i, row] of all.entries()) {
        const t = !spread ? windowPosition(list, row, visible, step) : all.length === 1 ? 1 : i / (all.length - 1);
        const { width, height } = stoneSize(row, t);
        const stone = row.querySelector('.cairn-rock');
        stone.setAttribute('width', Math.round(width));
        if (height) stone.setAttribute('height', Math.round(height));
        if (stops) stone.querySelector('path').style.fill = shadeAt(stops, t);
      }
      const above = Math.round(list.scrollTop / step);
      const below = Math.max(0, Math.round((list.scrollHeight - list.clientHeight - list.scrollTop) / step));
      onCounts?.(above, below, list.scrollHeight > list.clientHeight);
    }

    let frame = 0;
    list.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(shape);
    }, { passive: true });

    return { fit, shape, rowStep };
  }

  Cairn.ui = { el, cairnIcon, rock, chevron, layer, whenStyled, setTheme, removeAll, toast, editInPlace, sizeAt, stoneWindow };
})();
