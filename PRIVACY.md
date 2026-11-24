# Convo Cairn Privacy Policy

_Last updated: November 24, 2026_

Convo Cairn is a Chrome extension that adds bookmarks and a Reply ladder to claude.ai. It's an independent project, not affiliated with or endorsed by Anthropic.

## The short version

Your chats and bookmarks never leave your browser. The only thing Cairn sends anywhere is an anonymous error report when something breaks, so I can fix it.

## What stays in your browser

- **Bookmarks and Reply ladder spots**, including the text you bookmarked or replied to
- **Your settings**
- **A note of which error reports were already sent today**, so the same one isn't sent twice

These are saved with Chrome's extension storage on your computer. They aren't synced to other devices or sent to me or anyone else. In claude.ai's incognito chats, Cairn keeps them only in that browser tab and forgets them when you leave the chat or close the tab.

Uninstalling Cairn deletes everything it saved.

## What's sent: error reports

When something goes wrong, Cairn sends a report to [Sentry](https://sentry.io), an error-monitoring service. There are two kinds:

1. **Missing page elements.** If claude.ai changes its page and Cairn can't find something it relies on (like the message list or the Send button), Cairn reports which ones are missing. The same report is sent at most once a day.
2. **Errors in Cairn's own code.** If Cairn's code fails, it reports the type of error and where in Cairn's code it happened.

Each report contains only:

- the error type and where it happened in Cairn's code, with the error message removed
- the names of any missing page elements (for example, `sendButton`)
- the kind of page: a new chat, an existing chat, a project, or other
- the version of Cairn
- your browser and operating system, which Sentry reads from the request

Reports **never** include your chat text, your bookmarks, page addresses, chat IDs, or anything you typed. Cairn removes anything that could contain them before a report is sent.

Like any request on the internet, a report reaches Sentry along with your IP address. Sentry is set not to store it.

## How reports are used

Error reports are used only to find and fix problems in Cairn. They are not sold, shared, used for advertising, or used for anything unrelated to keeping Cairn working. Sentry processes them on my behalf and deletes them automatically after its retention period.

## Permissions

- **Storage:** to save your bookmarks, Reply ladder and settings on your computer.
- **Access to claude.ai:** to add the Bookmark button and Cairn's panel to claude.ai pages. Cairn runs on no other website.

## Changes

If this policy changes, the new version will be posted here with a new "Last updated" date.

## Contact

Questions? [Open an issue on GitHub](https://github.com/meghan-oconnell/convo-cairn/issues).
