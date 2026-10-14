// The cairn on the right edge of the chat: every place you marked, in chat
// order. Bookmarks are full stones; Reply spots are slimmer pebbles with a
// small "reply" tag after their name.
//
// The panel shows 5 rocks at a time and scrolls smoothly for the rest. Like a
// real cairn, the bottom rock is always the longest and darkest, and each one
// above is shorter and lighter (see ui.stoneWindow); color only shows
// position, not importance. The place you last visited has a soft glow
// behind it. Hover to see the names; click one to jump there.

(() => {
  const Cairn = (globalThis.Cairn ??= {});
  const { el, rock, chevron, editInPlace, whenStyled, sizeAt, stoneWindow } = Cairn.ui;

  const VISIBLE = 5;
  const ROCK_WIDTH = { top: 20, base: 56, curve: 1.5 };
  const ROCK_HEIGHT = { bookmark: 11, reply: 5 };
  const REPLY_WIDTH_SCALE = 0.85;

  // places: [{ id, name, kind: 'bookmark' | 'reply' }], in chat order.
  function createRail({ onVisit, onRename, onDelete }) {
    const list = el('div', { class: 'cairn-rail-list' });
    const upMore = moreButton('up');
    const downMore = moreButton('down');
    // The title shows only when the panel is open; its row keeps the same
    // height either way, so the rocks don't shift when you hover.
    const header = el('div', { class: 'cairn-rail-header' }, el('span', { class: 'cairn-list-title cairn-rail-title', text: 'Bookmarks & replies' }), upMore);
    const node = el('nav', { class: 'cairn-rail', 'aria-label': 'Bookmarks and Reply spots' }, header, list, downMore);
    let chatId = null;
    let places = [];
    let visitedId = null;
    let editing = false;

    const stones = stoneWindow(list, {
      visible: VISIBLE,
      stoneSize: (row, t) => ({ width: sizeAt(ROCK_WIDTH, t) * (row.classList.contains('is-reply') ? REPLY_WIDTH_SCALE : 1) }),
      onCounts: (above, below, scrollable) => {
        upMore.setCount(above);
        downMore.setCount(below);
        upMore.hidden = downMore.hidden = !scrollable; // everything fits: no buttons, no space kept
      },
    });

    const open = () => node.classList.add('is-open');
    const close = () => !editing && node.classList.remove('is-open');
    node.addEventListener('mouseenter', open);
    node.addEventListener('mouseleave', close);
    node.addEventListener('focusin', open);
    node.addEventListener('focusout', (event) => !node.contains(event.relatedTarget) && close());

    function moreButton(direction) {
      const count = el('span');
      const button = el(
        'button',
        {
          class: `cairn-more cairn-more-${direction}`,
          'aria-label': direction === 'up' ? 'Show earlier places' : 'Show later places',
          onclick: () => list.scrollBy({ top: (direction === 'up' ? -1 : 1) * stones.rowStep(), behavior: 'smooth' }),
        },
        count,
        chevron(direction)
      );
      button.setCount = (n) => {
        count.textContent = `+${n}`;
        // Keep the button's space when there's nothing to show, so the rocks
        // don't shift as it comes and goes.
        button.style.visibility = n > 0 ? 'visible' : 'hidden';
        button.disabled = n <= 0;
      };
      return button;
    }

    function activeIndex() {
      const index = places.findIndex((place) => place.id === visitedId);
      return index >= 0 ? index : places.length - 1;
    }

    // Bring the visited place into view if it's scrolled out of the window.
    function scrollToActive() {
      const row = list.children[activeIndex()];
      if (!row) return;
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      const bottom = row.offsetTop + row.offsetHeight;
      if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }

    function row(place, index, active) {
      const isReply = place.kind === 'reply';
      const kindLabel = isReply ? 'Reply spot' : 'bookmark';
      const label = el(
        'span',
        { class: 'cairn-name', title: 'Double-click to rename' },
        el('span', { class: 'cairn-name-text', text: place.name }),
        isReply ? el('span', { class: 'cairn-reply-tag', 'aria-hidden': 'true', text: 'reply' }) : ''
      );
      label.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        editing = true;
        editInPlace(label, place.name, (name) => {
          editing = false;
          if (name) onRename(place.id, name);
          else render();
        });
      });
      return el(
        'div',
        { class: `cairn-row is-${place.kind}${index === active ? ' is-active' : ''}` },
        el('button', { class: 'cairn-del', 'aria-label': `Delete ${kindLabel} ${place.name}`, title: 'Delete', text: '×', onclick: () => onDelete(place.id) }),
        el(
          'button',
          { class: 'cairn-row-main', 'aria-label': `Go to ${kindLabel} ${place.name}`, onclick: () => onVisit(place.id) },
          label,
          el(
            'span',
            { class: 'cairn-rock-slot' },
            el(
              'span',
              { class: 'cairn-rock-wrap' },
              index === active ? el('span', { class: 'cairn-glow', 'aria-hidden': 'true' }) : '',
              rock(index, ROCK_WIDTH.base, ROCK_HEIGHT[place.kind])
            )
          )
        )
      );
    }

    function render(bringActiveIntoView = false) {
      node.hidden = places.length === 0;
      const active = activeIndex();
      list.replaceChildren(...places.map((place, i) => row(place, i, active)));
      if (!places.length) return;
      // Sizes are measured from panel.css, which loads a moment after the page.
      whenStyled(() => {
        stones.fit();
        if (bringActiveIntoView) scrollToActive();
        stones.shape();
      });
    }

    return {
      node,
      update(next) {
        // Show the visited place when it changes or a different chat opens.
        const reveal = next.visitedId !== visitedId || next.chatId !== chatId;
        chatId = next.chatId;
        places = next.places;
        visitedId = next.visitedId;
        if (!editing) render(reveal);
      },
      // Re-shade after a theme change (the shade colors come from panel.css).
      reshape: () => stones.shape(),
    };
  }

  Cairn.createRail = createRail;
})();
