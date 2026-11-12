import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, "../..");

/**
 * Build a throwaway copy of the site so tests never touch the real `src/notes/`
 * or `dist/`. The copy shares `node_modules` by symlink; everything Eleventy
 * reads (`src/`, `lib/`, `publish/`, the config) is copied, then the fixture
 * notes and redirect map replace whatever the real checkout holds.
 *
 * @param {object} options
 * @param {string} [options.notesDir] directory of fixture `.md` notes to mirror into `src/notes/`
 * @param {object} [options.redirects] redirect map to write to `publish/redirects.json`
 * @returns {{ root: string, dist: string, read: (p: string) => string, exists: (p: string) => boolean }}
 */
export function buildSite({ notesDir, redirects } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-site-"));

    for (const entry of ["src", "lib", "publish", "eleventy.config.js", "package.json"]) {
        const from = path.join(projectRoot, entry);
        if (fs.existsSync(from)) {
            fs.cpSync(from, path.join(root, entry), { recursive: true });
        }
    }
    fs.symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir");

    const notesTarget = path.join(root, "src", "notes");
    fs.mkdirSync(notesTarget, { recursive: true });
    for (const file of fs.readdirSync(notesTarget, { recursive: true })) {
        if (String(file).endsWith(".md")) fs.rmSync(path.join(notesTarget, String(file)));
    }
    if (notesDir) {
        fs.cpSync(notesDir, notesTarget, { recursive: true });
    }

    if (redirects) {
        fs.mkdirSync(path.join(root, "publish"), { recursive: true });
        fs.writeFileSync(path.join(root, "publish", "redirects.json"), JSON.stringify(redirects, null, 4));
    }

    execFileSync(
        process.execPath,
        [path.join(projectRoot, "node_modules", "@11ty", "eleventy", "cmd.cjs"), "--quiet"],
        { cwd: root, stdio: "pipe" }
    );

    const dist = path.join(root, "dist");
    return {
        root,
        dist,
        read: (p) => fs.readFileSync(path.join(dist, p), "utf8"),
        exists: (p) => fs.existsSync(path.join(dist, p)),
    };
}
