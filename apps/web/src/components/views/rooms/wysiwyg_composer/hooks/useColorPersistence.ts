/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useEffect } from "react";

import type { GradientDirection, GradientStop } from "../../../../../@types/message_style.ts";
import { encodeGradientPayload } from "../../../../../@types/message_style.ts";
import SettingsStore from "../../../../../settings/SettingsStore";

const EDITOR_SELECTOR = ".mx_WysiwygComposer_Editor_content[contenteditable]";
const DIRECTION_MAP: Record<GradientDirection, string> = {
    "left-to-right": "to right",
    "top-to-bottom": "to bottom",
    "diagonal-down": "to bottom right",
    "diagonal-up": "to top right",
};

const PLACEHOLDER_STYLE_ID = "mx-wysiwyg-placeholder-style";

function setPlaceholderColor(color: string): void {
    let el = document.getElementById(PLACEHOLDER_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = PLACEHOLDER_STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = `${EDITOR_SELECTOR}::placeholder { color: ${color} !important; }`;
}

function removePlaceholderOverride(): void {
    const el = document.getElementById(PLACEHOLDER_STYLE_ID);
    if (el) el.remove();
}

export interface ColorAction {
    startOffset: number;
    endOffset: number;
    text: string;
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

interface StoredRange {
    startOffset: number;
    endOffset: number;
    text: string;
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

interface DefaultStyle {
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

const STORAGE_KEY = "mx_wysiwyg_default_style";
const pendingRanges: StoredRange[] = [];

let defaultStyle: DefaultStyle | null = null;

// Load persisted default style from localStorage
try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        defaultStyle = JSON.parse(raw) as DefaultStyle;
    }
} catch {
    // ignore
}

function persistDefaultStyle(style: DefaultStyle | null): void {
    if (style) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

const GRADIENT_WRAP_ATTR = "data-gradient-wrap";

function removeGradientWrap(editor: HTMLElement): void {
    const wrap = editor.querySelector(`:scope > [${GRADIENT_WRAP_ATTR}]`);
    if (!wrap) return;
    while (wrap.firstChild) {
        editor.insertBefore(wrap.firstChild, wrap);
    }
    editor.removeChild(wrap);
}

function applyStyleToEditor(style: DefaultStyle, editor: HTMLElement): void {
    if (!SettingsStore.getValue("Tweaks.enableColoredMessages")) {
        editor.style.color = "";
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        removeGradientWrap(editor);
        removePlaceholderOverride();
        return;
    }
    if (style.color) {
        editor.style.color = style.color;
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        removeGradientWrap(editor);
        removePlaceholderOverride();
    } else if (style.direction && style.stops) {
        const fallback = style.stops[0]?.color ?? "#000000";
        editor.style.color = fallback;
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        setPlaceholderColor(fallback);
    } else {
        editor.style.color = "";
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        removeGradientWrap(editor);
        removePlaceholderOverride();
    }
}

export function clearColorRanges(): void {
    pendingRanges.splice(0);
    /* defaultStyle intentionally NOT cleared — persists across sends */
}

const styleListeners = new Set<() => void>();

export function onDefaultStyleChange(listener: () => void): () => void {
    styleListeners.add(listener);
    return () => styleListeners.delete(listener);
}

function notifyStyleListeners(): void {
    styleListeners.forEach((fn) => fn());
}

export function setDefaultStyle(style: DefaultStyle): void {
    defaultStyle = style;
    persistDefaultStyle(style);
    const editor = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
    if (editor) {
        applyStyleToEditor(style, editor);
    }
    notifyStyleListeners();
}

export function getDefaultStyle(): DefaultStyle | null {
    return defaultStyle;
}

export function clearDefaultStyle(): void {
    defaultStyle = null;
    persistDefaultStyle(null);
    const editor = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
    if (editor) {
        editor.style.color = "";
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        removeGradientWrap(editor);
    }
    removePlaceholderOverride();
    notifyStyleListeners();
}

export function storeRange(action: ColorAction): void {
    const { startOffset, endOffset, text, color, direction, stops } = action;
    if (!color && !direction) return;
    for (let i = pendingRanges.length - 1; i >= 0; i--) {
        const existing = pendingRanges[i];
        if (existing.startOffset < endOffset && existing.endOffset > startOffset) {
            pendingRanges.splice(i, 1);
        }
    }
    pendingRanges.push({ startOffset, endOffset, text, color, direction, stops });
}

let isReapplying = false;

/**
 * Regex matching any emoji codepoint (Extended_Pictographic).
 * Used to detect text nodes containing emoji so they can be excluded from the
 * `background-clip: text` gradient preview and rendered with a solid fallback.
 */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

function wrapEmojiNodes(editor: HTMLElement, fallbackColor: string): void {
    // Collect text nodes before any DOM mutations so the walker stays valid
    const textNodes: Text[] = [];
    {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
            textNodes.push(node);
        }
    }

    for (const textNode of textNodes) {
        const text = textNode.textContent || "";
        if (!EMOJI_RE.test(text)) continue;

        // Don't touch nodes already inside a protected span or an explicit color span
        let parent: Node | null = textNode.parentNode;
        let isProtected = false;
        while (parent && parent !== editor) {
            if (
                parent instanceof HTMLElement &&
                (parent.hasAttribute("data-emoji-protected") ||
                    parent.hasAttribute("data-mx-color") ||
                    parent.hasAttribute("data-mx-gradient"))
            ) {
                isProtected = true;
                break;
            }
            parent = parent.parentNode;
        }
        if (isProtected) continue;

        // Split the text node at each emoji boundary so only emoji get the solid fallback
        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        const regex = /\p{Extended_Pictographic}/gu;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const span = document.createElement("span");
            span.style.color = fallbackColor;
            span.style.webkitTextFillColor = fallbackColor;
            span.setAttribute("data-emoji-protected", "");
            span.textContent = match[0];
            frag.appendChild(span);
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        if (frag.childNodes.length > 0) {
            textNode.parentNode?.replaceChild(frag, textNode);
        }
    }
}

function applyGradientWrap(editor: HTMLElement, defaultStyle: DefaultStyle): void {
    if (!defaultStyle.direction || !defaultStyle.stops) return;
    if (editor.querySelector(`:scope > [${GRADIENT_WRAP_ATTR}]`)) return;

    const cssDir = DIRECTION_MAP[defaultStyle.direction] ?? "to right";
    const stops = defaultStyle.stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(", ");
    const fallback = defaultStyle.stops[0]?.color ?? "#000000";

    const wrap = document.createElement("span");
    wrap.setAttribute(GRADIENT_WRAP_ATTR, "");
    wrap.style.cssText = [
        `background: linear-gradient(${cssDir}, ${stops})`,
        "background-clip: text",
        "-webkit-text-fill-color: transparent",
        `color: ${fallback}`,
        "display: inline-block",
        "width: fit-content",
    ].join(";");

    while (editor.firstChild) {
        wrap.appendChild(editor.firstChild);
    }
    editor.appendChild(wrap);
}

function saveCaret(editor: HTMLElement): { start: number; end: number } | null {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const startPre = document.createRange();
    startPre.selectNodeContents(editor);
    startPre.setEnd(range.startContainer, range.startOffset);
    const endPre = document.createRange();
    endPre.selectNodeContents(editor);
    endPre.setEnd(range.endContainer, range.endOffset);
    return { start: startPre.toString().length, end: endPre.toString().length };
}

function restoreCaret(editor: HTMLElement, pos: { start: number; end: number }): void {
    const sel = document.getSelection();
    if (!sel) return;
    const startInfo = findTextNodeAtOffset(editor, pos.start);
    const endInfo = findTextNodeAtOffset(editor, pos.end);
    if (!startInfo || !endInfo) return;
    const range = document.createRange();
    range.setStart(startInfo.node, startInfo.localOffset);
    range.setEnd(endInfo.node, endInfo.localOffset);
    sel.removeAllRanges();
    sel.addRange(range);
}

function reapplyRanges(editor: HTMLElement): void {
    if (pendingRanges.length === 0 && !defaultStyle) return;
    if (isReapplying) return;

    const caret = saveCaret(editor);

    isReapplying = true;
    try {
        const coloredEnabled = SettingsStore.getValue("Tweaks.enableColoredMessages");

        if (defaultStyle) {
            applyStyleToEditor(defaultStyle, editor);
        }

        if (coloredEnabled && pendingRanges.length > 0) {
            const ranges = [...pendingRanges];
            ranges.sort((a, b) => b.startOffset - a.startOffset);

            const toApply = ranges.filter((r) => !isAlreadyColored(editor, r));
            for (const range of toApply) {
                applyColorRange(editor, range);
            }
        }

        // Wrap emoji in a solid fallback color so they aren't affected by
        // the gradient effect, then wrap all editor content in an inline-block
        // span so the gradient background-size matches the text width exactly.
        if (defaultStyle?.direction && defaultStyle?.stops && SettingsStore.getValue("Tweaks.enableColoredMessages")) {
            wrapEmojiNodes(editor, defaultStyle.stops[0]?.color ?? "#000000");
            applyGradientWrap(editor, defaultStyle);
        }
    } finally {
        isReapplying = false;
    }

    if (caret) {
        restoreCaret(editor, caret);
    }
}

export function useColorPersistence(
    editorRef: React.RefObject<HTMLDivElement | null>,
    _messageContent: string | null,
): void {
    useEffect(() => {
        const editor = editorRef.current ?? document.querySelector<HTMLElement>(EDITOR_SELECTOR);
        if (!editor) return;

        if (defaultStyle) {
            applyStyleToEditor(defaultStyle, editor);
            if (
                defaultStyle.direction &&
                defaultStyle.stops &&
                SettingsStore.getValue("Tweaks.enableColoredMessages")
            ) {
                applyGradientWrap(editor, defaultStyle);
            }
        }

        const colorObserver = new MutationObserver(() => reapplyRanges(editor));
        colorObserver.observe(editor, { childList: true, subtree: true });

        return () => {
            colorObserver.disconnect();
        };
    }, [editorRef, _messageContent]);
}

function isAlreadyColored(editor: HTMLElement, range: StoredRange): boolean {
    const checkNode = (textNode: Text | null): boolean => {
        if (!textNode) return false;
        let node: Node | null = textNode;
        while (node && node !== editor) {
            if (
                node instanceof HTMLElement &&
                (node.hasAttribute("data-mx-color") || node.hasAttribute("data-mx-gradient"))
            ) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    };

    const fullText = editor.textContent || "";
    if (fullText.slice(range.startOffset, range.endOffset) !== range.text) return false;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
        const len = textNode.textContent?.length ?? 0;
        const nodeStart = offset;
        const nodeEnd = offset + len;
        if (nodeStart < range.endOffset && nodeEnd > range.startOffset) {
            if (checkNode(textNode)) return true;
        }
        offset += len;
    }
    return false;
}

function applyColorRange(editor: HTMLElement, range: StoredRange): void {
    let startInfo = findTextNodeAtOffset(editor, range.startOffset);
    let endInfo = findTextNodeAtOffset(editor, range.endOffset);

    if (!startInfo || !endInfo || !textAtOffsetMatches(editor, range.startOffset, range.endOffset, range.text)) {
        const found = findTextInEditor(editor, range.text);
        if (found === null) {
            return;
        }
        startInfo = findTextNodeAtOffset(editor, found);
        endInfo = findTextNodeAtOffset(editor, found + range.text.length);
        if (!startInfo || !endInfo) {
            return;
        }
    }

    const wrapper = document.createElement("span");
    if (range.color) {
        wrapper.style.color = range.color;
        wrapper.setAttribute("data-mx-color", range.color);
    } else if (range.direction && range.stops) {
        const payload = encodeGradientPayload({ kind: "gradient", direction: range.direction, stops: range.stops });
        wrapper.style.color = range.stops[0]?.color ?? "#000000";
        wrapper.setAttribute("data-mx-gradient", payload);
    } else {
        return;
    }

    try {
        if (startInfo.node === endInfo.node) {
            const r = document.createRange();
            r.setStart(startInfo.node, startInfo.localOffset);
            r.setEnd(endInfo.node, endInfo.localOffset);
            r.surroundContents(wrapper);
        } else {
            const r = document.createRange();
            r.setStart(startInfo.node, startInfo.localOffset);
            r.setEnd(endInfo.node, endInfo.localOffset);
            const frag = r.extractContents();
            wrapper.appendChild(frag);
            r.insertNode(wrapper);
        }
    } catch {
        // DOM manipulation failed silently
    }
}

function findTextNodeAtOffset(editor: HTMLElement, targetOffset: number): { node: Text; localOffset: number } | null {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
        const len = textNode.textContent?.length ?? 0;
        if (offset <= targetOffset && targetOffset <= offset + len) {
            return { node: textNode, localOffset: Math.min(targetOffset - offset, len) };
        }
        offset += len;
    }
    return null;
}

function textAtOffsetMatches(editor: HTMLElement, startOffset: number, endOffset: number, expected: string): boolean {
    const fullText = editor.textContent || "";
    return fullText.slice(startOffset, endOffset) === expected;
}

function findTextInEditor(editor: HTMLElement, text: string): number | null {
    const fullText = editor.textContent || "";
    const index = fullText.indexOf(text);
    return index >= 0 ? index : null;
}
