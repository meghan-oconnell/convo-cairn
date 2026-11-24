// Error reporting to Sentry. esbuild bundles this file and the Sentry SDK
// into dist/monitor.js; run `npm run build` after changing it.
//
// Two kinds of report:
// - Broken selectors: claude.ai changed and something in claude-page.js
//   matches nothing. Sent at most once a day for each page type, extension
//   version and set of broken selectors.
// - Errors thrown by Cairn's own code, sent every time.
//
// No chat text is ever sent; see scrub().
//
// claude.ai's page shares globals with this script, so this follows Sentry's
// guide for shared environments: its own client and scope instead of
// Sentry.init(), and none of the integrations that patch the page.

import { BrowserClient, Scope, createTransport, defaultStackParser, getDefaultIntegrations } from '@sentry/browser';
import { SENTRY_DSN } from './config.js';

const Cairn = (globalThis.Cairn ??= {});
const version = chrome.runtime.getManifest?.().version ?? 'unknown';
const extensionUrl = chrome.runtime.getURL('');

// The practice page has no background script to send through.
const enabled = !!SENTRY_DSN && typeof chrome.runtime.sendMessage === 'function';

// Default integrations that only look at events Cairn sends. The rest patch
// the page (console, fetch, timers, error handlers) or record what happens
// on it (breadcrumbs).
const KEPT_INTEGRATIONS = ['EventFilters', 'LinkedErrors', 'Dedupe'];

// Hands each report to background.js, which sends it (see there for why).
function relayTransport(options) {
  return createTransport(options, async (request) => {
    const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
    const response = await chrome.runtime.sendMessage({ type: 'cairn:sentry', url: options.url, body });
    if (!response || response.error) throw new Error('Couldn’t reach Sentry');
    return response;
  });
}

// Removes everything that could hold chat text or identify a chat. Error
// messages go too: a JSON or DOM error can quote the text it was given.
// What's left: error types, stack frames in Cairn's files, tags, and the
// broken-selector message, which is built only from names in claude-page.js.
const FRAME_FIELDS = ['filename', 'function', 'lineno', 'colno', 'in_app'];
const withoutIds = (text) => text.replace(/[0-9a-f-]{36}/gi, '<id>');

function scrub(event) {
  delete event.breadcrumbs;
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.contexts;
  if (event.tags?.report !== 'broken_selectors') delete event.message;
  for (const exception of event.exception?.values ?? []) {
    exception.value = '(message removed)';
    for (const frame of exception.stacktrace?.frames ?? []) {
      for (const field of Object.keys(frame)) if (!FRAME_FIELDS.includes(field)) delete frame[field];
      if (frame.filename) frame.filename = withoutIds(frame.filename);
    }
  }
  return event;
}

const scope = new Scope();
if (enabled) {
  const client = new BrowserClient({
    dsn: SENTRY_DSN,
    release: `convo-cairn@${version}`,
    transport: relayTransport,
    stackParser: defaultStackParser,
    integrations: getDefaultIntegrations({}).filter((integration) => KEPT_INTEGRATIONS.includes(integration.name)),
    maxBreadcrumbs: 0,
    sendDefaultPii: false,
    beforeSend: scrub,
  });
  scope.setClient(client);
  client.init(); // after setClient, as Sentry's guide says
  scope.setTag('ext_version', version);
}

const pageType = () => Cairn.page?.pageType() ?? 'other';

// Errors already sent, so one caught by Cairn and then thrown again isn't
// sent twice.
const sent = new WeakSet();

function captureException(error) {
  if (!enabled) return;
  if (error && typeof error === 'object') {
    if (sent.has(error)) return;
    sent.add(error);
  }
  scope.captureException(error, { captureContext: { tags: { page_type: pageType() } } });
}

// Errors nobody caught. These listeners only listen; they don't replace
// claude.ai's handlers. Errors from claude.ai's own code are skipped.
const fromCairn = (error, filename = '') => filename.startsWith(extensionUrl) || String(error?.stack ?? '').includes(extensionUrl);
window.addEventListener('error', (event) => {
  if (fromCairn(event.error, event.filename)) captureException(event.error ?? new Error('Unknown error'));
});
window.addEventListener('unhandledrejection', (event) => {
  if (fromCairn(event.reason)) captureException(event.reason);
});

// Remembers which broken-selector reports went out today, so reloading
// claude.ai doesn't send the same one again. Keys from earlier days are
// dropped whenever a new report is saved.
const REPORTED_KEY = 'reportedSelectorBreaks';

async function reportBrokenSelectors(type, missing) {
  if (!enabled || !missing.length) return;
  const names = [...missing].sort();
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
  const key = [type, version, names.join(',')].join('|');
  const { [REPORTED_KEY]: reported = {} } = await chrome.storage.local.get(REPORTED_KEY);
  if (reported[key] === today) return;
  const kept = Object.fromEntries(Object.entries(reported).filter(([, day]) => day === today));
  await chrome.storage.local.set({ [REPORTED_KEY]: { ...kept, [key]: today } });

  const selectors = Cairn.page.SELECTORS;
  scope.captureEvent({
    level: 'warning',
    message: `Broken selectors on ${type}: ${names.map((name) => `${name} (${selectors[name]})`).join(', ')}`,
    tags: { page_type: type, report: 'broken_selectors' },
    fingerprint: ['broken-selectors', type, ...names],
  });
}

Cairn.monitor = { captureException, reportBrokenSelectors };
