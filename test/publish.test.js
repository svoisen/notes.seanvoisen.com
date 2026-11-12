import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { preflightVault, pathsOutsideOwned, mirrorNotes, stageOwnedPaths } from "../scripts/publish.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "notes-publish-"));

function vaultWith(files) {
    const vault = tmp();
    const evergreen = path.join(vault, "Evergreen");
    fs.mkdirSync(evergreen);
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(evergreen, name), content);
    }
    return vault;
}

test("a readable vault yields its notes", () => {
    const notes = preflightVault(vaultWith({ "A.md": "Body." }));
    assert.deepEqual(notes.map((n) => n.title), ["A"]);
});

test("a zero-byte note stops the publish, naming the note", () => {
    assert.throws(() => preflightVault(vaultWith({ "A.md": "Body.", "Empty note.md": "" })), /Empty note/);
});

test("a legacy iCloud placeholder stops the publish, naming the note", () => {
    assert.throws(() => preflightVault(vaultWith({ "A.md": "Body.", ".Some note.md.icloud": "x" })), /Some note/);
});

test("a missing vault path stops the publish", () => {
    assert.throws(() => preflightVault(path.join(tmp(), "nowhere")), /VAULT_PATH/);
});

test("an empty Evergreen folder stops the publish", () => {
    assert.throws(() => preflightVault(vaultWith({})), /no notes/i);
});

test("only changes outside the publish command's own paths block it", () => {
    const status = [
        " M src/notes/A.md",
        "?? src/notes/B.md",
        " M publish/redirects.json",
        " M src/index.md",
        " M src/_layouts/note.njk",
        "?? scratch.txt",
    ];
    assert.deepEqual(pathsOutsideOwned(status), ["src/_layouts/note.njk", "scratch.txt"]);
});

test("mirroring and staging record a case-only rename with the new case", () => {
    const repo = tmp();
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "core.ignorecase", "true");
    const notesDir = path.join(repo, "src", "notes");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "notes.11tydata.js"), "export default {};\n");
    fs.writeFileSync(path.join(notesDir, "The GUI note.md"), "Body.\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");

    mirrorNotes([{ title: "The Gui note", source: "Body.\n", relPath: "The Gui note.md" }], notesDir);
    stageOwnedPaths(repo);
    git("commit", "-q", "-m", "rename");

    const tracked = git("ls-tree", "-r", "--name-only", "HEAD", "--", "src/notes").trim().split("\n");
    assert.deepEqual(tracked.sort(), ["src/notes/The Gui note.md", "src/notes/notes.11tydata.js"]);
});
