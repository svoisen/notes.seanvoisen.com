import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNoteIndex, extractWikilinks } from "../lib/note-index.js";

const note = (title, source) => ({ title, source });

test("links resolve case-insensitively to the note's URL", () => {
    const index = buildNoteIndex([note("Action can precede cognition", "Body.")]);
    assert.equal(index.resolve("action can precede cognition")?.url, "/action-can-precede-cognition/");
});

test("a leading folder path is ignored, but only Evergreen notes exist", () => {
    const index = buildNoteIndex([note("Action can precede cognition", "Body.")]);
    assert.equal(index.resolve("Evergreen/Action can precede cognition")?.title, "Action can precede cognition");
    assert.equal(index.resolve("References/Kay - 1993 - The Early History of Smalltalk"), null);
});

test("a heading or block part and a trailing .md are ignored when resolving", () => {
    const index = buildNoteIndex([note("Action can precede cognition", "Body.")]);
    assert.ok(index.resolve("Action can precede cognition#Some heading"));
    assert.ok(index.resolve("Action can precede cognition.md"));
});

test("aliases frontmatter makes a note reachable by its alias", () => {
    const index = buildNoteIndex([
        note("Action can precede cognition", "---\naliases:\n  - Epistemic first\n---\nBody."),
    ]);
    assert.equal(index.resolve("Epistemic first")?.title, "Action can precede cognition");
});

test("an NFC link resolves to a note whose filename arrived as NFD", () => {
    const index = buildNoteIndex([note("Café thinking".normalize("NFD"), "Body.")]);
    assert.equal(index.resolve("Café thinking")?.url, "/cafe-thinking/");
});

test("two titles that share a slug fail the build, naming both", () => {
    assert.throws(
        () => buildNoteIndex([
            note("Good design reduces metacognitive overhead", "A."),
            note("Good design: reduces metacognitive overhead?", "B."),
        ]),
        (err) => err.message.includes("Good design reduces metacognitive overhead")
            && err.message.includes("Good design: reduces metacognitive overhead?")
    );
});

test("a title whose slug is reserved fails the build", () => {
    assert.throws(() => buildNoteIndex([note("Pagefind", "A.")]), /Pagefind/);
    assert.throws(() => buildNoteIndex([note("Home", "A.")]), /Home/);
});

test("backlinks are deduped, never self-referential, and only from resolved links", () => {
    const index = buildNoteIndex([
        note("A", "See [[B]] and again [[b|the same note]]. Also [[A]] and [[Nowhere]]."),
        note("B", "Back to [[A]]."),
        note("C", "Nothing links here."),
    ]);
    assert.deepEqual(index.backlinks["/b/"], [{ title: "A", url: "/a/" }]);
    assert.deepEqual(index.backlinks["/a/"], [{ title: "B", url: "/b/" }]);
    assert.deepEqual(index.backlinks["/c/"] ?? [], []);
});

test("wikilinks inside code are not links", () => {
    const links = extractWikilinks("Real [[A]].\n\nInline `[[B]]` code.\n\n```\n[[C]]\n```\n");
    assert.deepEqual(links.map((l) => l.target), ["A"]);
});

test("display text is the alias, else the target as written without its heading", () => {
    const [aliased, headed, embed] = extractWikilinks("[[A|shown]] [[B#Part]] ![[C]]");
    assert.equal(aliased.display, "shown");
    assert.equal(headed.display, "B");
    assert.equal(embed.embed, true);
});
