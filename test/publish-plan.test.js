import { test } from "node:test";
import assert from "node:assert/strict";
import { planPublish, parseOverrides } from "../lib/publish-plan.js";

const words = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const text = (shared, sharedCount, own) => [...words(shared, sharedCount), ...words(own, 40 - sharedCount)].join(" ");
const file = (title, source) => ({ title, source, relPath: `${title}.md` });

const headWith = (notes, { redirects = {} } = {}) => ({
    notes,
    redirects,
    manifest: {
        notes: Object.fromEntries(notes.map((n) => [n.title.toLowerCase().replace(/\s+/g, "-"), { title: n.title, path: n.relPath }])),
    },
});

test("a first publish adds every note, with no removals or redirects", () => {
    const plan = planPublish({
        current: [file("A", "One."), file("B", "Two.")],
        head: { notes: [], redirects: {}, manifest: null },
    });
    assert.deepEqual(plan.added, ["A", "B"]);
    assert.deepEqual(plan.removed, []);
    assert.deepEqual(plan.redirects, {});
    assert.deepEqual(Object.keys(plan.manifest.notes), ["a", "b"]);
});

test("a body-only edit is an update and leaves the URL alone", () => {
    const plan = planPublish({
        current: [file("A", "New words.")],
        head: headWith([file("A", "Old words.")]),
    });
    assert.deepEqual(plan.updated, ["A"]);
    assert.deepEqual(plan.redirects, {});
});

test("a rename with the same body redirects the old URL", () => {
    const body = text("w", 40, "x");
    const plan = planPublish({
        current: [file("B", body)],
        head: headWith([file("A", body)]),
    });
    assert.deepEqual(plan.renamed.map((r) => [r.from, r.to]), [["A", "B"]]);
    assert.deepEqual(plan.redirects, { a: "b" });
    assert.deepEqual(plan.removed, []);
    assert.deepEqual(plan.added, []);
});

test("a rename plus heavy rewrite pairs through another note's updated link", () => {
    const plan = planPublish({
        current: [file("B", text("z", 40, "q")), file("C", "See [[B]].")],
        head: headWith([file("A", text("w", 40, "x")), file("C", "See [[A]].")]),
    });
    assert.deepEqual(plan.redirects, { a: "b" });
});

test("an uncertain rename publishes as delete plus new, with a paste-ready override", () => {
    const plan = planPublish({
        current: [file("B", text("w", 24, "y"))],
        head: headWith([file("A", text("w", 24, "x"))]),
    });
    assert.deepEqual(plan.removed, ["A"]);
    assert.deepEqual(plan.added, ["B"]);
    assert.deepEqual(plan.redirects, {});
    assert.ok(plan.warnings.some((w) => w.includes("A -> B")), plan.warnings.join("\n"));
});

test("a weak match is delete plus new with no possible-rename warning", () => {
    const plan = planPublish({
        current: [file("B", text("w", 10, "y"))],
        head: headWith([file("A", text("w", 10, "x"))]),
    });
    assert.deepEqual(plan.redirects, {});
    assert.ok(!plan.warnings.some((w) => w.includes("A -> B")));
});

test("an override pairs notes with nothing in common", () => {
    const plan = planPublish({
        current: [file("B", text("z", 40, "q"))],
        head: headWith([file("A", text("w", 40, "x"))]),
        overrides: parseOverrides("# renames\nA -> B\n"),
    });
    assert.deepEqual(plan.redirects, { a: "b" });
});

test("an override added after the fact creates the missed redirect", () => {
    const plan = planPublish({
        current: [file("B", "Body.")],
        head: headWith([file("B", "Body.")]),
        overrides: parseOverrides("A -> B"),
    });
    assert.deepEqual(plan.redirects, { a: "b" });
});

test("rename A to B plus a new note titled A: the new note keeps /a/ and the drop is reported", () => {
    const oldA = text("w", 40, "x");
    const plan = planPublish({
        current: [file("B", oldA), file("A", text("z", 40, "q"))],
        head: headWith([file("A", oldA)]),
    });
    assert.deepEqual(plan.renamed.map((r) => [r.from, r.to]), [["A", "B"]]);
    assert.deepEqual(plan.redirects, {});
    assert.ok(plan.warnings.some((w) => w.includes("/a/") && w.includes('"A"') && w.includes('"B"')), plan.warnings.join("\n"));
});

test("a Home link to a title that isn't published is reported", () => {
    const plan = planPublish({
        current: [file("B", "Body.")],
        head: headWith([file("B", "Body.")]),
        home: "Start with [[A]] or [[B]].",
    });
    assert.ok(plan.warnings.some((w) => w.includes("Home") && w.includes('"A"')));
    assert.ok(!plan.warnings.some((w) => w.includes('"B"')));
});

test("a case-only rename keeps the URL, updates the title, and adds no redirect", () => {
    const plan = planPublish({
        current: [file("The Gui note", "Body.")],
        head: headWith([file("The GUI note", "Body.")]),
    });
    assert.deepEqual(plan.redirects, {});
    assert.equal(plan.manifest.notes["the-gui-note"].title, "The Gui note");
    assert.deepEqual(plan.renamed.map((r) => [r.from, r.to]), [["The GUI note", "The Gui note"]]);
});

test("two notes whose titles share a URL stop the publish, naming both", () => {
    assert.throws(
        () => planPublish({
            current: [file("Good design", "A."), file("Good design?", "B.")],
            head: { notes: [], redirects: {}, manifest: null },
        }),
        /Good design.*Good design\?/
    );
});
