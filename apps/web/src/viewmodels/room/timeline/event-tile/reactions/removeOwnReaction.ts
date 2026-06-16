/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { EventStatus, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

const cancellableLocalEchoStatuses = new Set<EventStatus>([
    EventStatus.QUEUED,
    EventStatus.NOT_SENT,
    EventStatus.ENCRYPTING,
    EventStatus.SENDING,
]);

export function removeOwnReaction(client: MatrixClient, roomId: string, reactionEvent: MatrixEvent): boolean {
    if (reactionEvent.isRedacted()) return false;

    if (reactionEvent.status && cancellableLocalEchoStatuses.has(reactionEvent.status)) {
        client.cancelPendingEvent(reactionEvent);
        return true;
    }

    const eventId = reactionEvent.getId();
    if (!eventId) return false;

    void client.redactEvent(roomId, eventId).catch((error) => {
        logger.warn("Failed to redact reaction", error);
    });
    return true;
}
