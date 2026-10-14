// Bookmarks: the Bookmark button in Claude's highlight popup (or Cairn's own
// backup button), saving the highlighted spot, and naming it.

(() => {
  const Cairn = globalThis.Cairn;
  const { page, anchor, store, namer, ui } = Cairn;
  const { el, cairnIcon, toast, editInPlace } = ui;

  const AI_OFFER_MS = 15000;
  const RENAME_MS = 60000;
  const DOWNLOAD_MS = 10 * 60 * 1000;
  const DOWNLOAD_DONE_MS = 4000;

  // app: { state, change, rename, observe } from main.js.
  function createBookmarks(app) {
    function captureSelection() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return null;
      return anchor.capture(selection.getRangeAt(0));
    }

    async function addBookmark(captured) {
      page.checkPage();
      if (!captured || !app.state.chatId) {
        toast(el('span', { text: 'Couldn’t bookmark that. Try highlighting text inside a message.' }));
        return;
      }
      window.getSelection()?.removeAllRanges();
      const id = store.newId();
      const bookmark = { id, name: namer.quickName(captured.display, 'concept', captured.hints), anchor: captured, createdAt: Date.now() };
      await app.change((record) => {
        record.bookmarks.push(bookmark);
        record.bookmarks.sort((a, b) => anchor.compare(a.anchor, b.anchor));
        record.visited = id;
      });

      const nameLabel = el('strong', { text: bookmark.name });
      const renameButton = el('button', {
        class: 'cairn-toast-btn',
        text: 'Rename',
        onclick: () => {
          shown.hideAfter(RENAME_MS);
          const current = app.state.bookmarks.find((b) => b.id === id)?.name ?? bookmark.name;
          editInPlace(nameLabel, current, (name) => {
            if (name) app.rename(id, name);
            shown.hide();
          });
        },
      });
      const shown = toast(el('span', {}, 'Bookmarked · ', nameLabel), renameButton);
      offerAI(shown);

      const betterName = await namer.name(captured.display, 'concept', captured.hints);
      if (betterName === bookmark.name || app.state.bookmarks.find((b) => b.id === id)?.renamed) return;
      if (nameLabel.isConnected) nameLabel.textContent = betterName;
      app.change((record) => {
        const saved = record.bookmarks.find((b) => b.id === id);
        if (saved && !saved.renamed) saved.name = betterName;
      });
    }

    // The first time, ask before Chrome downloads its on-device model (~4 GB).
    async function offerAI(shown) {
      if ((await namer.aiStatus()) !== 'downloadable' || (await store.getSetting('aiAsked'))) return;
      const note = el('span', { class: 'cairn-toast-note', text: 'Better names with Chrome’s built-in AI? One-time download, about 4 GB.' });
      const yes = el('button', {
        class: 'cairn-toast-btn',
        text: 'Download',
        onclick: async () => {
          store.setSetting('aiAsked', true);
          shown.hideAfter(DOWNLOAD_MS);
          note.textContent = 'Downloading Chrome’s AI model…';
          yes.remove();
          no.remove();
          try {
            await namer.downloadModel((progress) => {
              note.textContent = `Downloading Chrome’s AI model… ${Math.round(progress * 100)}%`;
            });
            note.textContent = 'Built-in AI is ready. New bookmarks will get smarter names.';
          } catch {
            note.textContent = 'Chrome couldn’t download its AI model. Simple names will be used.';
          }
          shown.hideAfter(DOWNLOAD_DONE_MS);
        },
      });
      const no = el('button', {
        class: 'cairn-toast-btn',
        text: 'No thanks',
        onclick: () => {
          store.setSetting('aiAsked', true);
          shown.hide();
        },
      });
      shown.node.append(el('span', { class: 'cairn-toast-row' }, note, yes, no));
      shown.hideAfter(AI_OFFER_MS);
    }

    // Add the Bookmark button next to "Reply" in Claude's highlight popup.
    const watchedTooltips = new WeakSet();
    function injectIntoTooltip() {
      const tooltip = page.selectionTooltip();
      if (!tooltip) return false;
      // Claude adds the popup first and its Reply button a moment later; wait
      // for Reply so the Bookmark button lands inside the same dark bar.
      const bar = page.replyButton(tooltip)?.parentElement;
      const existing = tooltip.querySelector('.cairn-tip-btn');
      if (bar && existing && existing.parentElement !== bar) {
        bar.append(existing.previousElementSibling, existing); // the divider, then the button
      }
      if (bar && !existing) {
        const button = el(
          'button',
          {
            class: 'cairn-tip-btn',
            onmousedown: (event) => event.preventDefault(), // keep the highlight
            onclick: (event) => {
              event.stopPropagation();
              addBookmark(captureSelection());
            },
          },
          cairnIcon(16),
          el('span', { text: 'Bookmark' })
        );
        bar.append(el('span', { class: 'cairn-tip-divider' }), button);
        hideFallback();
      }
      // If Claude redraws its popup while it is open, put the button back.
      if (!watchedTooltips.has(tooltip)) {
        watchedTooltips.add(tooltip);
        app.observe(tooltip, { childList: true, subtree: true }, injectIntoTooltip);
      }
      return true;
    }

    // Claude only shows its popup on its own responses. For your messages (or
    // if the popup can't be found), show Cairn's own small button instead.
    let fallbackButton = null;
    function showFallback() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const captured = anchor.capture(range);
      if (!captured) return;
      const rect = range.getBoundingClientRect();
      hideFallback();
      fallbackButton = el(
        'button',
        {
          class: 'cairn-fallback-btn',
          'aria-label': 'Bookmark selection',
          title: 'Bookmark',
          onmousedown: (event) => event.preventDefault(),
          onclick: () => {
            hideFallback();
            addBookmark(captured);
          },
        },
        cairnIcon(20)
      );
      fallbackButton.style.left = `${Math.min(window.innerWidth - 52, rect.right + 8)}px`;
      fallbackButton.style.top = `${Math.max(8, rect.top - 48)}px`;
      ui.layer().append(fallbackButton);
    }

    function hideFallback() {
      fallbackButton?.remove();
      fallbackButton = null;
    }

    return { captureSelection, injectIntoTooltip, showFallback, hideFallback };
  }

  Cairn.createBookmarks = createBookmarks;
})();
