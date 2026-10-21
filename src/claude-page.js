// Everything Cairn knows about claude.ai's page lives in this file.
// Each selector was checked against claude.ai on 2026-10-14. If Claude changes
// its site, Cairn logs which one stopped matching; update it here.

(() => {
  const Cairn = (globalThis.Cairn ??= {});

  const SELECTORS = {
    transcriptList: '[data-testid="transcript-list"]',
    row: '[data-testid="transcript-row"]', // one per message; data-index is its position in the chat
    selectionTooltip: '[data-selection-tooltip]', // the dark "Reply" popup shown on highlight
    composerInput: '[data-testid="chat-input"]',
    sendButton: '[data-testid="chat-input-send"]',
    quoteChip: '[data-testid="file-thumbnail"]', // the quote Reply adds above the composer
  };

  // How far above the composer to look for a message attached to it.
  const ABOVE_COMPOSER_PX = 200;

  // <html data-mode="light|dark"> holds claude.ai's color mode.
  const THEME_ATTRIBUTE = 'data-mode';

  // Elements every loaded chat page has.
  const REQUIRED = ['transcriptList', 'row', 'composerInput', 'sendButton'];
  const warned = new Set();

  const page = {
    THEME_ATTRIBUTE,

    // Called when you use Cairn (bookmark, Reply, jump), never during page
    // load when claude.ai may still be building the page. Warns once for each
    // element that's missing, which means claude.ai has changed.
    checkPage() {
      for (const name of REQUIRED) {
        if (document.querySelector(SELECTORS[name]) || warned.has(name)) continue;
        warned.add(name);
        console.warn(`[Cairn] Couldn't find ${name} (${SELECTORS[name]}) on claude.ai. Update src/claude-page.js.`);
      }
    },

    // claude.ai/chat/<id>. Incognito chats stay at claude.ai/new?incognito
    // and are never saved, so they get a temporary id instead: one per
    // history entry, so starting another incognito chat starts fresh.
    chatId() {
      if (page.isIncognito()) return `incognito:${navigation.currentEntry.key}`;
      return location.pathname.match(/\/chat\/([0-9a-f-]{36})/i)?.[1] ?? null;
    },

    // Checked on 2026-10-21: the address stays claude.ai/new?incognito for
    // the whole chat.
    isIncognito() {
      return new URLSearchParams(location.search).has('incognito');
    },

    // Message rows currently on the page. claude.ai only keeps the rows near
    // the screen; older ones are swapped out as you scroll.
    rows() {
      return [...document.querySelectorAll(SELECTORS.row)];
    },

    rowIndex(row) {
      const index = Number(row?.getAttribute('data-index'));
      return Number.isFinite(index) ? index : null;
    },

    findRow(index) {
      return document.querySelector(`${SELECTORS.row}[data-index="${index}"]`);
    },

    rowFor(node) {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return element?.closest(SELECTORS.row) ?? null;
    },

    // The scrolling element that holds the conversation.
    scroller() {
      let element = document.querySelector(SELECTORS.transcriptList);
      while (element && element !== document.body) {
        const overflow = getComputedStyle(element).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') return element;
        element = element.parentElement;
      }
      return null;
    },

    selectionTooltip() {
      return document.querySelector(SELECTORS.selectionTooltip);
    },

    // Claude's Reply button inside its highlight popup. Its text is "Reply"
    // plus an icon-font character (U+E185), so letters are compared. If no
    // button says "Reply" (claude.ai in another language), it's the popup's
    // only button of Claude's own, which is how the popup looked on
    // 2026-10-14.
    replyButton(tooltip) {
      const claudes = [...tooltip.querySelectorAll('button')].filter((button) => !button.closest('.cairn-tip-btn'));
      const saysReply = (button) => button.textContent.replace(/[^\p{L}]/gu, '').toLowerCase() === 'reply';
      return claudes.find(saysReply) ?? (claudes.length === 1 ? claudes[0] : null);
    },

    composerInput() {
      return document.querySelector(SELECTORS.composerInput);
    },

    sendButton() {
      return document.querySelector(SELECTORS.sendButton);
    },

    // The rounded box around the composer, used to place the Reply ladder.
    composerBox() {
      return page.composerInput()?.closest('fieldset') ?? null;
    },

    // The area pinned to the bottom of the chat that holds the composer and
    // anything claude.ai shows just above it (on 2026-10-14, the composer's
    // nearest position: sticky ancestor).
    composerArea() {
      let element = page.composerBox();
      while (element && element !== document.body) {
        const position = getComputedStyle(element).position;
        if (position === 'sticky' || position === 'fixed') return element;
        element = element.parentElement;
      }
      return page.composerBox()?.parentElement ?? null;
    },

    // The top of whatever claude.ai shows directly above the composer, such
    // as "You've used 90% of your session limit", or of the composer itself
    // when nothing is there. Found by looking for visible text in the
    // composer's area that ends at (or just above) the composer, so it
    // doesn't depend on how that message is built.
    composerTop() {
      const box = page.composerBox();
      if (!box) return null;
      const boxRect = box.getBoundingClientRect();
      let top = boxRect.top;
      for (const element of page.composerArea()?.querySelectorAll('*') ?? []) {
        // Real words only: skip icons drawn with icon-font characters (like the
        // "jump to latest" arrow, U+E009) and anything marked decorative.
        // Elements inside the box count too: claude.ai's usage-limit banner
        // lives inside it but is drawn floating above its top edge.
        if (element.closest('[aria-hidden="true"]')) continue;
        const hasWords = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /\p{L}/u.test(node.data));
        if (!hasWords) continue;
        const rect = element.getBoundingClientRect();
        const aboveComposer = rect.bottom <= boxRect.top + 2 && rect.bottom >= boxRect.top - ABOVE_COMPOSER_PX;
        const overlaps = rect.right > boxRect.left && rect.left < boxRect.right;
        if (!(aboveComposer && overlaps && rect.height > 0)) continue;
        // Use the edge of the card the words sit in, not just the words:
        // climb the wrappers that still sit above the box and take the highest.
        top = Math.min(top, rect.top);
        for (let card = element.parentElement; card; card = card.parentElement) {
          const cardRect = card.getBoundingClientRect();
          if (cardRect.bottom > boxRect.top + 2 || cardRect.top < boxRect.top - ABOVE_COMPOSER_PX) break;
          top = Math.min(top, cardRect.top);
        }
      }
      return top;
    },

    // Text of each quote Reply has attached to the composer, before sending.
    quoteChipTexts() {
      return [...document.querySelectorAll(SELECTORS.quoteChip)].map(
        (chip) => (chip.querySelector('blockquote') ?? chip).textContent ?? ''
      );
    },

    isDarkMode() {
      return document.documentElement.getAttribute(THEME_ATTRIBUTE) === 'dark';
    },
  };

  Cairn.page = page;
})();
