/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type ImagePackEntry } from "../../../../../image-packs";

export interface ComposerCustomEmoji {
    shortcode: string;
    imgSrc: string;
}

const CUSTOM_EMOJI_SHORTCODE_REGEX = /:([a-zA-Z0-9-_]+):$/;
const CUSTOM_EMOJI_SHORTCODE_REGEX_GLOBAL = /:([a-zA-Z0-9-_]+):/g;
const CARET_PLACEHOLDER = "\u200A";

export function customEmojiText(shortcode: string): string {
    return `:${shortcode}:`;
}

export function stripCustomEmojiCaretPlaceholders(value: string): string {
    return value.replaceAll(CARET_PLACEHOLDER, "");
}

export function createCustomEmojiElement(doc: Document, { shortcode, imgSrc }: ComposerCustomEmoji): HTMLSpanElement {
    const text = customEmojiText(shortcode);
    const container = doc.createElement("span");
    container.className = "mx_CustomEmoji";
    container.setAttribute("contenteditable", "false");
    container.setAttribute("data-mx-emoticon", "");
    container.setAttribute("title", shortcode);

    const image = doc.createElement("img");
    image.className = "mx_CustomEmoji_image";
    image.setAttribute("data-mx-emoticon", "");
    image.src = imgSrc;
    image.alt = text;
    image.title = shortcode;
    image.width = 32;
    image.height = 32;
    container.appendChild(image);

    const hiddenText = doc.createElement("span");
    hiddenText.className = "mx_CustomEmoji_hiddenText";
    hiddenText.style.display = "none";
    hiddenText.appendChild(doc.createTextNode(text));
    container.appendChild(hiddenText);

    return container;
}

function isSelectionInsideEditor(editor: HTMLElement, selection: Selection): boolean {
    const { anchorNode, focusNode } = selection;
    return Boolean(
        anchorNode &&
        focusNode &&
        (anchorNode === editor || editor.contains(anchorNode)) &&
        (focusNode === editor || editor.contains(focusNode)),
    );
}

function rangeAtEditorEnd(editor: HTMLElement): Range {
    const range = document.createRange();
    const trailingBr = editor.lastChild instanceof HTMLBRElement ? editor.lastChild : null;
    if (trailingBr) {
        range.setStartBefore(trailingBr);
    } else {
        range.selectNodeContents(editor);
        range.collapse(false);
    }
    range.collapse(true);
    return range;
}

function ensureTrailingBr(editor: HTMLElement): void {
    if (!(editor.lastChild instanceof HTMLBRElement)) {
        editor.appendChild(document.createElement("br"));
    }
}

function setCaretAfter(node: Node): void {
    const doc = node.ownerDocument ?? document;
    let caretNode = node.nextSibling;
    let caretOffset = 0;

    if (caretNode?.nodeType !== Node.TEXT_NODE) {
        caretNode = doc.createTextNode(CARET_PLACEHOLDER);
        node.parentNode?.insertBefore(caretNode, node.nextSibling);
        caretOffset = CARET_PLACEHOLDER.length;
    } else if (caretNode.textContent === "") {
        caretNode.textContent = CARET_PLACEHOLDER;
        caretOffset = CARET_PLACEHOLDER.length;
    } else if (caretNode.textContent?.startsWith(CARET_PLACEHOLDER)) {
        caretOffset = CARET_PLACEHOLDER.length;
    }

    const range = document.createRange();
    range.setStart(caretNode, caretOffset);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function setCaretInNode(node: Node, offset: number): void {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

export function insertCustomEmojiAtSelection(editor: HTMLElement, emoji: ComposerCustomEmoji): void {
    ensureTrailingBr(editor);

    const selection = document.getSelection();
    const range =
        selection && isSelectionInsideEditor(editor, selection) ? selection.getRangeAt(0) : rangeAtEditorEnd(editor);
    const node = createCustomEmojiElement(editor.ownerDocument, emoji);

    range.deleteContents();
    range.insertNode(node);
    setCaretAfter(node);
}

export function insertTextAtSelection(editor: HTMLElement, text: string): void {
    ensureTrailingBr(editor);

    const selection = document.getSelection();
    const range =
        selection && isSelectionInsideEditor(editor, selection) ? selection.getRangeAt(0) : rangeAtEditorEnd(editor);
    const node = editor.ownerDocument.createTextNode(text);

    range.deleteContents();
    range.insertNode(node);
    setCaretInNode(node, text.length);
}

export function replaceLastCustomEmojiShortcode(editor: HTMLElement, entries: ImagePackEntry[]): boolean {
    const selection = document.getSelection();
    if (!selection?.isCollapsed || !isSelectionInsideEditor(editor, selection)) {
        return false;
    }

    const { anchorNode, anchorOffset } = selection;
    if (anchorNode?.nodeType !== Node.TEXT_NODE || anchorNode.textContent === null) {
        return false;
    }

    const beforeCaret = anchorNode.textContent.slice(0, anchorOffset);
    const match = CUSTOM_EMOJI_SHORTCODE_REGEX.exec(beforeCaret);
    if (!match) {
        return false;
    }

    const shortcode = match[1];
    const entry = entries.find((candidate) => candidate.shortcode === shortcode);
    if (!entry?.httpUrl) {
        return false;
    }

    const range = document.createRange();
    range.setStart(anchorNode, anchorOffset - match[0].length);
    range.setEnd(anchorNode, anchorOffset);

    const node = createCustomEmojiElement(editor.ownerDocument, { shortcode, imgSrc: entry.httpUrl });
    range.deleteContents();
    range.insertNode(node);
    setCaretAfter(node);
    ensureTrailingBr(editor);
    return true;
}

function shouldDecorateTextNode(node: Text): boolean {
    const parent = node.parentElement;
    return Boolean(parent && !parent.closest(".mx_CustomEmoji, a[data-mention-type], code, pre"));
}

export function decorateCustomEmojiShortcodes(editor: HTMLElement, entries: ImagePackEntry[]): boolean {
    if (!entries.length) {
        return false;
    }

    const byShortcode = new Map(entries.filter((entry) => entry.httpUrl).map((entry) => [entry.shortcode, entry]));
    if (!byShortcode.size) {
        return false;
    }

    const doc = editor.ownerDocument;
    const walker = doc.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
            shouldDecorateTextNode(node as Text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    let didReplace = false;
    for (const node of textNodes) {
        const value = node.nodeValue || "";
        if (!CUSTOM_EMOJI_SHORTCODE_REGEX_GLOBAL.test(value)) {
            CUSTOM_EMOJI_SHORTCODE_REGEX_GLOBAL.lastIndex = 0;
            continue;
        }
        CUSTOM_EMOJI_SHORTCODE_REGEX_GLOBAL.lastIndex = 0;

        const selection = doc.getSelection();
        const caretOffset =
            selection?.isCollapsed && selection.anchorNode === node ? selection.anchorOffset : undefined;
        const fragment = doc.createDocumentFragment();
        let caretTarget: { node: Node; offset: number } | null = null;
        let offset = 0;

        const appendText = (text: string, sourceOffset: number): void => {
            const textNode = doc.createTextNode(text);
            fragment.append(textNode);
            if (
                caretOffset !== undefined &&
                caretTarget === null &&
                caretOffset >= sourceOffset &&
                caretOffset <= sourceOffset + text.length
            ) {
                caretTarget = {
                    node: textNode,
                    offset: caretOffset - sourceOffset,
                };
            }
        };

        value.replace(CUSTOM_EMOJI_SHORTCODE_REGEX_GLOBAL, (match, shortcode: string, index: number) => {
            const entry = byShortcode.get(shortcode);
            if (!entry?.httpUrl) {
                return match;
            }

            if (index > offset) {
                appendText(value.slice(offset, index), offset);
            }
            const customEmoji = createCustomEmojiElement(doc, { shortcode, imgSrc: entry.httpUrl });
            fragment.append(customEmoji);
            if (
                caretOffset !== undefined &&
                caretTarget === null &&
                caretOffset > index &&
                caretOffset <= index + match.length
            ) {
                caretTarget = {
                    node: customEmoji,
                    offset: -1,
                };
            }
            offset = index + match.length;
            didReplace = true;
            return match;
        });

        if (offset > 0) {
            if (offset < value.length) {
                appendText(value.slice(offset), offset);
            }
            node.replaceWith(fragment);
            if (caretTarget) {
                if (caretTarget.offset === -1) {
                    setCaretAfter(caretTarget.node);
                } else {
                    setCaretInNode(caretTarget.node, caretTarget.offset);
                }
            }
        }
    }

    return didReplace;
}

function shortcodeFromCustomEmojiElement(element: Element): string | null {
    const image = element.matches("img[data-mx-emoticon]")
        ? (element as HTMLImageElement)
        : element.querySelector<HTMLImageElement>("img[data-mx-emoticon]");
    const raw = element.getAttribute("title") || image?.title || image?.alt || element.textContent || "";
    const shortcode = raw.replace(/^:/, "").replace(/:$/, "").trim();
    return shortcode || null;
}

export function replaceCustomEmojiHtmlWithShortcodes(html: string): string {
    const document = new DOMParser().parseFromString(html, "text/html");
    const customEmoji = Array.from(document.body.querySelectorAll("span.mx_CustomEmoji[data-mx-emoticon]"));
    for (const element of customEmoji) {
        const shortcode = shortcodeFromCustomEmojiElement(element);
        if (shortcode) {
            element.replaceWith(document.createTextNode(customEmojiText(shortcode)));
        }
    }

    const customEmojiImages = Array.from(document.body.querySelectorAll("img[data-mx-emoticon]"));
    for (const image of customEmojiImages) {
        const shortcode = shortcodeFromCustomEmojiElement(image);
        if (shortcode) {
            image.replaceWith(document.createTextNode(customEmojiText(shortcode)));
        }
    }

    return stripCustomEmojiCaretPlaceholders(document.body.innerHTML);
}

export function clipboardTextWithCustomEmojiShortcodes(data: DataTransfer | null): string | null {
    if (!data) {
        return null;
    }

    const html = data.getData("text/html");
    const normalizedHtml = html ? replaceCustomEmojiHtmlWithShortcodes(html) : "";
    if (normalizedHtml !== html) {
        return new DOMParser().parseFromString(normalizedHtml, "text/html").body.textContent || "";
    }

    return null;
}
