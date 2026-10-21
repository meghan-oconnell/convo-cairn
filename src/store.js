// Saves bookmarks and ladder rungs on this computer, one record per chat.
// Nothing is sent anywhere. Incognito chats are kept in this tab's
// sessionStorage only: they survive a refresh, and are forgotten when you
// leave the chat or close the tab.

(() => {
  const Cairn = (globalThis.Cairn ??= {});
  const keyFor = (chatId) => `chat:${chatId}`;
  const emptyRecord = () => ({ bookmarks: [], rungs: [], visited: null });
  const isIncognito = (chatId) => chatId.startsWith('incognito:');
  const INCOGNITO_KEY = 'cairn:incognito'; // the one incognito chat open in this tab

  function readIncognito() {
    try {
      return JSON.parse(sessionStorage.getItem(INCOGNITO_KEY)) ?? { chatId: null, record: null };
    } catch {
      return { chatId: null, record: null };
    }
  }

  function writeIncognito(chatId, record) {
    try {
      if (chatId) sessionStorage.setItem(INCOGNITO_KEY, JSON.stringify({ chatId, record }));
      else sessionStorage.removeItem(INCOGNITO_KEY);
    } catch (error) {
      console.warn('[Cairn] Couldn’t keep this incognito chat’s places for a refresh', error);
    }
  }

  let pending = Promise.resolve();

  const store = {
    // False once the extension has been reloaded or removed while this tab
    // stayed open; Chrome APIs stop working at that point.
    isAlive() {
      return !!globalThis.chrome?.runtime?.id;
    },

    async load(chatId) {
      // Opening any other chat forgets the incognito one.
      const incognito = readIncognito();
      if (incognito.chatId && chatId !== incognito.chatId) writeIncognito(null);
      if (!chatId) return emptyRecord();
      if (isIncognito(chatId)) return { ...emptyRecord(), ...(chatId === incognito.chatId ? incognito.record : {}) };
      const key = keyFor(chatId);
      const saved = await chrome.storage.local.get(key);
      return { ...emptyRecord(), ...saved[key] };
    },

    // Change a chat's record starting from the latest saved copy, so two tabs
    // open on the same chat don't overwrite each other's changes. Updates
    // from this tab run one at a time for the same reason.
    update(chatId, change) {
      const run = pending.then(async () => {
        const record = await store.load(chatId);
        change(record);
        if (isIncognito(chatId)) writeIncognito(chatId, record);
        else await chrome.storage.local.set({ [keyFor(chatId)]: record });
        return record;
      });
      pending = run.catch(() => {});
      return run;
    },

    // Calls onChange(record) when another tab (or this one) saves this chat.
    watch(getChatId, onChange) {
      chrome.storage.onChanged.addListener((changes, area) => {
        const chatId = getChatId();
        const change = area === 'local' && chatId && changes[keyFor(chatId)];
        if (change) onChange({ ...emptyRecord(), ...change.newValue });
      });
    },

    async getSetting(name) {
      const { settings } = await chrome.storage.local.get('settings');
      return settings?.[name];
    },

    async setSetting(name, value) {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, [name]: value } });
    },

    newId: () => crypto.randomUUID(),
  };

  Cairn.store = store;
})();
