/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useContext, useMemo } from "react";
import { type MatrixEvent, type Relations, EventType, RelationType } from "matrix-js-sdk/src/matrix";
import { type ReactionEventContent } from "matrix-js-sdk/src/types";

import * as recent from "../../../emojipicker/recent";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type FocusComposerPayload } from "../../../dispatcher/payloads/FocusComposerPayload";
import { getImagePackEntries } from "../../../image-packs";
import AccessibleButton from "../elements/AccessibleButton";
import { REACTION_SHORTCODE_KEY } from "../../../viewmodels/room/timeline/event-tile/reactions/reactionShortcode";
import SettingsStore from "../../../settings/SettingsStore";
import RoomContext from "../../../contexts/RoomContext";

interface QuickReactionsBarProps {
    mxEvent: MatrixEvent;
    reactions?: Relations | null;
    className?: string;
    onReaction?: () => void;
}

type CustomReactionEventContent = ReactionEventContent & Record<"shortcode" | "com.beeper.reaction.shortcode", string>;

const QUICK_REACTION_COUNT = 5;

const DEFAULT_QUICK_REACTIONS = ["👍", "😄", "❤️", "🎉", "👎"];

export function QuickReactionsBar({ mxEvent, reactions, className, onReaction }: QuickReactionsBarProps): React.ReactNode {
    const roomContext = useContext(RoomContext);

    const myReactions = useMemo(() => {
        if (!reactions) return {};
        const userId = MatrixClientPeg.safeGet().getSafeUserId();
        const myAnnotations = reactions.getAnnotationsBySender()?.[userId] ?? new Set<MatrixEvent>();
        return Object.fromEntries(
            [...myAnnotations]
                .filter((event) => !event.isRedacted())
                .map((event) => [event.getRelation()?.key, event.getId()]),
        );
    }, [reactions]);

    const sendReaction = (reaction: string, shortcode?: string): void => {
        if (myReactions.hasOwnProperty(reaction)) {
            if (mxEvent.isRedacted() || !roomContext.canSelfRedact) return;
            MatrixClientPeg.safeGet().redactEvent(mxEvent.getRoomId()!, myReactions[reaction]);
            dis.dispatch<FocusComposerPayload>({
                action: Action.FocusAComposer,
                context: roomContext.timelineRenderingType,
            });
        } else {
            const content: ReactionEventContent | CustomReactionEventContent = {
                "m.relates_to": {
                    rel_type: RelationType.Annotation,
                    event_id: mxEvent.getId()!,
                    key: reaction,
                },
            };
            if (shortcode) {
                const customContent = content as CustomReactionEventContent;
                customContent[REACTION_SHORTCODE_KEY.name] = shortcode;
                customContent[REACTION_SHORTCODE_KEY.altName] = shortcode;
            }
            MatrixClientPeg.safeGet().sendEvent(mxEvent.getRoomId()!, EventType.Reaction, {
                ...content,
            });
            dis.dispatch({ action: "message_sent" });
            dis.dispatch<FocusComposerPayload>({
                action: Action.FocusAComposer,
                context: roomContext.timelineRenderingType,
            });
        }
        onReaction?.();
    };

    const isDisabled = (reaction: string): boolean => {
        if (!myReactions[reaction]) return false;
        if (roomContext.canSelfRedact) return false;
        return true;
    };

    const emojiList: Array<{ key: string; reaction: string; shortcode?: string; imgSrc?: string }> = [];
    if (roomContext.canReact && SettingsStore.getValue("show_quick_reactions")) {
        const room = MatrixClientPeg.safeGet().getRoom(mxEvent.getRoomId());
        const customEntries = getImagePackEntries(MatrixClientPeg.safeGet(), room, "emoticon");
        const customByKey = new Map(
            customEntries.map((e) => [
                recent.customEmojiKey(e.shortcode, e.url),
                { reaction: e.url, shortcode: e.shortcode, imgSrc: e.httpUrl },
            ]),
        );

        const recents = recent.get(QUICK_REACTION_COUNT);
        for (const key of recents) {
            if (recent.isCustomEmojiKey(key)) {
                const custom = customByKey.get(key);
                if (custom) {
                    emojiList.push({ key, ...custom });
                }
            } else {
                emojiList.push({ key, reaction: key });
            }
        }

        // Fall back to default reactions when there are no recently used ones
        if (emojiList.length === 0) {
            for (const emoji of DEFAULT_QUICK_REACTIONS) {
                emojiList.push({ key: emoji, reaction: emoji });
            }
        }
    }

    if (emojiList.length === 0) return null;

    const buttonStyle: React.CSSProperties = {
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        fontSize: 16,
        lineHeight: 1,
        padding: 0,
        background: "transparent",
    };

    const imgStyle: React.CSSProperties = {
        width: 20,
        height: 20,
        objectFit: "contain",
    };

    const buttons = emojiList.map(({ key, reaction, shortcode, imgSrc }) => (
        <AccessibleButton
            element="button"
            key={key}
            onClick={() => sendReaction(reaction, shortcode)}
            disabled={isDisabled(reaction)}
            aria-pressed={!!myReactions[reaction]}
            title={shortcode ?? reaction}
            style={buttonStyle}
        >
            {imgSrc ? (
                <img src={imgSrc} alt={shortcode ?? ""} style={imgStyle} />
            ) : (
                reaction
            )}
        </AccessibleButton>
    ));

    if (className) {
        return <div className={className}>{buttons}</div>;
    }
    return <>{buttons}</>;
}
