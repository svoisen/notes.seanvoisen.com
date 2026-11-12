import markdownIt from "markdown-it";

export const markdownLib = markdownIt({
  html: true,
  linkify: true,
  typographer: true
});
