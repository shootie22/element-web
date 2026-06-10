/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    clipboardTextWithCustomEmojiShortcodes,
    createCustomEmojiElement,
    decorateCustomEmojiShortcodes,
    insertCustomEmojiAtSelection,
    insertTextAtSelection,
    replaceCustomEmojiHtmlWithShortcodes,
    replaceLastCustomEmojiShortcode,
} from "../../../../../../../src/components/views/rooms/wysiwyg_composer/utils/customEmoji";
import { type ImagePackEntry } from "../../../../../../../src/image-packs";

const partyEntry = {
    shortcode: "party",
    httpUrl: "https://example.org/party.gif",
} as ImagePackEntry;

describe("customEmoji", () => {
    it("creates an atomic custom emoji element with shortcode fallback text", () => {
        const node = createCustomEmojiElement(document, {
            shortcode: "party",
            imgSrc: "https://example.org/party.gif",
        });
        const image = node.querySelector<HTMLImageElement>("img.mx_CustomEmoji_image");

        expect(node).toHaveClass("mx_CustomEmoji");
        expect(node).toHaveAttribute("contenteditable", "false");
        expect(node).toHaveAttribute("data-mx-emoticon");
        expect(node).toHaveTextContent(":party:");
        expect(image).toHaveAttribute("data-mx-emoticon");
        expect(image).toHaveAttribute("src", "https://example.org/party.gif");
        expect(image).toHaveAttribute("alt", ":party:");
        expect(image).toHaveAttribute("title", "party");
    });

    it("inserts custom emoji at the current selection", () => {
        const editor = document.createElement("div");
        const text = document.createTextNode("hello world");
        editor.appendChild(text);
        document.body.appendChild(editor);
        document.getSelection()?.setBaseAndExtent(text, 6, text, 11);

        insertCustomEmojiAtSelection(editor, {
            shortcode: "party",
            imgSrc: "https://example.org/party.gif",
        });

        expect(editor.textContent).toBe("hello :party:");
        expect(editor.querySelector("span.mx_CustomEmoji")).not.toBeNull();
        expect(editor.lastChild).toBeInstanceOf(HTMLBRElement);
        expect(editor.textContent).not.toContain("\u200B");

        editor.remove();
    });

    it("inserts text at the current selection", () => {
        const editor = document.createElement("div");
        const text = document.createTextNode("hello world");
        editor.appendChild(text);
        document.body.appendChild(editor);
        document.getSelection()?.setBaseAndExtent(text, 6, text, 11);

        insertTextAtSelection(editor, ":party:");

        expect(editor.textContent).toBe("hello :party:");
        expect(document.getSelection()?.anchorNode?.textContent).toBe(":party:");
        expect(document.getSelection()?.anchorOffset).toBe(7);

        editor.remove();
    });

    it("replaces a typed shortcode ending at the caret with a custom emoji element", () => {
        const editor = document.createElement("div");
        const text = document.createTextNode("hello :party:");
        editor.appendChild(text);
        document.body.appendChild(editor);
        document.getSelection()?.setBaseAndExtent(text, text.length, text, text.length);

        expect(replaceLastCustomEmojiShortcode(editor, [partyEntry])).toBe(true);
        expect(editor.textContent).toBe("hello :party:");
        expect(editor.querySelector("span.mx_CustomEmoji")).not.toBeNull();

        editor.remove();
    });

    it("leaves unknown shortcodes as text", () => {
        const editor = document.createElement("div");
        const text = document.createTextNode(":unknown:");
        editor.appendChild(text);
        document.body.appendChild(editor);
        document.getSelection()?.setBaseAndExtent(text, text.length, text, text.length);

        expect(replaceLastCustomEmojiShortcode(editor, [partyEntry])).toBe(false);
        expect(editor.textContent).toBe(":unknown:");
        expect(editor.querySelector("span.mx_CustomEmoji")).toBeNull();

        editor.remove();
    });

    it("decorates known shortcode text as atomic custom emoji elements", () => {
        const editor = document.createElement("div");
        editor.appendChild(document.createTextNode("hello :party:"));

        expect(decorateCustomEmojiShortcodes(editor, [partyEntry])).toBe(true);
        expect(editor.textContent).toBe("hello :party:");
        expect(editor.querySelector("span.mx_CustomEmoji")).not.toBeNull();
    });

    it("keeps the caret after text typed after a decorated custom emoji", () => {
        const editor = document.createElement("div");
        const text = document.createTextNode(":party:a");
        editor.appendChild(text);
        document.body.appendChild(editor);
        document.getSelection()?.setBaseAndExtent(text, text.length, text, text.length);

        expect(decorateCustomEmojiShortcodes(editor, [partyEntry])).toBe(true);

        const selection = document.getSelection();
        expect(selection?.anchorNode?.textContent).toBe("a");
        expect(selection?.anchorOffset).toBe(1);

        editor.remove();
    });

    it("converts custom emoji HTML back to shortcode text", () => {
        const html = [
            "hello ",
            '<span class="mx_CustomEmoji" contenteditable="false" data-mx-emoticon title="party">',
            '<img class="mx_CustomEmoji_image" data-mx-emoticon src="https://example.org/party.gif" alt=":party:" title="party">',
            '<span class="mx_CustomEmoji_hiddenText" style="display: none;">:party:</span>',
            "</span>",
        ].join("");

        expect(replaceCustomEmojiHtmlWithShortcodes(html)).toBe("hello :party:");
    });

    it("extracts custom emoji shortcode text from clipboard HTML", () => {
        const html = [
            "hello ",
            '<span class="mx_CustomEmoji" contenteditable="false" data-mx-emoticon title="party">',
            '<img class="mx_CustomEmoji_image" data-mx-emoticon src="https://example.org/party.gif" alt=":party:" title="party">',
            '<span class="mx_CustomEmoji_hiddenText" style="display: none;">:party:</span>',
            "</span>",
        ].join("");
        const data = {
            getData: (type: string) => (type === "text/html" ? html : ""),
        } as DataTransfer;

        expect(clipboardTextWithCustomEmojiShortcodes(data)).toBe("hello :party:");
    });
});
