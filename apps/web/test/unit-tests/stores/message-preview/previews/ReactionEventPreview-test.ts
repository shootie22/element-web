/*
Copyright 2024 New Vector Ltd.
Copyright 2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { RelationType, Room, RoomMember } from "matrix-js-sdk/src/matrix";
import { mocked } from "jest-mock";

import { mkEvent, stubClient } from "../../../../test-utils";
// Import directly from the file to avoid circular dependencies with MessagePreviewStore
import { ReactionEventPreview } from "../../../../../src/stores/message-preview/previews/ReactionEventPreview";
import { MatrixClientPeg } from "../../../../../src/MatrixClientPeg";

describe("ReactionEventPreview", () => {
    const preview = new ReactionEventPreview();
    const userId = "@user:example.com";
    const roomId = "!room:example.com";

    beforeAll(() => {
        stubClient();
    });

    describe("getTextFor", () => {
        it("should return null for non-relations", () => {
            const event = mkEvent({
                event: true,
                content: {},
                user: userId,
                type: "m.room.message",
                room: roomId,
            });
            expect(preview.getTextFor(event)).toBeNull();
        });

        it("should return null for non-reactions", () => {
            const event = mkEvent({
                event: true,
                content: {
                    "body": "",
                    "m.relates_to": {
                        rel_type: RelationType.Thread,
                        event_id: "$foo:bar",
                    },
                },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });
            expect(preview.getTextFor(event)).toBeNull();
        });

        it("should use 'You' for your own reactions", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: {
                    "body": "duck duck goose",
                    "m.relates_to": {
                        rel_type: RelationType.Thread,
                        event_id: "$foo:bar",
                    },
                },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });

            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": {
                        rel_type: RelationType.Annotation,
                        key: "🪿",
                        event_id: message.getId(),
                    },
                },
                user: cli.getSafeUserId(),
                type: "m.reaction",
                room: roomId,
            });
            expect(preview.getTextFor(event)).toMatchInlineSnapshot(`"You reacted 🪿 to duck duck goose"`);
        });

        it("should use shortcode for custom emoji reactions with MXC key", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: {
                    "body": "hello world",
                    "m.relates_to": {
                        rel_type: RelationType.Thread,
                        event_id: "$foo:bar",
                    },
                },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });

            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": {
                        rel_type: RelationType.Annotation,
                        key: "mxc://example.com/emoji",
                        event_id: message.getId(),
                    },
                    "com.beeper.reaction.shortcode": "blobcat",
                },
                user: cli.getSafeUserId(),
                type: "m.reaction",
                room: roomId,
            });
            expect(preview.getTextFor(event)).toMatchInlineSnapshot(
                `"You reacted blobcat to hello world"`,
            );
        });

        it("should use fallback text for custom emoji without shortcode", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: {
                    "body": "hello world",
                    "m.relates_to": {
                        rel_type: RelationType.Thread,
                        event_id: "$foo:bar",
                    },
                },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });

            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": {
                        rel_type: RelationType.Annotation,
                        key: "mxc://example.com/emoji",
                        event_id: message.getId(),
                    },
                },
                user: cli.getSafeUserId(),
                type: "m.reaction",
                room: roomId,
            });
            expect(preview.getTextFor(event)).toMatchInlineSnapshot(
                `"You reacted a custom emoji to hello world"`,
            );
        });

        it("getHtmlFor: returns null for standard emoji (non-MXC)", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: { body: "test", "m.relates_to": { rel_type: RelationType.Thread, event_id: "$foo:bar" } },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });
            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": { rel_type: RelationType.Annotation, key: "🪿", event_id: message.getId() },
                },
                user: cli.getSafeUserId(),
                type: "m.reaction",
                room: roomId,
            });
            expect(preview.getHtmlFor(event)).toBeNull();
        });

        it("getHtmlFor: returns img tag for custom emoji with shortcode", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: { body: "hello", "m.relates_to": { rel_type: RelationType.Thread, event_id: "$foo:bar" } },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });
            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": { rel_type: RelationType.Annotation, key: "mxc://example.org/custom", event_id: message.getId() },
                    "com.beeper.reaction.shortcode": "blobcat",
                },
                user: cli.getSafeUserId(),
                type: "m.reaction",
                room: roomId,
            });
            const html = preview.getHtmlFor(event);
            expect(html).toContain("<img");
            expect(html).toContain('alt="blobcat"');
            expect(html).toContain("hello");
        });

        it("getHtmlFor: uses fallback alt text for custom emoji without shortcode", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: { body: "hello", "m.relates_to": { rel_type: RelationType.Thread, event_id: "$foo:bar" } },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });
            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": { rel_type: RelationType.Annotation, key: "mxc://example.org/custom", event_id: message.getId() },
                },
                user: cli.getSafeUserId(),
                type: "m.reaction",
                room: roomId,
            });
            const html = preview.getHtmlFor(event);
            expect(html).toContain("<img");
            expect(html).toContain("alt=\"a custom emoji\"");
        });

        it("getHtmlFor: returns html for other users reactions", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: { body: "hello", "m.relates_to": { rel_type: RelationType.Thread, event_id: "$foo:bar" } },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });
            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": { rel_type: RelationType.Annotation, key: "mxc://example.org/custom", event_id: message.getId() },
                    "com.beeper.reaction.shortcode": "blobcat",
                },
                user: userId,
                type: "m.reaction",
                room: roomId,
            });
            event.sender = new RoomMember(roomId, userId);
            event.sender.name = "Bob";
            const html = preview.getHtmlFor(event);
            expect(html).toContain("<img");
            expect(html).toContain('alt="blobcat"');
            expect(html).not.toContain("You");
        });

        it("should use display name for your others' reactions", () => {
            const cli = MatrixClientPeg.safeGet();
            const room = new Room(roomId, cli, userId);
            mocked(cli.getRoom).mockReturnValue(room);

            const message = mkEvent({
                event: true,
                content: {
                    "body": "duck duck goose",
                    "m.relates_to": {
                        rel_type: RelationType.Thread,
                        event_id: "$foo:bar",
                    },
                },
                user: userId,
                type: "m.room.message",
                room: roomId,
            });

            room.getUnfilteredTimelineSet().addLiveEvent(message, { addToState: true });

            const event = mkEvent({
                event: true,
                content: {
                    "m.relates_to": {
                        rel_type: RelationType.Annotation,
                        key: "🪿",
                        event_id: message.getId(),
                    },
                },
                user: userId,
                type: "m.reaction",
                room: roomId,
            });
            event.sender = new RoomMember(roomId, userId);
            event.sender.name = "Bob";

            expect(preview.getTextFor(event)).toMatchInlineSnapshot(`"Bob reacted 🪿 to duck duck goose"`);
        });
    });
});
