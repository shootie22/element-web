/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { EventType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import { type ImageInfo } from "matrix-js-sdk/src/types";

import { mediaFromMxc } from "./customisations/Media";

export const ROOM_IMAGE_PACK_EVENT = "m.room.image_pack";
export const ROOM_IMAGE_PACK_EVENT_UNSTABLE = "im.ponies.room_emotes";
export const ACCOUNT_IMAGE_PACK_EVENT = "m.image_pack";
export const ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE = "im.ponies.user_emotes";
export const IMAGE_PACK_ROOMS_EVENT = "m.image_pack.rooms";
export const IMAGE_PACK_ROOMS_EVENT_UNSTABLE = "im.ponies.emote_rooms";

export const IMAGE_PACK_SHORTCODE_REGEX = /^[a-zA-Z0-9-_]+$/;
export const IMAGE_PACK_SHORTCODE_MAX_BYTES = 100;
export const IMAGE_PACK_MAX_EVENT_BYTES = 65000;

const IMAGE_PACK_EVENT_TYPES = new Set<string>([
    ROOM_IMAGE_PACK_EVENT,
    ROOM_IMAGE_PACK_EVENT_UNSTABLE,
    ACCOUNT_IMAGE_PACK_EVENT,
    ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE,
    IMAGE_PACK_ROOMS_EVENT,
    IMAGE_PACK_ROOMS_EVENT_UNSTABLE,
]);

export type ImagePackUsage = "emoticon" | "sticker";

export interface ImagePackMetadata {
    displayName?: string;
    avatarUrl?: string;
    attribution?: string;
    usage?: ImagePackUsage[];
}

export interface ImagePackImage {
    shortcode: string;
    url: string;
    body?: string;
    info?: ImageInfo;
    usage?: ImagePackUsage[];
}

export interface ImagePack {
    id: string;
    source: "account" | "room" | "space" | "global";
    roomId?: string;
    stateKey?: string;
    metadata: ImagePackMetadata;
    images: ImagePackImage[];
    eventType?: string;
}

export interface ImagePackRoomReference {
    roomId: string;
    stateKey: string;
    legacyAllPacks?: boolean;
}

export interface ImagePackRoomsContent {
    rooms?: Record<string, Record<string, unknown>> | string[];
}

export type ImagePackContent = {
    pack?: {
        display_name?: unknown;
        avatar_url?: unknown;
        attribution?: unknown;
        usage?: unknown;
    };
    images?: Record<
        string,
        {
            url?: unknown;
            body?: unknown;
            info?: unknown;
            usage?: unknown;
        }
    >;
};

export interface ImagePackEntry extends ImagePackImage {
    pack: ImagePack;
    label: string;
    httpUrl?: string;
}

export function isImagePackEventType(eventType: string): boolean {
    return IMAGE_PACK_EVENT_TYPES.has(eventType);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function usageArray(value: unknown): ImagePackUsage[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const usages = value.filter((usage): usage is ImagePackUsage => usage === "emoticon" || usage === "sticker");
    return usages.length > 0 ? usages : undefined;
}

function imageInfo(value: unknown): ImageInfo | undefined {
    return isObject(value) ? (value as ImageInfo) : undefined;
}

export function isValidImagePackShortcode(shortcode: string): boolean {
    return (
        IMAGE_PACK_SHORTCODE_REGEX.test(shortcode) &&
        new TextEncoder().encode(shortcode).length <= IMAGE_PACK_SHORTCODE_MAX_BYTES
    );
}

export function validateImagePackEventSize(content: ImagePackContent): boolean {
    return new TextEncoder().encode(JSON.stringify(content)).length <= IMAGE_PACK_MAX_EVENT_BYTES;
}

export function packContentHasVisibleData(content: ImagePackContent): boolean {
    const hasMetadata = !!(
        content.pack?.display_name ||
        content.pack?.avatar_url ||
        content.pack?.attribution ||
        (Array.isArray(content.pack?.usage) && content.pack.usage.length > 0)
    );
    return hasMetadata || Object.keys(content.images ?? {}).length > 0;
}

export function parseImagePackContent(
    content: unknown,
    id: string,
    source: ImagePack["source"],
    opts: { roomId?: string; stateKey?: string; eventType?: string } = {},
): ImagePack | null {
    if (!isObject(content)) return null;
    const packContent = content as ImagePackContent;
    if (!packContentHasVisibleData(packContent)) return null;

    const metadata: ImagePackMetadata = {};
    if (isObject(packContent.pack)) {
        metadata.displayName = stringValue(packContent.pack.display_name);
        metadata.avatarUrl = stringValue(packContent.pack.avatar_url);
        metadata.attribution = stringValue(packContent.pack.attribution);
        metadata.usage = usageArray(packContent.pack.usage);
    }

    const images: ImagePackImage[] = [];
    if (isObject(packContent.images)) {
        for (const [shortcode, image] of Object.entries(packContent.images)) {
            if (!isObject(image)) continue;
            const url = stringValue(image.url);
            if (!url?.startsWith("mxc://")) continue;
            images.push({
                shortcode,
                url,
                body: stringValue(image.body),
                info: imageInfo(image.info),
                usage: usageArray(image.usage),
            });
        }
    }

    if (!metadata.displayName && images.length === 0) return null;

    return {
        id,
        source,
        roomId: opts.roomId,
        stateKey: opts.stateKey,
        metadata,
        images,
        eventType: opts.eventType,
    };
}

function getStateEvents(room: Room, eventType: string): MatrixEvent[] {
    const events = room.currentState.getStateEvents(eventType);
    if (!events) return [];
    return Array.isArray(events) ? events : [events];
}

function parseRoomPacks(room: Room, source: ImagePack["source"], stateKeys?: ReadonlySet<string>): ImagePack[] {
    const unstableByStateKey = new Map<string, MatrixEvent>();
    for (const event of getStateEvents(room, ROOM_IMAGE_PACK_EVENT_UNSTABLE)) {
        unstableByStateKey.set(event.getStateKey() ?? "", event);
    }

    const packs: ImagePack[] = [];
    const seenStateKeys = new Set<string>();

    for (const event of getStateEvents(room, ROOM_IMAGE_PACK_EVENT)) {
        const stateKey = event.getStateKey() ?? "";
        if (stateKeys && !stateKeys.has(stateKey)) continue;
        seenStateKeys.add(stateKey);
        const pack = parseImagePackContent(event.getContent(), `${room.roomId}:${stateKey}`, source, {
            roomId: room.roomId,
            stateKey,
            eventType: ROOM_IMAGE_PACK_EVENT,
        });
        if (pack) packs.push(pack);
    }

    for (const [stateKey, event] of unstableByStateKey) {
        if (seenStateKeys.has(stateKey)) continue;
        if (stateKeys && !stateKeys.has(stateKey)) continue;
        const pack = parseImagePackContent(event.getContent(), `${room.roomId}:${stateKey}`, source, {
            roomId: room.roomId,
            stateKey,
            eventType: ROOM_IMAGE_PACK_EVENT_UNSTABLE,
        });
        if (pack) packs.push(pack);
    }

    return packs;
}

function accountDataContent(
    client: MatrixClient,
    eventType:
        | typeof ACCOUNT_IMAGE_PACK_EVENT
        | typeof ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE
        | typeof IMAGE_PACK_ROOMS_EVENT
        | typeof IMAGE_PACK_ROOMS_EVENT_UNSTABLE,
): unknown {
    return client.getAccountData(eventType)?.getContent();
}

export function getAccountImagePack(client: MatrixClient): ImagePack | null {
    const stable = parseImagePackContent(accountDataContent(client, ACCOUNT_IMAGE_PACK_EVENT), "account", "account", {
        eventType: ACCOUNT_IMAGE_PACK_EVENT,
    });
    if (stable) return stable;

    return parseImagePackContent(accountDataContent(client, ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE), "account", "account", {
        eventType: ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE,
    });
}

function imagePackRoomReferenceKey({ roomId, stateKey, legacyAllPacks }: ImagePackRoomReference): string {
    return `${roomId}\u0000${legacyAllPacks ? "*" : stateKey}`;
}

function dedupeImagePackRoomReferences(refs: ImagePackRoomReference[]): ImagePackRoomReference[] {
    const seen = new Set<string>();
    return refs.filter((ref) => {
        const key = imagePackRoomReferenceKey(ref);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function getFavoriteImagePackRoomReferences(client: MatrixClient): ImagePackRoomReference[] {
    const stable = accountDataContent(client, IMAGE_PACK_ROOMS_EVENT);
    const unstable = accountDataContent(client, IMAGE_PACK_ROOMS_EVENT_UNSTABLE);
    const content = isObject(stable) ? stable : isObject(unstable) ? unstable : {};
    const rooms = (content as ImagePackRoomsContent).rooms;

    if (Array.isArray(rooms)) {
        return dedupeImagePackRoomReferences(
            rooms
                .filter((roomId): roomId is string => typeof roomId === "string")
                .map((roomId) => ({ roomId, stateKey: "", legacyAllPacks: true })),
        );
    }

    if (isObject(rooms)) {
        const refs: ImagePackRoomReference[] = [];
        for (const [roomId, stateKeys] of Object.entries(rooms)) {
            if (!isObject(stateKeys)) continue;
            const stateKeyNames = Object.keys(stateKeys);
            if (stateKeyNames.length === 0) {
                refs.push({ roomId, stateKey: "", legacyAllPacks: true });
                continue;
            }
            refs.push(...stateKeyNames.map((stateKey) => ({ roomId, stateKey })));
        }
        return dedupeImagePackRoomReferences(refs);
    }

    return [];
}

export function getFavoriteImagePackRoomIds(client: MatrixClient): string[] {
    return Array.from(new Set(getFavoriteImagePackRoomReferences(client).map(({ roomId }) => roomId)));
}

function getCanonicalParentSpaces(client: MatrixClient, room: Room): Room[] {
    const parentEvents = getStateEvents(room, EventType.SpaceParent);
    return parentEvents
        .filter((event) => event.getContent()?.canonical === true)
        .map((event) => client.getRoom(event.getStateKey() ?? ""))
        .filter((space): space is Room => !!space);
}

export function getImagePacksForRoom(client: MatrixClient, room?: Room | null): ImagePack[] {
    const packs: ImagePack[] = [];

    if (room) {
        packs.push(...parseRoomPacks(room, "room"));
        for (const space of getCanonicalParentSpaces(client, room)) {
            packs.push(...parseRoomPacks(space, "space"));
        }
    }

    for (const ref of getFavoriteImagePackRoomReferences(client)) {
        const packRoom = client.getRoom(ref.roomId);
        if (!packRoom || packRoom.roomId === room?.roomId) continue;
        packs.push(...parseRoomPacks(packRoom, "global", ref.legacyAllPacks ? undefined : new Set([ref.stateKey])));
    }

    const accountPack = getAccountImagePack(client);
    if (accountPack) packs.push(accountPack);

    return packs;
}

function packSupportsUsage(pack: ImagePack, usage: ImagePackUsage): boolean {
    return !pack.metadata.usage || pack.metadata.usage.includes(usage);
}

function imageSupportsUsage(image: ImagePackImage, pack: ImagePack, usage: ImagePackUsage): boolean {
    if (!packSupportsUsage(pack, usage)) return false;
    return !image.usage || image.usage.includes(usage);
}

export function getImagePackEntries(
    client: MatrixClient,
    room: Room | null | undefined,
    usage: ImagePackUsage,
): ImagePackEntry[] {
    return getImagePacksForRoom(client, room).flatMap((pack) => {
        const label = pack.metadata.displayName || pack.roomId || pack.id;
        return pack.images
            .filter((image) => imageSupportsUsage(image, pack, usage))
            .map((image) => ({
                ...image,
                pack,
                label,
                httpUrl: mediaFromMxc(image.url).srcHttp ?? undefined,
            }));
    });
}

export function packToContent(pack: Pick<ImagePack, "metadata" | "images">): ImagePackContent {
    const content: ImagePackContent = {
        pack: {},
        images: {},
    };

    if (pack.metadata.displayName) content.pack!.display_name = pack.metadata.displayName;
    if (pack.metadata.avatarUrl) content.pack!.avatar_url = pack.metadata.avatarUrl;
    if (pack.metadata.attribution) content.pack!.attribution = pack.metadata.attribution;
    if (pack.metadata.usage?.length) content.pack!.usage = pack.metadata.usage;

    for (const image of pack.images) {
        content.images![image.shortcode] = {
            url: image.url,
            body: image.body || image.shortcode,
            info: image.info,
            usage: image.usage,
        };
    }

    return content;
}

export function slugifyImagePackStateKey(name: string, existingStateKeys: Iterable<string>): string {
    const existing = new Set(existingStateKeys);
    const base = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    const slug = base || "pack";
    let candidate = slug;
    let suffix = 2;
    while (existing.has(candidate)) {
        candidate = `${slug}-${suffix}`;
        suffix++;
    }
    return candidate;
}

export async function saveAccountImagePack(client: MatrixClient, content: ImagePackContent): Promise<void> {
    if (!validateImagePackEventSize(content)) {
        throw new Error("Image pack is too large to save");
    }
    await client.setAccountData(ACCOUNT_IMAGE_PACK_EVENT, content);
    await client.setAccountData(ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE, content);
}

export async function saveRoomImagePack(
    client: MatrixClient,
    roomId: string,
    stateKey: string,
    content: ImagePackContent,
): Promise<void> {
    if (!validateImagePackEventSize(content)) {
        throw new Error("Image pack is too large to save");
    }
    await client.sendStateEvent(roomId, ROOM_IMAGE_PACK_EVENT, content, stateKey);
    await client.sendStateEvent(roomId, ROOM_IMAGE_PACK_EVENT_UNSTABLE, content, stateKey);
}

export async function saveFavoriteImagePackRooms(client: MatrixClient, refs: ImagePackRoomReference[]): Promise<void> {
    const rooms: Record<string, Record<string, unknown>> = {};

    for (const ref of dedupeImagePackRoomReferences(refs)) {
        const stateKeys =
            ref.legacyAllPacks && client.getRoom(ref.roomId)
                ? parseRoomPacks(client.getRoom(ref.roomId)!, "global").map((pack) => pack.stateKey ?? "")
                : [ref.stateKey];

        for (const stateKey of stateKeys) {
            rooms[ref.roomId] = rooms[ref.roomId] ?? {};
            rooms[ref.roomId][stateKey] = {};
        }
    }

    const content = { rooms };
    await client.setAccountData(IMAGE_PACK_ROOMS_EVENT, content);
    await client.setAccountData(IMAGE_PACK_ROOMS_EVENT_UNSTABLE, content);
}

export async function uploadImagePackFile(client: MatrixClient, file: File): Promise<ImagePackImage> {
    const { content_uri: url } = await client.uploadContent(file);
    const info: ImageInfo = {
        mimetype: file.type || undefined,
        size: file.size,
    };

    if (file.type.startsWith("image/")) {
        try {
            const bitmap = await createImageBitmap(file);
            info.w = bitmap.width;
            info.h = bitmap.height;
            bitmap.close();
        } catch {
            // Dimension metadata is best-effort; the upload itself remains usable without it.
        }
    }

    return {
        shortcode: file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "_") || "image",
        url,
        body: file.name,
        info,
    };
}
