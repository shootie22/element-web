/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { GradientStop, GradientDirection } from "../../../../../@types/message_style.ts";
import { encodeGradientPayload } from "../../../../../@types/message_style.ts";

export function buildColorTag(color: string): string {
    return `<span style="color: ${color}" data-mx-color="${color}">`;
}

export function buildGradientTag(direction: GradientDirection, stops: GradientStop[]): string {
    const payload = encodeGradientPayload({ kind: "gradient", direction, stops });
    const fallback = stops[0]?.color ?? "#000000";
    return `<span style="color: ${fallback}" data-mx-gradient="${payload}" data-mx-color="${fallback}">`;
}

function wrapRange(range: Range, color: string): HTMLSpanElement;
function wrapRange(range: Range, direction: GradientDirection, stops: GradientStop[]): HTMLSpanElement;
function wrapRange(range: Range, colorOrDir: string | GradientDirection, stops?: GradientStop[]): HTMLSpanElement | undefined {
    const span = document.createElement("span");
    if (stops) {
        const direction = colorOrDir as GradientDirection;
        const payload = encodeGradientPayload({ kind: "gradient", direction, stops });
        span.style.color = stops[0]?.color ?? "#000000";
        span.setAttribute("data-mx-gradient", payload);
        span.setAttribute("data-mx-color", stops[0]?.color ?? "#000000");
    } else {
        span.style.color = colorOrDir;
        span.setAttribute("data-mx-color", colorOrDir);
    }
    try {
        range.surroundContents(span);
        return span;
    } catch {
        // surroundContents fails when the range spans multiple elements (e.g. across bold boundaries)
        // Fall back: extract contents, wrap, and insert
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
        return span;
    }
}

export function applySolidColorToSelection(color: string): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    wrapRange(range, color);
}

export function applyGradientToSelection(
    direction: GradientDirection,
    stops: GradientStop[],
): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    wrapRange(range, direction, stops);
}

export function removeColorFromSelection(): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // Walk up from startContainer to find any color span ancestor, then unwrap
    let node: Node | null = range.startContainer;
    while (node && node instanceof Node) {
        if (node instanceof HTMLElement && (node.hasAttribute("data-mx-color") || node.hasAttribute("data-mx-gradient"))) {
            const parent = node.parentNode;
            if (parent) {
                while (node.firstChild) parent.insertBefore(node.firstChild, node);
                parent.removeChild(node);
            }
            return;
        }
        node = node.parentNode;
    }
    // Remove just the selection text's wrapping
    const text = range.toString();
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
}
