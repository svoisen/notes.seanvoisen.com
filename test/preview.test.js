import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncNotes } from "../scripts/preview.js";

function notesDirWith(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-preview-"));
    fs.writeFileSync(path.join(dir, "notes.11tydata.js"), "export default {};\n");
    for (const [rel, source] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), source);
    }
    return dir;
}

const note = (relPath, source) => ({ title: path.basename(relPath, ".md"), relPath, source });

test("an edited note is the only file rewritten", () => {
    const dir = notesDirWith({ "A.md": "Old.\n", "B.md": "Same.\n" });
    const before = fs.statSync(path.join(dir, "B.md")).mtimeMs;

    const result = syncNotes([note("A.md", "New.\n"), note("B.md", "Same.\n")], dir);

    assert.deepEqual(result, { added: [], removed: [], updated: ["A.md"] });
    assert.equal(fs.readFileSync(path.join(dir, "A.md"), "utf8"), "New.\n");
    assert.equal(fs.statSync(path.join(dir, "B.md")).mtimeMs, before);
});

test("added and removed notes are mirrored, and the data file is kept", () => {
    const dir = notesDirWith({ "Gone.md": "Bye.\n", "Kept.md": "Hi.\n" });

    const result = syncNotes([note("Kept.md", "Hi.\n"), note("sub/New.md", "Hello.\n")], dir);

    assert.deepEqual(result, { added: ["sub/New.md"], removed: ["Gone.md"], updated: [] });
    assert.ok(!fs.existsSync(path.join(dir, "Gone.md")));
    assert.equal(fs.readFileSync(path.join(dir, "sub", "New.md"), "utf8"), "Hello.\n");
    assert.ok(fs.existsSync(path.join(dir, "notes.11tydata.js")));
});

test("a case-only rename changes the filename on disk", () => {
    const dir = notesDirWith({ "The GUI note.md": "Body.\n" });

    syncNotes([note("The Gui note.md", "Body.\n")], dir);

    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".md")), ["The Gui note.md"]);
});

test("nothing is written when the notes already match", () => {
    const dir = notesDirWith({ "A.md": "Same.\n" });
    assert.deepEqual(syncNotes([note("A.md", "Same.\n")], dir), { added: [], removed: [], updated: [] });
});
