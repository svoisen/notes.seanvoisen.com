/*
 * The Markdown in this folder is generated: `npm run publish` mirrors it from
 * the vault's Evergreen/ folder, clearing every .md file here first. Edit notes
 * in Obsidian, never here, and don't keep any other Markdown in this folder.
 * This data file is the one thing the mirror leaves alone.
 */
import { titleFromPath } from "../../lib/note-index.js";
import { slugify } from "../../lib/slug.js";

// A note's title is its vault filename, whatever subfolder it sits in, so
// neither a `title` nor a `permalink` in a note's frontmatter can move it.
const titleOf = (data) => titleFromPath(data.page.inputPath);

export default {
  layout: "note",
  eleventyComputed: {
    title: titleOf,
    permalink: (data) => `/${slugify(titleOf(data))}/`,
  },
};
