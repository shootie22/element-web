/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { type TagID } from "../../room-list-v3/skip-list/tag";

/**
 * Represents an event preview.
 */
export interface Preview {
    /**
     * Gets the text which represents the event as a preview.
     * @param event The event to preview.
     * @param tagId Optional. The tag where the room the event was sent in resides.
     * @param isThread Optional. Whether the preview being generated is for a thread summary.
     * @returns The preview.
     */
    getTextFor(event: MatrixEvent, tagId?: TagID, isThread?: boolean): string | null;

    /**
     * Gets an HTML version of the preview, if the previewer supports it.
     * When available, consumers should prefer this over getTextFor() for richer rendering.
     * @param event The event to preview.
     * @param tagId Optional. The tag where the room the event was sent in resides.
     * @param isThread Optional. Whether the preview being generated is for a thread summary.
     * @returns The HTML preview, or null if not available.
     */
    getHtmlFor?(event: MatrixEvent, tagId?: TagID, isThread?: boolean): string | null;
}
