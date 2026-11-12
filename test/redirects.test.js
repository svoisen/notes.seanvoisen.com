import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRedirects } from "../lib/redirects.js";

const live = (entries) => new Map(Object.entries(entries));

test("a rename adds a redirect, and a second rename repoints the first", () => {
    const first = normalizeRedirects({}, [{ from: "a", to: "b" }], live({ b: "B" }));
    assert.deepEqual(first.redirects, { a: "b" });

    const second = normalizeRedirects(first.redirects, [{ from: "b", to: "c" }], live({ c: "C" }));
    assert.deepEqual(second.redirects, { a: "c", b: "c" });
    assert.deepEqual(second.warnings, []);
});

test("renaming a note back to its old title clears its own redirect", () => {
    const { redirects, warnings } = normalizeRedirects({ a: "b" }, [{ from: "b", to: "a" }], live({ a: "A" }));
    assert.deepEqual(redirects, { b: "a" });
    assert.deepEqual(warnings, []);
});

test("a new live note at a redirected URL wins, and the drop is reported", () => {
    const { redirects, warnings } = normalizeRedirects(
        { a: "b" },
        [],
        live({ a: "A brand new note", b: "B" })
    );
    assert.deepEqual(redirects, {});
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /A brand new note/);
    assert.match(warnings[0], /"B"/);
    assert.match(warnings[0], /\/a\//);
});

test("redirects to a note that is no longer published are dropped", () => {
    const { redirects } = normalizeRedirects({ a: "b" }, [], live({ c: "C" }));
    assert.deepEqual(redirects, {});
});

test("a case-only rename, which keeps its slug, adds nothing", () => {
    const { redirects } = normalizeRedirects({}, [{ from: "a", to: "a" }], live({ a: "a" }));
    assert.deepEqual(redirects, {});
});
