import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, isReservedSlug } from "../lib/slug.js";

// Every published URL is derived from these. The expected values are written
// out by hand from the slug rules, so a change to the function that would move
// a live URL fails here first.
const GOLDEN = {
    "Action can precede cognition": "action-can-precede-cognition",
    "Digital collaborative environments tend to be neat": "digital-collaborative-environments-tend-to-be-neat",
    "Epistemic actions are taken to think, not to progress toward a goal": "epistemic-actions-are-taken-to-think-not-to-progress-toward-a-goal",
    "Experts manipulate and perform more epistemic actions than non-experts": "experts-manipulate-and-perform-more-epistemic-actions-than-non-experts",
    "Good design reduces metacognitive overhead": "good-design-reduces-metacognitive-overhead",
    "Good interfaces should support all three of Bruner's modes of representation": "good-interfaces-should-support-all-three-of-bruners-modes-of-representation",
    "Interfaces can enable entirely new modes of thought": "interfaces-can-enable-entirely-new-modes-of-thought",
    "Physical space can act as scaffolding for creative work": "physical-space-can-act-as-scaffolding-for-creative-work",
    "Programming is a kind of literacy and tools alone are insufficient to make that literacy happen": "programming-is-a-kind-of-literacy-and-tools-alone-are-insufficient-to-make-that-literacy-happen",
    "The fundamental unit of design analysis should be the tool-user system": "the-fundamental-unit-of-design-analysis-should-be-the-tool-user-system",
    "The GUI was invented as a tool for thought": "the-gui-was-invented-as-a-tool-for-thought",
    "The opportunity for serendipitous encounters in many digital information spaces is low": "the-opportunity-for-serendipitous-encounters-in-many-digital-information-spaces-is-low",
    "There are more activity entry points in messy (scruffy) spaces": "there-are-more-activity-entry-points-in-messy-scruffy-spaces",
    "There is a difference between space and place in interaction design": "there-is-a-difference-between-space-and-place-in-interaction-design",
    "Thinking with a tool involves a close coupling between user and tool": "thinking-with-a-tool-involves-a-close-coupling-between-user-and-tool",
    "Using an external external referrent in cognition is about more than offloading memory": "using-an-external-external-referrent-in-cognition-is-about-more-than-offloading-memory",
};

test("all current Evergreen titles map to their frozen slugs", () => {
    for (const [title, slug] of Object.entries(GOLDEN)) {
        assert.equal(slugify(title), slug, title);
    }
});

test("curly and straight apostrophes produce the same slug", () => {
    assert.equal(
        slugify("Bruner’s modes of representation"),
        slugify("Bruner's modes of representation")
    );
    assert.equal(slugify("Bruner’s modes"), "bruners-modes");
});

test("an NFD-encoded title slugs the same as its NFC form", () => {
    const nfc = "Café thinking";
    const nfd = nfc.normalize("NFD");
    assert.notEqual(nfc, nfd);
    assert.equal(slugify(nfd), slugify(nfc));
    assert.equal(slugify(nfc), "cafe-thinking");
});

test("reserved slugs are recognized", () => {
    for (const slug of ["", "pagefind", "assets", "404", "home"]) {
        assert.ok(isReservedSlug(slug), slug);
    }
    assert.ok(!isReservedSlug("action-can-precede-cognition"));
});
