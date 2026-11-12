/**
 * Hover previews for links between notes (a[data-note-link]).
 *
 * Shown on mouse or pen hover after a short delay, and on keyboard focus.
 * Touch never previews: a tap just follows the link. The preview is a visual
 * supplement only, hidden from assistive technology and out of the tab order,
 * so a link's accessible name stays its own text and keyboard and
 * screen-reader users reach the note by following the link.
 */
import { loadNote } from "./note-loader.js";

const SHOW_DELAY = 300;
const HIDE_DELAY = 200;
const GAP = 8;
const MARGIN = 16;

const preview = document.createElement("div");
preview.className = "note-preview";
preview.setAttribute("aria-hidden", "true");
preview.hidden = true;
document.body.append(preview);

let activeLink = null;
let showTimer = 0;
let hideTimer = 0;

const noteLinkFrom = (target) => {
    const link = target instanceof Element ? target.closest("a[data-note-link]") : null;
    // Links inside the preview work, but they don't open previews of their own.
    return link && !preview.contains(link) ? link : null;
};

function scheduleShow(link) {
    clearTimeout(hideTimer);
    if (link === activeLink) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(link), SHOW_DELAY);
}

function scheduleHide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
}

function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    activeLink = null;
    preview.hidden = true;
    preview.replaceChildren();
}

async function show(link) {
    activeLink = link;
    let content;
    try {
        content = await loadNote(link.href);
    } catch {
        if (activeLink === link) hide();
        return;
    }
    if (activeLink !== link) return;

    for (const inner of content.querySelectorAll("a")) {
        inner.removeAttribute("data-note-link");
        inner.setAttribute("tabindex", "-1");
    }
    content.removeAttribute("data-pagefind-body");
    preview.replaceChildren(content);
    preview.hidden = false;
    position(link);
}

function position(link) {
    const anchor = link.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const fitsBelow = below + box.height <= window.innerHeight - MARGIN;
    const top = fitsBelow || anchor.top - GAP - box.height < MARGIN
        ? below
        : anchor.top - GAP - box.height;
    const left = Math.min(
        Math.max(anchor.left, MARGIN),
        window.innerWidth - box.width - MARGIN
    );
    preview.style.top = `${top + window.scrollY}px`;
    preview.style.left = `${Math.max(left, MARGIN) + window.scrollX}px`;
}

document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const link = noteLinkFrom(event.target);
    if (link) scheduleShow(link);
    else if (preview.contains(event.target)) clearTimeout(hideTimer);
});

document.addEventListener("pointerout", (event) => {
    if (!activeLink && !showTimer) return;
    const leaving = noteLinkFrom(event.target) || preview.contains(event.target);
    const entering = event.relatedTarget instanceof Element
        && (preview.contains(event.relatedTarget) || noteLinkFrom(event.relatedTarget) === activeLink);
    if (leaving && !entering) scheduleHide();
});

document.addEventListener("focusin", (event) => {
    const link = noteLinkFrom(event.target);
    if (link && link.matches(":focus-visible")) scheduleShow(link);
});

document.addEventListener("focusout", (event) => {
    if (noteLinkFrom(event.target)) hide();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !preview.hidden) hide();
});

document.addEventListener("click", (event) => {
    if (noteLinkFrom(event.target)) hide();
});

window.addEventListener("resize", hide);
