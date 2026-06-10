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
    stripCustomEmojiCaretPlaceholders,
} from "../../../../../../../src/components/views/rooms/wysiwyg_composer/utils/customEmoji";
import { type ImagePackEntry } from "../../../../../../../src/image-packs";

const caretPlaceholder = "\u200A";

const partyEntry = {
    shortcode: "party",
    httpUrl: "https://example.org/party.gif",
} as ImagePackEntry;

const waveEntry = {
    shortcode: "wave",
    httpUrl: "https://example.org/wave.gif",
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

        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe("hello :party:");
        expect(editor.querySelector("span.mx_CustomEmoji")).not.toBeNull();
        expect(editor.lastChild).toBeInstanceOf(HTMLBRElement);
        expect(editor.textContent).toContain(caretPlaceholder);

        editor.remove();
    });

    it("keeps the caret in an invisible text node after inserting custom emoji", () => {
        const editor = document.createElement("div");
        document.body.appendChild(editor);

        insertCustomEmojiAtSelection(editor, {
            shortcode: "party",
            imgSrc: "https://example.org/party.gif",
        });

        const selection = document.getSelection();
        expect(selection?.anchorNode?.textContent).toBe(caretPlaceholder);
        expect(selection?.anchorOffset).toBe(1);
        expect(editor.childNodes[0].textContent).toBe(caretPlaceholder);
        expect(editor.childNodes[1]).toBe(editor.querySelector("span.mx_CustomEmoji"));

        editor.remove();
    });

    it("can place the caret between adjacent custom emojis", () => {
        const editor = document.createElement("div");
        document.body.appendChild(editor);

        insertCustomEmojiAtSelection(editor, {
            shortcode: "party",
            imgSrc: "https://example.org/party.gif",
        });
        insertCustomEmojiAtSelection(editor, {
            shortcode: "wave",
            imgSrc: "https://example.org/wave.gif",
        });

        const range = document.createRange();
        range.setStart(editor.childNodes[1], 1);
        range.collapse(true);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);

        const selection = document.getSelection();
        expect(editor.querySelectorAll("span.mx_CustomEmoji")).toHaveLength(2);
        expect(selection?.anchorNode?.textContent).toBe(caretPlaceholder);
        expect(selection?.anchorOffset).toBe(1);

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
        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe("hello :party:");
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
        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe("hello :party:");
        expect(editor.querySelector("span.mx_CustomEmoji")).not.toBeNull();
    });

    it("adds caret placeholders between adjacent decorated custom emoji elements", () => {
        const editor = document.createElement("div");
        editor.appendChild(document.createTextNode(":party::wave:"));

        expect(decorateCustomEmojiShortcodes(editor, [partyEntry, waveEntry])).toBe(true);

        expect(editor.querySelectorAll("span.mx_CustomEmoji")).toHaveLength(2);
        expect(editor.childNodes[0].textContent).toBe(caretPlaceholder);
        expect(editor.childNodes[2].textContent).toBe(caretPlaceholder);
        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe(":party::wave:");
    });

    it("adds a caret placeholder before a leading decorated custom emoji element", () => {
        const editor = document.createElement("div");
        editor.appendChild(document.createTextNode(":party: hello"));

        expect(decorateCustomEmojiShortcodes(editor, [partyEntry])).toBe(true);

        expect(editor.childNodes[0].textContent).toBe(caretPlaceholder);
        expect(editor.childNodes[1]).toBe(editor.querySelector("span.mx_CustomEmoji"));
        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe(":party: hello");
    });

    it("inserts text at the caret between adjacent decorated custom emoji elements", () => {
        const editor = document.createElement("div");
        editor.appendChild(document.createTextNode(":party::wave:"));
        document.body.appendChild(editor);

        expect(decorateCustomEmojiShortcodes(editor, [partyEntry, waveEntry])).toBe(true);

        const range = document.createRange();
        range.setStart(editor.childNodes[2], caretPlaceholder.length);
        range.collapse(true);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);

        insertTextAtSelection(editor, "hello");

        expect(editor.querySelectorAll("span.mx_CustomEmoji")).toHaveLength(2);
        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe(":party:hello:wave:");

        editor.remove();
    });

    it("inserts text at the caret before a leading custom emoji element", () => {
        const editor = document.createElement("div");
        editor.appendChild(document.createTextNode(":party:"));
        document.body.appendChild(editor);

        expect(decorateCustomEmojiShortcodes(editor, [partyEntry])).toBe(true);

        const range = document.createRange();
        range.setStart(editor.childNodes[0], caretPlaceholder.length);
        range.collapse(true);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);

        insertTextAtSelection(editor, "hello");

        expect(editor.querySelectorAll("span.mx_CustomEmoji")).toHaveLength(1);
        expect(stripCustomEmojiCaretPlaceholders(editor.textContent || "")).toBe("hello:party:");

        editor.remove();
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
            caretPlaceholder,
        ].join("");

        expect(replaceCustomEmojiHtmlWithShortcodes(html)).toBe("hello :party:");
    });

    it("strips custom emoji caret placeholders from composer content", () => {
        expect(stripCustomEmojiCaretPlaceholders(`hello${caretPlaceholder}:party:`)).toBe("hello:party:");
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
