/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import escapeHtml from "escape-html";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { getImagePackEntries } from "./image-packs";

const SHORTCODE_TEXT_REGEX = /:([a-zA-Z0-9-_]+):/g;

function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/"/g, "&quot;");
}

export function shortcodeToEmoticonHtml(client: MatrixClient, room: Room | null | undefined, text: string): string {
    const entries = getImagePackEntries(client, room, "emoticon");
    if (entries.length === 0) return escapeHtml(text);

    const byShortcode = new Map(entries.map((entry) => [entry.shortcode, entry]));
    return escapeHtml(text).replace(SHORTCODE_TEXT_REGEX, (match, shortcode: string) => {
        const entry = byShortcode.get(shortcode);
        if (!entry) return match;
        const alt = entry.body || `:${entry.shortcode}:`;
        return `<img data-mx-emoticon src="${escapeAttr(entry.url)}" alt="${escapeAttr(alt)}" title="${escapeAttr(
            entry.shortcode,
        )}" height="32" />`;
    });
}

export function htmlWithEmoticonShortcodes(
    client: MatrixClient,
    room: Room | null | undefined,
    html: string,
): string {
    const entries = getImagePackEntries(client, room, "emoticon");
    if (entries.length === 0) return html;
    const byShortcode = new Map(entries.map((entry) => [entry.shortcode, entry]));

    const doc = new DOMParser().parseFromString(html, "text/html");
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    for (const node of textNodes) {
        const value = node.nodeValue || "";
        if (!SHORTCODE_TEXT_REGEX.test(value)) {
            SHORTCODE_TEXT_REGEX.lastIndex = 0;
            continue;
        }
        SHORTCODE_TEXT_REGEX.lastIndex = 0;
        const fragment = doc.createDocumentFragment();
        let offset = 0;
        value.replace(SHORTCODE_TEXT_REGEX, (match, shortcode: string, index: number) => {
            const entry = byShortcode.get(shortcode);
            if (!entry) return match;
            if (index > offset) fragment.append(doc.createTextNode(value.slice(offset, index)));
            const img = doc.createElement("img");
            img.setAttribute("data-mx-emoticon", "");
            img.setAttribute("src", entry.url);
            img.setAttribute("alt", entry.body || `:${entry.shortcode}:`);
            img.setAttribute("title", entry.shortcode);
            img.setAttribute("height", "32");
            fragment.append(img);
            offset = index + match.length;
            return match;
        });
        if (offset === 0) continue;
        if (offset < value.length) fragment.append(doc.createTextNode(value.slice(offset)));
        node.replaceWith(fragment);
    }

    return doc.body.innerHTML;
}
