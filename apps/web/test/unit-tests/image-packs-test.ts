/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    ACCOUNT_IMAGE_PACK_EVENT,
    ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE,
    getFavoriteImagePackRoomReferences,
    IMAGE_PACK_ROOMS_EVENT,
    IMAGE_PACK_ROOMS_EVENT_UNSTABLE,
    isImagePackEventType,
    isValidImagePackShortcode,
    packToContent,
    parseImagePackContent,
    ROOM_IMAGE_PACK_EVENT,
    ROOM_IMAGE_PACK_EVENT_UNSTABLE,
    saveAccountImagePack,
    saveFavoriteImagePackRooms,
    saveRoomImagePack,
    slugifyImagePackStateKey,
    validateImagePackEventSize,
} from "../../src/image-packs";

describe("image-packs", () => {
    it("parses MSC2545 image pack content and ignores non-MXC images", () => {
        const pack = parseImagePackContent(
            {
                pack: {
                    display_name: "Animals",
                    avatar_url: "mxc://server/avatar",
                    usage: ["emoticon", "sticker", "bad"],
                },
                images: {
                    cat: {
                        url: "mxc://server/cat",
                        body: "Cat",
                        info: { mimetype: "image/png", w: 64, h: 64 },
                        usage: ["sticker"],
                    },
                    remote: {
                        url: "https://example.invalid/remote.png",
                    },
                },
            },
            "account",
            "account",
        );

        expect(pack).toMatchObject({
            metadata: {
                displayName: "Animals",
                avatarUrl: "mxc://server/avatar",
                usage: ["emoticon", "sticker"],
            },
            images: [
                {
                    shortcode: "cat",
                    url: "mxc://server/cat",
                    body: "Cat",
                    usage: ["sticker"],
                },
            ],
        });
    });

    it("treats fully empty packs as deleted", () => {
        expect(parseImagePackContent({ images: {} }, "empty", "account")).toBeNull();
    });

    it("validates shortcode syntax and byte length", () => {
        expect(isValidImagePackShortcode("cat-party_2")).toBe(true);
        expect(isValidImagePackShortcode("cat party")).toBe(false);
        expect(isValidImagePackShortcode("a".repeat(101))).toBe(false);
    });

    it("recognises image pack update event types", () => {
        expect(isImagePackEventType(ROOM_IMAGE_PACK_EVENT)).toBe(true);
        expect(isImagePackEventType(ROOM_IMAGE_PACK_EVENT_UNSTABLE)).toBe(true);
        expect(isImagePackEventType(ACCOUNT_IMAGE_PACK_EVENT)).toBe(true);
        expect(isImagePackEventType(ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE)).toBe(true);
        expect(isImagePackEventType(IMAGE_PACK_ROOMS_EVENT)).toBe(true);
        expect(isImagePackEventType(IMAGE_PACK_ROOMS_EVENT_UNSTABLE)).toBe(true);
        expect(isImagePackEventType("m.room.message")).toBe(false);
    });

    it("serializes pack content and checks event size", () => {
        const content = packToContent({
            metadata: {
                displayName: "Cats",
                usage: ["emoticon"],
            },
            images: [{ shortcode: "cat", url: "mxc://server/cat", body: "Cat" }],
        });

        expect(content).toEqual({
            pack: {
                display_name: "Cats",
                usage: ["emoticon"],
            },
            images: {
                cat: {
                    url: "mxc://server/cat",
                    body: "Cat",
                    info: undefined,
                    usage: undefined,
                },
            },
        });
        expect(validateImagePackEventSize(content)).toBe(true);
    });

    it("generates slug state keys with numeric suffixes", () => {
        expect(slugifyImagePackStateKey("Cat Party!", ["cat-party"])).toBe("cat-party-2");
        expect(slugifyImagePackStateKey("!!!", [])).toBe("pack");
    });

    it("writes account packs to stable and unstable account data", async () => {
        const client = {
            setAccountData: jest.fn().mockResolvedValue(undefined),
        };
        const content = { images: {} };

        await saveAccountImagePack(client as never, content);

        expect(client.setAccountData).toHaveBeenCalledWith(ACCOUNT_IMAGE_PACK_EVENT, content);
        expect(client.setAccountData).toHaveBeenCalledWith(ACCOUNT_IMAGE_PACK_EVENT_UNSTABLE, content);
    });

    it("writes room packs to stable and unstable state events", async () => {
        const client = {
            sendStateEvent: jest.fn().mockResolvedValue(undefined),
        };
        const content = { images: {} };

        await saveRoomImagePack(client as never, "!room:server", "cats", content);

        expect(client.sendStateEvent).toHaveBeenCalledWith("!room:server", ROOM_IMAGE_PACK_EVENT, content, "cats");
        expect(client.sendStateEvent).toHaveBeenCalledWith(
            "!room:server",
            ROOM_IMAGE_PACK_EVENT_UNSTABLE,
            content,
            "cats",
        );
    });

    it("writes favorite pack rooms to stable and unstable account data", async () => {
        const client = {
            setAccountData: jest.fn().mockResolvedValue(undefined),
        };

        await saveFavoriteImagePackRooms(client as never, [{ roomId: "!pack:server", stateKey: "cats" }]);

        const content = { rooms: { "!pack:server": { cats: {} } } };
        expect(client.setAccountData).toHaveBeenCalledWith(IMAGE_PACK_ROOMS_EVENT, content);
        expect(client.setAccountData).toHaveBeenCalledWith(IMAGE_PACK_ROOMS_EVENT_UNSTABLE, content);
    });

    it("reads specific favorite pack room state keys", () => {
        const client = {
            getAccountData: jest.fn((type: string) =>
                type === IMAGE_PACK_ROOMS_EVENT
                    ? {
                          getContent: () => ({
                              rooms: {
                                  "!pack:server": {
                                      cats: {},
                                      dogs: {},
                                  },
                              },
                          }),
                      }
                    : undefined,
            ),
        };

        expect(getFavoriteImagePackRoomReferences(client as never)).toEqual([
            { roomId: "!pack:server", stateKey: "cats" },
            { roomId: "!pack:server", stateKey: "dogs" },
        ]);
    });

    it("keeps legacy room-only favorite pack data readable", () => {
        const client = {
            getAccountData: jest.fn((type: string) =>
                type === IMAGE_PACK_ROOMS_EVENT
                    ? {
                          getContent: () => ({
                              rooms: {
                                  "!pack:server": {},
                              },
                          }),
                      }
                    : undefined,
            ),
        };

        expect(getFavoriteImagePackRoomReferences(client as never)).toEqual([
            { roomId: "!pack:server", stateKey: "", legacyAllPacks: true },
        ]);
    });
});
