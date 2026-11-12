import path from "node:path";
import * as pagefind from "pagefind";

/**
 * Index the built site after every build, `--serve` rebuilds included, so
 * search in development always reflects the current notes. Only regions
 * marked data-pagefind-body (a note's title and text) are indexed.
 */
export async function indexSite({ dir }) {
  const output = path.resolve(dir.output);
  const { index, errors } = await pagefind.createIndex();
  if (errors?.length) throw new Error(`Pagefind: ${errors.join("; ")}`);
  await index.addDirectory({ path: output });
  await index.writeFiles({ outputPath: path.join(output, "pagefind") });
  await pagefind.close();
}
