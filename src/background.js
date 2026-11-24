// Sends Cairn's error reports to Sentry for the content scripts. claude.ai's
// Content-Security-Policy only lets its pages contact claude.ai, so reports
// leave from here instead. Only reports for our own Sentry project are sent.

import { SENTRY_DSN } from './config.js';

const sentryOrigin = SENTRY_DSN ? new URL(SENTRY_DSN).origin : null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'cairn:sentry' || sender.id !== chrome.runtime.id) return;
  if (!sentryOrigin || !URL.canParse(message.url) || new URL(message.url).origin !== sentryOrigin) return;
  fetch(message.url, { method: 'POST', body: message.body })
    .then((response) =>
      sendResponse({
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
      })
    )
    .catch(() => sendResponse({ error: true }));
  return true; // the response is sent after fetch finishes
});
