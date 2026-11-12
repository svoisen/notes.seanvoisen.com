import filters from "./src/_config/filters.js";
import plugins from "./src/_config/plugins.js";

export default async function(eleventyConfig) {
  /*
   * libraries
   */
  eleventyConfig.setLibrary("md", plugins.markdownLib);

  /*
   * watch targets
   */
  eleventyConfig.addWatchTarget("./src/assets/**/*.{css,js,woff2}");
  eleventyConfig.addWatchTarget("./lib/**/*.js");

  /*
   * filters
   */
  eleventyConfig.addFilter("postcss", filters.postCssFilter);

  /*
   * layout aliases
   */
  eleventyConfig.addLayoutAlias("base", "base.njk");
  eleventyConfig.addLayoutAlias("page", "page.njk");

  /*
   * passthrough file copy
   */
  eleventyConfig.addPassthroughCopy({ "src/assets/fonts": "assets/fonts" });
  eleventyConfig.addPassthroughCopy({ "src/assets/favicon/*": "/" });
}

/*
 * basic config
 */
export const config = {
  templateFormats: [
    "md",
    "njk",
    "html"
  ],

  // Notes arrive straight from the vault. Running them through Nunjucks would
  // turn any literal `{{` or `{%` in a note into a template error, so Markdown
  // is rendered as Markdown only.
  markdownTemplateEngine: false,
  dataTemplateEngine: "njk",
  htmlTemplateEngine: "njk",

  dir: {
    input: "src",
    output: "dist",
    includes: "_includes",
    data: "_data",
    layouts: "_layouts"
  }
};
