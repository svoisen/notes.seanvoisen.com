import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build-site.js";

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
