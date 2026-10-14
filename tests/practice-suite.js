// Automated checks for Cairn on the practice page. Serve the project folder
// (python3 -m http.server 8000) and open:
//   http://localhost:8000/test/chat/11111111-2222-3333-4444-555555555555/?test
// The page clears its saved data first, then runs every check below and
// shows the results in a box (also in window.cairnTestResults).

(async () => {
  const KEY = 'chat:11111111-2222-3333-4444-555555555555';
  const results = [];
  const check = (name, ok, detail = '') => results.push({ pass: !!ok, name, detail: String(detail) });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const saved = () => JSON.parse(localStorage.getItem('cairn-test') || '{}')[KEY] || { bookmarks: [], rungs: [] };
  const shadow = () => document.getElementById('cairn-root')?.shadowRoot;
  const $ = (selector) => shadow().querySelector(selector);
  const $$ = (selector) => [...shadow().querySelectorAll(selector)];
  const scroller = document.getElementById('scroller');
  const toBottom = async () => { scroller.scrollTop = scroller.scrollHeight; await wait(300); };
  const flashed = () => {
    const range = CSS.highlights.get('cairn-flash') && [...CSS.highlights.get('cairn-flash')][0];
    const row = range?.startContainer.parentElement.closest('[data-index]');
    return row ? { msg: +row.dataset.index, para: [...row.querySelectorAll('p')].indexOf(range.startContainer.parentElement) } : null;
  };
  const growsDownward = (widths) => widths.every((w, i) => i === 0 || w >= widths[i - 1]);
  const visibleRows = (list, rowSelector) => {
    const box = list.getBoundingClientRect();
    return [...list.querySelectorAll(rowSelector)].filter((row) => {
      const r = row.getBoundingClientRect();
      return r.bottom > box.top + 2 && r.top < box.bottom - 2;
    });
  };
  // Records every distinct "top/height" of an element while `during` runs.
  async function steadyWhile(element, during) {
    const seen = new Set();
    let watching = true;
    (function tick() {
      if (!watching) return;
      const r = element.getBoundingClientRect();
      seen.add(`${Math.round(r.top)}/${Math.round(r.height)}`);
      requestAnimationFrame(tick);
    })();
    await during();
    watching = false;
    return seen;
  }

  // Highlight a paragraph like a user would; the fake popup appears on mouseup.
  async function select(index, paragraph) {
    if (!document.querySelector(`[data-index="${index}"]`)) { scroller.scrollTop = index * 175 - 200; await wait(200); }
    const row = document.querySelector(`[data-index="${index}"]`);
    row.scrollIntoView({ block: 'center' });
    await wait(200);
    const p = row.querySelectorAll('p')[paragraph];
    const range = document.createRange();
    range.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await wait(400);
  }
  const replyButton = () => [...document.querySelector('[data-selection-tooltip]').querySelectorAll('button')].find((b) => b.textContent.startsWith('Reply'));
  async function reply(index, question, { removeQuote = false, withEnter = false } = {}) {
    await select(index, 1);
    const button = replyButton();
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button.click();
    await wait(100);
    if (removeQuote) document.getElementById('chips').replaceChildren();
    const input = document.querySelector('[data-testid="chat-input"]');
    input.textContent = question;
    if (withEnter) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    else document.querySelector('[data-testid="chat-input-send"]').click();
    input.textContent = '';
    document.getElementById('chips').replaceChildren();
    await wait(400);
  }
  const clearSelection = () => {
    document.querySelector('[data-selection-tooltip]')?.remove();
    getSelection().removeAllRanges();
    $('.cairn-toast')?.remove();
  };

  try {
    await wait(1000);
    check('Cairn loads in a shadow root', shadow());
    // (On this page page.css's extension-only font address fails and the
    // practice page's own copy loads, so look for a loaded copy.)
    const fontFaces = [...document.fonts].filter((face) => face.family.replace(/"/g, '') === 'Cairn Instrument Sans');
    const fontLoads = await Promise.all(fontFaces.map((face) => face.load().then(() => 'loaded', () => 'failed')));
    check('The bundled Instrument Sans font loads', fontLoads.includes('loaded'), fontLoads.join(','));
    const host = document.getElementById('cairn-root');
    check('Once its stylesheet loads, Cairn is shown (hidden only while loading)', host && !host.style.visibility && getComputedStyle(host).position === 'fixed', host?.getAttribute('style'));

    // ---- Bookmarks ----
    await select(3, 2); // "The key idea is simple once you see it." (also in paragraph 0)
    const tipButton = document.querySelector('.cairn-tip-btn');
    check('Bookmark button sits in the same bar as Reply', tipButton && tipButton.parentElement === replyButton().parentElement);
    tipButton.click();
    await wait(400);
    check('Bookmark is saved with a name', saved().bookmarks.length === 1 && saved().bookmarks[0].name, saved().bookmarks[0]?.name);
    clearSelection();

    await toBottom();
    $$('.cairn-row .cairn-row-main')[0].click();
    await wait(1400);
    const landed = flashed();
    check('Jumping back finds the repeated sentence you bookmarked', landed?.msg === 3 && landed?.para === 2, JSON.stringify(landed));

    // ---- Replies ----
    await reply(5, 'Why do likelihoods matter?');
    await reply(13, 'How do I read an interval?', { withEnter: true });
    await reply(15, 'never mind', { removeQuote: true });
    const names = saved().rungs.map((r) => r.name);
    check('Sent Replies become rungs, named from the question', names.join('|') === 'Why do likelihoods matter|How do I read an interval', names.join(' | '));
    check('A Reply whose quote was removed is ignored', saved().rungs.length === 2);
    // Three places (1 bookmark + 2 Replies): the gradient spreads across them.
    const fewRocks = $$('.cairn-rail-list .cairn-row .cairn-rock');
    const fewFills = fewRocks.map((rock) => rock.querySelector('path').style.fill);
    const fewWidths = fewRocks.map((rock) => +rock.getAttribute('width'));
    check('With only 3 places, the top rock is the lightest and the bottom the darkest',
      fewRocks.length === 3 && fewFills[0] === 'rgb(106, 153, 147)' && fewFills[2] === 'rgb(20, 58, 54)', fewFills.join(' | '));
    check('…and they range from small on top to big at the base', fewWidths[0] < 24 && fewWidths[2] >= 47, fewWidths.join(',')); // the base here is a Reply, drawn at 85% width
    for (const [index, question] of [[21, 'What is a credible interval?'], [29, 'What does mixing mean?'], [33, 'How do I check a model fits?'], [37, 'What is a posterior predictive?']]) {
      await reply(index, question);
    }
    clearSelection();
    check('Six Reply spots saved', saved().rungs.length === 6);

    // ---- Reply ladder ----
    await toBottom();
    const [up, down] = $$('.cairn-arrow');
    const counter = $('.cairn-counter');
    const panel = $('.cairn-ladder-panel');
    check('At the bottom the pill says "replies" and ▼ is off', counter.textContent === 'replies' && down.disabled);
    counter.dispatchEvent(new MouseEvent('mouseenter'));
    check('Hovering "replies" previews the newest Reply', $('.cairn-preview-head')?.textContent === 'Up to');
    $('.cairn-ladder').dispatchEvent(new MouseEvent('mouseleave'));

    const replyMessages = [5, 13, 21, 29, 33, 37]; // reply #1 … #6
    for (const n of [6, 5, 4]) {
      up.click();
      await wait(1400);
      const f = flashed();
      check(`▲ goes to reply ${n} of 6`, counter.textContent === `${n} of 6 replies` && f?.msg === replyMessages[n - 1], `${counter.textContent}, flashed ${f?.msg}`);
      await wait(800);
    }
    check('In the middle the count is not a button', counter.disabled);
    down.click(); await wait(1400);
    check('▼ goes back to reply 5 of 6', counter.textContent === '5 of 6 replies' && flashed()?.msg === 33, counter.textContent);
    await wait(800);
    down.click(); await wait(300); down.click(); await wait(1500);
    check('Quick ▼▼ returns to the bottom of the chat', counter.textContent === 'replies' && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5, counter.textContent);

    // A message above the composer (like claude.ai's usage-limit warning)
    // pushes the ladder up; when it goes away, the ladder comes back down.
    const ladderBottom = () => $('.cairn-ladder').getBoundingClientRect().bottom;
    const composerTop = () => document.querySelector('fieldset').getBoundingClientRect().top;
    check('The ladder sits just above the message box', ladderBottom() <= composerTop() && ladderBottom() >= composerTop() - 12, `${ladderBottom()} vs ${composerTop()}`);
    // An icon-only button (like claude.ai's "jump to latest" arrow) must not count.
    const iconButton = document.createElement('button');
    iconButton.innerHTML = '<span aria-hidden="true">\uE009</span>';
    iconButton.style.cssText = 'display: block; margin: 0 auto 6px';
    document.querySelector('footer').prepend(iconButton);
    await wait(200);
    check('An icon-only button above the message box doesn’t move the ladder', ladderBottom() >= composerTop() - 12, `${ladderBottom()} vs ${composerTop()}`);
    iconButton.remove();
    await wait(200);
    const warning = document.createElement('div');
    warning.textContent = 'You’ve used 90% of your session limit';
    warning.style.cssText = 'width: 680px; margin: 0 auto 6px; padding: 8px 12px; box-sizing: border-box; border-radius: 10px; background: #F0EEE6; font: 13px system-ui';
    document.querySelector('footer').prepend(warning);
    await wait(200);
    const warningTop = warning.getBoundingClientRect().top;
    check('With a usage warning above the message box, the ladder moves above it', ladderBottom() <= warningTop, `${ladderBottom()} vs warning top ${warningTop}`);
    warning.remove();
    await wait(200);
    check('When the warning goes away, the ladder moves back down', ladderBottom() >= composerTop() - 12, `${ladderBottom()} vs ${composerTop()}`);
    // claude.ai's real banner sits inside the message box, floated above its top edge.
    const fieldset = document.querySelector('fieldset');
    const fieldsetPosition = fieldset.style.position;
    fieldset.style.position = 'relative';
    const banner = document.createElement('div');
    banner.dataset.cds = 'Banner';
    banner.innerHTML = '<span>You’ve used 90% of your session limit</span>';
    banner.style.cssText = 'position: absolute; left: 0; right: 0; bottom: 100%; padding: 12px; background: #F0EEE6; font: 13px system-ui';
    fieldset.append(banner);
    await wait(200);
    const bannerTop = banner.getBoundingClientRect().top;
    check('With the usage banner floating above the box from inside it, the ladder moves above it', ladderBottom() <= bannerTop, `${ladderBottom()} vs banner top ${bannerTop}`);
    banner.remove();
    fieldset.style.position = fieldsetPosition;
    await wait(200);
    check('When the banner goes away, the ladder moves back down', ladderBottom() >= composerTop() - 12, `${ladderBottom()} vs ${composerTop()}`);

    // The open list: a steady box, cairn-shaped stones, "you are here" glow.
    counter.dispatchEvent(new MouseEvent('mouseenter'));
    panel.dispatchEvent(new MouseEvent('mouseenter'));
    await wait(100);
    const list = $('.cairn-rung-list');
    const stoneWidths = visibleRows(list, '.cairn-rung').map((row) => +row.querySelector('.cairn-rock').getAttribute('width'));
    check('Reply list shows 5 stones, biggest at the bottom', stoneWidths.length === 5 && growsDownward(stoneWidths), stoneWidths.join(','));
    check('"You are here" has the glow', $('.cairn-rung.is-here .cairn-glow'));
    const listBoxes = await steadyWhile(panel, async () => {
      list.scrollTo({ top: 0, behavior: 'smooth' }); await wait(800);
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); await wait(800);
    });
    check('Reply list box stays still while scrolling', listBoxes.size === 1, [...listBoxes].join(' '));
    check('Reply list has no scrollbar', list.offsetWidth === list.clientWidth);
    $('.cairn-ladder').dispatchEvent(new MouseEvent('mouseleave'));

    // ---- Right panel ----
    const rail = $('.cairn-rail-list');
    const railNode = $('.cairn-rail');
    const rocksTopClosed = rail.getBoundingClientRect().top;
    railNode.dispatchEvent(new MouseEvent('mouseenter'));
    const title = $('.cairn-rail-title');
    check('Opening the panel shows its "Bookmarks & replies" title', title.offsetHeight > 0 && /bookmarks/i.test(title.textContent), title.textContent);
    check('The panel uses Instrument Sans', getComputedStyle(title).fontFamily.startsWith('"Cairn Instrument Sans"'), getComputedStyle(title).fontFamily);
    check('Opening the panel doesn’t move the rocks', rail.getBoundingClientRect().top === rocksTopClosed);
    railNode.dispatchEvent(new MouseEvent('mouseleave'));
    check('Closed, the title is hidden', title.offsetHeight === 0);
    const rockWidths = () => visibleRows(rail, '.cairn-row').map((row) => +row.querySelector('.cairn-rock').getAttribute('width'));
    check('Right panel shows 5 rocks, longest at the bottom', rockWidths().length === 5 && growsDownward(rockWidths()), rockWidths().join(','));
    const railBoxes = await steadyWhile(rail, async () => {
      rail.scrollTo({ top: 0, behavior: 'smooth' }); await wait(800);
      rail.scrollTo({ top: rail.scrollHeight, behavior: 'smooth' }); await wait(800);
    });
    check('Right panel stays still while scrolling', railBoxes.size === 1, [...railBoxes].join(' '));
    check('Still longest at the bottom after scrolling', growsDownward(rockWidths()), rockWidths().join(','));

    // ---- Chat switching ----
    history.pushState({}, '', '/test/chat/99999999-8888-7777-6666-555555555555/?test');
    await wait(500);
    check('Another chat shows no rocks or ladder', $('.cairn-rail').hidden && $('.cairn-ladder').hidden);
    history.pushState({}, '', '/test/chat/11111111-2222-3333-4444-555555555555/?test');
    await wait(500);
    check('Coming back shows them again', !$('.cairn-rail').hidden && !$('.cairn-ladder').hidden);
    history.pushState({}, '', '/test/new/?test'); // like claude.ai/new: a new chat with no ID yet
    await wait(500);
    check('A new chat (no ID yet) shows no rocks or ladder', $('.cairn-rail').hidden && $('.cairn-ladder').hidden);
    history.pushState({}, '', '/test/chat/11111111-2222-3333-4444-555555555555/?test');
    await wait(500);
    check('Leaving the new chat brings them back', !$('.cairn-rail').hidden && !$('.cairn-ladder').hidden);

    // ---- Shutdown (last: Cairn is gone after this) ----
    delete chrome.runtime.id;
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await wait(300);
    check('If the extension is reloaded, Cairn removes itself', !document.getElementById('cairn-root'));
  } catch (error) {
    check('Suite finished without errors', false, error.stack);
  }

  // ---- Report ----
  window.cairnTestResults = results;
  const failed = results.filter((r) => !r.pass).length;
  console.table(results);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:12px;left:12px;z-index:2147483647;max-width:520px;max-height:80vh;overflow:auto;padding:12px 14px;border-radius:10px;font:12px/1.5 ui-monospace,Menlo,monospace;color:#fff;background:' + (failed ? '#8a2b1f' : '#1f5a3c');
  box.innerHTML = `<strong>${failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed`}</strong>`;
  for (const r of results) {
    const line = document.createElement('div');
    line.textContent = `${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : ` — ${r.detail}`}`;
    box.append(line);
  }
  document.body.append(box);
})();
