import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildSite, projectRoot } from "./helpers/build-site.js";

const fixtureNotes = path.join(projectRoot, "test", "fixtures", "notes");

test("an empty notes folder still builds the Home page", () => {
    const site = buildSite();
    const home = site.read("index.html");
    assert.match(home, /<title>[^<]*Home[^<]*<\/title>/);
    assert.match(home, /<h1[^>]*>Home<\/h1>/);
});

test("pages carry no <base> element", () => {
    const site = buildSite();
    assert.doesNotMatch(site.read("index.html"), /<base\b/);
});

test("inlined CSS carries the copied brand tokens and both font faces", () => {
    const home = buildSite().read("index.html");
    assert.match(home, /--background-color:/);
    assert.match(home, /--link-hover-color:/);
    assert.match(home, /font-family:Outfit/);
    assert.match(home, /font-family:IBM Plex Sans/);
});

test("the build emits a 404 page that links to Home", () => {
    const site = buildSite();
    assert.ok(site.exists("404.html"));
    assert.match(site.read("404.html"), /<a href="\/"/);
});

test("note pages, backlinks, and plain-text dead links render from real note files", async (t) => {
    const site = buildSite({
        notesDir: fixtureNotes,
        home: "Start with [[Action can precede cognition]].",
    });
    const action = site.read("action-can-precede-cognition/index.html");

    await t.test("each note is published at its title slug, subfolders included", () => {
        assert.ok(site.exists("epistemic-actions-are-taken-to-think-not-to-progress-toward-a-goal/index.html"));
        assert.ok(site.exists("nested-note/index.html"));
        assert.ok(!site.exists("subfolder/nested-note/index.html"));
    });

    await t.test("a citation to an unpublished literature note is plain text", () => {
        assert.match(action, /Kirsh, D\. and Maglio, P\. \(1994\) On Distinguishing Epistemic from Pragmatic Action\./);
        assert.doesNotMatch(action, /<a [^>]*>Kirsh, D\./);
    });

    await t.test("a link to a note that exists nowhere is plain text", () => {
        const epistemic = site.read("epistemic-actions-are-taken-to-think-not-to-progress-toward-a-goal/index.html");
        assert.match(epistemic, /Related: Offices and workspaces are complex ecologies of work\./);
    });

    await t.test("a note without frontmatter publishes and counts as a backlink source", () => {
        assert.ok(site.exists("digital-collaborative-environments-tend-to-be-neat/index.html"));
        assert.match(action, /<a href="\/digital-collaborative-environments-tend-to-be-neat\/" data-note-link>Digital collaborative environments tend to be neat<\/a>/);
    });

    await t.test("a note linking twice is listed once; Home is never listed", () => {
        const entries = action.match(/<a href="\/epistemic-actions-are-taken-to-think-not-to-progress-toward-a-goal\/" data-note-link>Epistemic/g) ?? [];
        assert.equal(entries.length, 1);
        assert.doesNotMatch(action.slice(action.indexOf('class="backlinks"')), />Home</);
    });

    await t.test("backlinks sit outside the previewable content region", () => {
        assert.match(action, /<\/div>\s*<section class="backlinks"/);
        assert.match(action, /<h2[^>]*>Links to this note<\/h2>/);
    });

    await t.test("a note nothing links to has no backlinks heading", () => {
        assert.doesNotMatch(site.read("lonely-note/index.html"), /Links to this note/);
    });

    await t.test("Home's wikilinks resolve to note links", () => {
        assert.match(site.read("index.html"), /<a href="\/action-can-precede-cognition\/" data-note-link>Action can precede cognition<\/a>/);
    });

    await t.test("the note title comes from the filename", () => {
        assert.match(action, /<h1>Action can precede cognition<\/h1>/);
    });
});
