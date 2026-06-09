/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useMemo, useState } from "react";
import { ClientEvent, RoomStateEvent, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import { SearchIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../../languageHandler";
import AccessibleButton from "../elements/AccessibleButton";
import dis from "../../../dispatcher/dispatcher";
import { getImagePackEntries, type ImagePackEntry } from "../../../image-packs";

interface Props {
    room: Room;
    threadId?: string | null;
    showLegacyButton: boolean;
    onFinished(this: void): void;
    onOpenLegacy(this: void): void;
}

function entryMatchesFilter(entry: ImagePackEntry, filter: string): boolean {
    if (!filter) return true;
    const query = filter.toLowerCase();
    return (
        entry.shortcode.toLowerCase().includes(query) ||
        (entry.body || "").toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query)
    );
}

function useImagePackUpdate(room: Room): number {
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const bump = (): void => setVersion((current) => current + 1);
        const onState = (event: MatrixEvent): void => {
            if (event.getType().includes("image_pack") || event.getType().includes("emotes")) {
                bump();
            }
        };

        room.client.on(ClientEvent.AccountData, bump);
        room.client.on(RoomStateEvent.Events, onState);
        return () => {
            room.client.removeListener(ClientEvent.AccountData, bump);
            room.client.removeListener(RoomStateEvent.Events, onState);
        };
    }, [room]);

    return version;
}

export function ImagePackStickerPicker({
    room,
    threadId,
    showLegacyButton,
    onFinished,
    onOpenLegacy,
}: Props): JSX.Element {
    const [filter, setFilter] = useState("");
    useImagePackUpdate(room);
    const entries = getImagePackEntries(room.client, room, "sticker");
    const filteredEntries = useMemo(
        () => entries.filter((entry) => entryMatchesFilter(entry, filter.trim())),
        [entries, filter],
    );

    const onSend = (entry: ImagePackEntry): void => {
        dis.dispatch({
            action: "post_sticker_message",
            data: {
                content: {
                    url: entry.url,
                    info: entry.info || {},
                },
                description: entry.body || entry.shortcode,
                name: entry.shortcode,
                threadId,
            },
        });
        onFinished();
    };

    return (
        <div className="mx_ImagePackStickerPicker" role="dialog" aria-label={_t("common|sticker")}>
            <div className="mx_ImagePackStickerPicker_search">
                <SearchIcon aria-hidden />
                <input
                    value={filter}
                    onChange={(ev) => setFilter(ev.target.value)}
                    placeholder={_t("action|search")}
                    aria-label={_t("action|search")}
                />
            </div>
            <div className="mx_ImagePackStickerPicker_body">
                {filteredEntries.length > 0 ? (
                    <div className="mx_ImagePackStickerPicker_grid" role="grid" aria-label={_t("common|sticker")}>
                        {filteredEntries.map((entry) => (
                            <AccessibleButton
                                key={`${entry.pack.id}:${entry.shortcode}:${entry.url}`}
                                className="mx_ImagePackStickerPicker_item"
                                onClick={() => onSend(entry)}
                                title={`${entry.shortcode} · ${entry.label}`}
                                role="gridcell"
                            >
                                {entry.httpUrl && <img src={entry.httpUrl} alt="" loading="lazy" />}
                                <span>{entry.shortcode}</span>
                            </AccessibleButton>
                        ))}
                    </div>
                ) : (
                    <div className="mx_ImagePackStickerPicker_empty">
                        {_t("stickers|native_empty")}
                    </div>
                )}
            </div>
            {showLegacyButton && (
                <div className="mx_ImagePackStickerPicker_footer">
                    <AccessibleButton kind="link_inline" onClick={onOpenLegacy}>
                        {_t("stickers|open_legacy_picker")}
                    </AccessibleButton>
                </div>
            )}
        </div>
    );
}
