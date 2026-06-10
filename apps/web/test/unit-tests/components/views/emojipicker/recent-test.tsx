/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    customEmojiKey,
    isCustomEmojiKey,
    translateLegacyEmojiData,
    mergeEmojiData,
} from "../../../../../src/emojipicker/recent.ts";

describe("recent", () => {
    describe("translateLegacyEmojiData", () => {
        it("should correctly translate to the new format", () => {
            expect(
                translateLegacyEmojiData([
                    ["🤩", 1],
                    ["😀", 2],
                ]),
            ).toEqual([
                { emoji: "🤩", total: 1 },
                { emoji: "😀", total: 2 },
            ]);
        });
    });

    describe("mergeEmojiData", () => {
        it("should merge given data correctly", () => {
            expect(
                mergeEmojiData(
                    [{ emoji: "🤩", total: 1 }],
                    [
                        { emoji: "🤩", total: 2 },
                        { emoji: "😀", total: 1 },
                    ],
                ),
            ).toEqual([
                { emoji: "🤩", total: 2 },
                { emoji: "😀", total: 1 },
            ]);
        });

        it("should handle data2 being undefined", () => {
            expect(mergeEmojiData([{ emoji: "🤩", total: 1 }])).toEqual([{ emoji: "🤩", total: 1 }]);
        });
    });

    describe("customEmojiKey", () => {
        it("creates a recognizable key for custom emoji recents", () => {
            const key = customEmojiKey("party", "mxc://example.org/media");

            expect(isCustomEmojiKey(key)).toBe(true);
            expect(isCustomEmojiKey("😀")).toBe(false);
        });
    });
});
