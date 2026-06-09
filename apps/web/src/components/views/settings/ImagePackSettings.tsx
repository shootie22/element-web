/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useRef, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../languageHandler";
import Field from "../elements/Field";
import AccessibleButton from "../elements/AccessibleButton";
import StyledCheckbox from "../elements/StyledCheckbox";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsSubsection, SettingsSubsectionText } from "./shared/SettingsSubsection";
import { chromeFileInputFix } from "../../../utils/BrowserWorkarounds";
import {
    getAccountImagePack,
    getFavoriteImagePackRoomIds,
    IMAGE_PACK_SHORTCODE_MAX_BYTES,
    isValidImagePackShortcode,
    packToContent,
    ROOM_IMAGE_PACK_EVENT,
    ROOM_IMAGE_PACK_EVENT_UNSTABLE,
    saveAccountImagePack,
    saveFavoriteImagePackRooms,
    saveRoomImagePack,
    slugifyImagePackStateKey,
    uploadImagePackFile,
    validateImagePackEventSize,
    type ImagePack,
    type ImagePackImage,
    type ImagePackUsage,
    parseImagePackContent,
} from "../../../image-packs";
import { mediaFromMxc } from "../../../customisations/Media";
import { MatrixClientPeg } from "../../../MatrixClientPeg";

type Mode = "account" | "room";

interface Props {
    mode: Mode;
    room?: Room;
}

interface EditablePack {
    displayName: string;
    avatarUrl: string;
    attribution: string;
    usage: ImagePackUsage[];
    images: ImagePackImage[];
}

const emptyPack = (name: string): EditablePack => ({
    displayName: name,
    avatarUrl: "",
    attribution: "",
    usage: ["emoticon", "sticker"],
    images: [],
});

function editableFromPack(pack: ImagePack | null, fallbackName: string): EditablePack {
    if (!pack) return emptyPack(fallbackName);
    return {
        displayName: pack.metadata.displayName || fallbackName,
        avatarUrl: pack.metadata.avatarUrl || "",
        attribution: pack.metadata.attribution || "",
        usage: pack.metadata.usage || ["emoticon", "sticker"],
        images: pack.images,
    };
}

function firstRoomPack(room: Room | undefined): ImagePack | null {
    if (!room) return null;
    const stable = room.currentState.getStateEvents(ROOM_IMAGE_PACK_EVENT);
    const unstable = room.currentState.getStateEvents(ROOM_IMAGE_PACK_EVENT_UNSTABLE);
    const events = [...(Array.isArray(stable) ? stable : stable ? [stable] : [])];
    if (events.length === 0) events.push(...(Array.isArray(unstable) ? unstable : unstable ? [unstable] : []));
    const event = events[0];
    if (!event) return null;
    return parseImagePackContent(event.getContent(), `${room.roomId}:${event.getStateKey() ?? ""}`, "room", {
        roomId: room.roomId,
        stateKey: event.getStateKey() ?? "",
        eventType: event.getType(),
    });
}

function packUsageIncludes(pack: EditablePack, usage: ImagePackUsage): boolean {
    return pack.usage.includes(usage);
}

function setUsage(usages: ImagePackUsage[], usage: ImagePackUsage, enabled: boolean): ImagePackUsage[] {
    if (enabled) return Array.from(new Set([...usages, usage]));
    return usages.filter((value) => value !== usage);
}

function packContentFromEditable(pack: EditablePack): ReturnType<typeof packToContent> {
    return packToContent({
        metadata: {
            displayName: pack.displayName.trim() || undefined,
            avatarUrl: pack.avatarUrl.trim() || undefined,
            attribution: pack.attribution.trim() || undefined,
            usage: pack.usage,
        },
        images: pack.images.map((image) => ({
            ...image,
            shortcode: image.shortcode.trim(),
            url: image.url.trim(),
            body: image.body?.trim() || image.shortcode.trim(),
        })),
    });
}

export function ImagePackSettings({ mode, room }: Props): JSX.Element {
    const client = room?.client ?? MatrixClientPeg.get();
    const initialPack = useMemo(() => {
        if (mode === "room") return firstRoomPack(room);
        return client ? getAccountImagePack(client) : null;
    }, [client, mode, room]);
    const [pack, setPack] = useState(() =>
        editableFromPack(initialPack, mode === "room" ? room?.name || _t("common|stickerpack") : _t("common|stickerpack")),
    );
    const [stateKey, setStateKey] = useState(initialPack?.stateKey || "");
    const [favoriteRooms, setFavoriteRooms] = useState(() => (client ? getFavoriteImagePackRoomIds(client) : []));
    const [favorite, setFavorite] = useState(() => !!room && favoriteRooms.includes(room.roomId));
    const [newShortcode, setNewShortcode] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [newBody, setNewBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canEditRoomPack =
        mode !== "room" ||
        (!!room && room.currentState.maySendStateEvent(ROOM_IMAGE_PACK_EVENT, room.client.getSafeUserId()));

    const updateImage = (index: number, image: ImagePackImage): void => {
        setPack((current) => ({
            ...current,
            images: current.images.map((value, i) => (i === index ? image : value)),
        }));
    };

    const removeImage = (index: number): void => {
        setPack((current) => ({
            ...current,
            images: current.images.filter((_, i) => i !== index),
        }));
    };

    const addImage = (image: ImagePackImage): void => {
        setPack((current) => ({
            ...current,
            images: [...current.images, image],
        }));
        setNewShortcode("");
        setNewUrl("");
        setNewBody("");
    };

    const onAddMxc = (): void => {
        const shortcode = newShortcode.trim();
        const url = newUrl.trim();
        if (!isValidImagePackShortcode(shortcode)) {
            setError(_t("image_packs|invalid_shortcode", { maxBytes: IMAGE_PACK_SHORTCODE_MAX_BYTES }));
            return;
        }
        if (!url.startsWith("mxc://")) {
            setError(_t("image_packs|invalid_mxc"));
            return;
        }
        addImage({ shortcode, url, body: newBody.trim() || shortcode, usage: ["emoticon", "sticker"] });
        setError(null);
    };

    const onUpload = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (!file || !client) return;
        setUploading(true);
        setError(null);
        try {
            const image = await uploadImagePackFile(client, file);
            let shortcode = image.shortcode;
            if (!isValidImagePackShortcode(shortcode)) shortcode = "image";
            addImage({ ...image, shortcode, usage: ["emoticon", "sticker"] });
        } catch (e) {
            setError(e instanceof Error ? e.message : _t("common|error"));
        } finally {
            setUploading(false);
        }
    };

    const onSave = async (): Promise<void> => {
        if (!client) return;
        setSaved(false);
        setError(null);

        for (const image of pack.images) {
            if (!isValidImagePackShortcode(image.shortcode)) {
                setError(_t("image_packs|invalid_shortcode", { maxBytes: IMAGE_PACK_SHORTCODE_MAX_BYTES }));
                return;
            }
            if (!image.url.startsWith("mxc://")) {
                setError(_t("image_packs|invalid_mxc"));
                return;
            }
        }

        const content = packContentFromEditable(pack);
        if (!validateImagePackEventSize(content)) {
            setError(_t("image_packs|too_large"));
            return;
        }

        try {
            if (mode === "room" && room) {
                const existingStateKeys = room.currentState
                    .getStateEvents(ROOM_IMAGE_PACK_EVENT)
                    .map((event) => event.getStateKey() ?? "");
                const nextStateKey = stateKey || slugifyImagePackStateKey(pack.displayName, existingStateKeys);
                await saveRoomImagePack(client, room.roomId, nextStateKey, content);
                setStateKey(nextStateKey);
                const nextFavorites = favorite
                    ? Array.from(new Set([...favoriteRooms, room.roomId]))
                    : favoriteRooms.filter((roomId) => roomId !== room.roomId);
                await saveFavoriteImagePackRooms(client, nextFavorites);
                setFavoriteRooms(nextFavorites);
            } else {
                await saveAccountImagePack(client, content);
                await saveFavoriteImagePackRooms(client, favoriteRooms);
            }
            setSaved(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : _t("common|error"));
        }
    };

    const onDelete = async (): Promise<void> => {
        if (!client) return;
        setPack(emptyPack(mode === "room" ? room?.name || _t("common|stickerpack") : _t("common|stickerpack")));
        if (mode === "room" && room && stateKey) {
            await saveRoomImagePack(client, room.roomId, stateKey, {});
        } else if (mode === "account") {
            await saveAccountImagePack(client, {});
        }
    };

    return (
        <SettingsSection heading={_t("image_packs|title")}>
            <SettingsSubsection description={_t("image_packs|visibility_warning")}>
                {mode === "room" && !canEditRoomPack && (
                    <SettingsSubsectionText>{_t("image_packs|room_read_only")}</SettingsSubsectionText>
                )}
                <Field
                    label={_t("common|name")}
                    value={pack.displayName}
                    disabled={!canEditRoomPack}
                    onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                        setPack({ ...pack, displayName: ev.target.value })
                    }
                />
                <Field
                    label={_t("image_packs|avatar_url")}
                    value={pack.avatarUrl}
                    disabled={!canEditRoomPack}
                    onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setPack({ ...pack, avatarUrl: ev.target.value })}
                />
                <Field
                    label={_t("image_packs|attribution")}
                    value={pack.attribution}
                    disabled={!canEditRoomPack}
                    onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                        setPack({ ...pack, attribution: ev.target.value })
                    }
                />
                <StyledCheckbox
                    checked={packUsageIncludes(pack, "emoticon")}
                    disabled={!canEditRoomPack}
                    onChange={(ev) => setPack({ ...pack, usage: setUsage(pack.usage, "emoticon", ev.target.checked) })}
                >
                    {_t("image_packs|usage_emoticon")}
                </StyledCheckbox>
                <StyledCheckbox
                    checked={packUsageIncludes(pack, "sticker")}
                    disabled={!canEditRoomPack}
                    onChange={(ev) => setPack({ ...pack, usage: setUsage(pack.usage, "sticker", ev.target.checked) })}
                >
                    {_t("image_packs|usage_sticker")}
                </StyledCheckbox>
            </SettingsSubsection>
            {mode === "account" && (
                <SettingsSubsection heading={_t("image_packs|favorite_rooms")}>
                    <Field
                        element="textarea"
                        label={_t("image_packs|favorite_rooms")}
                        value={favoriteRooms.join("\n")}
                        onChange={(ev: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setFavoriteRooms(
                                ev.target.value
                                    .split(/\s+/)
                                    .map((roomId) => roomId.trim())
                                    .filter(Boolean),
                            )
                        }
                    />
                </SettingsSubsection>
            )}
            {mode === "room" && room && (
                <SettingsSubsection>
                    <StyledCheckbox checked={favorite} onChange={(ev) => setFavorite(ev.target.checked)}>
                        {_t("image_packs|favorite_this_room")}
                    </StyledCheckbox>
                </SettingsSubsection>
            )}
            <SettingsSubsection heading={_t("image_packs|images")} stretchContent>
                {pack.images.map((image, index) => (
                    <div className="mx_ImagePackSettings_image" key={`${image.shortcode}:${index}`}>
                        {image.url.startsWith("mxc://") && <img src={mediaFromMxc(image.url).srcHttp} alt="" />}
                        <Field
                            label={_t("image_packs|shortcode")}
                            value={image.shortcode}
                            disabled={!canEditRoomPack}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                updateImage(index, { ...image, shortcode: ev.target.value })
                            }
                        />
                        <Field
                            label="MXC"
                            value={image.url}
                            disabled={!canEditRoomPack}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                updateImage(index, { ...image, url: ev.target.value })
                            }
                        />
                        <Field
                            label={_t("common|description")}
                            value={image.body || ""}
                            disabled={!canEditRoomPack}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                updateImage(index, { ...image, body: ev.target.value })
                            }
                        />
                        {canEditRoomPack && (
                            <AccessibleButton kind="danger_outline" onClick={() => removeImage(index)}>
                                {_t("action|remove")}
                            </AccessibleButton>
                        )}
                    </div>
                ))}
                {canEditRoomPack && (
                    <div className="mx_ImagePackSettings_add">
                        <Field
                            label={_t("image_packs|shortcode")}
                            value={newShortcode}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setNewShortcode(ev.target.value)}
                        />
                        <Field
                            label="MXC"
                            value={newUrl}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setNewUrl(ev.target.value)}
                        />
                        <Field
                            label={_t("common|description")}
                            value={newBody}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setNewBody(ev.target.value)}
                        />
                        <AccessibleButton kind="primary_outline" onClick={onAddMxc}>
                            {_t("image_packs|add_mxc")}
                        </AccessibleButton>
                        <AccessibleButton
                            kind="primary_outline"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {uploading ? _t("common|loading") : _t("action|upload")}
                        </AccessibleButton>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onClick={chromeFileInputFix}
                            onChange={onUpload}
                            accept="image/*"
                            style={{ display: "none" }}
                        />
                    </div>
                )}
            </SettingsSubsection>
            <SettingsSubsection>
                {error && <div className="mx_SettingsTab_warningText">{error}</div>}
                {saved && <SettingsSubsectionText>{_t("common|saved")}</SettingsSubsectionText>}
                <AccessibleButton kind="primary" onClick={onSave} disabled={!client}>
                    {_t("action|save")}
                </AccessibleButton>
                {canEditRoomPack && (
                    <AccessibleButton kind="danger_outline" onClick={onDelete} disabled={!client}>
                        {_t("action|delete")}
                    </AccessibleButton>
                )}
            </SettingsSubsection>
        </SettingsSection>
    );
}
