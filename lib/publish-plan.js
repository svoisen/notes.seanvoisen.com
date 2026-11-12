/**
 * Everything a publish decides, with no file system or git access: given the
 * vault's notes now and the state committed at HEAD, what was added, updated,
 * removed, and renamed; the new manifest and redirect map; and the warnings
 * worth printing. scripts/publish.js does the reading and writing around it.
 */
import matter from "gray-matter";
import { buildNoteIndex, extractWikilinks, lookupKey } from "./note-index.js";
import { inferRenames, similarity, POSSIBLE_THRESHOLD } from "./renames.js";
import { normalizeRedirects } from "./redirects.js";
import { slugify } from "./slug.js";

/**
 * Parse publish/renames.txt: one `old title -> new title` per line, `#` comments.
 * @param {string} text
 */
export function parseOverrides(text) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("->"))
        .map((line) => {
            const at = line.indexOf("->");
            const fromTitle = line.slice(0, at).trim();
            const toTitle = line.slice(at + 2).trim();
            return { from: lookupKey(fromTitle), to: lookupKey(toTitle), fromTitle, toTitle };
        });
}

const byTitle = (a, b) => a.localeCompare(b);
const linkKeys = (body) => new Set(
    extractWikilinks(body).filter((l) => !l.embed).map((l) => lookupKey(l.target))
);

/**
 * @param {object} input
 * @param {{ title: string, source: string, relPath: string }[]} input.current notes in the vault now
 * @param {{ notes: { title: string, source: string, relPath: string }[], redirects: Record<string, string>, manifest: object | null }} input.head state committed at HEAD; a null manifest means nothing was published yet
 * @param {ReturnType<typeof parseOverrides>} [input.overrides]
 * @param {string} [input.home] the Home page's Markdown source
 */
export function planPublish({ current, head, overrides = [], home }) {
    const now = buildNoteIndex(current);
    const before = buildNoteIndex(head.manifest ? head.notes : []);
    const nowBySlug = new Map(now.notes.map((n) => [n.slug, n]));
    const beforeBySlug = new Map(before.notes.map((n) => [n.slug, n]));
    const sourceOf = (files) => new Map(files.map((f) => [f.title.normalize("NFC"), f.source]));
    const nowSource = sourceOf(current);
    const beforeSource = sourceOf(head.manifest ? head.notes : []);

    const gone = before.notes.filter((n) => !nowBySlug.has(n.slug));
    const appeared = now.notes.filter((n) => !beforeBySlug.has(n.slug));
    const kept = now.notes.filter((n) => beforeBySlug.has(n.slug));

    // A note that kept its URL but whose text was replaced outright may be a
    // brand-new note that took an old title, so its old self is a rename candidate too.
    const replaced = kept
        .map((n) => beforeBySlug.get(n.slug))
        .filter((old) => similarity(old.body, nowBySlug.get(old.slug).body) < POSSIBLE_THRESHOLD);

    // Obsidian rewrites inbound links on rename: a note that stopped linking to
    // [[A]] and started linking to [[B]] is evidence that A became B.
    const linkEvidence = new Map();
    for (const note of kept) {
        const was = linkKeys(beforeBySlug.get(note.slug).body);
        const is = linkKeys(note.body);
        const gained = [...is].filter((k) => !was.has(k)).map((k) => now.resolve(k)?.title).filter(Boolean);
        for (const lost of [...was].filter((k) => !is.has(k))) {
            if (!linkEvidence.has(lost)) linkEvidence.set(lost, new Set());
            for (const title of gained) linkEvidence.get(lost).add(title);
        }
    }

    const { renames, possible } = inferRenames({
        old: [...gone, ...replaced],
        fresh: appeared,
        overrides,
        linkEvidence,
    });

    const edges = renames.map((r) => ({ from: r.from.slug, to: r.to.slug }));
    const renamed = renames.map((r) => ({ from: r.from.title, to: r.to.title, reason: r.reason }));

    // A title that only changed case or punctuation keeps its URL; report it, no redirect needed.
    for (const note of kept) {
        const old = beforeBySlug.get(note.slug);
        if (old.title !== note.title) renamed.push({ from: old.title, to: note.title, reason: "same URL" });
    }

    // An override written after the publish that missed a rename still creates its redirect.
    for (const o of overrides) {
        const fromSlug = slugify(o.fromTitle);
        const target = now.resolve(o.toTitle);
        const alreadyPaired = renames.some((r) => r.from.slug === fromSlug);
        if (target && !nowBySlug.has(fromSlug) && !alreadyPaired && fromSlug !== target.slug) {
            edges.push({ from: fromSlug, to: target.slug });
        }
    }

    const live = new Map(now.notes.map((n) => [n.slug, n.title]));
    const { redirects, warnings: redirectWarnings } = normalizeRedirects(head.redirects ?? {}, edges, live);

    const renamedFrom = new Set(renames.map((r) => r.from));
    const renamedTo = new Set(renames.map((r) => r.to));
    const added = appeared.filter((n) => !renamedTo.has(n)).map((n) => n.title).sort(byTitle);
    const removed = gone.filter((n) => !renamedFrom.has(n)).map((n) => n.title).sort(byTitle);
    const updated = kept
        .filter((n) => nowSource.get(n.title) !== beforeSource.get(beforeBySlug.get(n.slug).title))
        .map((n) => n.title)
        .sort(byTitle);

    const warnings = [...redirectWarnings];
    for (const p of possible) {
        warnings.push(
            `"${p.from.title}" may have been renamed to "${p.to.title}" (similarity ${p.score.toFixed(2)}). ` +
            `If it was, add this line to publish/renames.txt and publish again:\n    ${p.from.title} -> ${p.to.title}`
        );
    }
    if (home) {
        const missing = new Set();
        for (const link of extractWikilinks(matter(home).content)) {
            if (!link.embed && !now.resolve(link.target)) missing.add(link.target);
        }
        for (const title of missing) {
            warnings.push(`Home links to "${title}", which isn't a published note, so the link shows as plain text. Update src/index.md.`);
        }
    }

    const manifest = {
        notes: Object.fromEntries(
            [...now.notes]
                .sort((a, b) => a.slug.localeCompare(b.slug))
                .map((n) => [n.slug, { title: n.title, path: n.relPath }])
        ),
    };

    return { added, updated, removed, renamed, redirects, manifest, warnings };
}
