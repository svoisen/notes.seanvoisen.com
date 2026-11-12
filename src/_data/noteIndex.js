import { getNoteIndex } from "../_config/note-index.js";

export default function () {
  return { backlinks: getNoteIndex().backlinks };
}
