/**
 * markdown-it rule that renders Obsidian wikilinks against the note index.
 * A link becomes an anchor only when it resolves to a published note;
 * everything else (literature notes, notes that don't exist yet, embeds)
 * renders as its display text, with no link styling.
 */
import { parseWikilink } from "./note-index.js";

/**
 * @param {import("markdown-it")} md
 * @param {{ getIndex: () => { resolve: (target: string) => ({ url: string } | null) } }} options
 */
export function wikilinks(md, { getIndex }) {
    md.inline.ruler.before("link", "wikilink", (state, silent) => {
        const { src, pos } = state;
        const embed = src.charCodeAt(pos) === 0x21 /* ! */;
        const open = embed ? pos + 1 : pos;
        if (!src.startsWith("[[", open)) return false;
        const close = src.indexOf("]]", open + 2);
        if (close === -1) return false;
        const inner = src.slice(open + 2, close);
        if (!inner.trim() || /[[\]\n]/.test(inner)) return false;

        if (!silent) {
            const token = state.push("wikilink", "", 0);
            token.meta = parseWikilink(inner, embed);
        }
        state.pos = close + 2;
        return true;
    });

    md.renderer.rules.wikilink = (tokens, idx, _options, env) => {
        const link = tokens[idx].meta;
        const text = md.utils.escapeHtml(link.display);
        if (link.embed) return text;

        const note = getIndex().resolve(link.target);
        if (!note) return text;

        const href = md.utils.escapeHtml(note.url);
        // A link to the page you're on gets no preview: there is nothing new to show.
        const isSelf = env?.page?.url === note.url;
        return isSelf
            ? `<a href="${href}">${text}</a>`
            : `<a href="${href}" data-note-link>${text}</a>`;
    };
}
