/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { GradientStop, GradientDirection } from "../../../../../@types/message_style.ts";
import { encodeGradientPayload } from "../../../../../@types/message_style.ts";

/**
 * Apply a solid color to the current text selection.
 * Uses execCommand('insertHTML') which inserts HTML through the browser's contenteditable
 * pipeline. The WYSIWYG library ignores 'insertHTML' events (falls through to default handler),
 * so the span stays in the DOM until the next library-processed input event.
 */
export function applySolidColorToSelection(color: string): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    document.execCommand("insertHTML", false, `<span data-mx-color="${color}">${text}</span>`);
}

/**
 * Apply a gradient to the current text selection.
 * Same approach as applySolidColorToSelection.
 */
export function applyGradientToSelection(
    direction: GradientDirection,
    stops: GradientStop[],
): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    const payload = encodeGradientPayload({ kind: "gradient", direction, stops });
    document.execCommand("insertHTML", false, `<span data-mx-gradient="${payload}">${text}</span>`);
}

/**
 * Remove color/gradient from the current selection by replacing with plain text.
 */
export function removeColorFromSelection(): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    document.execCommand("insertHTML", false, text);
}
