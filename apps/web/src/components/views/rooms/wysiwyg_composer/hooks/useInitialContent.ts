/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { useMemo } from "react";

import { useMatrixClientContext } from "../../../../../contexts/MatrixClientContext";
import { parseEvent } from "../../../../../editor/deserialize";
import { CommandPartCreator, type Part } from "../../../../../editor/parts";
import SettingsStore from "../../../../../settings/SettingsStore";
import type EditorStateTransfer from "../../../../../utils/EditorStateTransfer";
import { useScopedRoomContext } from "../../../../../contexts/ScopedRoomContext.tsx";
import { decodeGradientPayload, validateColor } from "../../../../../@types/message_style.ts";
import { type ColorDecoration } from "../utils/colorDecorations";

const MX_REPLY_REGEX = /<mx-reply>[\s\S]*?<\/mx-reply>/;

function stripReplyFallback(html: string): string {
    return html.replace(MX_REPLY_REGEX, "");
}

export interface InitialContent {
    content: string;
    colorDecorations: ColorDecoration[];
}

function textOffsetBefore(root: HTMLElement, node: Node): number {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEndBefore(node);
    return range.toString().length;
}

function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
}

function prepareFormattedContentForEditing(html: string): InitialContent {
    if (!html.includes("data-mx-color") && !html.includes("data-mx-gradient")) {
        return { content: html, colorDecorations: [] };
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const colorDecorations: ColorDecoration[] = [];

    for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>("[data-mx-color], [data-mx-gradient]"))) {
        const color = element.getAttribute("data-mx-color");
        const gradient = element.getAttribute("data-mx-gradient");
        const decodedGradient = gradient ? decodeGradientPayload(gradient) : null;
        const text = element.textContent ?? "";
        const startOffset = textOffsetBefore(doc.body, element);
        const validColor = color && validateColor(color) ? color : undefined;

        if (text && (validColor || decodedGradient)) {
            colorDecorations.push({
                startOffset,
                endOffset: startOffset + text.length,
                text,
                color: decodedGradient ? undefined : validColor,
                direction: decodedGradient?.direction,
                stops: decodedGradient?.stops,
            });
        }

        element.style.removeProperty("background");
        element.style.removeProperty("background-image");
        element.style.removeProperty("background-clip");
        element.style.removeProperty("-webkit-background-clip");
        element.style.removeProperty("-webkit-text-fill-color");

        unwrapElement(element);
    }
    return { content: doc.body.innerHTML, colorDecorations };
}

function getFormattedContent(editorStateTransfer: EditorStateTransfer): InitialContent {
    const content = editorStateTransfer.getEvent().getContent();
    const formattedBody = content["m.new_content"]?.formatted_body ?? content.formatted_body ?? "";
    return prepareFormattedContentForEditing(stripReplyFallback(formattedBody));
}

export function parseEditorStateTransfer(
    editorStateTransfer: EditorStateTransfer,
    room: Room,
    mxClient: MatrixClient,
): InitialContent {
    const partCreator = new CommandPartCreator(room, mxClient);

    let parts: (Part | undefined)[] = [];
    if (editorStateTransfer.hasEditorState()) {
        // if restoring state from a previous editor,
        // restore serialized parts from the state
        const serializedParts = editorStateTransfer.getSerializedParts();
        if (serializedParts !== null) {
            parts = serializedParts.map((p) => partCreator.deserializePart(p));
        }
    } else {
        // otherwise, either restore serialized parts from localStorage or parse the body of the event
        // TODO local storage
        // const restoredParts = this.restoreStoredEditorState(partCreator);

        if (editorStateTransfer.getEvent().getContent().format === "org.matrix.custom.html") {
            return getFormattedContent(editorStateTransfer);
        }

        parts = parseEvent(editorStateTransfer.getEvent(), partCreator, {
            shouldEscape: SettingsStore.getValue("MessageComposerInput.useMarkdown"),
        });
    }

    return { content: parts.reduce((content, part) => content + part?.text, ""), colorDecorations: [] };
    // Todo local storage
    // this.saveStoredEditorState();
}

export function useInitialContent(editorStateTransfer: EditorStateTransfer): InitialContent | undefined {
    const { room } = useScopedRoomContext("room");
    const mxClient = useMatrixClientContext();

    return useMemo<InitialContent | undefined>(() => {
        if (editorStateTransfer && room && mxClient) {
            return parseEditorStateTransfer(editorStateTransfer, room, mxClient);
        }
    }, [editorStateTransfer, room, mxClient]);
}
