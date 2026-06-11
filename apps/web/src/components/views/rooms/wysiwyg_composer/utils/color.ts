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
    return `<span style="color: ${fallback}" data-mx-gradient="${payload}">`;
}

function ensureEditorFocus(): void {
    const active = document.activeElement;
    if (!active || !(active instanceof HTMLElement) || !active.hasAttribute("contenteditable")) {
        const editor = document.querySelector<HTMLElement>("[contenteditable]");
        editor?.focus();
    }
}

export function applySolidColorToSelection(color: string): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    ensureEditorFocus();
    document.execCommand("insertHTML", false, buildColorTag(color) + text + "</span>");
}

export function applyGradientToSelection(
    direction: GradientDirection,
    stops: GradientStop[],
): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    ensureEditorFocus();
    document.execCommand("insertHTML", false, buildGradientTag(direction, stops) + text + "</span>");
}

export function removeColorFromSelection(): void {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString();
    if (!text) return;
    ensureEditorFocus();
    document.execCommand("insertHTML", false, text);
}
