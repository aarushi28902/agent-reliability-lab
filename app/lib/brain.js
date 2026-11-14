/* Chat brain. Mirrors src/agent/scope.py in the agent repo; keep both in sync. */
/* Chat brain: scope gate -> rules -> document search. Pure functions, no network. */
const STOP = new Set("a an the of to and or is are in on for my me i it do does how what when with at be can you your we us this that about tell please any some there from if by as was were have has not so just".split(" "));
const CLAIMS = {
  "1234": { status: "pending", detail: "since Jan 15 2025, car accident" },
  "5678": { status: "approved", detail: "payment processing, 2500 EUR" },
  "9999": { status: "rejected", detail: "missing police report" },
  "4321": { status: "under review", detail: "since Feb 1 2025, home damage" },
};
const SCAM = [/(without|avoid|bypass|skip|dodge|evade)\s+(\w+\s+){0,2}(alerts?|detection|being\s+(flagged|detected|noticed|reported)|checks?)/i, /\b(launder|untraceable)\b/i];
const HUMAN = /\b(speak|talk)\s+to\s+(a\s+)?(human|person|real\s+agent|agent)\b|\bhuman\b/i;
const GREET = /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b[\s!.]*$/i;
const CLARIFY_TYPO = "I want to be sure I understand. Could you tell me in a few words what you need help with? I can help with claims, documents, payments and staying safe.";
const DOMAIN = /\b(claims?|insurance|insurer|polic(y|ies)|premium|excess|cover(ed|age)?|accident|damage|theft|stolen|refund|payments?)\b/i;
const SORRY = "Sorry, this isn't part of this app. I can only help with questions about claims, documents, payments and staying safe.";
const THRESHOLD = 2.0, STRONG = 3.0;
const OFFTOPIC = /\b(poem|joke|story|essay|recipe|song|lyrics|homework|python|javascript)\b/i;

function stem(w) {
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  for (const suf of ["ing", "ed"]) {
    if (w.length > 1 + suf.length && w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length);
      if (w.length > 3 && w[w.length - 1] === w[w.length - 2] && !"aeiou".includes(w[w.length - 1])) w = w.slice(0, -1);
      break;
    }
  }
  return w;
}
function tokens(t) {
  return (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w)).map(stem);
}
function buildIndex(docs) {
  const tf = docs.map(d => { const c = {}; for (const w of tokens(d.title + " " + d.title + " " + d.text)) c[w] = (c[w] || 0) + 1; return c; });
  const len = tf.map(c => Object.values(c).reduce((a, b) => a + b, 0));
  const avg = len.reduce((a, b) => a + b, 0) / docs.length;
  const df = {}; tf.forEach(c => Object.keys(c).forEach(w => df[w] = (df[w] || 0) + 1));
  const n = docs.length, idf = {};
  for (const w in df) idf[w] = Math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5));
  return { docs, tf, len, avg, idf };
}
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[b.length];
}
function typoHits(ix, q) {
  const vocab = Object.keys(ix.idf).filter(w => w.length >= 6), out = [];
  for (const w of new Set(tokens(q))) if (w.length >= 6 && !(w in ix.idf) && vocab.some(v => distance(w, v) <= 2)) out.push(w);
  return out;
}
function search(ix, q, k = 3) {
  const qt = tokens(q), k1 = 1.5, b = 0.75, hits = [];
  ix.docs.forEach((d, i) => {
    let s = 0, m = 0;
    for (const w of new Set(qt)) { const f = ix.tf[i][w]; if (f) { m++; s += ix.idf[w] * f * (k1 + 1) / (f + k1 * (1 - b + b * ix.len[i] / ix.avg)); } }
    if (s > 0) hits.push({ score: s, matched: m, doc: d });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}
/* Returns { reply, layer, decision, steps[] }. Same order of checks as src/agent/scope.py.
   decision: "pass" | "clarify" | "refuse" (what the Python gate would decide). steps feed the "Under the hood" panel. */
function answer(ix, q) {
  const steps = [];
  const done = (o) => Object.assign({ steps }, o);
  if (GREET.test(q)) { steps.push(["Scope gate", "Greeting, answered directly.", "ok"]); return done({ reply: "Hello! Ask me about claims, documents, payments or staying safe.", layer: "greeting", decision: "pass" }); }
  for (const p of SCAM) if (p.test(q)) {
    steps.push(["Scope gate", "Message matched a red-flag pattern.", "warn"], ["Rule", "Hand-off forced by code (not left to the AI).", "warn"]);
    return done({ reply: "I can't help with that, and I want to keep you safe. Please never move money or hide it from your bank because someone told you to. I am handing you to a person on our team now.", layer: "handoff", handoff: true, decision: "pass" });
  }
  if (HUMAN.test(q)) { steps.push(["Scope gate", "You asked for a person.", "ok"], ["Rule", "Hand-off forced by code.", "ok"]); return done({ reply: "Of course. I am handing you to a person on our team now.", layer: "handoff", handoff: true, decision: "pass" }); }
  const idm = q.match(/(?:claim\D{0,12}|#)(\d{3,6})\b/i);
  if (idm) {
    const c = CLAIMS[idm[1]];
    steps.push(["Scope gate", "Claim number found: " + idm[1], "ok"], ["Tool", "check_claim_status(" + idm[1] + ")", "ok"]);
    return done({ reply: c ? `Claim #${idm[1]} is ${c.status}: ${c.detail}.` : `I could not find claim ${idm[1]}. Please check the number on your letter.`, layer: "tool", decision: "pass" });
  }
  const statusWords = /\b(claim|payment)\b/i.test(q) && /\b(status|update|progress|where|paid|pay)\b/i.test(q);
  if (statusWords && !/\b(document|need|file|how)\b/i.test(q)) {
    steps.push(["Scope gate", "In scope: claim status.", "ok"], ["Rule", "No claim number given, so ask one simple question. No tool call.", "ok"]);
    return done({ reply: "I can look that up. What is your claim number? It is on your letter.", layer: "clarify", decision: "pass" });
  }
  const off = OFFTOPIC.test(q), hits = search(ix, q);
  const top = hits[0] ? hits[0].score : 0, matched = hits[0] ? hits[0].matched : 0;
  const strong = !off && (top >= STRONG || (top >= THRESHOLD && matched >= 2));
  const domain = !off && DOMAIN.test(q);
  let why = `Best document score ${top.toFixed(1)}, ${matched} matching word(s).` + (off ? " Off-topic request word found." : "");
  if (!(statusWords || strong || domain)) {
    const typos = off ? [] : typoHits(ix, q);
    if (typos.length) {
      steps.push(["Scope gate", "Words close to document words: " + typos.sort().join(", ") + ".", "warn"], ["Result", "Probably typos. Ask one gentle question instead of refusing. No AI call used.", "ok"]);
      return done({ reply: CLARIFY_TYPO, layer: "clarify", decision: "clarify" });
    }
    steps.push(["Scope gate", why, "warn"], ["Result", "Out of scope. No AI call used.", "warn"]);
    return done({ reply: SORRY, layer: "refused", decision: "refuse" });
  }
  steps.push(["Scope gate", why + (domain && !strong ? " Insurance word found." : ""), "ok"]);
  if (!hits.length) { steps.push(["Result", "In scope but nothing matched closely. Ask what they need.", "ok"]); return done({ reply: CLARIFY_TYPO, layer: "clarify", decision: "pass" }); }
  steps.push(["Search", hits.map(h => `${h.doc.title} (${h.score.toFixed(1)})`).join("; "), "ok"], ["Answer", "Quoted from the best document. No AI writing.", "ok"]);
  return done({ reply: hits[0].doc.text, source: hits[0].doc.title, layer: "documents", decision: "pass" });
}

export { buildIndex, answer, SORRY };
