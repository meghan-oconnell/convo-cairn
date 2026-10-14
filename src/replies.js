// Reply spots: noticing when you use Claude's Reply, and turning each Reply
// you actually send into a rung on the ladder.

(() => {
  const Cairn = globalThis.Cairn;
  const { page, anchor, store, namer } = Cairn;

  const CHIP_MATCH_CHARS = 20; // how much of a quote chip must match a pending Reply

  // app: { state, change, captureSelection } from main.js.
  function createReplies(app) {
    let pending = []; // anchors of Replies clicked but not sent yet

    // Remember the highlighted spot when "Reply" is pressed (before Claude
    // clears the selection).
    function onPointerDown(event) {
      const tooltip = page.selectionTooltip();
      const reply = tooltip && page.replyButton(tooltip);
      if (!reply?.contains(event.target)) return;
      page.checkPage();
      const captured = app.captureSelection();
      if (captured) pending.push(captured);
    }

    // When a message is sent, each Reply still attached becomes a rung. The
    // quote vanishes from the chat once sent, so this is the only chance.
    function onSend() {
      if (!pending.length || !app.state.chatId) return;
      const chipStarts = page
        .quoteChipTexts()
        .map((text) => anchor.squash(text).replace(/…$/, '').slice(0, CHIP_MATCH_CHARS))
        .filter(Boolean);
      const sent = pending.filter((captured) => chipStarts.some((start) => anchor.squash(captured.quote).startsWith(start)));
      pending = [];
      if (!sent.length) return;

      // Named after the question you asked; if you sent the quote with no
      // question, after the highlighted text instead.
      const question = page.composerInput()?.innerText.trim() ?? '';
      const naming = (captured) =>
        question ? [question, 'question', { passage: captured.display }] : [captured.display, 'concept', captured.hints];
      const rungs = sent.map((captured) => ({
        id: store.newId(),
        name: namer.quickName(...naming(captured)),
        question,
        anchor: captured,
        createdAt: Date.now(),
      }));
      app.change((record) => record.rungs.push(...rungs));
      for (const rung of rungs) {
        namer.name(...naming(rung.anchor)).then((name) => {
          if (name === rung.name) return;
          app.change((record) => {
            const saved = record.rungs.find((r) => r.id === rung.id);
            if (saved && !saved.renamed) saved.name = name;
          });
        });
      }
    }

    return { onPointerDown, onSend, forget: () => { pending = []; } };
  }

  Cairn.createReplies = createReplies;
})();
