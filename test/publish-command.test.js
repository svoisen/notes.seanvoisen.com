import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { projectRoot } from "./helpers/build-site.js";

// These run the real `scripts/publish.js` end to end against a throwaway copy
// of the project in its own git repository, with a throwaway vault.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "notes-publish-cmd-"));

function makeVault(notes) {
    const vault = tmp();
    fs.mkdirSync(path.join(vault, "Evergreen"));
    writeNotes(vault, notes);
    return vault;
}

function writeNotes(vault, notes) {
    const evergreen = path.join(vault, "Evergreen");
    for (const file of fs.readdirSync(evergreen)) fs.rmSync(path.join(evergreen, file));
    for (const [title, body] of Object.entries(notes)) {
        fs.writeFileSync(path.join(evergreen, `${title}.md`), body);
    }
}

function makeProject({ build } = {}) {
    const root = tmp();
    for (const entry of ["src", "lib", "scripts", "publish", "eleventy.config.js", "package.json"]) {
        fs.cpSync(path.join(projectRoot, entry), path.join(root, entry), { recursive: true });
    }
    for (const file of fs.readdirSync(path.join(root, "src", "notes"))) {
        if (file.endsWith(".md")) fs.rmSync(path.join(root, "src", "notes", file));
    }
    fs.symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"));
    // No trailing slash: node_modules here is a symlink, not a directory.
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\ndist\n");
    if (build) {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
        pkg.scripts.build = build;
        fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg, null, 4));
    }
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "core.ignorecase", "true");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    return { root, git };
}

function publish(root, vault, ...args) {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "publish.js"), ...args], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, VAULT_PATH: vault },
    });
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

test("a dry run reports the change set and writes nothing", () => {
    const { root, git } = makeProject();
    const vault = makeVault({ "A note": "Body." });
    const run = publish(root, vault, "--dry-run");
    assert.equal(run.code, 0, run.output);
    assert.match(run.output, /Added \(1\)/);
    assert.equal(git("status", "--porcelain"), "");
});

test("an unrelated uncommitted change stops the publish before anything is written", () => {
    const { root, git } = makeProject();
    fs.writeFileSync(path.join(root, "scratch.txt"), "work in progress\n");
    const run = publish(root, makeVault({ "A note": "Body." }));
    assert.equal(run.code, 1);
    assert.match(run.output, /scratch\.txt/);
    assert.equal(git("status", "--porcelain"), "?? scratch.txt");
});

test("a failed build commits nothing", () => {
    const { root, git } = makeProject({ build: "exit 1" });
    const run = publish(root, makeVault({ "A note": "Body." }));
    assert.equal(run.code, 1);
    assert.match(run.output, /build failed/i);
    assert.equal(git("rev-list", "--count", "HEAD"), "1");
});

test("publishing commits only the notes and publish state, then a case-only rename publishes too", () => {
    const { root, git } = makeProject();
    const remote = tmp();
    execFileSync("git", ["init", "-q", "--bare", remote]);
    git("remote", "add", "origin", remote);
    const vault = makeVault({ "The GUI note": "Body." });

    const first = publish(root, vault);
    assert.equal(first.code, 0, first.output);
    const changed = git("show", "--name-only", "--format=", "HEAD").split("\n").sort();
    assert.deepEqual(changed, ["publish/manifest.json", "src/notes/The GUI note.md"]);

    writeNotes(vault, { "The Gui note": "Body." });
    const second = publish(root, vault);
    assert.equal(second.code, 0, second.output);
    assert.deepEqual(git("ls-tree", "--name-only", "HEAD", "src/notes/").split("\n").sort(), [
        "src/notes/The Gui note.md",
        "src/notes/notes.11tydata.js",
    ]);
    assert.equal(git("rev-parse", "HEAD"), git("rev-parse", "origin/main"));
});

test("a rerun after a publish with no remote pushes the earlier commit", () => {
    const { root, git } = makeProject();
    const vault = makeVault({ "A note": "Body." });

    const first = publish(root, vault);
    assert.equal(first.code, 1);
    assert.match(first.output, /no git remote/);

    const remote = tmp();
    execFileSync("git", ["init", "-q", "--bare", remote]);
    git("remote", "add", "origin", remote);
    const rerun = publish(root, vault);
    assert.equal(rerun.code, 0, rerun.output);
    assert.equal(git("rev-parse", "HEAD"), git("rev-parse", "origin/main"));
});
