/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { GradientDirection, GradientStop } from "../../../../../@types/message_style.ts";
import { decodeGradientPayload, encodeGradientPayload } from "../../../../../@types/message_style.ts";

export interface ColorDecoration {
    startOffset: number;
    endOffset: number;
    text: string;
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

const editorDecorations = new WeakMap<HTMLElement, ColorDecoration[]>();

// Unicode emoji ranges - must match full emoji sequences including ZWJ, variation selectors, and flags.
const EMOJI_RE =
    /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{3030}\u{303D}\u{3297}\u{3299}]|\u{200D}|\u{FE0F}|\u{20E3}/gu;

function cloneDecoration(decoration: ColorDecoration): ColorDecoration {
    return {
        ...decoration,
        stops: decoration.stops ? [...decoration.stops] : undefined,
    };
}

export function storeColorDecoration(editor: HTMLElement, decoration: ColorDecoration): void {
    const { startOffset, endOffset, color, direction } = decoration;
    if (!color && !direction) return;
    if (startOffset >= endOffset) return;

    const decorations = editorDecorations.get(editor) ?? [];
    for (let i = decorations.length - 1; i >= 0; i--) {
        const existing = decorations[i];
        if (existing.startOffset < endOffset && existing.endOffset > startOffset) {
            decorations.splice(i, 1);
        }
    }
    decorations.push(cloneDecoration(decoration));
    editorDecorations.set(editor, decorations);
}

export function getColorDecorations(editor?: HTMLElement | null): ColorDecoration[] {
    if (!editor) return [];
    return (editorDecorations.get(editor) ?? []).map(cloneDecoration);
}

export function clearColorDecorations(editor?: HTMLElement | null): void {
    if (editor) {
        editorDecorations.delete(editor);
    }
}

export function rebaseColorDecorations(editor: HTMLElement, textContent: string): void {
    const decorations = editorDecorations.get(editor);
    if (!decorations) return;

    const rebased = decorations.flatMap((decoration): ColorDecoration[] => {
        if (textContent.slice(decoration.startOffset, decoration.endOffset) === decoration.text) {
            return [decoration];
        }

        const nextStartOffset = textContent.indexOf(decoration.text);
        if (nextStartOffset < 0) return [];

        return [
            {
                ...decoration,
                startOffset: nextStartOffset,
                endOffset: nextStartOffset + decoration.text.length,
            },
        ];
    });

    if (rebased.length > 0) {
        editorDecorations.set(editor, rebased);
    } else {
        editorDecorations.delete(editor);
    }
}

function decorationGradientPayload(decoration: ColorDecoration): string | undefined {
    if (!decoration.direction || !decoration.stops) return undefined;
    return encodeGradientPayload({ kind: "gradient", direction: decoration.direction, stops: decoration.stops });
}

function appendStyledText(
    doc: Document,
    fragment: DocumentFragment,
    text: string,
    color?: string,
    gradient?: string,
): void {
    let lastIndex = 0;
    for (const match of text.matchAll(EMOJI_RE)) {
        if (match.index! > lastIndex) {
            appendStyledTextPart(doc, fragment, text.slice(lastIndex, match.index!), color, gradient);
        }
        fragment.appendChild(doc.createTextNode(match[0]));
        lastIndex = match.index! + match[0].length;
    }
    if (lastIndex < text.length) {
        appendStyledTextPart(doc, fragment, text.slice(lastIndex), color, gradient);
    }
}

function appendStyledTextPart(
    doc: Document,
    fragment: DocumentFragment,
    text: string,
    color?: string,
    gradient?: string,
): void {
    if (!text) return;
    if (!color && !gradient) {
        fragment.appendChild(doc.createTextNode(text));
        return;
    }

    const span = doc.createElement("span");
    if (color) {
        span.setAttribute("data-mx-color", color);
    } else if (gradient) {
        span.setAttribute("data-mx-gradient", gradient);
        const fallbackColor = decodeGradientPayload(gradient)?.stops[0]?.color;
        if (fallbackColor) {
            span.setAttribute("data-mx-color", fallbackColor);
        }
    }
    span.textContent = text;
    fragment.appendChild(span);
}

function replaceTextRange(
    doc: Document,
    root: HTMLElement,
    startOffset: number,
    endOffset: number,
    color?: string,
    gradient?: string,
): void {
    const replacements: Array<{ node: Text; fragment: DocumentFragment }> = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let textNode: Text | null;

    while ((textNode = walker.nextNode() as Text | null)) {
        const text = textNode.textContent ?? "";
        const nodeStart = offset;
        const nodeEnd = offset + text.length;

        if (nodeStart < endOffset && nodeEnd > startOffset) {
            const localStart = Math.max(0, startOffset - nodeStart);
            const localEnd = Math.min(text.length, endOffset - nodeStart);
            const fragment = doc.createDocumentFragment();

            if (localStart > 0) fragment.appendChild(doc.createTextNode(text.slice(0, localStart)));
            appendStyledText(doc, fragment, text.slice(localStart, localEnd), color, gradient);
            if (localEnd < text.length) fragment.appendChild(doc.createTextNode(text.slice(localEnd)));

            replacements.push({ node: textNode, fragment });
        }

        offset = nodeEnd;
    }

    for (const { node, fragment } of replacements) {
        node.parentNode?.replaceChild(fragment, node);
    }
}

export function applyColorDecorationsToHtml(html: string, decorations: ColorDecoration[]): string {
    const activeDecorations = decorations.filter((decoration) => decoration.color || decoration.direction);
    if (activeDecorations.length === 0) return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const body = doc.body;
    const sortedDecorations = [...activeDecorations].sort((a, b) => b.startOffset - a.startOffset);

    for (const decoration of sortedDecorations) {
        const fullText = body.textContent ?? "";
        let startOffset = decoration.startOffset;
        let endOffset = decoration.endOffset;

        if (fullText.slice(startOffset, endOffset) !== decoration.text) {
            startOffset = fullText.indexOf(decoration.text);
            if (startOffset < 0) continue;
            endOffset = startOffset + decoration.text.length;
        }

        replaceTextRange(doc, body, startOffset, endOffset, decoration.color, decorationGradientPayload(decoration));
    }

    return body.innerHTML;
}

export function applyDefaultColorToHtml(html: string, color?: string, gradient?: string): string {
    if (!color && !gradient) return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const body = doc.body;
    replaceTextRange(doc, body, 0, body.textContent?.length ?? 0, color, gradient);
    return body.innerHTML;
}
