import path from "node:path";
import * as pagefind from "pagefind";

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
}
