/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixEvent, MsgType, RelationType } from "matrix-js-sdk/src/matrix";

import { type Preview } from "./Preview";
import { type TagID } from "../../room-list-v3/skip-list/tag";
import { _t, sanitizeForTranslation } from "../../../languageHandler";
import { getSenderName, isSelf, shouldPrefixMessagesIn } from "./utils";
import { getHtmlText } from "../../../HtmlUtils";
import { stripHTMLReply, stripPlainReply } from "../../../utils/Reply";
import { mediaFromMxc } from "../../../customisations/Media";

const htmlEscape = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const htmlAttrEscape = (value: string): string => htmlEscape(value).replace(/'/g, "&#39;");

function replaceEmoticonImagesWithAltText(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const image of Array.from(doc.body.querySelectorAll("img[data-mx-emoticon]"))) {
        image.replaceWith(doc.createTextNode(image.getAttribute("alt") || image.getAttribute("title") || ""));
    }
    return doc.body.innerHTML;
}

function getPreviewImageSrc(rawSrc: string): string {
    if (!rawSrc.startsWith("mxc://")) return rawSrc;

    try {
        return mediaFromMxc(rawSrc).srcHttp ?? rawSrc;
    } catch {
        return rawSrc;
    }
}

function getHtmlBodyWithSafeEmoticons(html: string): { html: string; hasEmoticon: boolean } {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let hasEmoticon = false;

    const renderNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return htmlEscape(node.textContent ?? "");
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return "";
        }

        const element = node as HTMLElement;
        if (element.tagName.toLowerCase() === "br") {
            return " ";
        }

        if (element.tagName.toLowerCase() === "img" && element.hasAttribute("data-mx-emoticon")) {
            const rawSrc = element.getAttribute("src") ?? "";
            if (!rawSrc) return htmlEscape(element.getAttribute("alt") || element.getAttribute("title") || "");

            const src = getPreviewImageSrc(rawSrc);
            const alt = element.getAttribute("alt") || element.getAttribute("title") || "";
            hasEmoticon = true;
            return `<img data-mx-emoticon src="${htmlAttrEscape(src)}" alt="${htmlAttrEscape(alt)}" />`;
        }

        return Array.from(element.childNodes).map(renderNode).join("");
    };

    return {
        html: Array.from(doc.body.childNodes).map(renderNode).join("").trim(),
        hasEmoticon,
    };
}

export class MessageEventPreview implements Preview {
    public getTextFor(event: MatrixEvent, tagId?: TagID, isThread?: boolean): string | null {
        let eventContent = event.getContent();

        if (event.isRelation(RelationType.Replace)) {
            // It's an edit, generate the preview on the new text
            eventContent = event.getContent()["m.new_content"];
        }

        if (!eventContent?.["body"]) return null; // invalid for our purposes

        let body = eventContent["body"].trim();
        if (!body) return null; // invalid event, no preview
        // A msgtype is actually required in the spec but the app is a bit softer on this requirement
        const msgtype = eventContent["msgtype"] ?? MsgType.Text;

        const hasHtml = eventContent.format === "org.matrix.custom.html" && eventContent.formatted_body;
        if (hasHtml) {
            body = eventContent.formatted_body;
        }

        // XXX: Newer relations have a getRelation() function which is not compatible with replies.
        if (event.getWireContent()["m.relates_to"]?.["m.in_reply_to"]) {
            // If this is a reply, get the real reply and use that
            if (hasHtml) {
                body = (stripHTMLReply(body) || "").trim();
            } else {
                body = (stripPlainReply(body) || "").trim();
            }
            if (!body) return null; // invalid event, no preview
        }

        if (hasHtml) {
            const htmlWithEmoticonAltText = replaceEmoticonImagesWithAltText(body);
            const sanitised = getHtmlText(htmlWithEmoticonAltText.replace(/<br\/?>/gi, "\n")); // replace line breaks before removing them
            // run it through DOMParser to fixup encoded html entities
            body = new DOMParser().parseFromString(sanitised, "text/html").documentElement.textContent;
        }

        if (!body.trim()) return null;
        body = sanitizeForTranslation(body);

        if (msgtype === MsgType.Emote) {
            return _t("event_preview|m.emote", { senderName: getSenderName(event), emote: body });
        }

        const roomId = event.getRoomId();

        if (isThread || isSelf(event) || (roomId && !shouldPrefixMessagesIn(roomId, tagId))) {
            return body;
        } else {
            return _t("event_preview|m.text", { senderName: getSenderName(event), message: body });
        }
    }

    public getHtmlFor(event: MatrixEvent, tagId?: TagID, isThread?: boolean): string | null {
        let eventContent = event.getContent();

        if (event.isRelation(RelationType.Replace)) {
            eventContent = event.getContent()["m.new_content"];
        }

        if (!eventContent?.["body"]) return null;

        let body = eventContent["body"].trim();
        if (!body) return null;

        const msgtype = eventContent["msgtype"] ?? MsgType.Text;
        if (eventContent.format !== "org.matrix.custom.html" || !eventContent.formatted_body) return null;

        body = eventContent.formatted_body;

        if (event.getWireContent()["m.relates_to"]?.["m.in_reply_to"]) {
            body = (stripHTMLReply(body) || "").trim();
            if (!body) return null;
        }

        const safeBody = getHtmlBodyWithSafeEmoticons(body);
        if (!safeBody.hasEmoticon || !safeBody.html) return null;

        if (msgtype === MsgType.Emote) {
            return _t("event_preview|m.emote", {
                senderName: htmlEscape(getSenderName(event)),
                emote: safeBody.html,
            });
        }

        const roomId = event.getRoomId();
        if (isThread || isSelf(event) || (roomId && !shouldPrefixMessagesIn(roomId, tagId))) {
            return safeBody.html;
        } else {
            return _t("event_preview|m.text", {
                senderName: htmlEscape(getSenderName(event)),
                message: safeBody.html,
            });
        }
    }
}
