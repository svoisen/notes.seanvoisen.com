/**
 * URL slugs for notes. Every published URL is built from this function, so it
 * is pinned here rather than borrowed from a dependency whose behavior could
 * change on upgrade and silently move every page. test/slug.test.js freezes it
 * against the real note titles.
 */

const RESERVED = new Set(["", "pagefind", "assets", "404", "home"]);

/**
 * @param {string} title a note title (its vault filename without `.md`)
 * @returns {string} the URL slug, e.g. "bruners-modes-of-representation"
 */
export function slugify(title) {
    return title
        // macOS can hand back decomposed (NFD) filenames; fold to one form first.
        .normalize("NFC")
        // Curly and straight apostrophes are the same word: "Bruner's" -> "bruners".
        .replace(/[‘’ʼ']/g, "")
        // Strip accents: "café" -> "cafe".
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Slugs that would collide with the site's own routes or folders.
 * @param {string} slug
 */
export function isReservedSlug(slug) {
    return RESERVED.has(slug);
}
