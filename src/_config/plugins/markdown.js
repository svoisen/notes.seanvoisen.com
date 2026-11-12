import markdownIt from "markdown-it";
import { wikilinks } from "../../../lib/wikilinks.js";
import { getNoteIndex } from "../note-index.js";

export const markdownLib = markdownIt({
  html: true,
  linkify: true,
  typographer: true
}).use(wikilinks, { getIndex: getNoteIndex });
