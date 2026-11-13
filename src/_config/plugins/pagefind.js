import fs from "node:fs/promises";
import path from "node:path";
import * as pagefind from "pagefind";

/** Where pages link Pagefind's stylesheet from, inside its cascade layer. */
export const LAYERED_CSS = "pagefind/pagefind-component-ui.layered.css";

/**
 * Index the built site after every build, `--serve` rebuilds included, so
 * search in development always reflects the current notes. Only regions
 * marked data-pagefind-body (a note's title and text) are indexed.
 *
 * Any indexing error fails the build, so a publish can never ship broken search.
 */
export async function indexSite({ dir }) {
  const output = path.resolve(dir.output);
  try {
    const { index, errors } = await pagefind.createIndex();
    const added = index ? await index.addDirectory({ path: output }) : { errors: [] };
    const written = index ? await index.writeFiles({ outputPath: path.join(output, "pagefind") }) : { errors: [] };
    const problems = [...(errors ?? []), ...(added.errors ?? []), ...(written.errors ?? [])];
    if (problems.length) throw new Error(`Pagefind: ${problems.join("; ")}`);
  } finally {
    await pagefind.close();
  }
  await writeLayeredCss(output);
}

/**
 * Pagefind's stylesheet, wrapped in the `pagefind` cascade layer so the
 * site's own unlayered rules restyle search without out-ranking the
 * specificity boosters it ships with. Pages load it with a plain <link>:
 * an `@import ... layer()` inside an inline <style> would do the same job,
 * but no spec says when such a sheet applies, browsers differ on it, and
 * the search trigger was seen unstyled in Firefox with it.
 * @param {string} output the build's output directory
 */
async function writeLayeredCss(output) {
  const source = path.join(output, "pagefind", "pagefind-component-ui.css");
  const css = await fs.readFile(source, "utf8");
  await fs.writeFile(path.join(output, LAYERED_CSS), `@layer pagefind {\n${css}\n}\n`);
}
