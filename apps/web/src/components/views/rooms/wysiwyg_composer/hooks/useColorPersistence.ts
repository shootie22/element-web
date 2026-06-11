/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useEffect } from "react";

import type { GradientDirection, GradientStop } from "../../../../../@types/message_style.ts";
import { buildColorTag, buildGradientTag } from "../utils/color.ts";

interface ColorRangeEntry {
    startOffset: number;
    endOffset: number;
    openTag: string;
}

export interface ColorAction {
    startOffset: number;
    endOffset: number;
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

const pendingRanges: ColorRangeEntry[] = [];

export function clearColorRanges(): void {
    pendingRanges.splice(0);
}

export function storeRange(action: ColorAction): void {
    const { startOffset, endOffset, color, direction, stops } = action;
    let openTag: string;
    if (color) {
        openTag = buildColorTag(color);
    } else if (direction && stops) {
        openTag = buildGradientTag(direction, stops);
    } else {
        return;
    }
    pendingRanges.push({ startOffset, endOffset, openTag });
}

export function useColorPersistence(
    editorRef: React.RefObject<HTMLDivElement | null>,
    messageContent: string | null,
): void {
    useEffect(() => {
        if (!editorRef.current || pendingRanges.length === 0) return;

        const timer = setTimeout(() => {
            if (pendingRanges.length === 0) return;
            const editor = editorRef.current;
            if (!editor) return;

            const ranges = [...pendingRanges];
            ranges.sort((a, b) => b.startOffset - a.startOffset);
            for (const range of ranges) {
                applyColorRange(editor, range);
            }
        }, 0);

        return () => clearTimeout(timer);
    }, [messageContent, editorRef]);
}

function applyColorRange(editor: HTMLElement, range: ColorRangeEntry): void {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
        const len = textNode.textContent?.length ?? 0;
        const nodeStart = offset;
        const nodeEnd = offset + len;

        if (nodeStart <= range.startOffset && range.startOffset < nodeEnd) {
            const localStart = range.startOffset - nodeStart;
            const localEnd = range.endOffset - nodeStart;

            if (localEnd > len) continue;

            const text = textNode.textContent?.slice(localStart, localEnd) ?? "";
            if (!text) continue;

            const html = range.openTag + text + "</span>";

            try {
                const r = document.createRange();
                r.setStart(textNode, localStart);
                r.setEnd(textNode, localEnd);
                const sel = document.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(r);
                    document.execCommand("insertHTML", false, html);
                }
            } catch {
                // skip errors
            }
            break;
        }
        offset = nodeEnd;
    }
}
