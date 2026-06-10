/*
Copyright 2024 New Vector Ltd.
Copyright 2022 Ryan Browne <code@commonlawfeature.com>
Copyright 2019 The Matrix.org Foundation C.I.C.
Copyright 2017, 2018 New Vector Ltd
Copyright 2017 Vector Creations Ltd
Copyright 2016 Aviral Dasgupta

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { uniq, sortBy, uniqBy, type ListIteratee } from "lodash";
import EMOTICON_REGEX from "emojibase-regex/emoticon";
import { type Room } from "matrix-js-sdk/src/matrix";
import { EMOJI, type Emoji, getEmojiFromUnicode } from "@matrix-org/emojibase-bindings";

import { _t } from "../languageHandler";
import AutocompleteProvider from "./AutocompleteProvider";
import QueryMatcher from "./QueryMatcher";
import { PillCompletion } from "./Components";
import { type ICompletion, type ISelectionRange } from "./Autocompleter";
import SettingsStore from "../settings/SettingsStore";
import { type TimelineRenderingType } from "../contexts/RoomContext";
import * as recent from "../emojipicker/recent";
import { filterBoolean } from "../utils/arrays";
import { getImagePackEntries, type ImagePackEntry } from "../image-packs";

const LIMIT = 20;

// Match for ascii-style ";-)" emoticons or ":wink:" shortcodes provided by emojibase
// anchored to only match from the start of parts otherwise it'll show emoji suggestions whilst typing matrix IDs
const EMOJI_REGEX = new RegExp("(" + EMOTICON_REGEX.source + "|(?:^|\\s):[+-\\w]*:?)$", "g");

interface ISortedEmoji {
    emoji: Emoji;
    _orderBy: number;
}

const SORTED_EMOJI: ISortedEmoji[] = EMOJI.sort((a, b) => {
    if (a.group === b.group) {
        return a.order! - b.order!;
    }
    return a.group! - b.group!;
}).map((emoji, index) => ({
    emoji,
    // Include the index so that we can preserve the original order
    _orderBy: index,
}));

function score(query: string, space: string[] | string): number {
    if (Array.isArray(space)) {
        return Math.min(...space.map((s) => score(query, s)));
    }

    const index = space.indexOf(query);
    if (index === -1) {
        return Infinity;
    } else {
        return index;
    }
}

function colonsTrimmed(str: string): string {
    // Trim off leading and potentially trailing `:` to correctly match the emoji data as they exist in emojibase.
    // Notes: The regex is pinned to the start and end of the string so that we can use the lazy-capturing `*?` matcher.
    // It needs to be lazy so that the trailing `:` is not captured in the replacement group, if it exists.
    return str.replace(/^:(.*?):?$/, "$1");
}

export default class EmojiProvider extends AutocompleteProvider {
    public matcher: QueryMatcher<ISortedEmoji>;
    public nameMatcher: QueryMatcher<ISortedEmoji>;
    private readonly recentlyUsed: Emoji[];
    private readonly room: Room;

    public constructor(room: Room, renderingType?: TimelineRenderingType) {
        super({ commandRegex: EMOJI_REGEX, renderingType });
        this.room = room;
        this.matcher = new QueryMatcher<ISortedEmoji>(SORTED_EMOJI, {
            keys: [],
            funcs: [(o) => o.emoji.shortcodes.map((s) => `:${s}:`)],
            // For matching against ascii equivalents
            shouldMatchWordsOnly: false,
        });
        this.nameMatcher = new QueryMatcher(SORTED_EMOJI, {
            keys: ["emoji.label"],
            // For removing punctuation
            shouldMatchWordsOnly: true,
        });

        this.recentlyUsed = Array.from(new Set(filterBoolean(recent.get().map(getEmojiFromUnicode))));
    }

    public async getCompletions(
        query: string,
        selection: ISelectionRange,
        force?: boolean,
        limit = -1,
    ): Promise<ICompletion[]> {
        if (!SettingsStore.getValue("MessageComposerInput.suggestEmoji")) {
            return []; // don't give any suggestions if the user doesn't want them
        }

        let completions: ISortedEmoji[] = [];
        const { command, range } = this.getCurrentCommand(query, selection);

        if (command && command[0].length > 2) {
            const matchedString = command[0];
            completions = this.matcher.match(matchedString, limit);

            // Do second match with shouldMatchWordsOnly in order to match against 'name'
            completions = completions.concat(this.nameMatcher.match(matchedString));

            const sorters: ListIteratee<ISortedEmoji>[] = [];
            // make sure that emoticons come first
            sorters.push((c) => score(matchedString, c.emoji.emoticon || ""));

            // then sort by score (Infinity if matchedString not in shortcode)
            sorters.push((c) => score(matchedString, c.emoji.shortcodes[0]));
            // then sort by max score of all shortcodes, trim off the `:`
            const trimmedMatch = colonsTrimmed(matchedString);
            sorters.push((c) => Math.min(...c.emoji.shortcodes.map((s) => score(trimmedMatch, s))));
            // If the matchedString is not empty, sort by length of shortcode. Example:
            //  matchedString = ":bookmark"
            //  completions = [":bookmark:", ":bookmark_tabs:", ...]
            if (matchedString.length > 1) {
                sorters.push((c) => c.emoji.shortcodes[0].length);
            }
            // Finally, sort by original ordering
            sorters.push((c) => c._orderBy);
            completions = sortBy<ISortedEmoji>(uniq(completions), sorters);

            completions = completions.slice(0, LIMIT);

            // Do a second sort to place emoji matching with frequently used one on top
            const recentlyUsedAutocomplete: ISortedEmoji[] = [];
            this.recentlyUsed.forEach((emoji) => {
                if (emoji.shortcodes[0].indexOf(trimmedMatch) === 0) {
                    recentlyUsedAutocomplete.push({ emoji: emoji, _orderBy: 0 });
                }
            });

            //if there is an exact shortcode match in the frequently used emojis, it goes before everything
            for (let i = 0; i < recentlyUsedAutocomplete.length; i++) {
                if (recentlyUsedAutocomplete[i].emoji.shortcodes[0] === trimmedMatch) {
                    const exactMatchEmoji = recentlyUsedAutocomplete[i];
                    for (let j = i; j > 0; j--) {
                        recentlyUsedAutocomplete[j] = recentlyUsedAutocomplete[j - 1];
                    }
                    recentlyUsedAutocomplete[0] = exactMatchEmoji;
                    break;
                }
            }

            completions = recentlyUsedAutocomplete.concat(completions);
            completions = uniqBy(completions, "emoji");

            const recentCustomCompletions = this.getRecentlyUsedCustomEmojiCompletions(matchedString, range!);
            const customCompletions = this.getCustomEmojiCompletions(matchedString, range!);

            return uniqBy(
                [
                    ...recentCustomCompletions,
                    ...customCompletions,
                    ...completions.map(
                        (c): ICompletion => ({
                            completion: c.emoji.unicode,
                            component: (
                                <PillCompletion title={`:${c.emoji.shortcodes[0]}:`} aria-label={c.emoji.unicode}>
                                    <span>{c.emoji.unicode}</span>
                                </PillCompletion>
                            ),
                            range: range!,
                        }),
                    ),
                ],
                (completion) => `${completion.type ?? "emoji"}:${completion.completion}:${completion.completionId ?? ""}`,
            );
        }
        return [];
    }

    private getRecentlyUsedCustomEmojiCompletions(matchedString: string, range: ISelectionRange): ICompletion[] {
        if (!SettingsStore.getValue("Tweaks.mixCustomEmojisWithFrequentlyUsed")) {
            return [];
        }

        const query = colonsTrimmed(matchedString).toLowerCase();
        if (!query) return [];

        const customEntries = getImagePackEntries(this.room.client, this.room, "emoticon");
        const customByKey = new Map(customEntries.map((entry) => [recent.customEmojiKey(entry.shortcode, entry.url), entry]));
        const seen = new Set<string>();

        return recent
            .get()
            .filter(recent.isCustomEmojiKey)
            .flatMap((key) => {
                const entry = customByKey.get(key);
                if (!entry || !customEntryMatches(entry, query)) {
                    return [];
                }

                const dedupeKey = `${entry.shortcode}:${entry.httpUrl ?? entry.url}`;
                if (seen.has(dedupeKey)) {
                    return [];
                }
                seen.add(dedupeKey);

                return [
                    {
                        type: "custom-emoji" as const,
                        completion: `:${entry.shortcode}:`,
                        completionId: entry.httpUrl ?? undefined,
                        component: (
                            <PillCompletion title={`:${entry.shortcode}:`} subtitle={entry.label}>
                                {entry.httpUrl && (
                                    <img className="mx_Autocomplete_CustomEmoji" src={entry.httpUrl} alt="" />
                                )}
                            </PillCompletion>
                        ),
                        range,
                    },
                ];
            });
    }

    private getCustomEmojiCompletions(matchedString: string, range: ISelectionRange): ICompletion[] {
        const query = colonsTrimmed(matchedString).toLowerCase();
        if (!query) return [];

        return getImagePackEntries(this.room.client, this.room, "emoticon")
            .filter((entry) => customEntryMatches(entry, query))
            .slice(0, LIMIT)
            .map((entry) => ({
                type: "custom-emoji" as const,
                completion: `:${entry.shortcode}:`,
                completionId: entry.httpUrl ?? undefined,
                component: (
                    <PillCompletion title={`:${entry.shortcode}:`} subtitle={entry.label}>
                        {entry.httpUrl && <img className="mx_Autocomplete_CustomEmoji" src={entry.httpUrl} alt="" />}
                    </PillCompletion>
                ),
                range,
            }));
    }

    public getName(): string {
        return "😃 " + _t("common|emoji");
    }

    public renderCompletions(completions: React.ReactNode[]): React.ReactNode {
        return (
            <div
                className="mx_Autocomplete_Completion_container_pill"
                role="presentation"
                aria-label={_t("composer|autocomplete|emoji_a11y")}
            >
                {completions}
            </div>
        );
    }
}

function customEntryMatches(entry: ImagePackEntry, query: string): boolean {
    return (
        entry.shortcode.toLowerCase().includes(query) ||
        (entry.body || "").toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query)
    );
}
