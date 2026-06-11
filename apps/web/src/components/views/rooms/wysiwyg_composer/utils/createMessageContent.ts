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

export const EMOTE_PREFIX = "/me ";

// Unicode emoji ranges — must match full emoji sequences including ZWJ, variation selectors, and flags
const EMOJI_RE = /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{3030}\u{303D}\u{3297}\u{3299}]|\u{200D}|\u{FE0F}|\u{20E3}/gu;

function splitAroundEmojis(
    text: string,
): Array<{ type: "text" | "emoji"; content: string }> {
    const parts: Array<{ type: "text" | "emoji"; content: string }> = [];
    let lastIndex = 0;
    for (const match of text.matchAll(EMOJI_RE)) {
        if (match.index! > lastIndex) {
            parts.push({ type: "text", content: text.slice(lastIndex, match.index!) });
        }
        parts.push({ type: "emoji", content: match[0] });
        lastIndex = match.index! + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push({ type: "text", content: text.slice(lastIndex) });
    }
    return parts;
}

function wrapNonEmojiInColor(text: string, color?: string, gradient?: string): string {
    if (!color && !gradient) return text;
    const parts = splitAroundEmojis(text);
    return parts
        .map((p) => {
            if (p.type === "emoji") return p.content;
            if (color) return `<span data-mx-color="${color}">${p.content}</span>`;
            if (gradient) return `<span data-mx-gradient="${gradient}">${p.content}</span>`;
            return p.content;
        })
        .join("");
}

function applyColorToHtml(html: string, color?: string, gradient?: string): string {
    if (!color && !gradient) return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const body = doc.body;
    const textNodes: Text[] = [];
    {
        const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    }
    for (const node of textNodes) {
        const wrapped = wrapNonEmojiInColor(node.textContent ?? "", color, gradient);
        if (wrapped === node.textContent) continue;
        const fragment = doc.createDocumentFragment();
        const temp = doc.createElement("div");
        temp.innerHTML = wrapped;
        while (temp.firstChild) fragment.appendChild(temp.firstChild);
        node.parentNode?.replaceChild(fragment, node);
    }
    return body.innerHTML;
}

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
        if (!enableColoredMessages) {
            content.formatted_body = isEditing ? `* ${formattedBody}` : formattedBody;
        } else {
            // Step 1: Inject explicit color spans from DOM (selection-based) — highest priority
            formattedBody = injectColorSpansFromDOM(formattedBody, editorElement);

            const hasExplicitColor = (): boolean =>
                formattedBody.includes("data-mx-color") || formattedBody.includes("data-mx-gradient");

            // Step 2: Apply session default style (setDefaultStyle) — overrides account data default
            const sessionDefault = getDefaultStyle();
            if (sessionDefault && !hasExplicitColor()) {
                if (sessionDefault.color) {
                    formattedBody = applyColorToHtml(formattedBody, sessionDefault.color);
                } else if (sessionDefault.direction && sessionDefault.stops) {
                    const encoded = encodeGradientPayload({
                        kind: "gradient",
                        direction: sessionDefault.direction,
                        stops: sessionDefault.stops,
                    });
                    formattedBody = applyColorToHtml(formattedBody, undefined, encoded);
                }
            }

            // Step 3: Apply account data default style — fallback only
            if (room && !hasExplicitColor()) {
                const accountData = room.client.getAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE);
                const messageStyleData = accountData?.getContent<MessageStyleAccountData>();
                const defaultStyle = messageStyleData?.defaultStyle;
                if (defaultStyle && validateMessageStyle(defaultStyle)) {
                    const color = defaultStyle.kind === "solid" ? defaultStyle.color : undefined;
                    const gradient = defaultStyle.kind === "gradient" ? encodeGradientPayload(defaultStyle) : undefined;
                    formattedBody = applyColorToHtml(formattedBody, color, gradient);
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

        const textNodes: Text[] = [];
        {
            const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
        }
        for (const node of textNodes) {
            if (node.textContent === text) {
                const wrapped = wrapNonEmojiInColor(text, colorAttr ?? undefined, gradientAttr ?? undefined);
                const fragment = doc.createDocumentFragment();
                const temp = doc.createElement("div");
                temp.innerHTML = wrapped;
                while (temp.firstChild) fragment.appendChild(temp.firstChild);
                node.parentNode?.replaceChild(fragment, node);
                break;
            } else if (node.textContent?.includes(text)) {
                const wrapped = wrapNonEmojiInColor(text, colorAttr ?? undefined, gradientAttr ?? undefined);
                const idx = node.textContent.indexOf(text);
                const before = node.textContent.substring(0, idx);
                const after = node.textContent.substring(idx + text.length);
                const fragment = doc.createDocumentFragment();
                if (before) fragment.appendChild(doc.createTextNode(before));
                const temp = doc.createElement("div");
                temp.innerHTML = wrapped;
                while (temp.firstChild) fragment.appendChild(temp.firstChild);
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
