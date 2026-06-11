/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useEffect } from "react";

import type { GradientDirection, GradientStop } from "../../../../../@types/message_style.ts";
import { encodeGradientPayload } from "../../../../../@types/message_style.ts";

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
    el.textContent = `.mx_WysiwygComposer_Editor_content[contenteditable]::placeholder { color: ${color} !important; }`;
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

function applyStyleToEditor(style: DefaultStyle, editor: HTMLElement): void {
    if (style.color) {
        editor.style.color = style.color;
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        removePlaceholderOverride();
    } else if (style.direction && style.stops) {
        const cssDir = DIRECTION_MAP[style.direction] ?? "to right";
        const stops = style.stops.map(s => `${s.color} ${Math.round(s.position * 100)}%`).join(", ");
        const fallback = style.stops[0]?.color ?? "#000000";
        editor.style.color = fallback;
        editor.style.background = `linear-gradient(${cssDir}, ${stops})`;
        editor.style.backgroundClip = "text";
        editor.style.webkitTextFillColor = "transparent";
        setPlaceholderColor(fallback);
    } else {
        editor.style.color = "";
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
        removePlaceholderOverride();
    }
}

export function clearColorRanges(): void {
    pendingRanges.splice(0);
    /* defaultStyle intentionally NOT cleared — persists across sends */
}

export function setDefaultStyle(style: DefaultStyle): void {
    defaultStyle = style;
    persistDefaultStyle(style);
    const editor =
        document.querySelector<HTMLElement>(".mx_WysiwygComposer_Editor_content[contenteditable]");
    if (editor) {
        applyStyleToEditor(style, editor);
    }
}

export function getDefaultStyle(): DefaultStyle | null {
    return defaultStyle;
}

export function clearDefaultStyle(): void {
    defaultStyle = null;
    persistDefaultStyle(null);
    const editor =
        document.querySelector<HTMLElement>(".mx_WysiwygComposer_Editor_content[contenteditable]");
    if (editor) {
        editor.style.color = "";
        editor.style.background = "";
        editor.style.webkitTextFillColor = "";
        editor.style.backgroundClip = "";
    }
    removePlaceholderOverride();
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

let colorObserver: MutationObserver | null = null;
let isReapplying = false;

function reapplyRanges(): void {
    if (pendingRanges.length === 0 && !defaultStyle) return;
    if (isReapplying) return;
    const editor =
        document.querySelector<HTMLElement>(".mx_WysiwygComposer_Editor_content[contenteditable]");
    if (!editor) return;

    if (defaultStyle) {
        applyStyleToEditor(defaultStyle, editor);
    }

    if (pendingRanges.length === 0) return;
    const ranges = [...pendingRanges];
    ranges.sort((a, b) => b.startOffset - a.startOffset);

    const toApply = ranges.filter(r => !isAlreadyColored(editor, r));
    if (toApply.length === 0) return;

    isReapplying = true;
    try {
        for (const range of toApply) {
            applyColorRange(editor, range);
        }
    } finally {
        isReapplying = false;
    }
}

export function useColorPersistence(
    editorRef: React.RefObject<HTMLDivElement | null>,
    _messageContent: string | null,
): void {
    useEffect(() => {
        const editor =
            editorRef.current ??
            document.querySelector<HTMLElement>(".mx_WysiwygComposer_Editor_content[contenteditable]");
        if (!editor) return;

        if (defaultStyle) {
            applyStyleToEditor(defaultStyle, editor);
        }

        if (!colorObserver) {
            colorObserver = new MutationObserver(reapplyRanges);
            console.debug("[useColorPersistence] observer created");
        }
        colorObserver.observe(editor, { childList: true, subtree: true });
        console.debug("[useColorPersistence] observer connected, pendingRanges:", pendingRanges.length);

        return () => {
            /* observer intentionally NOT disconnected — stays alive across re-renders
               to avoid discarding queued mutation microtasks */
        };
    }, [_messageContent]);
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
        if (!startInfo) console.debug("[useColorPersistence] startInfo null for", range.startOffset, range.text, "textContent:", editor.textContent);
        if (!endInfo) console.debug("[useColorPersistence] endInfo null for", range.endOffset, range.text, "textContent:", editor.textContent);
        const found = findTextInEditor(editor, range.text);
        if (found === null) {
            console.debug("[useColorPersistence] fallback: text not found");
            return;
        }
        startInfo = findTextNodeAtOffset(editor, found);
        endInfo = findTextNodeAtOffset(editor, found + range.text.length);
        if (!startInfo || !endInfo) {
            console.debug("[useColorPersistence] fallback: startInfo or endInfo still null", found, range.text, "textContent:", editor.textContent);
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

function findTextNodeAtOffset(
    editor: HTMLElement,
    targetOffset: number,
): { node: Text; localOffset: number } | null {
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
