/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { initOnce } from "@vector-im/matrix-wysiwyg";

import { createMessageContent } from "../../../../../../../src/components/views/rooms/wysiwyg_composer/utils/createMessageContent";
import { encodeGradientPayload } from "../../../../../../../src/@types/message_style.ts";
import SettingsStore from "../../../../../../../src/settings/SettingsStore";

beforeAll(initOnce, 10000);

describe("createMessageContent with colored messages", () => {
    const mockClient = {
        getAccountData: jest.fn(),
        setAccountData: jest.fn(),
    } as unknown as jest.Mocked<MatrixClient>;

    const mockRoom = {
        client: mockClient,
        roomId: "!room:id",
    } as any;

    const originalGetValue = SettingsStore.getValue;

    function mockColoredMessageSettings(): void {
        jest.spyOn(SettingsStore, "getValue").mockImplementation(((key: string): any => {
            if (key === "Tweaks.enableColoredMessages") return true;
            if (key === "MessageComposerInput.useMarkdown") return false;
            return originalGetValue(key as any);
        }) as any);
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("plain body never contains color/gradient markup", () => {
        it("keeps body clean for rich text messages", async () => {
            const content = (await createMessageContent("<b>hello</b>", true, { room: mockRoom })) as any;
            expect(content.body).not.toContain("data-mx-color");
            expect(content.body).not.toContain("data-mx-gradient");
        });
    });

    describe("explicit selection decorations", () => {
        it("serializes a selected solid color without depending on editor DOM spans", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue(undefined);

            const content = (await createMessageContent("<b>hello</b> world", true, {
                room: mockRoom,
                colorDecorations: [
                    {
                        startOffset: 0,
                        endOffset: 5,
                        text: "hello",
                        color: "#00ff00",
                    },
                ],
            })) as any;

            expect(content.body).toBe("hello world");
            expect(content.formatted_body).toBe('<b><span data-mx-color="#00ff00">hello</span></b> world');
        });

        it("serializes a selected gradient using the existing data-mx-gradient wire format", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue(undefined);

            const stops = [
                { color: "#ff0000", position: 0 },
                { color: "#0000ff", position: 1 },
            ];
            const content = (await createMessageContent("hello world", true, {
                room: mockRoom,
                colorDecorations: [
                    {
                        startOffset: 6,
                        endOffset: 11,
                        text: "world",
                        direction: "left-to-right",
                        stops,
                    },
                ],
            })) as any;

            expect(content.formatted_body).toBe(
                `hello <span data-mx-gradient="${encodeGradientPayload({
                    kind: "gradient",
                    direction: "left-to-right",
                    stops,
                })}" data-mx-color="#ff0000">world</span>`,
            );
        });

        it("escapes selected text while adding color spans", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue(undefined);

            const content = (await createMessageContent("a &lt; b", true, {
                room: mockRoom,
                colorDecorations: [
                    {
                        startOffset: 2,
                        endOffset: 3,
                        text: "<",
                        color: "#00ff00",
                    },
                ],
            })) as any;

            expect(content.formatted_body).toBe('a <span data-mx-color="#00ff00">&lt;</span> b');
        });
    });

    describe("solid default emits valid data-mx-color", () => {
        it("wraps formatted body in data-mx-color span when default style is solid", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue({
                getContent: () => ({
                    version: 1,
                    defaultStyle: { kind: "solid", color: "#ff0000" },
                }),
            } as any);

            const content = (await createMessageContent("hello", true, { room: mockRoom })) as any;
            expect(content.formatted_body).toContain('data-mx-color="#ff0000"');
            expect(content.body).toBe("hello");
            expect(content.format).toBe("org.matrix.custom.html");
        });

        it("does not wrap when message already has explicit color", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue({
                getContent: () => ({
                    version: 1,
                    defaultStyle: { kind: "solid", color: "#ff0000" },
                }),
            } as any);

            const content = (await createMessageContent('<span data-mx-color="#00ff00">hello</span>', true, {
                room: mockRoom,
            })) as any;
            expect(content.formatted_body).toBe('<span data-mx-color="#00ff00">hello</span>');
            expect(content.formatted_body).not.toContain('data-mx-color="#ff0000"');
        });
    });

    describe("gradient default emits client-specific gradient metadata", () => {
        it("wraps formatted body in data-mx-gradient span when default style is gradient", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue({
                getContent: () => ({
                    version: 1,
                    defaultStyle: {
                        kind: "gradient",
                        direction: "left-to-right",
                        stops: [
                            { color: "#ff0000", position: 0 },
                            { color: "#0000ff", position: 1 },
                        ],
                    },
                }),
            } as any);

            const content = (await createMessageContent("hello", true, { room: mockRoom })) as any;
            expect(content.formatted_body).toContain("data-mx-gradient");
            expect(content.formatted_body).toContain('data-mx-color="#ff0000"');
            expect(content.body).toBe("hello");
            expect(content.format).toBe("org.matrix.custom.html");
        });
    });

    describe("edits put styled content into both edited content and m.new_content", () => {
        it("applies default style to edits", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue({
                getContent: () => ({
                    version: 1,
                    defaultStyle: { kind: "solid", color: "#ff0000" },
                }),
            } as any);

            const editedEvent = {
                getId: () => "$eventId",
                getType: () => "m.room.message",
                getContent: () => ({ body: "old" }),
                replyEventId: undefined,
                getThread: () => null,
                getRoomId: () => "!room:id",
                isEvent: true,
            } as any;

            const content = (await createMessageContent("edited text", true, { editedEvent, room: mockRoom })) as any;
            expect(content.formatted_body).toContain('data-mx-color="#ff0000"');
            expect(content["m.new_content"].formatted_body).toContain('data-mx-color="#ff0000"');
        });

        it("preserves explicit gradient style when editing", async () => {
            mockColoredMessageSettings();

            mockClient.getAccountData.mockReturnValue(undefined);

            const editedEvent = {
                getId: () => "$eventId",
                getType: () => "m.room.message",
                getContent: () => ({ body: "old" }),
                replyEventId: undefined,
                getThread: () => null,
                getRoomId: () => "!room:id",
                isEvent: true,
            } as any;
            const gradient = encodeGradientPayload({
                kind: "gradient",
                direction: "left-to-right",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            });

            const content = (await createMessageContent(
                `<span data-mx-gradient="${gradient}" data-mx-color="#ff0000">edited text</span>`,
                true,
                { editedEvent, room: mockRoom },
            )) as any;

            expect(content.formatted_body).toContain(`data-mx-gradient="${gradient}"`);
            expect(content.formatted_body).toContain('data-mx-color="#ff0000"');
            expect(content["m.new_content"].formatted_body).toContain(`data-mx-gradient="${gradient}"`);
            expect(content["m.new_content"].formatted_body).toContain('data-mx-color="#ff0000"');
        });
    });
});
