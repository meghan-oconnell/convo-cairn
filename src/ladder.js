// The Reply ladder: a small pill above the message box.
//
// Every Reply you send adds a rung at the text you highlighted. Up climbs to
// earlier Reply spots, down comes back toward the latest message. Hovering an
// arrow previews where it goes; hovering the preview shows nearby rungs.

(() => {
  const Cairn = (globalThis.Cairn ??= {});
  const { page } = Cairn;
  const { el, rock, chevron, cairnIcon, sizeAt, stoneWindow } = Cairn.ui;

  const VISIBLE = 5; // rows the open list shows at once; the rest scroll
  // Stones beside each Reply, in real-cairn proportions: small flat stones on
  // top, wider and thicker toward the base. Like the right panel, size and
  // shade come from a stone's place in the window (ui.stoneWindow), so the
  // five you see always stack like a cairn as you scroll.
  const STONE_WIDTH = { top: 18, base: 40, curve: 1.3 };
  const STONE_HEIGHT = { top: 5, base: 11, curve: 1.15 };
  const GAP_ABOVE_COMPOSER_PX = 8;
  // While the page is still loading, the composer may not exist yet.
  const COMPOSER_RETRY_MS = 300;
  const COMPOSER_RETRIES = 20;

  function createLadder({ onJump }) {
    let rungs = []; // oldest first
    let level = 0; // 0 = latest message, 1 = most recent rung, and so on up
    let hoverDirection = null; // 'up' | 'down' | null
    let expanded = false;

    const panel = el('div', { class: 'cairn-ladder-panel' });
    const upButton = el('button', { class: 'cairn-arrow', 'aria-label': 'Up to earlier Reply spot' }, chevron('up'));
    const downButton = el('button', { class: 'cairn-arrow', 'aria-label': 'Down toward latest message' }, chevron('down'));
    const counter = el('button', { class: 'cairn-counter' }); // a button only at the ends; see onlyDirection
    const pill = el('div', { class: 'cairn-pill' }, el('span', { class: 'cairn-pill-icon' }, cairnIcon(18)), upButton, counter, downButton);
    const node = el('div', { class: 'cairn-ladder' }, panel, pill);

    // Top to bottom: oldest rung … newest rung, then "Latest message".
    const items = () => [
      ...rungs.map((rung, i) => ({ label: rung.name, detail: `“${rung.anchor.display}”`, level: rungs.length - i, rung })),
      { label: 'Latest message', detail: 'Back to the bottom of the chat', level: 0, rung: null },
    ];
    const itemAt = (target) => items().find((item) => item.level === target);
    const targetLevel = () => (hoverDirection === 'up' ? level + 1 : hoverDirection === 'down' ? level - 1 : level);

    function goTo(target) {
      level = target;
      expanded = false;
      hoverDirection = null;
      render();
      onJump(itemAt(target).rung);
    }

    function hover(direction) {
      hoverDirection = direction;
      expanded = false;
      render();
    }

    upButton.addEventListener('click', () => level < rungs.length && goTo(level + 1));
    downButton.addEventListener('click', () => level > 0 && goTo(level - 1));
    upButton.addEventListener('mouseenter', () => hover('up'));
    downButton.addEventListener('mouseenter', () => hover('down'));

    // At either end there's only one way to go, so the count acts like that
    // arrow: at the bottom ("replies") it goes up; at the oldest Reply
    // ("1 of N") it goes down. In between, only the arrows respond.
    const onlyDirection = () => (level === 0 ? 'up' : level === rungs.length ? 'down' : null);
    counter.addEventListener('mouseenter', () => {
      const direction = onlyDirection();
      if (direction) hover(direction);
    });
    counter.addEventListener('click', () => {
      const direction = onlyDirection();
      if (direction === 'up') goTo(level + 1);
      if (direction === 'down') goTo(level - 1);
    });
    node.addEventListener('mouseleave', () => hover(null));
    panel.addEventListener('mouseenter', () => {
      if (!panel.classList.contains('is-preview')) return;
      expanded = true;
      render();
    });

    // The open list holds every Reply in a window VISIBLE rows tall that
    // scrolls natively (smooth, pixel by pixel). It opens with the row you're
    // heading to two rows from the top.
    function renderList() {
      const all = items();
      const target = targetLevel();
      const earlier = el('span', { class: 'cairn-list-note' });
      const later = el('div', { class: 'cairn-list-note cairn-list-later' });
      const rows = all.map((item, i) => {
        const isTarget = item.level === target && target !== level;
        const isHere = item.level === level;
        return el(
          'button',
          { class: `cairn-rung${isTarget ? ' is-target' : ''}${isHere ? ' is-here' : ''}`, onclick: () => goTo(item.level) },
          el(
            'span',
            { class: 'cairn-pebble-slot' },
            el(
              'span',
              { class: 'cairn-rock-wrap' },
              isHere ? el('span', { class: 'cairn-glow', 'aria-hidden': 'true' }) : '', // "you are here"
              rock(i, STONE_WIDTH.base, STONE_HEIGHT.base)
            )
          ),
          el('span', { class: 'cairn-rung-text' }, el('span', { class: 'cairn-rung-name', text: item.label }), el('span', { class: 'cairn-rung-detail', text: item.detail })),
          isHere ? el('span', { class: 'cairn-here', text: 'you are here' }) : ''
        );
      });
      const list = el('div', { class: 'cairn-rung-list' }, ...rows);
      panel.className = 'cairn-ladder-panel is-list';
      panel.replaceChildren(
        el('div', { class: 'cairn-list-header' }, el('span', { class: 'cairn-list-title', text: 'Replies' }), earlier),
        list,
        later
      );

      const stones = stoneWindow(list, {
        visible: VISIBLE,
        stoneSize: (row, t) => ({ width: sizeAt(STONE_WIDTH, t), height: sizeAt(STONE_HEIGHT, t) }),
        // The notes keep their space even when empty, so the box never changes
        // height (and jumps) as they come and go.
        onCounts: (above, below, scrollable) => {
          earlier.textContent = `+${above} earlier`;
          earlier.style.visibility = above > 0 ? 'visible' : 'hidden';
          later.textContent = `+${below} later`;
          later.style.visibility = below > 0 ? 'visible' : 'hidden';
          later.hidden = !scrollable; // nothing to scroll: no gap
        },
      });
      stones.fit();
      list.scrollTop = Math.max(0, all.findIndex((item) => item.level === target) - 2) * stones.rowStep();
      stones.shape();
    }

    function renderPreview() {
      const item = itemAt(targetLevel());
      panel.className = 'cairn-ladder-panel is-preview';
      panel.replaceChildren(
        el('span', { class: 'cairn-preview-head', text: hoverDirection === 'up' ? 'Up to' : 'Down to' }),
        el('span', { class: 'cairn-rung-name', text: item.label }),
        el('span', { class: 'cairn-rung-detail', text: item.detail })
      );
    }

    function render() {
      node.hidden = rungs.length === 0;
      const canGoUp = level < rungs.length;
      const canGoDown = level > 0;
      upButton.disabled = !canGoUp;
      downButton.disabled = !canGoDown;
      upButton.classList.toggle('is-hover', hoverDirection === 'up' && canGoUp);
      downButton.classList.toggle('is-hover', hoverDirection === 'down' && canGoDown);
      // Replies are numbered in the order you made them (1 = oldest, the top of
      // the list), so the number matches the row you're on. `level` counts
      // steps up from the bottom, so the newest Reply is level 1.
      // At the bottom of the chat the pill just says "replies".
      const replies = rungs.length === 1 ? 'reply' : 'replies';
      const replyNumber = rungs.length - level + 1;
      counter.textContent = level === 0 ? 'replies' : `${replyNumber} of ${rungs.length} ${replies}`;
      // Usable only at the ends (a disabled button gets no hover or clicks).
      const direction = onlyDirection();
      counter.disabled = !direction;
      if (direction) counter.setAttribute('aria-label', direction === 'up' ? 'Up to your newest Reply spot' : 'Down to the next Reply spot');
      else counter.removeAttribute('aria-label');

      const hoveringUsableArrow = (hoverDirection === 'up' && canGoUp) || (hoverDirection === 'down' && canGoDown);
      if (expanded) renderList();
      else if (hoveringUsableArrow) renderPreview();
      else {
        panel.className = 'cairn-ladder-panel';
        panel.replaceChildren();
      }
    }

    // Keep the pill just above the right end of the composer (or above a
    // message claude.ai shows on top of it). A ResizeObserver re-places it
    // when the composer grows (multi-line drafts, attachments) or the chat
    // area changes width (opening or closing claude.ai's sidebar).
    const resizeObserver = new ResizeObserver(() => place());
    let observed = [];
    let retriesLeft = COMPOSER_RETRIES;

    // Observe exactly these elements; either may not exist yet while the
    // page loads, so this is re-checked on every place().
    function watch(elements) {
      const present = elements.filter(Boolean);
      if (present.length === observed.length && present.every((element, i) => element === observed[i])) return;
      resizeObserver.disconnect();
      present.forEach((element) => resizeObserver.observe(element));
      observed = present;
    }

    // Messages claude.ai adds above the composer (like a usage-limit warning)
    // don't resize it, so watch that area for changes too.
    let observedArea = null;
    let frame = 0;
    const areaObserver = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    });

    function place() {
      const box = page.composerBox();
      watch([box, box && page.scroller()]);
      const area = box && page.composerArea();
      if (area !== observedArea) {
        areaObserver.disconnect();
        if (area) areaObserver.observe(area, { childList: true, subtree: true, characterData: true });
        observedArea = area;
      }
      if (!box) {
        node.style.display = 'none';
        if (rungs.length && retriesLeft-- > 0) setTimeout(place, COMPOSER_RETRY_MS);
        return;
      }
      retriesLeft = COMPOSER_RETRIES;
      node.style.display = '';
      // Sit above the composer, or above any message shown on top of it.
      const rect = box.getBoundingClientRect();
      node.style.right = `${window.innerWidth - rect.right}px`;
      node.style.bottom = `${window.innerHeight - page.composerTop() + GAP_ABOVE_COMPOSER_PX}px`;
    }

    return {
      node,
      place,
      update(next) {
        if (next.rungs.length > rungs.length) level = 0; // a new Reply was sent: back to the bottom
        rungs = next.rungs;
        level = Math.min(level, rungs.length); // a Reply was deleted
        render();
        place();
      },
      reset() {
        level = 0;
        hoverDirection = null;
        expanded = false;
        render();
      },
      destroy() {
        resizeObserver.disconnect();
        areaObserver.disconnect();
      },
    };
  }

  Cairn.createLadder = createLadder;
})();
