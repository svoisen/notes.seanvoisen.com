import { test } from "node:test";
import assert from "node:assert/strict";
import markdownIt from "markdown-it";
import { buildNoteIndex } from "../lib/note-index.js";
import { wikilinks } from "../lib/wikilinks.js";

const index = buildNoteIndex([
    { title: "Action can precede cognition", source: "Body." },
    { title: "Experts manipulate and perform more epistemic actions than non-experts", source: "Body." },
]);
const md = markdownIt({ typographer: true }).use(wikilinks, { getIndex: () => index });
const render = (text, env = {}) => md.renderInline(text, env);

test("an aliased link to an unpublished note renders its alias as plain text", () => {
    const html = render("[[Kirsh - 1994 - On Distinguishing Epistemic from Pragmatic Action|Kirsh, D. and Maglio, P. (1994) On Distinguishing Epistemic from Pragmatic Action.]]");
    assert.equal(html, "Kirsh, D. and Maglio, P. (1994) On Distinguishing Epistemic from Pragmatic Action.");
});

test("a link to a note that exists nowhere renders its title as plain text", () => {
    assert.equal(render("[[Offices and workspaces are complex ecologies of work]]"), "Offices and workspaces are complex ecologies of work");
});

test("a resolved link becomes a note link, matched case-insensitively", () => {
    assert.equal(
        render("[[action can precede cognition]]"),
        '<a href="/action-can-precede-cognition/" data-note-link>action can precede cognition</a>'
    );
});

test("a heading link points at the note and drops the heading from the text", () => {
    assert.equal(
        render("[[Action can precede cognition#Some heading]]"),
        '<a href="/action-can-precede-cognition/" data-note-link>Action can precede cognition</a>'
    );
});

test("an embed renders as plain text", () => {
    assert.equal(render("![[Action can precede cognition]]"), "Action can precede cognition");
});

test("a wikilink inside inline code stays literal", () => {
    assert.equal(render("`[[Action can precede cognition]]`"), "<code>[[Action can precede cognition]]</code>");
});

test("a self-link is a plain link with no preview marker", () => {
    const html = render("[[Action can precede cognition]]", { page: { url: "/action-can-precede-cognition/" } });
    assert.equal(html, '<a href="/action-can-precede-cognition/">Action can precede cognition</a>');
});

test("display text is HTML-escaped", () => {
    assert.equal(render("[[Nowhere|<b>x</b>]]"), "&lt;b&gt;x&lt;/b&gt;");
});
