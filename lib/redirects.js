/**
 * The redirect map: old slug -> current slug. The publish command is its only
 * writer, and it runs every publish through this function so the map is
 * always flat, never shadows a live note, and never points at a dead one.
 */

/**
 * @param {Record<string, string>} previous the map as committed at HEAD
 * @param {{ from: string, to: string }[]} renames rename edges found this publish, as slugs
 * @param {Map<string, string>} live slug -> title for every note published after this run
 * @returns {{ redirects: Record<string, string>, warnings: string[] }}
 */
export function normalizeRedirects(previous, renames, live) {
    const map = new Map(Object.entries(previous));
    const warnings = [];

    for (const { from, to } of renames) {
        if (from === to) continue;
        // Anything that pointed at the old URL now points straight at the new one.
        for (const [source, target] of map) {
            if (target === from) map.set(source, to);
        }
        map.set(from, to);
    }

    // Follow any remaining chains to their end, so every rule is a single hop.
    for (const [source] of map) {
        const seen = new Set([source]);
        let target = map.get(source);
        while (map.has(target) && !seen.has(target)) {
            seen.add(target);
            target = map.get(target);
        }
        map.set(source, target);
    }

    const redirects = {};
    for (const [source, target] of [...map].sort(([a], [b]) => a.localeCompare(b))) {
        if (source === target) continue;
        if (live.has(source)) {
            warnings.push(
                `/${source}/ now serves "${live.get(source)}", so it no longer redirects to "${live.get(target) ?? target}".`
            );
            continue;
        }
        // The note it led to is gone; an old URL that 404s beats one that redirects to a 404.
        if (!live.has(target)) continue;
        redirects[source] = target;
    }

    return { redirects, warnings };
}
