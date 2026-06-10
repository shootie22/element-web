/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useRef, useState } from "react";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import classNames from "classnames";
import DeleteIcon from "@vector-im/compound-design-tokens/assets/web/icons/delete";
import UploadIcon from "@vector-im/compound-design-tokens/assets/web/icons/share";

import { _t } from "../../../languageHandler";
import Field from "../elements/Field";
import AccessibleButton from "../elements/AccessibleButton";
import StyledCheckbox from "../elements/StyledCheckbox";
import BaseAvatar from "../avatars/BaseAvatar";
import { getFileChanged } from "./AvatarSetting";
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
type ValidationErrors = Map<number, string[]>;

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

interface ValidationResult {
    packErrors: string[];
    imageErrors: ValidationErrors;
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

function addImageError(errors: ValidationErrors, index: number, error: string): void {
    errors.set(index, [...(errors.get(index) ?? []), error]);
}

function validatePack(pack: EditablePack): ValidationResult {
    const packErrors: string[] = [];
    const imageErrors: ValidationErrors = new Map();
    const shortcodeIndexes = new Map<string, number>();
    const urlIndexes = new Map<string, number>();

    if (pack.usage.length === 0) {
        packErrors.push(_t("image_packs|validation_no_pack_usage"));
    }

    for (const [index, image] of pack.images.entries()) {
        const shortcode = image.shortcode.trim();
        const url = image.url.trim();
        const usage = image.usage ?? ["emoticon", "sticker"];

        if (!isValidImagePackShortcode(shortcode)) {
            addImageError(
                imageErrors,
                index,
                _t("image_packs|invalid_shortcode", { maxBytes: IMAGE_PACK_SHORTCODE_MAX_BYTES }),
            );
        }

        if (!url.startsWith("mxc://")) {
            addImageError(imageErrors, index, _t("image_packs|invalid_mxc"));
        }

        if (usage.length === 0) {
            addImageError(imageErrors, index, _t("image_packs|validation_no_image_usage"));
        }

        const existingShortcodeIndex = shortcodeIndexes.get(shortcode);
        if (shortcode && existingShortcodeIndex !== undefined) {
            const error = _t("image_packs|validation_duplicate_shortcode", { shortcode });
            addImageError(imageErrors, existingShortcodeIndex, error);
            addImageError(imageErrors, index, error);
        } else {
            shortcodeIndexes.set(shortcode, index);
        }

        const existingUrlIndex = urlIndexes.get(url);
        if (url && existingUrlIndex !== undefined) {
            const error = _t("image_packs|validation_duplicate_media");
            addImageError(imageErrors, existingUrlIndex, error);
            addImageError(imageErrors, index, error);
        } else {
            urlIndexes.set(url, index);
        }
    }

    return { packErrors, imageErrors };
}

function validationErrorCount({ packErrors, imageErrors }: ValidationResult): number {
    return packErrors.length + Array.from(imageErrors.values()).reduce((count, errors) => count + errors.length, 0);
}

function imagePreviewUrl(url: string): string | undefined {
    return url.startsWith("mxc://") ? (mediaFromMxc(url).srcHttp ?? undefined) : undefined;
}

function packScopeHeading(mode: Mode, room?: Room): string {
    if (mode === "account") return _t("image_packs|my_pack_heading");
    return room?.isSpaceRoom() ? _t("image_packs|space_pack_heading") : _t("image_packs|room_pack_heading");
}

function favoriteRoomName(client: MatrixClient | null | undefined, roomId: string): string {
    return client?.getRoom(roomId)?.name || roomId;
}

interface UsageTogglesProps {
    usage: ImagePackUsage[];
    disabled?: boolean;
    onChange: (usage: ImagePackUsage[]) => void;
}

function UsageToggles({ usage, disabled, onChange }: UsageTogglesProps): JSX.Element {
    return (
        <div className="mx_ImagePackSettings_usageToggles">
            <StyledCheckbox
                checked={usage.includes("emoticon")}
                disabled={disabled}
                onChange={(ev) => onChange(setUsage(usage, "emoticon", ev.target.checked))}
            >
                {_t("image_packs|usage_emoticon")}
            </StyledCheckbox>
            <StyledCheckbox
                checked={usage.includes("sticker")}
                disabled={disabled}
                onChange={(ev) => onChange(setUsage(usage, "sticker", ev.target.checked))}
            >
                {_t("image_packs|usage_sticker")}
            </StyledCheckbox>
        </div>
    );
}

interface ImageTileProps {
    image: ImagePackImage;
    index: number;
    disabled?: boolean;
    errors?: string[];
    onChange: (index: number, image: ImagePackImage) => void;
    onRemove: (index: number) => void;
    onReplace: (index: number, file: File) => Promise<void>;
}

function ImageTile({ image, index, disabled, errors, onChange, onRemove, onReplace }: ImageTileProps): JSX.Element {
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const previewUrl = imagePreviewUrl(image.url);
    const usage = image.usage ?? ["emoticon", "sticker"];

    const onReplaceFile = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (!file) return;
        await onReplace(index, file);
    };

    return (
        <div
            className={classNames("mx_ImagePackSettings_tile", {
                mx_ImagePackSettings_tileInvalid: !!errors?.length,
            })}
        >
            <div className="mx_ImagePackSettings_tilePreview">
                {previewUrl ? <img src={previewUrl} alt="" /> : <div className="mx_ImagePackSettings_missingPreview" />}
            </div>
            <div className="mx_ImagePackSettings_tileFields">
                <Field
                    label={_t("image_packs|shortcode")}
                    value={image.shortcode}
                    disabled={disabled}
                    forceValidity={!errors?.some((error) => error.includes(image.shortcode))}
                    onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                        onChange(index, { ...image, shortcode: ev.target.value })
                    }
                />
                <Field
                    label={_t("common|description")}
                    value={image.body || ""}
                    disabled={disabled}
                    onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                        onChange(index, { ...image, body: ev.target.value })
                    }
                />
                <UsageToggles
                    usage={usage}
                    disabled={disabled}
                    onChange={(nextUsage) => onChange(index, { ...image, usage: nextUsage })}
                />
                <details className="mx_ImagePackSettings_advanced">
                    <summary>{_t("common|advanced")}</summary>
                    <Field
                        label={_t("image_packs|mxc_url")}
                        value={image.url}
                        disabled={disabled}
                        onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                            onChange(index, { ...image, url: ev.target.value })
                        }
                    />
                </details>
                {!!errors?.length && (
                    <ul className="mx_ImagePackSettings_tileErrors">
                        {errors.map((error, errorIndex) => (
                            <li key={`${error}:${errorIndex}`}>{error}</li>
                        ))}
                    </ul>
                )}
            </div>
            {!disabled && (
                <div className="mx_ImagePackSettings_tileActions">
                    <AccessibleButton kind="primary_outline" onClick={() => replaceInputRef.current?.click()}>
                        <UploadIcon width="16px" height="16px" />
                        {_t("image_packs|replace_image")}
                    </AccessibleButton>
                    <AccessibleButton kind="danger_outline" onClick={() => onRemove(index)}>
                        <DeleteIcon width="16px" height="16px" />
                        {_t("action|remove")}
                    </AccessibleButton>
                    <input
                        type="file"
                        ref={replaceInputRef}
                        onClick={chromeFileInputFix}
                        onChange={onReplaceFile}
                        accept="image/*"
                        aria-label={_t("image_packs|replace_image")}
                        style={{ display: "none" }}
                    />
                </div>
            )}
        </div>
    );
}

export function ImagePackSettings({ mode, room }: Props): JSX.Element {
    const client = room?.client ?? MatrixClientPeg.get();
    const initialPack = useMemo(() => {
        if (mode === "room") return firstRoomPack(room);
        return client ? getAccountImagePack(client) : null;
    }, [client, mode, room]);
    const fallbackPackName =
        mode === "room" ? room?.name || _t("common|stickerpack") : _t("image_packs|my_pack_default_name");
    const [pack, setPack] = useState(() => editableFromPack(initialPack, fallbackPackName));
    const [stateKey, setStateKey] = useState(initialPack?.stateKey || "");
    const [favoriteRooms, setFavoriteRooms] = useState(() => (client ? getFavoriteImagePackRoomIds(client) : []));
    const [favorite, setFavorite] = useState(() => !!room && favoriteRooms.includes(room.roomId));
    const [newShortcode, setNewShortcode] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [newBody, setNewBody] = useState("");
    const [manualRoomId, setManualRoomId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [uploadSummary, setUploadSummary] = useState<string | null>(null);
    const [validation, setValidation] = useState<ValidationResult>({ packErrors: [], imageErrors: new Map() });
    const [saved, setSaved] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    const canEditRoomPack =
        mode !== "room" ||
        (!!room && room.currentState.maySendStateEvent(ROOM_IMAGE_PACK_EVENT, room.client.getSafeUserId()));
    const canEdit = !!client && canEditRoomPack;
    const avatarPreviewUrl = imagePreviewUrl(pack.avatarUrl);

    const setPackAndClearValidation = (updater: React.SetStateAction<EditablePack>): void => {
        setPack(updater);
        setValidation({ packErrors: [], imageErrors: new Map() });
        setSaved(false);
    };

    const updateImage = (index: number, image: ImagePackImage): void => {
        setPackAndClearValidation((current) => ({
            ...current,
            images: current.images.map((value, i) => (i === index ? image : value)),
        }));
    };

    const removeImage = (index: number): void => {
        setPackAndClearValidation((current) => ({
            ...current,
            images: current.images.filter((_, i) => i !== index),
        }));
    };

    const addImages = (images: ImagePackImage[]): { added: number; skipped: number } => {
        let added = 0;
        let skipped = 0;
        setPackAndClearValidation((current) => {
            const shortcodes = new Set(current.images.map((image) => image.shortcode.trim()).filter(Boolean));
            const urls = new Set(current.images.map((image) => image.url.trim()).filter(Boolean));
            const nextImages = [...current.images];

            for (const image of images) {
                const shortcode = image.shortcode.trim();
                const url = image.url.trim();
                if (shortcodes.has(shortcode) || urls.has(url)) {
                    skipped++;
                    continue;
                }
                shortcodes.add(shortcode);
                urls.add(url);
                nextImages.push(image);
                added++;
            }

            return { ...current, images: nextImages };
        });
        return { added, skipped };
    };

    const uploadFiles = async (files: File[]): Promise<void> => {
        if (!client || files.length === 0) return;
        setUploading(true);
        setError(null);
        setUploadSummary(null);
        try {
            const uploadedImages: ImagePackImage[] = [];
            let skipped = 0;
            for (const file of files) {
                if (!file.type.startsWith("image/")) {
                    skipped++;
                    continue;
                }
                const image = await uploadImagePackFile(client, file);
                const shortcode = isValidImagePackShortcode(image.shortcode) ? image.shortcode : "image";
                uploadedImages.push({ ...image, shortcode, usage: ["emoticon", "sticker"] });
            }
            const result = addImages(uploadedImages);
            skipped += result.skipped;
            setUploadSummary(_t("image_packs|upload_summary", { added: result.added, skipped }));
        } catch (e) {
            setError(e instanceof Error ? e.message : _t("common|error"));
        } finally {
            setUploading(false);
        }
    };

    const onUpload = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const files = Array.from(ev.target.files ?? []);
        ev.target.value = "";
        await uploadFiles(files);
    };

    const onDrop = async (ev: React.DragEvent<HTMLDivElement>): Promise<void> => {
        ev.preventDefault();
        if (!canEdit) return;
        await uploadFiles(Array.from(ev.dataTransfer.files ?? []));
    };

    const onReplaceImage = async (index: number, file: File): Promise<void> => {
        if (!client || !file.type.startsWith("image/")) return;
        setUploading(true);
        setError(null);
        try {
            const image = await uploadImagePackFile(client, file);
            updateImage(index, {
                ...image,
                shortcode: isValidImagePackShortcode(image.shortcode) ? image.shortcode : pack.images[index].shortcode,
                usage: pack.images[index].usage ?? ["emoticon", "sticker"],
                body: image.body || pack.images[index].body,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : _t("common|error"));
        } finally {
            setUploading(false);
        }
    };

    const onAvatarUpload = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = getFileChanged(ev);
        ev.target.value = "";
        if (!file || !client) return;
        setAvatarUploading(true);
        setError(null);
        try {
            const { content_uri: avatarUrl } = await client.uploadContent(file);
            setPackAndClearValidation((current) => ({ ...current, avatarUrl }));
        } catch (e) {
            setError(e instanceof Error ? e.message : _t("common|error"));
        } finally {
            setAvatarUploading(false);
        }
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
        const result = addImages([
            { shortcode, url, body: newBody.trim() || shortcode, usage: ["emoticon", "sticker"] },
        ]);
        setNewShortcode("");
        setNewUrl("");
        setNewBody("");
        setError(null);
        setUploadSummary(_t("image_packs|upload_summary", { added: result.added, skipped: result.skipped }));
    };

    const addFavoriteRoom = (): void => {
        const roomId = manualRoomId.trim();
        if (!roomId) return;
        setFavoriteRooms((current) => Array.from(new Set([...current, roomId])));
        setManualRoomId("");
        setSaved(false);
    };

    const onSave = async (): Promise<void> => {
        if (!client) return;
        setSaved(false);
        setError(null);

        const nextValidation = validatePack(pack);
        setValidation(nextValidation);
        const errorCount = validationErrorCount(nextValidation);
        if (errorCount > 0) {
            setError(_t("image_packs|validation_summary", { count: errorCount }));
            return;
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
            setUploadSummary(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : _t("common|error"));
        }
    };

    const onDelete = async (): Promise<void> => {
        if (!client) return;
        setPackAndClearValidation(emptyPack(fallbackPackName));
        if (mode === "room" && room && stateKey) {
            await saveRoomImagePack(client, room.roomId, stateKey, {});
        } else if (mode === "account") {
            await saveAccountImagePack(client, {});
        }
    };

    return (
        <SettingsSection heading={_t("image_packs|title")}>
            <SettingsSubsection
                heading={packScopeHeading(mode, room)}
                description={_t("image_packs|visibility_warning")}
            >
                {mode === "room" && !canEditRoomPack && (
                    <SettingsSubsectionText>{_t("image_packs|room_read_only")}</SettingsSubsectionText>
                )}
                <div className="mx_ImagePackSettings_header">
                    <div className="mx_ImagePackSettings_avatar">
                        <BaseAvatar
                            idName={mode === "room" ? room?.roomId : client?.getSafeUserId()}
                            name={pack.displayName || fallbackPackName}
                            size="72px"
                            url={avatarPreviewUrl}
                            altText={_t("image_packs|pack_avatar")}
                        />
                        {canEdit && (
                            <div className="mx_ImagePackSettings_avatarActions">
                                <AccessibleButton
                                    kind="primary_outline"
                                    disabled={avatarUploading}
                                    onClick={() => avatarInputRef.current?.click()}
                                >
                                    <UploadIcon width="16px" height="16px" />
                                    {avatarUploading ? _t("common|loading") : _t("image_packs|upload_pack_avatar")}
                                </AccessibleButton>
                                {pack.avatarUrl && (
                                    <AccessibleButton
                                        kind="danger_outline"
                                        onClick={() =>
                                            setPackAndClearValidation((current) => ({ ...current, avatarUrl: "" }))
                                        }
                                    >
                                        <DeleteIcon width="16px" height="16px" />
                                        {_t("action|remove")}
                                    </AccessibleButton>
                                )}
                                <input
                                    type="file"
                                    ref={avatarInputRef}
                                    onClick={chromeFileInputFix}
                                    onChange={onAvatarUpload}
                                    accept="image/*"
                                    aria-label={_t("image_packs|upload_pack_avatar")}
                                    style={{ display: "none" }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="mx_ImagePackSettings_metadata">
                        <Field
                            label={_t("image_packs|pack_name")}
                            value={pack.displayName}
                            disabled={!canEditRoomPack}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                setPackAndClearValidation({ ...pack, displayName: ev.target.value })
                            }
                        />
                        <Field
                            label={_t("image_packs|attribution")}
                            value={pack.attribution}
                            disabled={!canEditRoomPack}
                            onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                setPackAndClearValidation({ ...pack, attribution: ev.target.value })
                            }
                        />
                        <SettingsSubsectionText>{_t("image_packs|attribution_help")}</SettingsSubsectionText>
                        <UsageToggles
                            usage={pack.usage}
                            disabled={!canEditRoomPack}
                            onChange={(usage) => setPackAndClearValidation({ ...pack, usage })}
                        />
                        <details className="mx_ImagePackSettings_advanced">
                            <summary>{_t("common|advanced")}</summary>
                            <Field
                                label={_t("image_packs|avatar_url")}
                                value={pack.avatarUrl}
                                disabled={!canEditRoomPack}
                                onChange={(ev: React.ChangeEvent<HTMLInputElement>) =>
                                    setPackAndClearValidation({ ...pack, avatarUrl: ev.target.value })
                                }
                            />
                        </details>
                        {validation.packErrors.length > 0 && (
                            <ul className="mx_ImagePackSettings_tileErrors">
                                {validation.packErrors.map((packError) => (
                                    <li key={packError}>{packError}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </SettingsSubsection>
            {mode === "account" && (
                <SettingsSubsection heading={_t("image_packs|global_room_packs")} stretchContent>
                    {favoriteRooms.length === 0 ? (
                        <SettingsSubsectionText>{_t("image_packs|global_room_packs_empty")}</SettingsSubsectionText>
                    ) : (
                        <div className="mx_ImagePackSettings_globalRooms">
                            {favoriteRooms.map((roomId) => (
                                <div className="mx_ImagePackSettings_globalRoom" key={roomId}>
                                    <div>
                                        <div className="mx_ImagePackSettings_globalRoomName">
                                            {favoriteRoomName(client, roomId)}
                                        </div>
                                        <div className="mx_ImagePackSettings_globalRoomId">{roomId}</div>
                                    </div>
                                    <AccessibleButton
                                        kind="danger_outline"
                                        onClick={() => {
                                            setFavoriteRooms((current) => current.filter((id) => id !== roomId));
                                            setSaved(false);
                                        }}
                                    >
                                        {_t("action|remove")}
                                    </AccessibleButton>
                                </div>
                            ))}
                        </div>
                    )}
                    <details className="mx_ImagePackSettings_advanced">
                        <summary>{_t("image_packs|add_room_by_id")}</summary>
                        <div className="mx_ImagePackSettings_addRoom">
                            <Field
                                label={_t("image_packs|room_id")}
                                value={manualRoomId}
                                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setManualRoomId(ev.target.value)}
                            />
                            <AccessibleButton kind="primary_outline" onClick={addFavoriteRoom}>
                                {_t("action|add")}
                            </AccessibleButton>
                        </div>
                    </details>
                </SettingsSubsection>
            )}
            {mode === "room" && room && (
                <SettingsSubsection>
                    <StyledCheckbox
                        checked={favorite}
                        onChange={(ev) => {
                            setFavorite(ev.target.checked);
                            setSaved(false);
                        }}
                    >
                        {_t("image_packs|favorite_this_room")}
                    </StyledCheckbox>
                </SettingsSubsection>
            )}
            <SettingsSubsection heading={_t("image_packs|images")} stretchContent>
                {canEdit && (
                    <div
                        className={classNames("mx_ImagePackSettings_dropzone", {
                            mx_ImagePackSettings_dropzoneBusy: uploading,
                        })}
                        onDrop={onDrop}
                        onDragOver={(ev) => ev.preventDefault()}
                    >
                        <div>
                            <div className="mx_ImagePackSettings_dropzoneTitle">{_t("image_packs|upload_images")}</div>
                            <div className="mx_ImagePackSettings_dropzoneDescription">
                                {_t("image_packs|upload_images_description")}
                            </div>
                        </div>
                        <AccessibleButton
                            kind="primary"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadIcon width="16px" height="16px" />
                            {uploading ? _t("common|loading") : _t("image_packs|choose_images")}
                        </AccessibleButton>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onClick={chromeFileInputFix}
                            onChange={onUpload}
                            accept="image/*"
                            multiple
                            aria-label={_t("image_packs|upload_images")}
                            style={{ display: "none" }}
                        />
                    </div>
                )}
                {uploadSummary && <SettingsSubsectionText>{uploadSummary}</SettingsSubsectionText>}
                <div className="mx_ImagePackSettings_grid">
                    {pack.images.map((image, index) => (
                        <ImageTile
                            key={`${image.shortcode}:${index}`}
                            image={image}
                            index={index}
                            disabled={!canEditRoomPack}
                            errors={validation.imageErrors.get(index)}
                            onChange={updateImage}
                            onRemove={removeImage}
                            onReplace={onReplaceImage}
                        />
                    ))}
                </div>
                {pack.images.length === 0 && (
                    <div className="mx_ImagePackSettings_empty">{_t("image_packs|empty_images")}</div>
                )}
                {canEdit && (
                    <details className="mx_ImagePackSettings_advanced">
                        <summary>{_t("image_packs|add_mxc")}</summary>
                        <div className="mx_ImagePackSettings_add">
                            <Field
                                label={_t("image_packs|shortcode")}
                                value={newShortcode}
                                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setNewShortcode(ev.target.value)}
                            />
                            <Field
                                label={_t("image_packs|mxc_url")}
                                value={newUrl}
                                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setNewUrl(ev.target.value)}
                            />
                            <Field
                                label={_t("common|description")}
                                value={newBody}
                                onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setNewBody(ev.target.value)}
                            />
                            <AccessibleButton kind="primary_outline" onClick={onAddMxc}>
                                {_t("action|add")}
                            </AccessibleButton>
                        </div>
                    </details>
                )}
            </SettingsSubsection>
            <SettingsSubsection>
                {error && <div className="mx_SettingsTab_warningText">{error}</div>}
                {saved && <SettingsSubsectionText>{_t("common|saved")}</SettingsSubsectionText>}
                <div className="mx_ImagePackSettings_saveBar">
                    <AccessibleButton kind="primary" onClick={onSave} disabled={!client}>
                        {_t("action|save")}
                    </AccessibleButton>
                    {canEditRoomPack && (
                        <AccessibleButton kind="danger_outline" onClick={onDelete} disabled={!client}>
                            {_t("action|delete")}
                        </AccessibleButton>
                    )}
                </div>
            </SettingsSubsection>
        </SettingsSection>
    );
}
