// Starts Cairn on claude.ai: holds this chat's saved state, saves changes,
// follows chat switches, and wires page events to the bookmark and Reply
// code. Everything shuts down cleanly if the extension is reloaded.

(() => {
  const Cairn = globalThis.Cairn;
  const { page, anchor, store, ui } = Cairn;
  const { el, toast } = ui;

  const FALLBACK_DELAY_MS = 250; // how long to wait for Claude's popup before showing Cairn's own button

  const state = { chatId: null, bookmarks: [], rungs: [], visited: null };

  // ---- Lifecycle ---------------------------------------------------------
  // If the extension is reloaded or removed, this script keeps running in
  // open tabs but Chrome APIs stop working. Everything is registered here so
  // it can all be switched off at once.

  const listeners = new AbortController();
  const observers = [];

  function on(target, type, handler, options = {}) {
    target.addEventListener(type, (event) => (store.isAlive() ? handler(event) : teardown()), {
      ...options,
      signal: listeners.signal,
    });
  }

  function observe(target, options, callback) {
    const observer = new MutationObserver(() => (store.isAlive() ? callback() : teardown()));
    observer.observe(target, options);
    observers.push(observer);
  }

  function teardown() {
    listeners.abort();
    observers.forEach((observer) => observer.disconnect());
    ladder.destroy();
    ui.removeAll();
  }

  // ---- Saving ------------------------------------------------------------

  // Apply a change to this chat's saved record, then show the result.
  async function change(mutate) {
    const chatId = state.chatId;
    if (!chatId) return;
    try {
      const record = await store.update(chatId, mutate);
      if (chatId === state.chatId) {
        Object.assign(state, record);
        render();
      }
    } catch (error) {
      if (store.isAlive()) console.error('[Cairn] Couldn’t save', error);
      else teardown();
    }
  }

  // Finds a bookmark or Reply spot by id within a saved record.
  const findPlace = (record, id) => record.bookmarks.find((b) => b.id === id) ?? record.rungs.find((r) => r.id === id);

  function rename(id, name) {
    return change((record) => {
      const place = findPlace(record, id);
      if (place) Object.assign(place, { name, renamed: true });
    });
  }

  // ---- UI ----------------------------------------------------------------

  // The rocks show bookmarks and Reply spots together, in chat order. The
  // ladder shows Reply spots only. Both read from the same saved entries, so
  // a rename or delete in one shows in the other.
  function places() {
    return [
      ...state.bookmarks.map((bookmark) => ({ ...bookmark, kind: 'bookmark' })),
      ...state.rungs.map((rung) => ({ ...rung, kind: 'reply' })),
    ].sort((a, b) => anchor.compare(a.anchor, b.anchor));
  }

  const notFound = (what) => toast(el('span', { text: `Couldn’t find that ${what}. The message may have been edited or removed.` }));

  const rail = Cairn.createRail({
    onVisit: async (id) => {
      const place = findPlace(state, id);
      if (!place) return;
      change((record) => { record.visited = id; });
      if (!(await anchor.jumpTo(place.anchor))) notFound('spot');
    },
    onRename: rename,
    onDelete: (id) =>
      change((record) => {
        record.bookmarks = record.bookmarks.filter((b) => b.id !== id);
        record.rungs = record.rungs.filter((r) => r.id !== id);
        if (record.visited === id) record.visited = null;
      }),
  });

  const ladder = Cairn.createLadder({
    onJump: async (rung) => {
      if (!rung) return anchor.scrollToLatest();
      if (!(await anchor.jumpTo(rung.anchor))) notFound('Reply spot');
    },
  });

  const bookmarks = Cairn.createBookmarks({ state, change, rename, observe });
  const replies = Cairn.createReplies({ state, change, captureSelection: bookmarks.captureSelection });

  function mount() {
    const layer = ui.layer();
    if (!layer.contains(rail.node)) layer.append(rail.node, ladder.node);
  }

  function render() {
    const inChat = !!state.chatId;
    rail.update({ chatId: state.chatId, places: inChat ? places() : [], visitedId: state.visited });
    ladder.update({ rungs: inChat ? state.rungs : [] });
  }

  // ---- Chat switching ----------------------------------------------------

  // chatId is null on pages that aren't a saved chat yet, like a new chat
  // before its first message; that shows an empty panel and no ladder.
  // Each switch gets a number and only the latest one finishes, so quick
  // switches can't leave an older chat's places on screen.
  let latestSwitch = 0;
  async function syncChat() {
    const chatId = page.chatId();
    if (chatId === state.chatId) return;
    const thisSwitch = ++latestSwitch;
    const record = await store.load(chatId);
    if (thisSwitch !== latestSwitch || page.chatId() !== chatId) return; // switched again while loading
    Object.assign(state, record, { chatId });
    replies.forget();
    ladder.reset();
    render();
  }

  // ---- Wiring ------------------------------------------------------------

  on(document, 'pointerdown', replies.onPointerDown, { capture: true });
  on(document, 'click', (event) => {
    const send = page.sendButton();
    if (send && event.target.closest?.('button') === send) replies.onSend();
  }, { capture: true });
  on(document, 'keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    if (page.composerInput()?.contains(event.target)) replies.onSend();
  }, { capture: true });

  on(document, 'mouseup', () => setTimeout(() => bookmarks.injectIntoTooltip() || bookmarks.showFallback(), FALLBACK_DELAY_MS));
  on(document, 'selectionchange', () => window.getSelection()?.isCollapsed && bookmarks.hideFallback());
  on(window, 'resize', () => ladder.place());
  on(navigation, 'currententrychange', syncChat); // claude.ai switches chats without reloading

  observe(document.body, { childList: true }, () => {
    mount(); // in case claude.ai removed Cairn's container
    bookmarks.injectIntoTooltip();
  });
  observe(document.documentElement, { attributes: true, attributeFilter: [page.THEME_ATTRIBUTE] }, () => {
    ui.setTheme();
    rail.reshape(); // rock shades depend on light/dark mode
  });

  store.watch(() => state.chatId, (record) => {
    Object.assign(state, record);
    render();
  });

  mount();
  syncChat();
})();
