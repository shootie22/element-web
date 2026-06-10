/*
Copyright 2024 New Vector Ltd.
Copyright 2022 Ryan Browne <code@commonlawfeature.com>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import EmojiProvider from "../../../src/autocomplete/EmojiProvider";
import { mkStubRoom } from "../../test-utils/test-utils";
import { add } from "../../../src/emojipicker/recent";
import { stubClient } from "../../test-utils";
import { MatrixClientPeg } from "../../../src/MatrixClientPeg";
import SettingsStore from "../../../src/settings/SettingsStore";
import { SettingLevel } from "../../../src/settings/SettingLevel";
import * as imagePacks from "../../../src/image-packs";
import * as recent from "../../../src/emojipicker/recent";

const EMOJI_SHORTCODES = [
    ":+1",
    ":heart",
    ":grinning",
    ":hand",
    ":man",
    ":sweat",
    ":monkey",
    ":boat",
    ":mailbox",
    ":cop",
    ":bow",
    ":kiss",
    ":golf",
];

// Some emoji shortcodes are too short and do not actually trigger autocompletion until the ending `:`.
// This means that we cannot compare their autocompletion before and after the ending `:` and have
// to simply assert that the final completion with the colon is the exact emoji.
const TOO_SHORT_EMOJI_SHORTCODE = [{ emojiShortcode: ":o", expectedEmoji: "⭕️" }];

interface CompletionComponentProps {
    title: string;
}

describe("EmojiProvider", function () {
    const testRoom = mkStubRoom(undefined, undefined, undefined);
    stubClient();
    MatrixClientPeg.safeGet();

    it.each(EMOJI_SHORTCODES)("Returns consistent results after final colon %s", async function (emojiShortcode) {
        const ep = new EmojiProvider(testRoom);
        const range = { beginning: true, start: 0, end: 3 };
        const completionsBeforeColon = await ep.getCompletions(emojiShortcode, range);
        const completionsAfterColon = await ep.getCompletions(emojiShortcode + ":", range);

        const firstCompletionWithoutColon = completionsBeforeColon[0].completion;
        const firstCompletionWithColon = completionsAfterColon[0].completion;

        expect(firstCompletionWithoutColon).toEqual(firstCompletionWithColon);
    });

    it.each(TOO_SHORT_EMOJI_SHORTCODE)(
        "Returns correct results after final colon $emojiShortcode",
        async ({ emojiShortcode, expectedEmoji }) => {
            const ep = new EmojiProvider(testRoom);
            const range = { beginning: true, start: 0, end: 3 };
            const completions = await ep.getCompletions(emojiShortcode + ":", range);

            expect(completions[0].completion).toEqual(expectedEmoji);
        },
    );

    it("Recently used emojis are correctly sorted", async function () {
        add("😘"); //kissing_heart
        add("💗"); //heartpulse
        add("💗"); //heartpulse
        add("😍"); //heart_eyes

        const ep = new EmojiProvider(testRoom);
        const completionsList = await ep.getCompletions(":heart", { beginning: true, start: 0, end: 6 });
        expect((completionsList[0]?.component?.props as CompletionComponentProps).title).toEqual(":heartpulse:");
        expect((completionsList[1]?.component?.props as CompletionComponentProps).title).toEqual(":heart_eyes:");
    });

    it("Exact match in recently used takes the lead", async function () {
        add("😘"); //kissing_heart
        add("💗"); //heartpulse
        add("💗"); //heartpulse
        add("😍"); //heart_eyes

        add("❤️"); //heart
        const ep = new EmojiProvider(testRoom);
        const completionsList = await ep.getCompletions(":heart", { beginning: true, start: 0, end: 6 });

        expect((completionsList[0]?.component?.props as CompletionComponentProps).title).toEqual(":heart:");
        expect((completionsList[1]?.component?.props as CompletionComponentProps).title).toEqual(":heartpulse:");
        expect((completionsList[2]?.component?.props as CompletionComponentProps).title).toEqual(":heart_eyes:");
    });

    it("mixes recently used custom emojis into autocomplete when enabled", async function () {
        const recentKey = recent.customEmojiKey("party", "mxc://example.org/party");
        SettingsStore.setValue("recent_emoji", null, SettingLevel.ACCOUNT, [{ emoji: recentKey, total: 3 }]);
        SettingsStore.setValue("Tweaks.mixCustomEmojisWithFrequentlyUsed", null, SettingLevel.ACCOUNT, true);
        jest.spyOn(imagePacks, "getImagePackEntries").mockReturnValue([
            {
                shortcode: "panda",
                url: "mxc://example.org/panda",
                httpUrl: "https://example.org/panda.gif",
                label: "Panda",
                pack: { id: "pack", source: "room", metadata: {}, images: [] },
            },
            {
                shortcode: "party",
                url: "mxc://example.org/party",
                httpUrl: "https://example.org/party.gif",
                label: "Party",
                pack: { id: "pack", source: "room", metadata: {}, images: [] },
            },
        ] as unknown as imagePacks.ImagePackEntry[]);

        const ep = new EmojiProvider(testRoom);
        const completionsList = await ep.getCompletions(":pa", { beginning: true, start: 0, end: 3 });

        expect((completionsList[0]?.component?.props as CompletionComponentProps).title).toEqual(":party:");
    });
});
