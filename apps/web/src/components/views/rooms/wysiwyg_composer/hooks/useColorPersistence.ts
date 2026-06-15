/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type RefObject, useEffect } from "react";

import type { GradientDirection, GradientStop } from "../../../../../@types/message_style.ts";
import SettingsStore from "../../../../../settings/SettingsStore";
import {
    clearColorDecorations,
    rebaseColorDecorations,
    storeColorDecoration,
    type ColorDecoration,
} from "../utils/colorDecorations";

const EDITOR_SELECTOR = ".mx_WysiwygComposer_Editor_content[contenteditable]";
const DIRECTION_MAP: Record<GradientDirection, string> = {
    "left-to-right": "to right",
    "top-to-bottom": "to bottom",
    "diagonal-down": "to bottom right",
    "diagonal-up": "to top right",
};

const PLACEHOLDER_STYLE_ID = "mx-wysiwyg-placeholder-style";
const GRADIENT_WRAP_ATTR = "data-gradient-wrap";
const STORAGE_KEY = "mx_wysiwyg_default_style";

interface DefaultStyle {
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

let defaultStyle: DefaultStyle | null = null;

try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        defaultStyle = JSON.parse(raw) as DefaultStyle;
    }
} catch {
    // ignore localStorage failures
}

function persistDefaultStyle(style: DefaultStyle | null): void {
    if (style) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

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
    document.getElementById(PLACEHOLDER_STYLE_ID)?.remove();
}

function removeGradientWrap(editor: HTMLElement): void {
    const wrap = editor.querySelector(`:scope > [${GRADIENT_WRAP_ATTR}]`);
    if (!wrap) return;
    while (wrap.firstChild) {
        editor.insertBefore(wrap.firstChild, wrap);
    }
    editor.removeChild(wrap);
}

function applyGradientWrap(editor: HTMLElement, style: DefaultStyle): void {
    if (!style.direction || !style.stops) return;
    if (editor.querySelector(`:scope > [${GRADIENT_WRAP_ATTR}]`)) return;

    const cssDir = DIRECTION_MAP[style.direction] ?? "to right";
    const stops = style.stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(", ");
    const fallback = style.stops[0]?.color ?? "#000000";

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

function isSelectionInsideEditor(editor: HTMLElement, selection: Selection): boolean {
    return Boolean(
        selection.anchorNode &&
        selection.focusNode &&
        editor.contains(selection.anchorNode) &&
        editor.contains(selection.focusNode),
    );
}

function nodeOffsetFromEditorStart(editor: HTMLElement, node: Node, offset: number): number | null {
    const range = document.createRange();
    try {
        range.selectNodeContents(editor);
        range.setEnd(node, offset);
        return range.toString().length;
    } catch {
        return null;
    }
}

function saveSelection(editor: HTMLElement): { anchor: number; focus: number } | null {
    const selection = document.getSelection();
    if (!selection || !isSelectionInsideEditor(editor, selection)) return null;

    const anchor = nodeOffsetFromEditorStart(editor, selection.anchorNode!, selection.anchorOffset);
    const focus = nodeOffsetFromEditorStart(editor, selection.focusNode!, selection.focusOffset);
    if (anchor === null || focus === null) return null;

    return { anchor, focus };
}

function findTextPosition(editor: HTMLElement, targetOffset: number): { node: Node; offset: number } {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let lastTextNode: Text | null = null;
    let textNode: Text | null;

    while ((textNode = walker.nextNode() as Text | null)) {
        lastTextNode = textNode;
        const length = textNode.textContent?.length ?? 0;
        if (targetOffset <= offset + length) {
            return { node: textNode, offset: Math.max(0, targetOffset - offset) };
        }
        offset += length;
    }

    if (lastTextNode) {
        return { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
    }

    return { node: editor, offset: editor.childNodes.length };
}

function restoreSelection(editor: HTMLElement, savedSelection: { anchor: number; focus: number } | null): void {
    if (!savedSelection) return;

    const selection = document.getSelection();
    if (!selection) return;

    const anchor = findTextPosition(editor, savedSelection.anchor);
    const focus = findTextPosition(editor, savedSelection.focus);
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}

function resetEditorStyle(editor: HTMLElement): void {
    editor.style.color = "";
    editor.style.background = "";
    editor.style.webkitTextFillColor = "";
    editor.style.backgroundClip = "";
    removeGradientWrap(editor);
}

function applyStyleToEditor(style: DefaultStyle | null, editor: HTMLElement): void {
    const savedSelection = saveSelection(editor);

    resetEditorStyle(editor);

    if (!style || !SettingsStore.getValue("Tweaks.enableColoredMessages")) {
        removePlaceholderOverride();
        restoreSelection(editor, savedSelection);
        return;
    }

    if (style.color) {
        editor.style.color = style.color;
        removePlaceholderOverride();
        restoreSelection(editor, savedSelection);
        return;
    }

    if (style.direction && style.stops) {
        const fallback = style.stops[0]?.color ?? "#000000";
        editor.style.color = fallback;
        setPlaceholderColor(fallback);
        applyGradientWrap(editor, style);
    }

    restoreSelection(editor, savedSelection);
}

function htmlToText(html: string): string {
    return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
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
        resetEditorStyle(editor);
    }
    removePlaceholderOverride();
    notifyStyleListeners();
}

export function clearColorRanges(editor?: HTMLElement | null): void {
    clearColorDecorations(editor);
}

export function storeRange(action: ColorDecoration & { editor?: HTMLElement | null }): void {
    const { editor, ...decoration } = action;
    if (!editor) return;
    storeColorDecoration(editor, decoration);
}

export function useColorPersistence(editorRef: RefObject<HTMLDivElement | null>, _messageContent: string | null): void {
    useEffect(() => {
        const editor = editorRef.current ?? document.querySelector<HTMLElement>(EDITOR_SELECTOR);
        if (!editor) return;

        if (_messageContent) {
            rebaseColorDecorations(editor, htmlToText(_messageContent));
        }
        applyStyleToEditor(defaultStyle, editor);
    }, [editorRef, _messageContent]);
}
