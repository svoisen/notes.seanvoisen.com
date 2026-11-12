#!/usr/bin/env node

/**
 * Publish the vault's Evergreen notes: mirror them into src/notes/, work out
 * renames and redirects, build, commit, and push. Netlify deploys the push.
 *
 *   npm run publish              publish for real
 *   npm run publish -- --dry-run show what would change, write nothing
 *
 * The vault is only ever read. The command commits nothing but its own paths
 * (src/notes/, publish/, and the Home page), and refuses to run while anything
 * else in the repo has uncommitted changes.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { readNotesDir, listMarkdown, titleFromPath } from '../lib/note-index.js';
import { planPublish, parseOverrides } from '../lib/publish-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NOTES_DIR = path.join(ROOT, 'src', 'notes');
const OWNED = ['src/notes', 'publish', 'src/index.md'];

/** A problem the user can fix; printed without a stack trace. */
class PublishError extends Error {}

/**
 * Check the vault can be read safely, then read its notes.
 * @param {string | undefined} vaultPath the vault root (VAULT_PATH)
 */
export function preflightVault(vaultPath) {
    if (!vaultPath || !fs.existsSync(vaultPath)) {
        throw new PublishError(`VAULT_PATH points at a folder that doesn't exist: ${vaultPath ?? '(not set)'}. Set it in .env to the vault root.`);
    }
    const evergreen = path.join(vaultPath, 'Evergreen');
    if (!fs.existsSync(evergreen)) {
        throw new PublishError(`There is no Evergreen/ folder in VAULT_PATH (${vaultPath}).`);
    }

    // Current iCloud keeps evicted files under their real names and downloads
    // them on read, so this only catches the older placeholder format.
    const placeholders = fs.readdirSync(evergreen, { recursive: true })
        .map((rel) => path.basename(String(rel)).match(/^\.(.+?)(\.md)?\.icloud$/))
        .filter(Boolean)
        .map((m) => m[1]);
    if (placeholders.length) {
        throw new PublishError(`These notes haven't downloaded from iCloud yet. Open them in Obsidian, then publish again:\n${placeholders.map((t) => `  - ${t}`).join('\n')}`);
    }

    const notes = readNotesDir(evergreen);
    const empty = notes.filter((note) => note.source.length === 0).map((note) => note.title);
    if (empty.length) {
        throw new PublishError(`These notes are empty, which usually means iCloud hasn't finished syncing them:\n${empty.map((t) => `  - ${t}`).join('\n')}`);
    }
    if (notes.length === 0) {
        throw new PublishError(`Evergreen/ has no notes in it (${evergreen}). Refusing to publish an empty site.`);
    }
    return notes;
}

/**
 * Paths with uncommitted changes that the publish command doesn't own.
 * @param {string[]} statusLines `git status --porcelain` style lines: "XY path"
 */
export function pathsOutsideOwned(statusLines) {
    return statusLines
        .map((line) => line.slice(3))
        .map((p) => (p.includes(' -> ') ? p.split(' -> ').pop() : p))
        .filter((p) => !isOwned(p));
}

/** @param {string} repoPath a path relative to the repo root */
function isOwned(repoPath) {
    return OWNED.some((owned) => repoPath === owned || repoPath.startsWith(`${owned}/`));
}

/**
 * Replace every note in notesDir with the given notes, keeping their subfolders.
 * Clearing first (rather than copying over) is what lets a case-only rename
 * change the filename on a case-insensitive disk.
 * @param {{ source: string, relPath: string }[]} notes
 * @param {string} notesDir
 */
export function mirrorNotes(notes, notesDir) {
    for (const rel of listMarkdown(notesDir)) fs.rmSync(path.join(notesDir, rel));
    removeEmptyDirs(notesDir, true);
    for (const note of notes) {
        const target = path.join(notesDir, note.relPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, note.source);
    }
}

function removeEmptyDirs(dir, keep = false) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name));
    }
    if (!keep && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

/**
 * Stage the publish command's own paths. The notes are dropped from the index
 * and re-added so git records each filename's on-disk case, which macOS's
 * case-insensitive default would otherwise keep from the first commit.
 * @param {string} repoDir
 */
export function stageOwnedPaths(repoDir) {
    gitIn(repoDir, 'rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', 'src/notes');
    const present = OWNED.filter((p) => fs.existsSync(path.join(repoDir, p)));
    gitIn(repoDir, 'add', '-A', '--', ...present);
}

/**
 * Commit exactly what stageOwnedPaths staged. The commit takes no pathspec on
 * purpose: with paths, git rebuilds the commit from HEAD plus the working tree
 * and resurrects the old-case entry of a case-only rename, which then fails.
 * The check below keeps the guarantee a pathspec would have given.
 * @param {string} repoDir
 * @param {string} messageFile
 */
export function commitStaged(repoDir, messageFile) {
    const staged = gitIn(repoDir, 'diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean);
    const foreign = staged.filter((p) => !isOwned(p));
    if (foreign.length) {
        throw new PublishError(`Refusing to commit files publish doesn't own:\n${foreign.map((p) => `  - ${p}`).join('\n')}`);
    }
    gitIn(repoDir, 'commit', '-q', '-F', messageFile);
}

function gitIn(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function git(...args) {
    return gitIn(ROOT, ...args);
}

function gitSucceeds(...args) {
    try {
        git(...args);
        return true;
    } catch {
        return false;
    }
}

function gitStatusLines() {
    // -z keeps paths unquoted; rename entries carry the old path as an extra field.
    const fields = git('status', '--porcelain', '-z', '--untracked-files=all').split('\0').filter(Boolean);
    const lines = [];
    for (let i = 0; i < fields.length; i++) {
        lines.push(fields[i]);
        if (/^[RC]/.test(fields[i])) i++;
    }
    return lines;
}

function readHeadFile(repoPath) {
    try {
        return git('show', `HEAD:${repoPath}`);
    } catch {
        return null;
    }
}

/** The notes, manifest, and redirect map as last published (committed at HEAD). */
function readHeadState() {
    const manifestText = readHeadFile('publish/manifest.json');
    const redirectsText = readHeadFile('publish/redirects.json');
    const notePaths = git('ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', 'src/notes')
        .split('\0')
        .filter((p) => p.toLowerCase().endsWith('.md'));
    const notes = notePaths.map((p) => ({
        title: titleFromPath(p),
        source: git('show', `HEAD:${p}`),
        relPath: path.relative('src/notes', p),
    }));
    return {
        notes,
        manifest: manifestText ? JSON.parse(manifestText) : null,
        redirects: redirectsText ? JSON.parse(redirectsText) : {},
    };
}

function readIfExists(file) {
    const full = path.join(ROOT, file);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function printPlan(plan) {
    const list = (label, items) => {
        if (!items.length) return;
        console.log(`\n${label} (${items.length}):`);
        for (const item of items) console.log(`  - ${item}`);
    };
    list('Added', plan.added);
    list('Updated', plan.updated);
    list('Removed', plan.removed);
    list('Renamed', plan.renamed.map((r) => `${r.from} -> ${r.to} (${r.reason})`));
    console.log(`\nRedirects: ${Object.keys(plan.redirects).length}`);
    if (plan.warnings.length) {
        console.log(`\nWarnings (${plan.warnings.length}):`);
        for (const warning of plan.warnings) console.log(`  ! ${warning}`);
    }
}

function commitMessage(plan) {
    const counts = [
        `${plan.added.length} added`,
        `${plan.updated.length} updated`,
        `${plan.removed.length} removed`,
        `${plan.renamed.length} renamed`,
    ].join(', ');
    const lines = [`Publish notes: ${counts}`, ''];
    const section = (label, items) => {
        if (items.length) lines.push(`${label}:`, ...items.map((i) => `- ${i}`), '');
    };
    section('Added', plan.added);
    section('Updated', plan.updated);
    section('Removed', plan.removed);
    section('Renamed', plan.renamed.map((r) => `${r.from} -> ${r.to}`));
    return lines.join('\n').trimEnd() + '\n';
}

function push() {
    if (!git('remote').trim()) {
        throw new PublishError('Committed locally, but this repo has no git remote yet. Add one (git remote add origin ...) and run publish again to push.');
    }
    if (gitSucceeds('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')) {
        git('push');
    } else {
        git('push', '-u', 'origin', 'HEAD');
    }
}

function parseCliArgs() {
    const args = process.argv.slice(2);
    return {
        dryRun: args.includes('--dry-run'),
        help: args.includes('--help') || args.includes('-h'),
    };
}

async function main() {
    const args = parseCliArgs();
    if (args.help) {
        console.log('Usage: npm run publish [-- --dry-run]');
        return;
    }

    try {
        process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
        // No .env; VAULT_PATH may come from the environment instead.
    }

    const notes = preflightVault(process.env.VAULT_PATH);

    const dirty = pathsOutsideOwned(gitStatusLines());
    if (dirty.length) {
        throw new PublishError(`Commit or stash these changes first; publish only commits notes and its own files:\n${dirty.map((p) => `  - ${p}`).join('\n')}`);
    }

    let plan;
    try {
        plan = planPublish({
            current: notes,
            head: readHeadState(),
            overrides: parseOverrides(readIfExists('publish/renames.txt')),
            home: readIfExists('src/index.md'),
        });
    } catch (error) {
        throw new PublishError(error.message);
    }

    console.log(`Read ${notes.length} notes from ${path.join(process.env.VAULT_PATH, 'Evergreen')}.`);
    printPlan(plan);

    if (args.dryRun) {
        console.log('\nDry run: nothing was written.');
        return;
    }

    mirrorNotes(notes, NOTES_DIR);
    fs.mkdirSync(path.join(ROOT, 'publish'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'publish', 'manifest.json'), JSON.stringify(plan.manifest, null, 4) + '\n');
    fs.writeFileSync(path.join(ROOT, 'publish', 'redirects.json'), JSON.stringify(plan.redirects, null, 4) + '\n');

    console.log('\nBuilding the site...');
    try {
        execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
    } catch (error) {
        process.stderr.write(error.stdout?.toString() ?? '');
        process.stderr.write(error.stderr?.toString() ?? '');
        throw new PublishError('The build failed, so nothing was committed. The mirrored notes are left in place; fix the problem above and run publish again.');
    }

    stageOwnedPaths(ROOT);
    const hasChanges = !gitSucceeds('diff', '--cached', '--quiet');
    // With no upstream yet (no remote, or a first push that failed), there is
    // no way to tell what's unpushed, so push and let it set one up or explain.
    const ahead = gitSucceeds('rev-parse', '@{u}')
        ? Number(git('rev-list', '--count', '@{u}..HEAD').trim()) > 0
        : true;

    if (!hasChanges && !ahead) {
        console.log('\nNothing to publish: the site already matches the vault.');
        return;
    }

    if (hasChanges) {
        const messageFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notes-publish-')), 'message.txt');
        fs.writeFileSync(messageFile, commitMessage(plan));
        commitStaged(ROOT, messageFile);
    }

    push();
    const { base } = await import(pathToFileURL(path.join(ROOT, 'src', '_data', 'site.js')).href);
    console.log(`\nPushed on ${git('branch', '--show-current').trim()}. Netlify deploys it to ${base} in a minute or two.`);
}

// Compare real paths: module URLs are symlink-resolved and argv isn't, so a
// checkout reached through a symlink would otherwise never run main().
const invokedAs = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        if (error instanceof PublishError) {
            console.error(`\n${error.message}`);
        } else {
            console.error('Fatal error:', error);
        }
        process.exit(1);
    });
}
