#!/usr/bin/env node

/**
 * Preview the vault's current Evergreen notes locally, without publishing.
 *
 *   npm run preview
 *
 * Mirrors VAULT_PATH/Evergreen/ into src/notes/, starts the Eleventy dev
 * server, and mirrors again whenever a note changes, so an edit in Obsidian
 * shows up in the browser a moment later. The vault is only ever read.
 *
 * On exit, src/notes/ goes back to what's committed, so a preview leaves no
 * changes behind. If src/notes/ already had uncommitted changes when the
 * preview started, there's nothing safe to go back to, so it stays mirrored.
 */

import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { listMarkdown } from '../lib/note-index.js';
import { preflightVault, mirrorNotes } from './publish.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NOTES_DIR = path.join(ROOT, 'src', 'notes');

/**
 * Bring notesDir in line with the given notes, touching only what changed so
 * the dev server rebuilds once per edit rather than once per file. When the
 * set of filenames differs (a note added, removed, or renamed, even by case
 * alone), it falls back to a full mirror.
 * @param {{ source: string, relPath: string }[]} notes
 * @param {string} notesDir
 * @returns {{ added: string[], removed: string[], updated: string[] }} relative paths
 */
export function syncNotes(notes, notesDir) {
    const onDisk = new Set(listMarkdown(notesDir));
    const wanted = new Set(notes.map((note) => note.relPath));
    const added = [...wanted].filter((rel) => !onDisk.has(rel));
    const removed = [...onDisk].filter((rel) => !wanted.has(rel));
    const updated = notes
        .filter((note) => onDisk.has(note.relPath))
        .filter((note) => fs.readFileSync(path.join(notesDir, note.relPath), 'utf8') !== note.source)
        .map((note) => note.relPath);

    if (added.length || removed.length) {
        mirrorNotes(notes, notesDir);
    } else {
        for (const rel of updated) {
            fs.writeFileSync(path.join(notesDir, rel), notes.find((note) => note.relPath === rel).source);
        }
    }
    return { added, removed, updated };
}

function git(...args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function notesDirIsClean() {
    return git('status', '--porcelain', '--untracked-files=all', '--', 'src/notes').trim() === '';
}

function restoreNotesDir() {
    git('checkout', 'HEAD', '--', 'src/notes');
    git('clean', '-fq', '--', 'src/notes');
}

function main() {
    try {
        process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
        // No .env; VAULT_PATH may come from the environment instead.
    }

    const vaultPath = process.env.VAULT_PATH;
    let notes;
    try {
        notes = preflightVault(vaultPath);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    const evergreen = path.join(vaultPath, 'Evergreen');

    const restoreOnExit = notesDirIsClean();
    if (!restoreOnExit) {
        console.log('src/notes/ already has uncommitted changes, so it will be left as the preview leaves it.');
    }

    syncNotes(notes, NOTES_DIR);
    console.log(`Previewing ${notes.length} notes from ${evergreen}. Edits there show up after a moment.`);

    let pending = null;
    const watcher = fs.watch(evergreen, { recursive: true }, (_event, filename) => {
        if (filename && !String(filename).toLowerCase().endsWith('.md')) return;
        clearTimeout(pending);
        pending = setTimeout(() => {
            try {
                const { added, removed, updated } = syncNotes(preflightVault(vaultPath), NOTES_DIR);
                for (const [label, list] of [['Added', added], ['Removed', removed], ['Updated', updated]]) {
                    if (list.length) console.log(`${label}: ${list.join(', ')}`);
                }
            } catch (error) {
                // Usually a note caught mid-sync by iCloud; the next save fixes it.
                console.error(`Skipped this change: ${error.message}`);
            }
        }, 300);
    });

    const server = spawn(
        process.execPath,
        [path.join(ROOT, 'node_modules', '@11ty', 'eleventy', 'cmd.cjs'), '--serve', '--quiet'],
        { cwd: ROOT, stdio: 'inherit' }
    );

    let finished = false;
    const finish = (code) => {
        if (finished) return;
        finished = true;
        watcher.close();
        clearTimeout(pending);
        if (restoreOnExit) {
            try {
                restoreNotesDir();
            } catch (error) {
                console.error(`Couldn't restore src/notes/: ${error.message}`);
            }
        }
        process.exit(code ?? 0);
    };

    server.on('exit', (code) => finish(code));
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => {
            if (server.exitCode === null) server.kill(signal);
            else finish(0);
        });
    }
}

const invokedAs = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
    main();
}
