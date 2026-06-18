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

const MX_REPLY_REGEX = /<mx-reply>[\s\S]*?<\/mx-reply>/;

function stripReplyFallback(html: string): string {
    return html.replace(MX_REPLY_REGEX, "");
}

function prepareFormattedContentForEditing(html: string): string {
    if (!html.includes("data-mx-gradient")) {
        return html;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>("[data-mx-gradient]"))) {
        element.style.removeProperty("background");
        element.style.removeProperty("background-image");
        element.style.removeProperty("background-clip");
        element.style.removeProperty("-webkit-background-clip");
        element.style.removeProperty("-webkit-text-fill-color");
        if (!element.getAttribute("style")) {
            element.removeAttribute("style");
        }
    }
    return doc.body.innerHTML;
}

function getFormattedContent(editorStateTransfer: EditorStateTransfer): string {
    const content = editorStateTransfer.getEvent().getContent();
    const formattedBody = content["m.new_content"]?.formatted_body ?? content.formatted_body ?? "";
    return prepareFormattedContentForEditing(stripReplyFallback(formattedBody));
}

export function parseEditorStateTransfer(
    editorStateTransfer: EditorStateTransfer,
    room: Room,
    mxClient: MatrixClient,
): string {
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

    return parts.reduce((content, part) => content + part?.text, "");
    // Todo local storage
    // this.saveStoredEditorState();
}

export function useInitialContent(editorStateTransfer: EditorStateTransfer): string | undefined {
    const { room } = useScopedRoomContext("room");
    const mxClient = useMatrixClientContext();

    return useMemo<string | undefined>(() => {
        if (editorStateTransfer && room && mxClient) {
            return parseEditorStateTransfer(editorStateTransfer, room, mxClient);
        }
    }, [editorStateTransfer, room, mxClient]);
}
