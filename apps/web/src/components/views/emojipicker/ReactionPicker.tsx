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
    type Relations,
    RelationsEvent,
    type Room,
    RoomStateEvent,
} from "matrix-js-sdk/src/matrix";

import EmojiPicker from "./EmojiPicker";
import { type ICustomEmojiData } from "./Emoji";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import RoomContext from "../../../contexts/RoomContext";
import { type FocusComposerPayload } from "../../../dispatcher/payloads/FocusComposerPayload";
import { getFavoriteImagePackRoomIds, getImagePackEntries, isImagePackEventType } from "../../../image-packs";
import * as recent from "../../../emojipicker/recent";
import { type ButtonEvent } from "../elements/AccessibleButton";
import { toggleOwnReaction } from "../../../viewmodels/room/timeline/event-tile/reactions/toggleOwnReaction";

interface IProps {
    mxEvent: MatrixEvent;
    reactions?: Relations | null | undefined;
    onFinished(): void;
}

interface IState {
    selectedEmojis: Set<string>;
}

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

    private getReactions(): Record<string, MatrixEvent> {
        if (!this.props.reactions) {
            return {};
        }
        const userId = MatrixClientPeg.safeGet().getSafeUserId();
        const myAnnotations = this.props.reactions.getAnnotationsBySender()?.[userId] ?? new Set<MatrixEvent>();
        return Object.fromEntries(
            [...myAnnotations].flatMap((event) => {
                const key = event.getRelation()?.key;
                return !event.isRedacted() && key ? [[key, event]] : [];
            }),
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

    private onChooseEmoji = (reaction: string, customEmoji?: ICustomEmojiData, ev?: ButtonEvent): boolean => {
        return this.onChooseReaction(reaction, customEmoji?.shortcode, !!ev && "shiftKey" in ev && ev.shiftKey);
    };

    private onChooseReaction = (reaction: string, shortcode?: string, keepOpen = false): boolean => {
        if (!keepOpen) {
            this.componentWillUnmount();
            this.props.onFinished();
        }
        const myReactions = this.getReactions();
        const bumpedRecent = toggleOwnReaction({
            client: MatrixClientPeg.safeGet(),
            mxEvent: this.props.mxEvent,
            reaction,
            shortcode,
            myReactionEvent: myReactions[reaction],
            canSelfRedact: this.context.canSelfRedact,
        });

        if (!bumpedRecent) {
            if (!keepOpen) {
                dis.dispatch<FocusComposerPayload>({
                    action: Action.FocusAComposer,
                    context: this.context.timelineRenderingType,
                });
            }
            // Tell the emoji picker not to bump this in the more frequently used list.
            return false;
        }

        if (!keepOpen) {
            dis.dispatch<FocusComposerPayload>({
                action: Action.FocusAComposer,
                context: this.context.timelineRenderingType,
            });
        }
        return true;
    };

    private isEmojiDisabled = (unicode: string): boolean => {
        if (!this.getReactions()[unicode]) return false;
        if (this.context.canSelfRedact) return false;

        return true;
    };

    public render(): React.ReactNode {
        const room = MatrixClientPeg.safeGet().getRoom(this.props.mxEvent.getRoomId());
        const customReactions = getImagePackEntries(MatrixClientPeg.safeGet(), room, "emoticon").map((entry) => ({
            shortcode: entry.shortcode,
            label: entry.body || entry.shortcode,
            imgSrc: entry.httpUrl,
            unicode: entry.url,
            recentKey: recent.customEmojiKey(entry.shortcode, entry.url),
        }));
        return (
            <EmojiPicker
                onChoose={this.onChooseEmoji}
                isEmojiDisabled={this.isEmojiDisabled}
                onFinished={this.props.onFinished}
                selectedEmojis={this.state.selectedEmojis}
                customEmoji={customReactions}
                allowTextReaction
            />
        );
    }
}

export default ReactionPicker;
