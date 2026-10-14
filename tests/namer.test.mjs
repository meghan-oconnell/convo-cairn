// Tests for the naming rules in src/namer.js (used when Chrome's built-in AI
// isn't available). Each case is a real example from building the
// extension. Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// namer.js is a browser script that adds itself to globalThis.Cairn; run it
// in a fresh sandbox with no LanguageModel, i.e. no built-in AI.
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/namer.js', import.meta.url), 'utf8'), sandbox);
const { quickName, name } = sandbox.Cairn.namer;

const bookmarks = [
  // [highlighted text, clues from the page, expected name]
  ['conjugate priors', {}, 'Conjugate priors'], // short highlight is its own name
  ['Your prior is what you believed before seeing any data. The likelihood measures how probable the data is.', { bold: 'prior' }, 'Prior'],
  ['Neural nets are noise-tolerant. Each output is a sum over thousands of products.', {}, 'Neural nets are noise-tolerant'],
  // The highlight's own opening phrase beats a more general section heading…
  ['Neural nets are noise-tolerant. Each output is a sum over thousands of products.', { heading: 'Why the model survives this' }, 'Neural nets are noise-tolerant'],
  // …but a one-word opening phrase loses to the heading.
  ["So yes, it's event-driven: a native DOM event (mouseup) triggers the detection", { heading: 'How the Reply button works' }, 'How the Reply button works'],
  ["So yes, it's event-driven: a native DOM event (mouseup) triggers the detection", {}, 'Event-driven'],
  ['the probability of a hypothesis given the evidence, written P(H | E)', {}, 'Probability of a hypothesis'],
  ['(see below) the posterior is proportional to prior times likelihood', {}, 'Posterior is proportional'], // asides skipped
  ['In practice, gradient clipping keeps training stable when losses spike early on.', {}, 'Gradient clipping keeps training'], // scene-setter skipped
];

const questions = [
  // [question you asked, expected name]
  ['Can you explain why we divide by P(E) at the end?', 'Why we divide by P(E) at the end'], // filler removed, "P(E)" kept whole
  ['How do I pick a prior if I know nothing yet?', 'How do I pick a prior'], // long question cut at a sensible word
  ['ok so wait, how do I read a credible interval?', 'How do I read a credible interval'],
  ['What does mixing mean?', 'What does mixing mean'], // short question kept whole ("mean" isn't dropped)
  ['Why do likelihoods matter so much here?', 'Why do likelihoods matter so much here'],
  ['What should I do?', 'What should I do'],
  ['Can you break this down further with visuals?', 'Break this down further with visuals'],
];

for (const [text, hints, expected] of bookmarks) {
  test(`bookmark: ${text.slice(0, 50)}${hints.heading ? ' [heading]' : ''}${hints.bold ? ' [bold]' : ''}`, () => {
    assert.equal(quickName(text, 'concept', hints), expected);
  });
}

for (const [text, expected] of questions) {
  test(`reply: ${text}`, () => {
    assert.equal(quickName(text, 'question'), expected);
  });
}

test('without built-in AI, name() falls back to the rules', async () => {
  assert.equal(await name('What does mixing mean?', 'question'), 'What does mixing mean');
});

test('an empty highlight still gets a name', () => {
  assert.equal(quickName('', 'concept'), 'Bookmark');
});
