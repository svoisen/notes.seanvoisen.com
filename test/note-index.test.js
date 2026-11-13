import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNoteIndex, extractWikilinks, backlinkExcerpt } from "../lib/note-index.js";

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
    const entries = (url) => index.backlinks[url].map(({ title, url }) => ({ title, url }));
    assert.deepEqual(entries("/b/"), [{ title: "A", url: "/a/" }]);
    assert.deepEqual(entries("/a/"), [{ title: "B", url: "/b/" }]);
    assert.deepEqual(index.backlinks["/b/"][0].excerpt, { before: "See ", link: "B", after: " and again the same note. Also A and Nowhere." });
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

const toB = (target) => target.toLowerCase() === "b";

test("a backlink excerpt is the paragraph holding the first link, as plain text", () => {
    const body = "# Heading\n\nNo link here.\n\n- A **bold** [md link](https://x.test) and [[C|another]], then [[B|the target]] with `code`.\n\n[[B]] again.";
    assert.deepEqual(backlinkExcerpt(body, toB), { before: "A bold md link and another, then ", link: "the target", after: " with code." });
});

test("a late link's excerpt starts at a sentence close enough that the clamp keeps the link", () => {
    const lead = "Filler words run on here. ".repeat(10);
    const { before } = backlinkExcerpt(`${lead}This sentence links [[B]].`, toB);
    assert.match(before, /^…Filler words/);
    assert.ok(before.length <= 141, `${before.length} characters before the link`);
    assert.ok(before.endsWith("This sentence links "));
});

test("a backlink excerpt curls quotes the way the rendered note does", () => {
    const { before, after } = backlinkExcerpt(`Spaces are "neat," says [[B]]'s author.`, toB);
    assert.equal(before, "Spaces are “neat,” says ");
    assert.equal(after, "’s author.");
});

test("an embed or a link inside code is never the excerpt's link", () => {
    assert.equal(backlinkExcerpt("![[B]]\n\n```\n[[B]]\n```", toB), null);
});
