/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.
Copyright 2019 Tulir Asokan <tulir@maunium.net>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { type Emoji as IEmoji } from "@matrix-org/emojibase-bindings";

import { type ButtonEvent } from "../elements/AccessibleButton";
import { RovingAccessibleButton } from "../../../accessibility/RovingTabIndex";

export interface ICustomEmojiData {
    shortcode: string;
    label: string;
    imgSrc?: string;
}

type EmojiData = IEmoji | (ICustomEmojiData & Pick<IEmoji, "shortcodes">);

interface IProps {
    emoji: EmojiData;
    /**
     * Set of which emojis are already selected and should be decorated as such.
     * If specified, emoji will use a checkbox role with aria-checked set appropriately.
     */
    selectedEmojis?: Set<string>;
    onClick(ev: ButtonEvent, emoji: EmojiData): void;
    onMouseEnter(emoji: EmojiData): void;
    onMouseLeave(emoji: EmojiData): void;
    disabled?: boolean;
    id?: string;
    className?: string;
}

function isCustomEmoji(emoji: EmojiData): emoji is EmojiData & ICustomEmojiData {
    return "imgSrc" in emoji;
}

class Emoji extends React.PureComponent<IProps> {
    public render(): React.ReactNode {
        const { onClick, onMouseEnter, onMouseLeave, emoji, selectedEmojis } = this.props;
        const isSelected = selectedEmojis?.has((emoji as IEmoji).unicode);
        const custom = isCustomEmoji(emoji) ? emoji : undefined;
        return (
            <RovingAccessibleButton
                id={this.props.id}
                onClick={(ev: ButtonEvent) => onClick(ev, emoji)}
                onMouseEnter={() => onMouseEnter(emoji)}
                onMouseLeave={() => onMouseLeave(emoji)}
                className={this.props.className}
                disabled={this.props.disabled || undefined}
                role={selectedEmojis ? "checkbox" : undefined}
                aria-checked={this.props.disabled ? undefined : isSelected}
                focusOnMouseOver
            >
                <div className={`mx_EmojiPicker_item ${isSelected ? "mx_EmojiPicker_item_selected" : ""}`}>
                    {custom ? (
                        <img className="mx_EmojiPicker_customEmoji" src={custom.imgSrc} alt={custom.label} />
                    ) : (
                        (emoji as IEmoji).unicode
                    )}
                </div>
            </RovingAccessibleButton>
        );
    }
}

export default Emoji;
