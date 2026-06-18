/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { EventType, type MatrixClient, type MatrixEvent, RelationType } from "matrix-js-sdk/src/matrix";
import { type ReactionEventContent } from "matrix-js-sdk/src/types";
import { logger } from "matrix-js-sdk/src/logger";

import dis from "../../../../../dispatcher/dispatcher";
import { REACTION_SHORTCODE_KEY } from "./reactionShortcode";
import { removeOwnReaction } from "./removeOwnReaction";

type CustomReactionEventContent = ReactionEventContent & Record<"shortcode" | "com.beeper.reaction.shortcode", string>;
type SentReactionResponse = { event_id: string } | MatrixEvent;

interface ToggleOwnReactionOptions {
    client: MatrixClient;
    mxEvent: MatrixEvent;
    reaction: string;
    shortcode?: string;
    myReactionEvent?: MatrixEvent;
    canSelfRedact: boolean;
}

const PENDING_REACTION_TOGGLE_TIMEOUT_MS = 30000;

interface PendingReactionToggle {
    timeoutId: number;
    removeAfterAdd: boolean;
}

const pendingReactionToggles = new Map<string, PendingReactionToggle>();

function pendingToggleKey(client: MatrixClient, roomId: string, eventId: string, reaction: string): string {
    return `${client.getSafeUserId()}\u0000${roomId}\u0000${eventId}\u0000${reaction}`;
}

function schedulePendingToggleTimeout(key: string, pendingToggle: PendingReactionToggle): void {
    window.clearTimeout(pendingToggle.timeoutId);
    pendingToggle.timeoutId = window.setTimeout(() => {
        if (pendingReactionToggles.get(key) === pendingToggle) {
            pendingReactionToggles.delete(key);
        }
    }, PENDING_REACTION_TOGGLE_TIMEOUT_MS);
}

function clearPendingToggle(key: string, pendingToggle: PendingReactionToggle): void {
    if (pendingReactionToggles.get(key) !== pendingToggle) {
        return;
    }

    window.clearTimeout(pendingToggle.timeoutId);
    pendingReactionToggles.delete(key);
}

function markPendingToggle(key: string): PendingReactionToggle {
    const existingToggle = pendingReactionToggles.get(key);
    if (existingToggle) {
        schedulePendingToggleTimeout(key, existingToggle);
        return existingToggle;
    }

    const pendingToggle: PendingReactionToggle = {
        timeoutId: 0,
        removeAfterAdd: false,
    };
    pendingReactionToggles.set(key, pendingToggle);
    schedulePendingToggleTimeout(key, pendingToggle);
    return pendingToggle;
}

function buildReactionContent(eventId: string, reaction: string, shortcode?: string): ReactionEventContent {
    const content: ReactionEventContent | CustomReactionEventContent = {
        "m.relates_to": {
            rel_type: RelationType.Annotation,
            event_id: eventId,
            key: reaction,
        },
    };

    if (shortcode) {
        const customContent = content as CustomReactionEventContent;
        customContent[REACTION_SHORTCODE_KEY.name] = shortcode;
        customContent[REACTION_SHORTCODE_KEY.altName] = shortcode;
    }

    return content;
}

function redactSentReaction(client: MatrixClient, roomId: string, eventId: string): Promise<void> {
    return Promise.resolve(client.redactEvent(roomId, eventId)).then(
        () => {},
        (error) => {
            logger.warn("Failed to redact reaction", error);
        },
    );
}

function getSentReactionEventId(response: SentReactionResponse): string | undefined {
    if ("event_id" in response && typeof response.event_id === "string") {
        return response.event_id;
    }

    return response.getId();
}

function finishSentReaction(
    client: MatrixClient,
    roomId: string,
    key: string,
    pendingToggle: PendingReactionToggle,
    response: SentReactionResponse,
): void {
    if (!pendingToggle.removeAfterAdd) {
        clearPendingToggle(key, pendingToggle);
        return;
    }

    const sentEventId = getSentReactionEventId(response);
    if (!sentEventId) {
        clearPendingToggle(key, pendingToggle);
        return;
    }

    void redactSentReaction(client, roomId, sentEventId).finally(() => {
        clearPendingToggle(key, pendingToggle);
    });
}

/**
 * Toggle one own reaction while a Matrix local echo or redaction may still be in flight.
 * This prevents stale relation state from turning a rapid remove click into a duplicate send.
 */
export function toggleOwnReaction({
    client,
    mxEvent,
    reaction,
    shortcode,
    myReactionEvent,
    canSelfRedact,
}: ToggleOwnReactionOptions): boolean {
    const roomId = mxEvent.getRoomId();
    const eventId = mxEvent.getId();
    if (!roomId || !eventId || mxEvent.isRedacted()) return false;

    const key = pendingToggleKey(client, roomId, eventId, reaction);
    const existingPendingToggle = pendingReactionToggles.get(key);
    if (existingPendingToggle) {
        existingPendingToggle.removeAfterAdd = true;
        schedulePendingToggleTimeout(key, existingPendingToggle);
        return false;
    }

    const pendingToggle = markPendingToggle(key);

    if (myReactionEvent && !myReactionEvent.isRedacted()) {
        if (!canSelfRedact) {
            clearPendingToggle(key, pendingToggle);
            return false;
        }

        const removed = removeOwnReaction(client, roomId, myReactionEvent, () =>
            clearPendingToggle(key, pendingToggle),
        );
        if (!removed) {
            clearPendingToggle(key, pendingToggle);
        }
        return false;
    }

    void Promise.resolve(
        client.sendEvent(roomId, EventType.Reaction, buildReactionContent(eventId, reaction, shortcode)),
    )
        .then((response) => {
            finishSentReaction(client, roomId, key, pendingToggle, response);
        })
        .catch((error) => {
            logger.warn("Failed to send reaction", error);
            clearPendingToggle(key, pendingToggle);
        });
    dis.dispatch({ action: "message_sent" });
    return true;
}
