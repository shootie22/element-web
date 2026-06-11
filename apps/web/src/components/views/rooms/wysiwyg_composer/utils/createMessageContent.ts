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
}

const isMatrixEvent = (e: MatrixEvent | undefined): e is MatrixEvent => e instanceof MatrixEvent;

export async function createMessageContent(
    message: string,
    isHTML: boolean,
    { relation, replyToEvent, editedEvent, room, editorElement }: CreateMessageContentParams,
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
        if (enableColoredMessages) {
            formattedBody = injectColorSpansFromDOM(formattedBody, editorElement);
        }

        if (enableColoredMessages && room) {
            const accountData = room.client.getAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE);
            const messageStyleData = accountData?.getContent<MessageStyleAccountData>();
            const defaultStyle = messageStyleData?.defaultStyle;
            if (defaultStyle && validateMessageStyle(defaultStyle)) {
                const hasExplicitColor = formattedBody.includes("data-mx-color") || formattedBody.includes("data-mx-gradient");
                if (!hasExplicitColor) {
                    if (defaultStyle.kind === "solid") {
                        formattedBody = `<span data-mx-color="${defaultStyle.color}">${formattedBody}</span>`;
                    } else if (defaultStyle.kind === "gradient") {
                        const encoded = encodeGradientPayload(defaultStyle);
                        formattedBody = `<span data-mx-gradient="${encoded}">${formattedBody}</span>`;
                    }
                }
            }
        }

        content.formatted_body = isEditing ? `* ${formattedBody}` : formattedBody;
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
 * Scan the editor DOM for color spans and inject them into the formatted body HTML.
 * This bridges the gap between the WYSIWYG library's DOM (which has color spans applied
 * via execCommand but not stored in the model) and the message content sent to the server.
 */
function injectColorSpansFromDOM(formattedBody: string, editorElement?: HTMLElement | null): string {
    if (!editorElement) return formattedBody;

    const colorSpans = editorElement.querySelectorAll<HTMLElement>("[data-mx-color], [data-mx-gradient]");
    if (colorSpans.length === 0) return formattedBody;

    const parser = new DOMParser();
    const doc = parser.parseFromString(formattedBody, "text/html");
    const body = doc.body;

    for (const colorSpan of colorSpans) {
        const text = colorSpan.textContent;
        if (!text) continue;
        const colorAttr = colorSpan.getAttribute("data-mx-color");
        const gradientAttr = colorSpan.getAttribute("data-mx-gradient");

        const treeWalker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        while (treeWalker.nextNode()) {
            const node = treeWalker.currentNode;
            if (node.textContent === text) {
                const span = doc.createElement("span");
                if (colorAttr) span.setAttribute("data-mx-color", colorAttr);
                if (gradientAttr) span.setAttribute("data-mx-gradient", gradientAttr);
                span.textContent = text;
                node.parentNode?.replaceChild(span, node);
                break;
            } else if (node.textContent?.includes(text)) {
                const span = doc.createElement("span");
                if (colorAttr) span.setAttribute("data-mx-color", colorAttr);
                if (gradientAttr) span.setAttribute("data-mx-gradient", gradientAttr);
                span.textContent = text;
                const before = node.textContent!.substring(0, node.textContent!.indexOf(text));
                const after = node.textContent!.substring(node.textContent!.indexOf(text) + text.length);
                const fragment = doc.createDocumentFragment();
                if (before) fragment.appendChild(doc.createTextNode(before));
                fragment.appendChild(span);
                if (after) fragment.appendChild(doc.createTextNode(after));
                node.parentNode?.replaceChild(fragment, node);
                break;
            }
        }
    }

    return body.innerHTML;
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
