/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import sanitizeHtml from "sanitize-html";

import { sanitizeHtmlParams } from "../../src/Linkify";
import { encodeGradientPayload } from "../../src/@types/message_style.ts";
import SettingsStore from "../../src/settings/SettingsStore";

describe("Linkify sanitization", () => {
    describe("data-mx-gradient", () => {
        beforeEach(() => {
            // Enable colored messages by default in tests
            jest.spyOn(SettingsStore, "getValue").mockReturnValue(true);
        });

        it("converts valid data-mx-gradient to CSS", () => {
            const gradient = {
                kind: "gradient" as const,
                direction: "left-to-right" as const,
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            };
            const encoded = encodeGradientPayload(gradient);
            const html = `<span data-mx-gradient="${encoded}">hello</span>`;
            const result = sanitizeHtml(html, sanitizeHtmlParams);
            expect(result).toContain("style=\"");
            expect(result).toContain("background-image:");
            expect(result).toContain("background-clip: text");
            expect(result).toContain("color: transparent");
            expect(result).toContain("linear-gradient");
            expect(result).not.toContain("data-mx-gradient");
        });

        it("renders gradient when a solid fallback color is also present", () => {
            const gradient = {
                kind: "gradient" as const,
                direction: "left-to-right" as const,
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            };
            const encoded = encodeGradientPayload(gradient);
            const html = `<span data-mx-gradient="${encoded}" data-mx-color="#ff0000">hello</span>`;
            const result = sanitizeHtml(html, sanitizeHtmlParams);

            expect(result).toContain("background-image:");
            expect(result).toContain("linear-gradient");
            expect(result).toContain("color: transparent");
            expect(result).not.toContain("data-mx-gradient");
            expect(result).not.toContain("data-mx-color");
        });

        it("strips invalid data-mx-gradient", () => {
            const html = `<span data-mx-gradient="invalid-data">hello</span>`;
            const result = sanitizeHtml(html, sanitizeHtmlParams);
            expect(result).not.toContain("data-mx-gradient");
            expect(result).not.toContain("background-image:");
        });

        it("strips data-mx-gradient when enableColoredMessages is off", () => {
            jest.spyOn(SettingsStore, "getValue").mockImplementation((key: string) => {
                if (key === "Tweaks.enableColoredMessages") return false;
                return true;
            });
            const gradient = {
                kind: "gradient" as const,
                direction: "left-to-right" as const,
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            };
            const encoded = encodeGradientPayload(gradient);
            const html = `<span data-mx-gradient="${encoded}">hello</span>`;
            const result = sanitizeHtml(html, sanitizeHtmlParams);
            expect(result).not.toContain("data-mx-gradient");
            expect(result).not.toContain("background-image:");
            expect(result).toBe("<span>hello</span>");
        });

        it("preserves data-mx-color for valid colors", () => {
            const html = '<span data-mx-color="#ff0000">red text</span>';
            const result = sanitizeHtml(html, sanitizeHtmlParams);
            expect(result).toContain('style="color:#ff0000;"');
            expect(result).toContain("red text");
            expect(result).not.toContain("data-mx-color");
        });

        it("strips data-mx-color when enableColoredMessages is off", () => {
            jest.spyOn(SettingsStore, "getValue").mockImplementation((key: string) => {
                if (key === "Tweaks.enableColoredMessages") return false;
                return true;
            });
            const html = '<span data-mx-color="#ff0000">red text</span>';
            const result = sanitizeHtml(html, sanitizeHtmlParams);
            expect(result).not.toContain("data-mx-color");
            expect(result).not.toContain("color:#ff0000");
            expect(result).toBe("<span>red text</span>");
        });
    });
});
