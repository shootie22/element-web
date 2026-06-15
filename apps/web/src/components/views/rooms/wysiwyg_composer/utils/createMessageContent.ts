/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { richToPlain, plainToRich } from "@vector-im/matrix-wysiwyg";
import { type IContent, type IEventRelation, MatrixEvent, MsgType, type Room } from "matrix-js-sdk/src/matrix";
import {
    type ReplacementEvent,
    type RoomMessageEventContent,
    type RoomMessageTextEventContent,
} from "matrix-js-sdk/src/types";

import SettingsStore from "../../../../../settings/SettingsStore";
import { parsePermalink } from "../../../../../utils/permalinks/Permalinks";
import { addReplyToMessageContent } from "../../../../../utils/Reply";
import { isNotNull } from "../../../../../Typeguards";
import { htmlWithEmoticonShortcodes, shortcodeToEmoticonHtml } from "../../../../../image-pack-html";
import { replaceCustomEmojiHtmlWithShortcodes } from "./customEmoji";
import {
    MESSAGE_STYLE_ACCOUNT_DATA_TYPE,
    type MessageStyleAccountData,
    validateMessageStyle,
    encodeGradientPayload,
} from "../../../../../@types/message_style.ts";
import { getDefaultStyle } from "../hooks/useColorPersistence";
import {
    applyColorDecorationsToHtml,
    applyDefaultColorToHtml,
    getColorDecorations,
    type ColorDecoration,
} from "./colorDecorations";

export const EMOTE_PREFIX = "/me ";

// Merges favouring the given relation
function attachRelation(content: IContent, relation?: IEventRelation): void {
    if (relation) {
        content["m.relates_to"] = {
            ...(content["m.relates_to"] || {}),
            ...relation,
        };
    }
}

interface CreateMessageContentParams {
    relation?: IEventRelation;
    replyToEvent?: MatrixEvent;
    editedEvent?: MatrixEvent;
    room?: Room;
    editorElement?: HTMLElement | null;
    colorDecorations?: ColorDecoration[];
}

const isMatrixEvent = (e: MatrixEvent | undefined): e is MatrixEvent => e instanceof MatrixEvent;

export async function createMessageContent(
    message: string,
    isHTML: boolean,
    { relation, replyToEvent, editedEvent, room, editorElement, colorDecorations }: CreateMessageContentParams,
): Promise<RoomMessageEventContent> {
    const isEditing = isMatrixEvent(editedEvent);

    const isEmote = message.startsWith(EMOTE_PREFIX);
    if (isEmote) {
        // if we are dealing with an emote we want to remove the prefix so that `/me` does not
        // appear after the `* <userName>` text in the timeline
        message = message.slice(EMOTE_PREFIX.length);
    }
    if (message.startsWith("//")) {
        // if user wants to enter a single slash at the start of a message, this
        // is how they have to do it (due to it clashing with commands), so here we
        // remove the first character to make sure //word displays as /word
        message = message.slice(1);
    }

    // if we're editing rich text, the message content is pure html
    // BUT if we're not, the message content will be plain text where we need to convert the mentions
    const messageWithCustomEmojiShortcodes = replaceCustomEmojiHtmlWithShortcodes(message);
    const body = isHTML
        ? await richToPlain(messageWithCustomEmojiShortcodes, false)
        : convertPlainTextToBody(messageWithCustomEmojiShortcodes);

    const content = {
        msgtype: isEmote ? MsgType.Emote : MsgType.Text,
        body: isEditing ? `* ${body}` : body,
    } as RoomMessageTextEventContent & ReplacementEvent<RoomMessageTextEventContent>;

    // TODO markdown support

    const isMarkdownEnabled = SettingsStore.getValue("MessageComposerInput.useMarkdown");
    let formattedBody = isHTML
        ? messageWithCustomEmojiShortcodes
        : isMarkdownEnabled
          ? await plainToRich(messageWithCustomEmojiShortcodes, true)
          : null;
    if (formattedBody && room) {
        formattedBody = htmlWithEmoticonShortcodes(room.client, room, formattedBody);
    } else if (room) {
        const customEmoticonBody = shortcodeToEmoticonHtml(room.client, room, body);
        if (customEmoticonBody.includes("data-mx-emoticon")) {
            formattedBody = customEmoticonBody;
        }
    }

    if (formattedBody) {
        content.format = "org.matrix.custom.html";

        const enableColoredMessages = SettingsStore.getValue("Tweaks.enableColoredMessages");
        if (!enableColoredMessages) {
            content.formatted_body = isEditing ? `* ${formattedBody}` : formattedBody;
        } else {
            // Step 1: Apply explicit selection color decorations, which are stored independently of the DOM.
            formattedBody = applyColorDecorationsToHtml(
                formattedBody,
                colorDecorations ?? getColorDecorations(editorElement),
            );

            const hasExplicitColor = (html: string): boolean =>
                html.includes("data-mx-color") || html.includes("data-mx-gradient");

            // Step 2: Apply session default style (setDefaultStyle) — overrides account data default
            const sessionDefault = getDefaultStyle();
            if (sessionDefault && !hasExplicitColor(formattedBody)) {
                if (sessionDefault.color) {
                    formattedBody = applyDefaultColorToHtml(formattedBody, sessionDefault.color);
                } else if (sessionDefault.direction && sessionDefault.stops) {
                    const encoded = encodeGradientPayload({
                        kind: "gradient",
                        direction: sessionDefault.direction,
                        stops: sessionDefault.stops,
                    });
                    formattedBody = applyDefaultColorToHtml(formattedBody, undefined, encoded);
                }
            }

            // Step 3: Apply account data default style — fallback only
            if (room && !hasExplicitColor(formattedBody)) {
                const accountData = room.client.getAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE);
                const messageStyleData = accountData?.getContent<MessageStyleAccountData>();
                const defaultStyle = messageStyleData?.defaultStyle;
                if (defaultStyle && validateMessageStyle(defaultStyle)) {
                    const color = defaultStyle.kind === "solid" ? defaultStyle.color : undefined;
                    const gradient = defaultStyle.kind === "gradient" ? encodeGradientPayload(defaultStyle) : undefined;
                    formattedBody = applyDefaultColorToHtml(formattedBody, color, gradient);
                }
            }

            content.formatted_body = isEditing ? `* ${formattedBody}` : formattedBody;
        }
    }

    if (isEditing) {
        content["m.new_content"] = {
            msgtype: content.msgtype,
            body: body,
        };

        if (formattedBody) {
            content["m.new_content"].format = "org.matrix.custom.html";
            content["m.new_content"]["formatted_body"] = formattedBody;
        }
    }

    const newRelation = isEditing ? { ...relation, rel_type: "m.replace", event_id: editedEvent.getId() } : relation;

    // TODO Do we need to attach mentions here?
    // TODO Handle editing?
    attachRelation(content, newRelation);

    if (!isEditing && replyToEvent) {
        addReplyToMessageContent(content, replyToEvent);
    }

    return content;
}

/**
 * Without a model, we need to manually amend mentions in uncontrolled message content
 * to make sure that mentions meet the matrix specification.
 *
 * @param content - the output from the `MessageComposer` state when in plain text mode
 * @returns - a string formatted with the mentions replaced as required
 */
function convertPlainTextToBody(content: string): string {
    const document = new DOMParser().parseFromString(content, "text/html");
    const mentions = Array.from(document.querySelectorAll("a[data-mention-type]"));

    mentions.forEach((mention) => {
        const mentionType = mention.getAttribute("data-mention-type");
        switch (mentionType) {
            case "at-room": {
                mention.replaceWith("@room");
                break;
            }
            case "user": {
                const innerText = mention.innerHTML;
                mention.replaceWith(innerText);
                break;
            }
            case "room": {
                // for this case we use parsePermalink to try and get the mx id
                const href = mention.getAttribute("href");

                // if the mention has no href attribute, leave it alone
                if (href === null) break;

                // otherwise, attempt to parse the room alias or id from the href
                const permalinkParts = parsePermalink(href);

                // then if we have permalink parts with a valid roomIdOrAlias, replace the
                // room mention with that text
                if (isNotNull(permalinkParts) && isNotNull(permalinkParts.roomIdOrAlias)) {
                    mention.replaceWith(permalinkParts.roomIdOrAlias);
                }
                break;
            }
            default:
                break;
        }
    });

    return document.body.innerHTML;
}
