/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import classNames from "classnames";
import React, { type JSX, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ReactionIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../../languageHandler";
import ContextMenu, { aboveLeftOf, type MenuProps, useContextMenu } from "../../structures/ContextMenu";
import EmojiPicker from "../emojipicker/EmojiPicker";
import { type ICustomEmojiData } from "../emojipicker/Emoji";
import { CollapsibleButton } from "./CollapsibleButton";
import { OverflowMenuContext } from "./MessageComposerButtons";
import RoomContext from "../../../contexts/RoomContext";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { getImagePackEntries } from "../../../image-packs";
import { useImagePackRoomUpdate } from "../../../hooks/useImagePackUpdate";
import UIStore from "../../../stores/UIStore";
import * as recent from "../../../emojipicker/recent";
import { useSettingValue } from "../../../hooks/useSettings";

const EMOJI_PICKER_WIDTH_STORAGE_KEY = "mx_emoji_picker_width";
const EMOJI_PICKER_MIN_WIDTH = 340;
const EMOJI_PICKER_MAX_WIDTH = 768;
const EMOJI_PICKER_GRID_PADDING = 24;
const EMOJI_PICKER_ITEM_WIDTH = 38;

interface IEmojiButtonProps {
    addEmoji: (unicode: string, customEmoji?: ICustomEmojiData) => boolean;
    menuPosition?: MenuProps;
    className?: string;
}

function clampEmojiPickerWidth(width: number): number {
    const viewportMax = Math.max(EMOJI_PICKER_MIN_WIDTH, UIStore.instance.windowWidth - 24);
    return Math.max(EMOJI_PICKER_MIN_WIDTH, Math.min(width, EMOJI_PICKER_MAX_WIDTH, viewportMax));
}

function readEmojiPickerWidth(): number {
    const storedWidth = Number(window.localStorage.getItem(EMOJI_PICKER_WIDTH_STORAGE_KEY));
    return clampEmojiPickerWidth(Number.isFinite(storedWidth) ? storedWidth : EMOJI_PICKER_MIN_WIDTH);
}

function columnCountForWidth(width: number): number {
    return Math.max(8, Math.floor((width - EMOJI_PICKER_GRID_PADDING) / EMOJI_PICKER_ITEM_WIDTH));
}

export function EmojiButton({ addEmoji, menuPosition, className }: IEmojiButtonProps): JSX.Element {
    const overflowMenuCloser = useContext(OverflowMenuContext);
    const roomContext = useContext(RoomContext);
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu();
    const [pickerWidth, setPickerWidth] = useState(readEmojiPickerWidth);
    const imagePackVersion = useImagePackRoomUpdate(roomContext.room);
    const resizeAnimationFrame = useRef<number | null>(null);
    const useAccentButtons = useSettingValue("Tweaks.accentEmojiStickerButtons");
    const useResizablePickers = useSettingValue("Tweaks.resizableEmojiStickerPickers");
    const effectivePickerWidth = useResizablePickers ? pickerWidth : EMOJI_PICKER_MIN_WIDTH;

    const customEmoji = useMemo(
        () => {
            void imagePackVersion;
            return roomContext.room
                ? getImagePackEntries(MatrixClientPeg.safeGet(), roomContext.room, "emoticon").map((e) => ({
                      shortcode: e.shortcode,
                      label: e.body || e.shortcode,
                      imgSrc: e.httpUrl,
                      recentKey: recent.customEmojiKey(e.shortcode, e.url),
                  }))
                : undefined;
        },
        [imagePackVersion, roomContext.room],
    );

    useEffect(() => {
        return () => {
            if (resizeAnimationFrame.current !== null) {
                window.cancelAnimationFrame(resizeAnimationFrame.current);
            }
        };
    }, []);

    let contextMenu: React.ReactElement | null = null;
    if (menuDisplayed && button.current) {
        const position = menuPosition ?? aboveLeftOf(button.current.getBoundingClientRect());
        const onFinished = (): void => {
            closeMenu();
            overflowMenuCloser?.();
        };
        const onResizePointerDown = (ev: React.PointerEvent): void => {
            ev.preventDefault();
            ev.stopPropagation();

            const startX = ev.clientX;
            const startWidth = pickerWidth;
            let nextWidth = pickerWidth;

            const onPointerMove = (moveEv: PointerEvent): void => {
                nextWidth = clampEmojiPickerWidth(startWidth + startX - moveEv.clientX);
                if (resizeAnimationFrame.current === null) {
                    resizeAnimationFrame.current = window.requestAnimationFrame(() => {
                        resizeAnimationFrame.current = null;
                        setPickerWidth(nextWidth);
                    });
                }
            };
            const onPointerUp = (): void => {
                if (resizeAnimationFrame.current !== null) {
                    window.cancelAnimationFrame(resizeAnimationFrame.current);
                    resizeAnimationFrame.current = null;
                }
                setPickerWidth(nextWidth);
                window.localStorage.setItem(EMOJI_PICKER_WIDTH_STORAGE_KEY, String(nextWidth));
                document.removeEventListener("pointermove", onPointerMove);
                document.removeEventListener("pointerup", onPointerUp);
            };

            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", onPointerUp);
        };

        contextMenu = (
            <ContextMenu {...position} onFinished={onFinished} managed={false} focusLock>
                <div className="mx_EmojiButton_picker" style={{ width: effectivePickerWidth }}>
                    {useResizablePickers && (
                        <div
                            className="mx_EmojiButton_pickerResizeHandle"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={_t("emoji_picker|resize")}
                            onPointerDown={onResizePointerDown}
                        />
                    )}
                    <EmojiPicker
                        onChoose={addEmoji}
                        onFinished={onFinished}
                        customEmoji={customEmoji}
                        columnCount={columnCountForWidth(effectivePickerWidth)}
                    />
                </div>
            </ContextMenu>
        );
    }

    const computedClassName = classNames("mx_EmojiButton", className, {
        mx_EmojiButton_highlight: menuDisplayed,
        mx_EmojiButton_accent: useAccentButtons,
    });

    // TODO: replace ContextMenuTooltipButton with a unified representation of
    // the header buttons and the right panel buttons
    return (
        <>
            <CollapsibleButton
                className={computedClassName}
                onClick={openMenu}
                title={_t("common|emoji")}
                inputRef={button}
            >
                <ReactionIcon />
            </CollapsibleButton>

            {contextMenu}
        </>
    );
}
