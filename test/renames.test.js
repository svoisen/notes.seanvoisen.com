import { test } from "node:test";
import assert from "node:assert/strict";
import { similarity, inferRenames } from "../lib/renames.js";

// Bodies with a known overlap. Two 40-word bodies sharing their first p words
// (and nothing else) share p-2 of their 38 three-word shingles, so their
// similarity is (p-2) / (76-(p-2)).
const words = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const body = (shared, sharedCount, own) => [...words(shared, sharedCount), ...words(own, 40 - sharedCount)].join(" ");

const note = (title, text) => ({ title, slug: title.toLowerCase(), body: text });

test("similarity follows the shingle overlap", () => {
    assert.equal(similarity(body("w", 40, "x"), body("w", 40, "y")), 1);
    assert.equal(similarity(body("w", 24, "x"), body("w", 24, "y")), 22 / 54);
    assert.equal(similarity(body("w", 0, "x"), body("w", 0, "y")), 0);
});

test("an unchanged body pairs a vanished note with a new one", () => {
    const text = body("w", 40, "x");
    const { renames } = inferRenames({ old: [note("A", text)], fresh: [note("B", text)] });
    assert.deepEqual(renames.map((r) => [r.from.title, r.to.title, r.reason]), [["A", "B", "similar body"]]);
});

test("rewritten links in other notes pair a renamed note even after a full rewrite", () => {
    const { renames } = inferRenames({
        old: [note("A", body("w", 40, "x"))],
        fresh: [note("B", body("z", 40, "q"))],
        linkEvidence: new Map([["a", new Set(["B"])]]),
    });
    assert.deepEqual(renames.map((r) => [r.from.title, r.to.title, r.reason]), [["A", "B", "links updated"]]);
});

test("a mid-band match is not a rename but is offered as a possible one", () => {
    const { renames, possible } = inferRenames({
        old: [note("A", body("w", 24, "x"))],
        fresh: [note("B", body("w", 24, "y"))],
    });
    assert.deepEqual(renames, []);
    assert.deepEqual(possible.map((p) => [p.from.title, p.to.title]), [["A", "B"]]);
});

test("a weak match is neither a rename nor a possible one", () => {
    const { renames, possible } = inferRenames({
        old: [note("A", body("w", 10, "x"))],
        fresh: [note("B", body("w", 10, "y"))],
    });
    assert.deepEqual(renames, []);
    assert.deepEqual(possible, []);
});

test("an override pairs notes that share nothing", () => {
    const { renames } = inferRenames({
        old: [note("A", body("w", 40, "x"))],
        fresh: [note("B", body("z", 40, "q"))],
        overrides: [{ from: "a", to: "b" }],
    });
    assert.deepEqual(renames.map((r) => [r.from.title, r.to.title, r.reason]), [["A", "B", "override"]]);
});

test("pairing is one-to-one by best score across all candidates", () => {
    // Y is identical to Q. X is a little closer to Q (prefix 32) than to P
    // (prefix 31), so pairing X first would steal Q from Y.
    const q = body("w", 40, "q");
    const y = q;
    const x = body("w", 32, "x");
    const p = [...words("w", 31), ...words("x", 1), ...words("p", 8)].join(" ");
    const { renames } = inferRenames({
        old: [note("X", x), note("Y", y)],
        fresh: [note("P", p), note("Q", q)],
    });
    const pairs = Object.fromEntries(renames.map((r) => [r.from.title, r.to.title]));
    assert.deepEqual(pairs, { Y: "Q", X: "P" });
});
