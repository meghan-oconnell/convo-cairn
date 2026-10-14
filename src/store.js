// Saves bookmarks and ladder rungs on this computer, one record per chat.
// Nothing is sent anywhere.

(() => {
  const Cairn = (globalThis.Cairn ??= {});
  const keyFor = (chatId) => `chat:${chatId}`;
  const emptyRecord = () => ({ bookmarks: [], rungs: [], visited: null });
  let pending = Promise.resolve();

  const store = {
    // False once the extension has been reloaded or removed while this tab
    // stayed open; Chrome APIs stop working at that point.
    isAlive() {
      return !!globalThis.chrome?.runtime?.id;
    },

    async load(chatId) {
      if (!chatId) return emptyRecord();
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
        await chrome.storage.local.set({ [keyFor(chatId)]: record });
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
