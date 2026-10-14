// Saving a spot in the chat and finding it again.
//
// Same idea as Hypothesis' text-quote anchors: store the exact highlighted
// text plus a little text on either side. The surrounding text only tells
// repeated phrases apart; it is never shown. Matching ignores whitespace,
// because the page and the selection disagree about spaces and line breaks
// between paragraphs.

(() => {
  const Cairn = (globalThis.Cairn ??= {});
  const { page } = Cairn;

  const CONTEXT_CHARS = 32; // surrounding text kept on each side
  const MAX_SCROLL_STEPS = 40; // give up finding an unloaded message after this many scrolls
  const SCROLL_SETTLE_MS = 150; // time for claude.ai to load rows after a scroll
  const MIN_ROW_HEIGHT_PX = 80; // floor for the row-height estimate
  const ARRIVAL_POSITION = 0.35; // place the found text 35% down the screen
  const SMOOTH_SCROLL_MS = 450;
  const FLASH_MS = 1800;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const squash = (text) => (text ?? '').replace(/\s+/g, '');

  // Whitespace-free text of a message row, plus a map from each character
  // back to its text node and offset so a match can become a Range.
  function indexText(root) {
    const hiddenCache = new Map();
    const isHidden = (element) => {
      if (!hiddenCache.has(element)) {
        const { width, height } = element.getBoundingClientRect();
        hiddenCache.set(element, !!element.closest('button, svg, [aria-hidden="true"]') || (width <= 1 && height <= 1));
      }
      return hiddenCache.get(element);
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement && !isHidden(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const chars = [];
    const positions = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let offset = 0; offset < node.data.length; offset++) {
        if (/\s/.test(node.data[offset])) continue;
        chars.push(node.data[offset]);
        positions.push([node, offset]);
      }
    }
    return { text: chars.join(''), positions };
  }

  const MAX_HINT_WORDS = 6;
  const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
  const isVisible = (element) => {
    const { width, height } = element.getBoundingClientRect();
    return width > 1 && height > 1;
  };

  // Clues for naming, taken from the page around the selection: a bold term
  // inside it (Claude bolds key ideas) and the nearest section heading above
  // it in the same message.
  function namingHints(range, row) {
    const short = (element) => {
      const text = element?.textContent.replace(/\s+/g, ' ').trim() ?? '';
      return text && wordCount(text) <= MAX_HINT_WORDS ? text : null;
    };
    const bold = [...row.querySelectorAll('strong, b')].find((element) => range.intersectsNode(element) && short(element));
    const headings = [...row.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (heading) => isVisible(heading) && range.comparePoint(heading, 0) < 0
    );
    return { bold: short(bold), heading: short(headings.at(-1)) };
  }

  // Build an anchor from a selected Range.
  function capture(range) {
    if (!range || range.collapsed) return null;
    const row = page.rowFor(range.startContainer);
    const msgIndex = page.rowIndex(row);
    if (msgIndex == null) return null;
    const { text, positions } = indexText(row);
    let start = -1;
    let end = positions.length;
    for (let i = 0; i < positions.length; i++) {
      const where = range.comparePoint(...positions[i]);
      if (where >= 0 && start < 0) start = i;
      if (where > 0) { end = i; break; }
    }
    if (start < 0 || end <= start) return null;
    return {
      msgIndex,
      pos: start,
      quote: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
      suffix: text.slice(end, end + CONTEXT_CHARS),
      display: range.toString().replace(/\s+/g, ' ').trim(),
      hints: namingHints(range, row),
    };
  }

  function sharedSuffixLength(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  }

  function sharedPrefixLength(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  }

  // Find the anchor inside one row; returns a Range or null. When the quote
  // appears more than once, pick the copy whose surroundings match best.
  function locateInRow(anchor, row) {
    const { text, positions } = indexText(row);
    let best = null;
    for (let i = text.indexOf(anchor.quote); i >= 0; i = text.indexOf(anchor.quote, i + 1)) {
      const after = i + anchor.quote.length;
      const score =
        sharedSuffixLength(text.slice(Math.max(0, i - CONTEXT_CHARS), i), anchor.prefix) +
        sharedPrefixLength(text.slice(after, after + CONTEXT_CHARS), anchor.suffix);
      if (!best || score > best.score) best = { start: i, score };
    }
    if (!best) return null;
    const [startNode, startOffset] = positions[best.start];
    const [endNode, endOffset] = positions[best.start + anchor.quote.length - 1];
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset + 1);
    return range;
  }

  // Scroll until the row with this index is on the page. claude.ai only keeps
  // nearby rows, so estimate the distance from the rows that are loaded.
  async function revealRow(scroller, index, isCurrent) {
    for (let step = 0; step < MAX_SCROLL_STEPS && isCurrent(); step++) {
      const row = page.findRow(index);
      if (row) return row;
      const rows = page.rows();
      if (!rows.length) return null;
      const indexes = rows.map(page.rowIndex);
      const first = Math.min(...indexes);
      const last = Math.max(...indexes);
      const top = rows[indexes.indexOf(first)].getBoundingClientRect().top;
      const bottom = rows[indexes.indexOf(last)].getBoundingClientRect().bottom;
      const rowHeight = Math.max(MIN_ROW_HEIGHT_PX, (bottom - top) / (last - first + 1));
      const before = scroller.scrollTop;
      scroller.scrollTop += index < first ? -(first - index) * rowHeight : (index - last) * rowHeight;
      if (scroller.scrollTop === before) return null; // already at the top or bottom
      await wait(SCROLL_SETTLE_MS);
    }
    return null;
  }

  function flash(range) {
    CSS.highlights.set('cairn-flash', new Highlight(range));
    setTimeout(() => CSS.highlights.delete('cairn-flash'), FLASH_MS);
  }

  // Each new jump cancels any jump still in progress, so quick clicks always
  // end up at the last place you asked for.
  let latestJump = 0;

  // Scroll to an anchor and flash it. Resolves false only if it can't be found.
  async function jumpTo(anchor) {
    const jump = ++latestJump;
    const isCurrent = () => jump === latestJump;
    page.checkPage();
    const scroller = page.scroller();
    if (!scroller) return false;

    const row = await revealRow(scroller, anchor.msgIndex, isCurrent);
    if (!isCurrent()) return true;
    let range = row && locateInRow(anchor, row);
    // The message may have moved (edits, retries): try whatever is loaded.
    for (const other of page.rows()) {
      if (range) break;
      range = locateInRow(anchor, other);
    }
    if (!range) return false;

    const textTop = range.getBoundingClientRect().top;
    const scrollerTop = scroller.getBoundingClientRect().top;
    scroller.scrollBy({ top: textTop - scrollerTop - scroller.clientHeight * ARRIVAL_POSITION, behavior: 'smooth' });
    await wait(SMOOTH_SCROLL_MS);
    if (isCurrent()) flash(range);
    return true;
  }

  async function scrollToLatest() {
    const jump = ++latestJump;
    const scroller = page.scroller();
    if (!scroller) return;
    const toBottom = () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    toBottom();
    // Safety net: a late scroll from a jump still in progress can occasionally
    // stop this short (seen once or twice in quick ▼▼ tests). If this is still
    // the latest request and it hasn't reached the bottom, finish the trip.
    await wait(SMOOTH_SCROLL_MS * 2);
    const short = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 2;
    if (jump === latestJump && short) toBottom();
  }

  // Sort comparator so bookmarks follow the order of the chat.
  function compare(a, b) {
    return a.msgIndex - b.msgIndex || a.pos - b.pos;
  }

  Cairn.anchor = { capture, jumpTo, scrollToLatest, compare, squash };
})();
