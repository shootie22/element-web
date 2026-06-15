/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    validateColor,
    validateGradientStops,
    validateGradientDirection,
    validateMessageStyle,
    encodeGradientPayload,
    decodeGradientPayload,
    gradientToCSS,
    type GradientStyle,
} from "../../../src/@types/message_style.ts";

describe("message_style", () => {
    describe("validateColor", () => {
        it("accepts valid 6-digit hex colors", () => {
            expect(validateColor("#ff0000")).toBe(true);
            expect(validateColor("#00FF00")).toBe(true);
            expect(validateColor("#0000ff")).toBe(true);
            expect(validateColor("#aAbBcC")).toBe(true);
            expect(validateColor("#ffffff")).toBe(true);
            expect(validateColor("#000000")).toBe(true);
        });

        it("rejects invalid colors", () => {
            expect(validateColor("red")).toBe(false);
            expect(validateColor("#fff")).toBe(false);
            expect(validateColor("#gggggg")).toBe(false);
            expect(validateColor("")).toBe(false);
            expect(validateColor("#12345")).toBe(false);
            expect(validateColor("#1234567")).toBe(false);
        });
    });

    describe("validateGradientDirection", () => {
        it("accepts valid directions", () => {
            expect(validateGradientDirection("left-to-right")).toBe(true);
            expect(validateGradientDirection("top-to-bottom")).toBe(true);
            expect(validateGradientDirection("diagonal-down")).toBe(true);
            expect(validateGradientDirection("diagonal-up")).toBe(true);
        });

        it("rejects invalid directions", () => {
            expect(validateGradientDirection("invalid")).toBe(false);
            expect(validateGradientDirection("")).toBe(false);
            expect(validateGradientDirection("bottom-to-top")).toBe(false);
        });
    });

    describe("validateGradientStops", () => {
        it("accepts valid stops", () => {
            const stops = [
                { color: "#ff0000", position: 0 },
                { color: "#0000ff", position: 1 },
            ];
            expect(validateGradientStops(stops)).toBe(true);
        });

        it("accepts 5 stops", () => {
            const stops = [
                { color: "#ff0000", position: 0 },
                { color: "#ff8800", position: 0.25 },
                { color: "#00ff00", position: 0.5 },
                { color: "#0000ff", position: 0.75 },
                { color: "#ff00ff", position: 1 },
            ];
            expect(validateGradientStops(stops)).toBe(true);
        });

        it("rejects fewer than 2 stops", () => {
            expect(validateGradientStops([{ color: "#ff0000", position: 0 }])).toBe(false);
            expect(validateGradientStops([])).toBe(false);
        });

        it("rejects more than 5 stops", () => {
            const stops = Array(6).fill({ color: "#ff0000", position: 0 });
            expect(validateGradientStops(stops)).toBe(false);
        });

        it("rejects invalid stop positions", () => {
            const stops = [
                { color: "#ff0000", position: -0.1 },
                { color: "#0000ff", position: 1 },
            ];
            expect(validateGradientStops(stops)).toBe(false);
        });

        it("rejects invalid stop colors", () => {
            const stops = [
                { color: "red", position: 0 },
                { color: "#0000ff", position: 1 },
            ];
            expect(validateGradientStops(stops)).toBe(false);
        });
    });

    describe("validateMessageStyle", () => {
        it("validates solid style", () => {
            expect(validateMessageStyle({ kind: "solid", color: "#ff0000" })).toBe(true);
            expect(validateMessageStyle({ kind: "solid", color: "red" })).toBe(false);
            expect(validateMessageStyle({ kind: "solid" })).toBe(false);
        });

        it("validates gradient style", () => {
            const valid = {
                kind: "gradient",
                direction: "left-to-right",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            };
            expect(validateMessageStyle(valid)).toBe(true);
        });

        it("rejects null", () => {
            expect(validateMessageStyle(null)).toBe(false);
        });

        it("rejects non-object", () => {
            expect(validateMessageStyle("string")).toBe(false);
        });
    });

    describe("encodeGradientPayload", () => {
        it("encodes to a base64 string", () => {
            const encoded = encodeGradientPayload({
                kind: "gradient",
                direction: "left-to-right",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            });
            expect(typeof encoded).toBe("string");
            expect(encoded.length).toBeGreaterThan(0);
        });
    });

    describe("decodeGradientPayload", () => {
        it("decodes a valid payload", () => {
            const original: GradientStyle = {
                kind: "gradient",
                direction: "left-to-right",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            };
            const encoded = encodeGradientPayload(original);
            const decoded = decodeGradientPayload(encoded);
            expect(decoded).toEqual(original);
        });

        it("decodes a payload with 3 stops", () => {
            const original: GradientStyle = {
                kind: "gradient",
                direction: "top-to-bottom",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#00ff00", position: 0.5 },
                    { color: "#0000ff", position: 1 },
                ],
            };
            const encoded = encodeGradientPayload(original);
            const decoded = decodeGradientPayload(encoded);
            expect(decoded).toEqual(original);
        });

        it("returns null for invalid payload", () => {
            expect(decodeGradientPayload("not-base64!")).toBe(null);
            expect(decodeGradientPayload("")).toBe(null);
            expect(decodeGradientPayload(btoa("not-json"))).toBe(null);
        });
    });

    describe("gradientToCSS", () => {
        it("generates correct CSS for left-to-right", () => {
            const css = gradientToCSS({
                kind: "gradient",
                direction: "left-to-right",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#0000ff", position: 1 },
                ],
            });
            expect(css).toBe("linear-gradient(to right, #ff0000 0%, #0000ff 100%)");
        });

        it("generates correct CSS for diagonal-down", () => {
            const css = gradientToCSS({
                kind: "gradient",
                direction: "diagonal-down",
                stops: [
                    { color: "#ff0000", position: 0 },
                    { color: "#00ff00", position: 0.5 },
                    { color: "#0000ff", position: 1 },
                ],
            });
            expect(css).toBe("linear-gradient(to bottom right, #ff0000 0%, #00ff00 50%, #0000ff 100%)");
        });
    });
});
