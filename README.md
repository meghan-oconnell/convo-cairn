# Convo Cairn

A Chrome extension for claude.ai that lets you:

- **Bookmark** any highlighted text in a chat, then jump back to it from a stack of rocks on the right edge.
- **Climb the Reply ladder.** Every time you use Claude's Reply button, Cairn remembers the text you highlighted, and the ▲ ▼ pill above the message box takes you back to it.

Everything is saved on your computer (Chrome's extension storage), per chat. The only thing Cairn sends anywhere is error reports to the developer's Sentry project (see [Error reports](#error-reports)); they never contain chat text. Full details are in the [privacy policy](PRIVACY.md). In claude.ai's incognito chats, bookmarks and Reply spots are kept only while the chat is open (they survive a refresh) and are forgotten when you leave the chat or close the tab.

Convo Cairn is an independent project. It works on claude.ai but is not affiliated with or endorsed by Anthropic.

## Load it into Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder (`convo-cairn`). `dist/monitor.js` is checked in, so this works without building first.
4. Open or refresh a chat on claude.ai.

After changing any file, click the ↻ reload icon on Cairn's card in `chrome://extensions`, then refresh claude.ai. After changing `src/monitor.js` or `src/config.js`, run `npm run build` first (once, run `npm install`).

## How to use it

- **Bookmark:** highlight text in a Claude response. Next to **Reply**, click **Bookmark**. A rock appears on the right.
- **Jump:** hover the rocks to see names; click one. The rocks hold both your bookmarks (full stones) and your Reply spots (slimmer pebbles with a small "reply" tag), in chat order. Like a real cairn, the bottom rock is always the longest and darkest; the one you last visited has a soft teal glow behind it. Up to 5 show at a time; scroll over the panel (mouse wheel or trackpad) or use the **+N** arrows for the rest.
- **Rename / delete:** hover the rocks, double-click a name to rename it, or click **×** to delete it. This works for Reply spots too, and the change shows on the ladder.
- **Reply ladder:** use Claude's Reply as usual. After you send, the pill appears above the message box. Hover ▲ or ▼ to preview where it goes, move onto the preview to see nearby rungs, and click to jump. The ladder lists Reply spots only, under a "Replies" header, and the pill counts them in the order you made them ("2 of 4 replies"; just "replies" at the bottom of the chat). At either end, where only one arrow works, hovering or clicking the count does the same as that arrow. The open list scrolls with the mouse wheel or trackpad, like the panel on the right.

## Naming

Bookmarks are named by their core concept and ladder rungs by the question you asked, using Chrome's built-in AI (Gemini Nano) when it's available. The first time, Cairn asks before Chrome downloads the model (about 4 GB, once). Without it, Cairn uses the first few meaningful words. You can always rename.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome what the extension is and that it runs on claude.ai. |
| `src/claude-page.js` | **Everything Cairn knows about claude.ai's page**, including the health check that reports selectors matching nothing. If Claude changes its site, Cairn logs a `[Cairn]` warning in the console naming what it couldn't find; fix it in this file. |
| `src/config.js` | The Sentry DSN. Empty turns error reports off. |
| `src/monitor.js` | Error reports to Sentry: broken selectors (once a day each) and errors in Cairn's code, with chat text removed. Bundled with the Sentry SDK into `dist/monitor.js` by `npm run build`. |
| `src/background.js` | Sends error reports to Sentry for the content scripts (claude.ai's security policy blocks them from doing it themselves). |
| `src/anchor.js` | Saves a spot (your exact text plus a little surrounding text) and finds it again, including scrolling older messages back into view. |
| `src/store.js` | Saving and loading, per chat. Safe with the same chat open in several tabs. Incognito chats are kept in the tab's sessionStorage only. |
| `src/namer.js` | Short names, via Chrome's built-in AI or a simple fallback. |
| `src/ui.js` | Shared pieces: the cairn icon, rock shapes, the toast message, the shadow root that keeps Cairn's styles separate from claude.ai's, and the "stone window" both lists use (smooth scrolling, stones sized and shaded by position). |
| `src/rail.js` | The rocks on the right: bookmarks and Reply spots together. |
| `src/ladder.js` | The Reply ladder pill. |
| `src/bookmarks.js` | The Bookmark button in Claude's popup (or Cairn's own backup button), saving and naming bookmarks. |
| `src/replies.js` | Noticing when you use Reply, and turning each sent Reply into a rung. |
| `src/main.js` | Starts it all: this chat's state, saving, switching chats, and wiring page events. Shuts down cleanly if the extension is reloaded. |
| `src/panel.css` | Styles for the rocks, ladder and toast (light and dark), loaded inside the shadow root. |
| `src/page.css` | The only styles on claude.ai's own page: the Bookmark button in Claude's popup and the arrival flash. |
| `fonts/` | Instrument Sans, the extension's font, bundled so nothing is fetched from the web. Its license is in `fonts/OFL.txt`. |
| `icons/` | Extension icons. Redraw them with `node tools/make-icons.mjs`. |
| `package.json` | The build (esbuild) and the Sentry SDK, pinned. |
| `test/` | A fake claude.ai chat for trying the code without installing it (see below). Not used by the extension. |
| `tests/` | Automated tests (see below). Not used by the extension. |

## Practice page

To try the code without installing the extension:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/test/chat/11111111-2222-3333-4444-555555555555/>. The page mimics the parts of claude.ai that Cairn relies on, and stores data in the page's localStorage instead of Chrome's extension storage. Open it in two tabs to test syncing between tabs. To test the extension being reloaded, run `delete chrome.runtime.id` in the console; Cairn's UI should remove itself. Add `?nocss` to the address to see the page as it looks before Cairn's stylesheet arrives (Cairn should stay hidden, with no stray buttons). If you edit a file and the practice page doesn't change, your browser is using a cached copy: hard-reload with Cmd+Shift+R.

## Tests

- **Naming rules:** `node --test` runs `tests/namer.test.mjs`, real examples of highlights and questions with the names they should get.
- **Everything on the page:** with the practice-page server running, open <http://localhost:8000/test/chat/11111111-2222-3333-4444-555555555555/?test>. It clears the practice data and runs `tests/practice-suite.js`: bookmarking, the Reply ladder, both scrolling lists, chat switching and shutdown. Results appear in a box on the page.

## Error reports

Cairn reports two things to Sentry, as long as `SENTRY_DSN` in `src/config.js` is set:

- **Broken selectors.** After each claude.ai page loads, Cairn waits up to 10 seconds for the elements that page type should have (see `EXPECTED` in `src/claude-page.js`), then reports any still missing. Each report is sent at most once a day per page type (`new_chat`, `existing_chat`, `project`, `other`), extension version and set of broken selectors. These appear in Sentry as warnings, tagged `page_type` and `ext_version`.
- **Errors in Cairn's own code**, every time they happen (Sentry only drops an exact repeat of the error just before it).

What's sent: error types, stack frames in Cairn's files, the tags, and the names of broken selectors. What's removed before sending: error messages, page addresses, breadcrumbs, and anything else that could hold chat text.

In Sentry's project settings, under **Inbound Filters**, turn off "Filter out errors known to be caused by browser extensions", or Sentry may drop Cairn's reports.

### Test the broken-selector report

1. In `src/claude-page.js`, break one selector, for example change `sendButton: '[data-testid="chat-input-send"]'` to `sendButton: '[data-testid="chat-input-send-BROKEN"]'`.
2. In `chrome://extensions`, click ↻ on Cairn's card.
3. Open a chat on claude.ai (or refresh one) and wait 10 seconds.
4. In Sentry, under **Issues**, you should see one warning: "Broken selectors on existing_chat: sendButton (…)", tagged `page_type: existing_chat` and `ext_version: 0.3.0`.
5. Refresh claude.ai and wait 10 seconds again. Nothing new arrives (the issue's event count stays at 1).
6. Open a new chat (`claude.ai/new`): that's a different page type, so expect one more event, tagged `new_chat`.
7. Undo the change in step 1 and click ↻ again.

To test again the same day, clear the record of what was sent: on claude.ai, open DevTools, pick **Convo Cairn** in the console's context menu (top left, "top" by default), and run `chrome.storage.local.remove('reportedSelectorBreaks')`.

## Credits

- [Instrument Sans](https://github.com/Instrument/instrument-sans), © 2022 The Instrument Sans Project Authors, used under the SIL Open Font License 1.1 (`fonts/OFL.txt`).

## Known limits

- Cairn depends on details of claude.ai's page (listed in `src/claude-page.js`). A redesign may need small updates there.
- On claude.ai in other languages, Claude's Reply button is found by its place in the popup rather than its label. If Claude adds more buttons to that popup, the Bookmark button and ladder may need an update for non-English pages.
- If a message is edited or regenerated, an old bookmark in it may no longer be found. Cairn will tell you instead of jumping to the wrong place.
- Replies sent before Cairn was installed don't appear on the ladder.
