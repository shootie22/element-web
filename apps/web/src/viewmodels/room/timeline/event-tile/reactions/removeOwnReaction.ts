/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { EventStatus, type MatrixClient, type MatrixEvent, RoomEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

const cancellableLocalEchoStatuses = new Set<EventStatus>([
    EventStatus.QUEUED,
    EventStatus.NOT_SENT,
    EventStatus.ENCRYPTING,
]);

const pendingRemovalReactions = new WeakSet<MatrixEvent>();
const pendingRedactionReactions = new WeakSet<MatrixEvent>();
const PENDING_REMOVAL_TIMEOUT_MS = 30000;

function redactReaction(
    client: MatrixClient,
    roomId: string,
    reactionEvent: MatrixEvent,
    onSettled?: () => void,
): boolean {
    if (pendingRedactionReactions.has(reactionEvent)) {
        return true;
    }

    const eventId = reactionEvent.getId();
    if (!eventId) return false;

    pendingRedactionReactions.add(reactionEvent);
    void client
        .redactEvent(roomId, eventId)
        .catch((error) => {
            logger.warn("Failed to redact reaction", error);
        })
        .finally(() => {
            pendingRedactionReactions.delete(reactionEvent);
            onSettled?.();
        });
    return true;
}

function removeReactionAfterSend(
    client: MatrixClient,
    roomId: string,
    reactionEvent: MatrixEvent,
    onSettled?: () => void,
): boolean {
    if (pendingRemovalReactions.has(reactionEvent)) {
        return true;
    }

    const room = client.getRoom(roomId);
    if (!room) return false;

    const originalEventId = reactionEvent.getId();
    let cleanup: () => void = () => {};

    const tryRemove = (event: MatrixEvent): boolean => {
        if (event.status && cancellableLocalEchoStatuses.has(event.status)) {
            client.cancelPendingEvent(event);
            cleanup();
            onSettled?.();
            return true;
        }

        if (event.status === EventStatus.SENDING) {
            return false;
        }

        const removed = redactReaction(client, roomId, event, onSettled);
        if (removed) cleanup();
        return removed;
    };

    const onLocalEchoUpdated = (event: MatrixEvent, _room: unknown, oldEventId?: string): void => {
        if (event !== reactionEvent && event.getId() !== reactionEvent.getId() && oldEventId !== originalEventId) {
            return;
        }
        tryRemove(event);
    };

    cleanup = (): void => {
        pendingRemovalReactions.delete(reactionEvent);
        room.off(RoomEvent.LocalEchoUpdated, onLocalEchoUpdated);
        window.clearTimeout(timeoutId);
    };

    pendingRemovalReactions.add(reactionEvent);
    room.on(RoomEvent.LocalEchoUpdated, onLocalEchoUpdated);
    const timeoutId = window.setTimeout(() => {
        cleanup();
        onSettled?.();
    }, PENDING_REMOVAL_TIMEOUT_MS);
    return true;
}

export function removeOwnReaction(
    client: MatrixClient,
    roomId: string,
    reactionEvent: MatrixEvent,
    onSettled?: () => void,
): boolean {
    if (reactionEvent.isRedacted()) return false;

    if (reactionEvent.status && cancellableLocalEchoStatuses.has(reactionEvent.status)) {
        client.cancelPendingEvent(reactionEvent);
        onSettled?.();
        return true;
    }

    if (reactionEvent.status === EventStatus.SENDING) {
        return removeReactionAfterSend(client, roomId, reactionEvent, onSettled);
    }

    return redactReaction(client, roomId, reactionEvent, onSettled);
}
