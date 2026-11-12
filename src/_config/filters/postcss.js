import postcss from "postcss";
import postCssImport from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";

export const postCssFilter = async (code) => {
  const result = await postcss([
    postCssImport,
    autoprefixer,
    cssnano
  ]).process(code, { from: undefined });

  return result.css;
}
