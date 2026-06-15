/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { type Preview } from "./Preview";
import { type TagID } from "../../room-list-v3/skip-list/tag";
import { getSenderName, isSelf } from "./utils";
import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { MessagePreviewStore } from "../MessagePreviewStore";
import { REACTION_SHORTCODE_KEY } from "../../../viewmodels/room/timeline/event-tile/reactions/reactionShortcode";

const htmlEscape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class ReactionEventPreview implements Preview {
    public getTextFor(event: MatrixEvent, tagId?: TagID, isThread?: boolean): string | null {
        const roomId = event.getRoomId();
        if (!roomId) return null; // not a room event

        const relation = event.getRelation();
        if (!relation) return null; // invalid reaction (probably redacted)

        let reaction = relation.key;
        if (!reaction) return null; // invalid reaction (unknown format)

        if (reaction.startsWith("mxc://")) {
            reaction = REACTION_SHORTCODE_KEY.findIn(event.getContent()) || _t("event_preview|m.reaction|custom_emoji");
        }

        const cli = MatrixClientPeg.get();
        const room = cli?.getRoom(roomId);
        const relatedEvent = relation.event_id ? room?.findEventById(relation.event_id) : null;
        if (!relatedEvent) return null;

        const message = MessagePreviewStore.instance.generatePreviewForEvent(relatedEvent);
        if (isSelf(event)) {
            return _t("event_preview|m.reaction|you", {
                reaction,
                message,
            });
        }

        return _t("event_preview|m.reaction|user", {
            sender: getSenderName(event),
            reaction,
            message,
        });
    }

    public getHtmlFor(event: MatrixEvent, tagId?: TagID, isThread?: boolean): string | null {
        const roomId = event.getRoomId();
        if (!roomId) return null;

        const relation = event.getRelation();
        if (!relation) return null;

        const reaction = relation.key;
        if (!reaction || !reaction.startsWith("mxc://")) return null;

        const cli = MatrixClientPeg.get();
        const room = cli?.getRoom(roomId);
        const relatedEvent = relation.event_id ? room?.findEventById(relation.event_id) : null;
        if (!relatedEvent) return null;

        const shortcode = (REACTION_SHORTCODE_KEY.findIn(event.getContent() as Record<string, unknown>) as string | undefined) || (_t("event_preview|m.reaction|custom_emoji") as string);
        const httpUrl = cli?.mxcUrlToHttp(reaction) ?? reaction;

        const emojiImg = `<img src="${htmlEscape(httpUrl)}" alt="${htmlEscape(shortcode)}" style="height: 1em; vertical-align: center;" />`;
        const message = htmlEscape(MessagePreviewStore.instance.generatePreviewForEvent(relatedEvent));

        if (isSelf(event)) {
            return _t("event_preview|m.reaction|you", {
                reaction: emojiImg,
                message,
            });
        }

        return _t("event_preview|m.reaction|user", {
            sender: htmlEscape(getSenderName(event)),
            reaction: emojiImg,
            message,
        });
    }
}
