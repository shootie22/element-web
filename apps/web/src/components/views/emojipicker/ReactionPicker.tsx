/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.
Copyright 2019 Tulir Asokan <tulir@maunium.net>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import {
    ClientEvent,
    type MatrixClient,
    type MatrixEvent,
    EventType,
    RelationType,
    type Relations,
    RelationsEvent,
    type Room,
    RoomStateEvent,
} from "matrix-js-sdk/src/matrix";
import { type ReactionEventContent } from "matrix-js-sdk/src/types";

import EmojiPicker from "./EmojiPicker";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import RoomContext from "../../../contexts/RoomContext";
import { type FocusComposerPayload } from "../../../dispatcher/payloads/FocusComposerPayload";
import {
    getFavoriteImagePackRoomIds,
    getImagePackEntries,
    isImagePackEventType,
    type ImagePackEntry,
} from "../../../image-packs";
import AccessibleButton from "../elements/AccessibleButton";
import { REACTION_SHORTCODE_KEY } from "../../../viewmodels/room/timeline/event-tile/reactions/reactionShortcode";

interface IProps {
    mxEvent: MatrixEvent;
    reactions?: Relations | null | undefined;
    onFinished(): void;
}

interface IState {
    selectedEmojis: Set<string>;
}

type CustomReactionEventContent = ReactionEventContent & Record<"shortcode" | "com.beeper.reaction.shortcode", string>;

class ReactionPicker extends React.Component<IProps, IState> {
    public static contextType = RoomContext;
    declare public context: React.ContextType<typeof RoomContext>;
    private imagePackUpdateClient?: MatrixClient;

    public constructor(props: IProps) {
        super(props);

        this.state = {
            selectedEmojis: new Set(Object.keys(this.getReactions())),
        };
    }

    public componentDidMount(): void {
        this.addListeners();
        this.addImagePackListeners();
    }

    public componentDidUpdate(prevProps: IProps): void {
        if (prevProps.reactions !== this.props.reactions) {
            this.removeListeners(prevProps.reactions);
            this.addListeners();
            this.onReactionsChange();
        }

        if (prevProps.mxEvent.getRoomId() !== this.props.mxEvent.getRoomId()) {
            this.removeImagePackListeners();
            this.addImagePackListeners();
        }
    }

    private addListeners(): void {
        if (this.props.reactions) {
            this.props.reactions.on(RelationsEvent.Add, this.onReactionsChange);
            this.props.reactions.on(RelationsEvent.Remove, this.onReactionsChange);
            this.props.reactions.on(RelationsEvent.Redaction, this.onReactionsChange);
        }
    }

    private removeListeners(reactions: Relations | null | undefined = this.props.reactions): void {
        if (reactions) {
            reactions.removeListener(RelationsEvent.Add, this.onReactionsChange);
            reactions.removeListener(RelationsEvent.Remove, this.onReactionsChange);
            reactions.removeListener(RelationsEvent.Redaction, this.onReactionsChange);
        }
    }

    private addImagePackListeners(): void {
        const client = MatrixClientPeg.safeGet();
        if (this.imagePackUpdateClient === client) return;

        this.removeImagePackListeners();
        this.imagePackUpdateClient = client;
        client.on(ClientEvent.AccountData, this.onImagePackEvent);
        client.on(RoomStateEvent.Events, this.onImagePackEvent);
        client.on(ClientEvent.Room, this.onImagePackRoom);
    }

    private removeImagePackListeners(): void {
        if (!this.imagePackUpdateClient) return;

        this.imagePackUpdateClient.removeListener(ClientEvent.AccountData, this.onImagePackEvent);
        this.imagePackUpdateClient.removeListener(RoomStateEvent.Events, this.onImagePackEvent);
        this.imagePackUpdateClient.removeListener(ClientEvent.Room, this.onImagePackRoom);
        this.imagePackUpdateClient = undefined;
    }

    public componentWillUnmount(): void {
        this.removeListeners();
        this.removeImagePackListeners();
    }

    private getReactions(): Record<string, string> {
        if (!this.props.reactions) {
            return {};
        }
        const userId = MatrixClientPeg.safeGet().getSafeUserId();
        const myAnnotations = this.props.reactions.getAnnotationsBySender()?.[userId] ?? new Set<MatrixEvent>();
        return Object.fromEntries(
            [...myAnnotations]
                .filter((event) => !event.isRedacted())
                .map((event) => [event.getRelation()?.key, event.getId()]),
        );
    }

    private onReactionsChange = (): void => {
        this.setState({
            selectedEmojis: new Set(Object.keys(this.getReactions())),
        });
    };

    private onImagePackEvent = (event: MatrixEvent): void => {
        if (isImagePackEventType(event.getType())) {
            this.forceUpdate();
        }
    };

    private onImagePackRoom = (room: Room): void => {
        const client = MatrixClientPeg.safeGet();
        if (getFavoriteImagePackRoomIds(client).includes(room.roomId)) {
            this.forceUpdate();
        }
    };

    private onChooseCustomReaction = (entry: ImagePackEntry): void => {
        this.onChoose(entry.url, entry.shortcode);
    };

    private onChoose = (reaction: string, shortcode?: string): boolean => {
        this.componentWillUnmount();
        this.props.onFinished();
        const myReactions = this.getReactions();
        if (myReactions.hasOwnProperty(reaction)) {
            if (this.props.mxEvent.isRedacted() || !this.context.canSelfRedact) return false;

            MatrixClientPeg.safeGet().redactEvent(this.props.mxEvent.getRoomId()!, myReactions[reaction]);
            dis.dispatch<FocusComposerPayload>({
                action: Action.FocusAComposer,
                context: this.context.timelineRenderingType,
            });
            // Tell the emoji picker not to bump this in the more frequently used list.
            return false;
        } else {
            const content: ReactionEventContent | CustomReactionEventContent = {
                "m.relates_to": {
                    rel_type: RelationType.Annotation,
                    event_id: this.props.mxEvent.getId()!,
                    key: reaction,
                },
            };
            if (shortcode) {
                const customContent = content as CustomReactionEventContent;
                customContent[REACTION_SHORTCODE_KEY.name] = shortcode;
                customContent[REACTION_SHORTCODE_KEY.altName] = shortcode;
            }
            MatrixClientPeg.safeGet().sendEvent(this.props.mxEvent.getRoomId()!, EventType.Reaction, {
                ...content,
            });
            dis.dispatch({ action: "message_sent" });
            dis.dispatch<FocusComposerPayload>({
                action: Action.FocusAComposer,
                context: this.context.timelineRenderingType,
            });
            return true;
        }
    };

    private isEmojiDisabled = (unicode: string): boolean => {
        if (!this.getReactions()[unicode]) return false;
        if (this.context.canSelfRedact) return false;

        return true;
    };

    public render(): React.ReactNode {
        const room = MatrixClientPeg.safeGet().getRoom(this.props.mxEvent.getRoomId());
        const customReactions = getImagePackEntries(MatrixClientPeg.safeGet(), room, "emoticon");
        return (
            <>
                {customReactions.length > 0 && (
                    <div className="mx_ReactionPicker_custom" aria-label="Custom reactions">
                        {customReactions.slice(0, 32).map((entry) => (
                            <AccessibleButton
                                key={`${entry.pack.id}:${entry.shortcode}:${entry.url}`}
                                className="mx_ReactionPicker_customItem"
                                onClick={() => this.onChooseCustomReaction(entry)}
                                title={`${entry.shortcode} · ${entry.label}`}
                                disabled={!!this.getReactions()[entry.url] && !this.context.canSelfRedact}
                            >
                                {entry.httpUrl && <img src={entry.httpUrl} alt="" />}
                            </AccessibleButton>
                        ))}
                    </div>
                )}
                <EmojiPicker
                    onChoose={this.onChoose}
                    isEmojiDisabled={this.isEmojiDisabled}
                    onFinished={this.props.onFinished}
                    selectedEmojis={this.state.selectedEmojis}
                />
            </>
        );
    }
}

export default ReactionPicker;
