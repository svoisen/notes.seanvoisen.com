/**
 * The one place that knows which notes exist, where they live, and how
 * wikilinks resolve to them. The Eleventy build renders from it and the
 * publish command reports from it, so the two can never disagree about what
 * a link points at.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { slugify, isReservedSlug } from "./slug.js";

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;

/**
 * Normalize a title or link target for lookup. Obsidian matches note names
 * case-insensitively, and macOS may store filenames decomposed (NFD).
 * @param {string} text
 */
export function lookupKey(text) {
    return text.normalize("NFC").trim().toLowerCase();
}

/**
 * Split the inside of a `[[...]]` into its parts.
 * @param {string} inner e.g. "Folder/Note#Heading|shown text"
 * @param {boolean} [embed] whether it was written `![[...]]`
 */
export function parseWikilink(inner, embed = false) {
    const pipe = inner.indexOf("|");
    const written = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();
    // "#heading" and "#^block" point inside a note; the note itself is what resolves.
    const withoutAnchor = written.split("#")[0].trim();
    const target = withoutAnchor
        .replace(/\.md$/i, "")
        .split("/")
        .pop()
        .trim();
    return {
        embed,
        target,
        alias,
        display: alias || withoutAnchor || written,
    };
}

/**
 * Find every wikilink in a Markdown body, skipping code spans and fenced code.
 * @param {string} markdown
 */
export function extractWikilinks(markdown) {
    const withoutCode = markdown
        .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
        .replace(/`[^`\n]*`/g, "");
    const links = [];
    for (const match of withoutCode.matchAll(WIKILINK)) {
        links.push(parseWikilink(match[2], match[1] === "!"));
    }
    return links;
}

const LEAD_CHARS = 140;
const TAIL_CHARS = 320;

/** Markdown down to the words a reader sees, on one line. */
function plainText(markdown) {
    return markdown
        .replace(WIKILINK, (_, embed, inner) => parseWikilink(inner, embed === "!").display)
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
        .replace(/\*\*|__|[*`]/g, "")
        .replace(/\s+/g, " ");
}

/**
 * The quotes and dashes markdown-it's typographer gives the note itself, so
 * a passage reads the same in a backlink as on its own page.
 * @param {string} text
 * @param {boolean} opensAtStart whether a quote at the very start opens (true) or closes
 */
function typeset(text, opensAtStart) {
    const open = opensAtStart ? /(^|[\s([{—–-])/ : /([\s([{—–-])/;
    return text
        .replace(/\.\.\./g, "…")
        .replace(/---/g, "—")
        .replace(/--/g, "–")
        .replace(new RegExp(open.source + '"', "g"), "$1“")
        .replace(/"/g, "”")
        .replace(new RegExp(open.source + "'", "g"), "$1‘")
        .replace(/'/g, "’");
}

/**
 * The passage of a linking note that a backlink shows: the paragraph holding
 * the first link to the target, cut so the link itself is near the start and
 * survives the four-line clamp. The link's own text comes back separately so
 * the page can set it apart.
 * @param {string} body the linking note's Markdown
 * @param {(target: string) => boolean} pointsHere whether a link target is the note being linked to
 * @returns {{ before: string, link: string, after: string } | null}
 */
export function backlinkExcerpt(body, pointsHere) {
    const blocks = body
        .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
        .split(/\n\s*\n/);
    for (const block of blocks) {
        for (const match of block.matchAll(WIKILINK)) {
            const link = parseWikilink(match[2], match[1] === "!");
            if (link.embed || !pointsHere(link.target)) continue;
            let before = plainText(block.slice(0, match.index)).trimStart();
            let after = plainText(block.slice(match.index + match[0].length)).trimEnd();
            if (before.length > LEAD_CHARS) {
                const lead = before.slice(-LEAD_CHARS);
                const sentence = lead.search(/[.!?…]["”’)]*\s+\S/);
                const start = sentence === -1 ? lead.indexOf(" ") + 1 : lead.slice(sentence).search(/\s\S/) + sentence + 1;
                before = "…" + lead.slice(start);
            }
            if (after.length > TAIL_CHARS) {
                after = after.slice(0, after.lastIndexOf(" ", TAIL_CHARS)) + "…";
            }
            return { before: typeset(before, true), link: typeset(link.display, false), after: typeset(after, false) };
        }
    }
    return null;
}

/**
 * A note's title is its filename without the extension; the folder it sits
 * in never matters. Every place that names a note goes through this.
 * @param {string} filePath
 */
export function titleFromPath(filePath) {
    return path.basename(filePath, path.extname(filePath)).normalize("NFC");
}

/**
 * Every Markdown file under a directory, as paths relative to it.
 * @param {string} dir
 */
export function listMarkdown(dir) {
    return fs.readdirSync(dir, { recursive: true })
        .map(String)
        .filter((rel) => rel.toLowerCase().endsWith(".md"));
}

/**
 * Read every note under a directory, recursively.
 * @param {string} dir
 * @returns {{ title: string, source: string, relPath: string }[]}
 */
export function readNotesDir(dir) {
    if (!fs.existsSync(dir)) return [];
    return listMarkdown(dir).map((rel) => ({
        title: titleFromPath(rel),
        source: fs.readFileSync(path.join(dir, rel), "utf8"),
        relPath: rel,
    }));
}

/**
 * Build the index from note files.
 * @param {{ title: string, source: string, relPath?: string }[]} files
 */
export function buildNoteIndex(files) {
    const bySlug = new Map();
    const notes = files.map((file) => {
        const title = file.title.normalize("NFC");
        const { data, content } = matter(file.source);
        const slug = slugify(title);
        if (isReservedSlug(slug)) {
            throw new Error(`The note "${title}" would publish at /${slug}/, which the site reserves for itself. Rename the note.`);
        }
        const clash = bySlug.get(slug);
        if (clash) {
            throw new Error(`The notes "${clash.title}" and "${title}" would both publish at /${slug}/. Rename one of them.`);
        }
        const aliases = [data.aliases ?? []].flat().map(String);
        const note = { title, slug, url: `/${slug}/`, aliases, body: content, source: file.source, relPath: file.relPath };
        bySlug.set(slug, note);
        return note;
    });

    // Titles win over aliases, so an alias can never hijack a real note's name.
    const lookup = new Map();
    for (const note of notes) lookup.set(lookupKey(note.title), note);
    for (const note of notes) {
        for (const alias of note.aliases) {
            const key = lookupKey(alias);
            if (!lookup.has(key)) lookup.set(key, note);
        }
    }

    /** @param {string} target a link target already stripped of folder, heading, and alias */
    const byTarget = (target) => lookup.get(lookupKey(target)) ?? null;

    /** @param {string} target a link target, as written or already parsed */
    const resolve = (target) => byTarget(parseWikilink(target).target);

    const backlinkSets = new Map(notes.map((n) => [n.url, new Map()]));
    for (const note of notes) {
        for (const link of extractWikilinks(note.body)) {
            if (link.embed) continue;
            const hit = byTarget(link.target);
            if (!hit || hit === note) continue;
            const sources = backlinkSets.get(hit.url);
            if (sources.has(note.url)) continue;
            const excerpt = backlinkExcerpt(note.body, (target) => byTarget(target) === hit);
            sources.set(note.url, { title: note.title, url: note.url, excerpt });
        }
    }

    const backlinks = {};
    for (const [url, sources] of backlinkSets) {
        backlinks[url] = [...sources.values()].sort((a, b) => a.title.localeCompare(b.title));
    }

    return { notes, resolve, backlinks };
}
