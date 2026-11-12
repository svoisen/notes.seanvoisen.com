/**
 * Working out which notes were renamed. Obsidian notes carry no stable ID, so
 * identity is inferred, strongest evidence first:
 *   1. an explicit override line in publish/renames.txt
 *   2. other notes' links changing from [[old]] to [[new]] (Obsidian rewrites
 *      inbound links on rename), which holds even after a heavy rewrite
 *   3. the bodies still being mostly the same text
 * A pair the evidence can't settle is treated as a delete plus a new note,
 * and reported as a possible rename so an override can fix it later.
 */
import { lookupKey } from "./note-index.js";

export const RENAME_THRESHOLD = 0.6;
export const POSSIBLE_THRESHOLD = 0.3;

/** @param {string} text */
function shingles(text) {
    const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    if (words.length < 3) return new Set(words.length ? [words.join(" ")] : []);
    const set = new Set();
    for (let i = 0; i + 2 < words.length; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    return set;
}

/**
 * Jaccard similarity of two bodies' three-word shingles, from 0 to 1.
 * @param {string} a
 * @param {string} b
 */
export function similarity(a, b) {
    const sa = shingles(a);
    const sb = shingles(b);
    if (sa.size === 0 && sb.size === 0) return 1;
    let shared = 0;
    for (const s of sa) if (sb.has(s)) shared++;
    return shared / (sa.size + sb.size - shared);
}

/**
 * @typedef {{ title: string, slug: string, body: string }} Candidate
 * @param {object} input
 * @param {Candidate[]} input.old notes that no longer exist under their old title
 * @param {Candidate[]} input.fresh notes that newly appeared
 * @param {{ from: string, to: string }[]} [input.overrides] lookup keys of titles, old -> new
 * @param {Map<string, Set<string>>} [input.linkEvidence] old title key -> new titles other notes now link to instead
 * @returns {{ renames: { from: Candidate, to: Candidate, reason: string }[], possible: { from: Candidate, to: Candidate, score: number }[] }}
 */
export function inferRenames({ old, fresh, overrides = [], linkEvidence = new Map() }) {
    const renames = [];
    const usedOld = new Set();
    const usedFresh = new Set();
    const pair = (from, to, reason) => {
        renames.push({ from, to, reason });
        usedOld.add(from);
        usedFresh.add(to);
    };
    const freshByKey = new Map(fresh.map((n) => [lookupKey(n.title), n]));

    for (const { from, to } of overrides) {
        const o = old.find((n) => lookupKey(n.title) === from && !usedOld.has(n));
        const f = freshByKey.get(to);
        if (o && f && !usedFresh.has(f)) pair(o, f, "override");
    }

    for (const o of old) {
        if (usedOld.has(o)) continue;
        const targets = [...(linkEvidence.get(lookupKey(o.title)) ?? [])]
            .map((title) => freshByKey.get(lookupKey(title)))
            .filter((f) => f && !usedFresh.has(f));
        if (targets.length === 1) pair(o, targets[0], "links updated");
    }

    // Score every remaining pair and take the best ones first, so one note
    // can't claim a partner that is a better match for another.
    const scored = [];
    for (const o of old) {
        if (usedOld.has(o)) continue;
        for (const f of fresh) {
            if (usedFresh.has(f)) continue;
            scored.push({ from: o, to: f, score: similarity(o.body, f.body) });
        }
    }
    scored.sort((a, b) => b.score - a.score);

    const possible = [];
    for (const s of scored) {
        if (usedOld.has(s.from) || usedFresh.has(s.to)) continue;
        if (s.score >= RENAME_THRESHOLD) pair(s.from, s.to, "similar body");
    }
    const offered = new Set();
    for (const s of scored) {
        if (usedOld.has(s.from) || usedFresh.has(s.to) || offered.has(s.from)) continue;
        if (s.score >= POSSIBLE_THRESHOLD) {
            possible.push(s);
            offered.add(s.from);
        }
    }

    return { renames, possible };
}
