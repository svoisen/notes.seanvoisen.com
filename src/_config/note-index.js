import path from "node:path";
import { buildNoteIndex, readNotesDir } from "../../lib/note-index.js";

const NOTES_DIR = path.resolve("src/notes");

let current = null;

/**
 * The note index for the build in progress. Built on first use so the
 * Markdown renderer and the global data share one copy per build.
 */
export function getNoteIndex() {
  if (!current) current = buildNoteIndex(readNotesDir(NOTES_DIR));
  return current;
}

/** Forget the index so the next build (including a watch rebuild) rereads the notes. */
export function resetNoteIndex() {
  current = null;
}
