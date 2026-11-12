/**
 * Load a note by URL and return its content region: the title and body a
 * note page wraps in [data-note-content]. Hover previews use this today;
 * stacked sheets can reuse it later. Each note is fetched once per page view.
 */

const cache = new Map();

/**
 * @param {string} url any URL on this site that serves a note page
 * @returns {Promise<Element>} a fresh copy of the note's content region
 */
export function loadNote(url) {
    const key = new URL(url, location.href).pathname;
    if (!cache.has(key)) {
        const request = fetch(key, { headers: { Accept: "text/html" } })
            .then((response) => {
                if (!response.ok) throw new Error(`${key} returned ${response.status}`);
                return response.text();
            })
            .then((html) => {
                const content = new DOMParser()
                    .parseFromString(html, "text/html")
                    .querySelector("[data-note-content]");
                if (!content) throw new Error(`${key} has no note content`);
                return content;
            })
            .catch((error) => {
                // Don't cache a failure: the next hover may succeed.
                cache.delete(key);
                throw error;
            });
        cache.set(key, request);
    }
    return cache.get(key).then((content) => document.importNode(content, true));
}
