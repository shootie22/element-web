/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { CustomEmojiPart, EmojiPart, PlainPart } from "../../../src/editor/parts";
import { createPartCreator } from "./mock";

describe("editor/parts", () => {
    describe("appendUntilRejected", () => {
        const femaleFacepalmEmoji = "🤦‍♀️";

        it("should not accept emoji strings into type=plain", () => {
            const part = new PlainPart();
            expect(part.appendUntilRejected(femaleFacepalmEmoji, "")).toEqual(femaleFacepalmEmoji);
            expect(part.text).toEqual("");
        });

        it("should accept emoji strings into type=emoji", () => {
            const part = new EmojiPart();
            expect(part.appendUntilRejected(femaleFacepalmEmoji, "")).toBeUndefined();
            expect(part.text).toEqual(femaleFacepalmEmoji);
        });
    });

    it("should not explode on room pills for unknown rooms", () => {
        const pc = createPartCreator();
        const part = pc.roomPill("#room:server");
        expect(() => part.toDOMNode()).not.toThrow();
    });

    it("renders custom emoji parts as real inline emoticon images while preserving shortcode text", () => {
        const part = new CustomEmojiPart(":party:", "party", "https://example.org/party.gif");
        const node = part.toDOMNode() as HTMLElement;
        const image = node.querySelector<HTMLImageElement>("img.mx_CustomEmoji_image");

        expect(node).toHaveClass("mx_CustomEmoji");
        expect(node).toHaveAttribute("contenteditable", "false");
        expect(node).toHaveAttribute("data-mx-emoticon");
        expect(node.textContent).toBe(":party:");
        expect(image).toHaveAttribute("data-mx-emoticon");
        expect(image).toHaveAttribute("src", "https://example.org/party.gif");
        expect(image).toHaveAttribute("alt", ":party:");
        expect(image).toHaveAttribute("title", "party");
        expect(image).toHaveAttribute("height", "32");
    });

    it("updates reused custom emoji DOM nodes to the real inline image shape", () => {
        const node = document.createElement("span");
        node.className = "mx_CustomEmoji";
        node.setAttribute("contentEditable", "false");
        node.setAttribute("data-mx-emoticon", "");

        const part = new CustomEmojiPart(":party:", "party", "https://example.org/party.gif");
        part.updateDOMNode(node);

        const image = node.querySelector<HTMLImageElement>("img.mx_CustomEmoji_image");
        expect(image).toHaveAttribute("src", "https://example.org/party.gif");
        expect(node.querySelector(".mx_CustomEmoji_hiddenText")).toHaveTextContent(":party:");
    });
});
