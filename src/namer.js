// Short names for bookmarks (the core concept) and Reply spots (the question).
//
// Uses Chrome's built-in AI (Gemini Nano, runs on this computer) when it is
// available. Otherwise names come from clues on the page: a bold term in what
// you highlighted, the highlight itself if it's short, its opening phrase, or
// the section heading. Reply spots use the question you asked, tidied up.

(() => {
  const Cairn = (globalThis.Cairn ??= {});

  const PROMPTS = {
    concept:
      'You label bookmarks in a conversation. Given a highlighted passage and clues about where it sits, reply with only a 1 to 5 word title naming the specific idea it is about. Prefer the exact term the passage uses. No quotes, no ending punctuation.',
    question:
      'You label follow-up questions. Given a question someone asked about a passage, reply with only a 1 to 5 word title naming what they asked about. No quotes, no ending punctuation.',
  };
  const MAX_INPUT_CHARS = 1500;
  const MAX_NAME_WORDS = 5;
  const MAX_NAME_CHARS = 48;
  const SHORT_HIGHLIGHT_WORDS = 6; // a highlight this short is its own name
  const PHRASE_WORDS = 4;
  const QUESTION_WORDS = 8;
  // Clauses starting with these set the scene ("In practice, …", "When the
  // data is small, …") rather than naming the idea, so they're skipped.
  const INTRO_WORDS = new Set(
    'in for at on by with from to as after before during when if because since although while once unlike given'.split(' ')
  );

  const STOP_WORDS = new Set(
    ('a an the and or but if then so of to in on at by for with from as is are was were be been being it its it’s it\'s this that these those ' +
      'you your i me my we our they their he she his her them can could would should will just also very really about into than ' +
      'what which who whom how why when where does do did please tell explain mean means more some any there here not no yes like ok okay well now ' +
      'actually exactly basically even still')
      .split(' ')
  );
  const isStop = (word) => STOP_WORDS.has(word.toLowerCase().replace(/[^\p{L}'’]/gu, ''));
  const words = (text) => (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
  // Trim quotes, bullets and punctuation from the ends, but keep a closing
  // bracket that belongs to an opening one ("P(E)").
  const stripEdges = (text) => {
    let trimmed = text.replace(/^[\s"'“”‘’*#•\-–—]+|[\s"'“”‘’*.,;:!?…\-–—]+$/g, '');
    while (/^[([{]/.test(trimmed) && !/[)\]}]/.test(trimmed.slice(1))) trimmed = trimmed.slice(1);
    while (/[)\]}]$/.test(trimmed) && !/[([{]/.test(trimmed.slice(0, -1))) trimmed = trimmed.slice(0, -1);
    return trimmed.trim();
  };

  // The opening phrase of a passage: the first clause that says something,
  // without leading filler ("So yes, …"), asides in parentheses, or trailing
  // small words.
  function leadingPhrase(text) {
    const withoutAsides = text.replace(/\([^)]*\)/g, ' ');
    let sceneSetter = null; // used only if no other clause has a phrase
    for (const clause of withoutAsides.split(/[,;:.!?—–]|\s-\s/)) {
      const clauseWords = words(clause);
      const isIntro = INTRO_WORDS.has(clauseWords[0]?.toLowerCase());
      while (clauseWords.length && isStop(clauseWords[0])) clauseWords.shift();
      const phrase = clauseWords.slice(0, PHRASE_WORDS);
      while (phrase.length && isStop(phrase.at(-1))) phrase.pop();
      if (!phrase.length) continue;
      const name = capitalize(stripEdges(phrase.join(' ')));
      if (!isIntro) return name;
      sceneSetter ??= name;
    }
    return sceneSetter;
  }

  // "Can you explain why we divide by P(E) at the end?" → "Why we divide by P(E) at"
  function tidyQuestion(text) {
    let question = text.replace(/\s+/g, ' ').trim();
    const fillers = [
      /^(so|ok|okay|hey|hi|um|and|but|also|wait|actually|hmm|right|great|thanks|thank you)\b[\s,.!-]*/i,
      /^(can|could|would|will) you (please )?/i,
      /^please\s+/i,
      /^(explain|tell me|show me|walk me through|help me understand|remind me)\s+/i,
      /^(i('m| am) (confused|wondering|curious) (about|why|how|what|if)\s*)/i,
    ];
    for (let changed = true; changed; ) {
      changed = false;
      for (const filler of fillers) {
        const next = question.replace(filler, '');
        if (next !== question) { question = next; changed = true; }
      }
    }
    const firstSentence = words(stripEdges(question.split(/(?<=[?.!])\s/)[0]));
    const kept = firstSentence.slice(0, QUESTION_WORDS);
    // Only when the question was cut short, drop small words left dangling at
    // the end ("…a prior if"). A question that fits is kept whole, so "What
    // does mixing mean" keeps its "mean".
    if (kept.length < firstSentence.length) while (kept.length > 2 && isStop(kept.at(-1))) kept.pop();
    return capitalize(kept.join(' '));
  }

  // Name without AI. kind: 'concept' (a highlight) or 'question'.
  function quickName(text, kind = 'concept', hints = {}) {
    const clean = stripEdges((text ?? '').replace(/\s+/g, ' ').trim());
    let name = null;
    if (kind === 'question') name = tidyQuestion(clean);
    else if (hints.bold) name = hints.bold;
    else if (words(clean).length <= SHORT_HIGHLIGHT_WORDS) name = clean;
    else {
      // The highlight's own opening phrase is most specific; fall back to the
      // section heading when that phrase is a single word.
      const phrase = leadingPhrase(clean);
      name = phrase && words(phrase).length >= 2 ? phrase : hints.heading || phrase;
    }
    return capitalize(stripEdges(name || clean.split(' ').slice(0, PHRASE_WORDS).join(' '))) || 'Bookmark';
  }

  function tidy(output) {
    const firstLine = (output ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? '';
    return stripEdges(firstLine).split(/\s+/).slice(0, MAX_NAME_WORDS).join(' ').slice(0, MAX_NAME_CHARS);
  }

  async function aiStatus() {
    try {
      return 'LanguageModel' in globalThis ? await LanguageModel.availability() : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  // Starts the one-time model download. Must be called from a click.
  async function downloadModel(onProgress) {
    const session = await LanguageModel.create({
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
      },
    });
    session.destroy();
  }

  // One primed session per kind, cloned for each name (cheaper than creating).
  const baseSessions = {};
  function sessionFor(kind) {
    baseSessions[kind] ??= LanguageModel.create({ initialPrompts: [{ role: 'system', content: PROMPTS[kind] }] }).catch(
      (error) => {
        delete baseSessions[kind];
        throw error;
      }
    );
    return baseSessions[kind].then((base) => base.clone());
  }

  function promptFor(text, kind, hints) {
    const lines = [];
    if (kind === 'question') {
      lines.push(`Question: ${text}`);
      if (hints.passage) lines.push(`About this passage: ${hints.passage}`);
    } else {
      if (hints.heading) lines.push(`Section heading: ${hints.heading}`);
      if (hints.bold) lines.push(`Bold term in the passage: ${hints.bold}`);
      lines.push(`Highlighted passage: ${text}`);
    }
    return lines.join('\n').slice(0, MAX_INPUT_CHARS);
  }

  // kind: 'concept' (bookmark text) or 'question' (what you asked).
  // hints: { bold, heading } from the page, or { passage } for a question.
  async function name(text, kind, hints = {}) {
    const fallback = quickName(text, kind, hints);
    if ((await aiStatus()) !== 'available') return fallback;
    let session;
    try {
      session = await sessionFor(kind);
      return tidy(await session.prompt(promptFor(text, kind, hints))) || fallback;
    } catch {
      return fallback;
    } finally {
      session?.destroy();
    }
  }

  Cairn.namer = { name, quickName, aiStatus, downloadModel };
})();
