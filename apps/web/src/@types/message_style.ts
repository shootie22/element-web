/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export const MESSAGE_STYLE_ACCOUNT_DATA_TYPE = "com.elementcreations.message_style";

export type GradientDirection = "left-to-right" | "top-to-bottom" | "diagonal-down" | "diagonal-up";

export interface GradientStop {
    color: string;
    position: number;
}

export interface SolidStyle {
    kind: "solid";
    color: string;
}

export interface GradientStyle {
    kind: "gradient";
    direction: GradientDirection;
    stops: GradientStop[];
}

export type MessageStyle = SolidStyle | GradientStyle;

export interface MessageStyleAccountData {
    version: 1;
    defaultStyle: MessageStyle | null;
}

declare module "matrix-js-sdk/src/types" {
    interface AccountDataEvents {
        [MESSAGE_STYLE_ACCOUNT_DATA_TYPE]: MessageStyleAccountData;
    }
}

const HEX6_REGEX = /^#[0-9a-fA-F]{6}$/;

export function validateColor(color: string): boolean {
    return HEX6_REGEX.test(color);
}

export function validateGradientStops(stops: GradientStop[]): boolean {
    if (stops.length < 2 || stops.length > 5) return false;
    return stops.every((stop) => validateColor(stop.color) && stop.position >= 0 && stop.position <= 1);
}

export function validateGradientDirection(direction: string): direction is GradientDirection {
    return ["left-to-right", "top-to-bottom", "diagonal-down", "diagonal-up"].includes(direction);
}

export function validateMessageStyle(style: unknown): style is MessageStyle {
    if (!style || typeof style !== "object") return false;
    const s = style as Record<string, unknown>;
    if (s.kind === "solid" && typeof s.color === "string") {
        return validateColor(s.color);
    }
    if (s.kind === "gradient" && typeof s.direction === "string" && Array.isArray(s.stops)) {
        return validateGradientDirection(s.direction) && validateGradientStops(s.stops as GradientStop[]);
    }
    return false;
}

export function encodeGradientPayload(style: GradientStyle): string {
    const payload = {
        v: 1,
        d: style.direction,
        s: style.stops.map((stop) => [stop.color, stop.position]),
    };
    return btoa(JSON.stringify(payload));
}

export function decodeGradientPayload(encoded: string): GradientStyle | null {
    try {
        const raw = JSON.parse(atob(encoded));
        if (raw?.v !== 1 || typeof raw.d !== "string" || !Array.isArray(raw.s)) return null;
        if (!validateGradientDirection(raw.d)) return null;
        const stops: GradientStop[] = raw.s.map((s: [string, number]) => ({
            color: s[0],
            position: s[1],
        }));
        if (!validateGradientStops(stops)) return null;
        return { kind: "gradient", direction: raw.d, stops };
    } catch {
        return null;
    }
}

export function gradientToCSS(style: GradientStyle): string {
    const dirMap: Record<GradientDirection, string> = {
        "left-to-right": "to right",
        "top-to-bottom": "to bottom",
        "diagonal-down": "to bottom right",
        "diagonal-up": "to top right",
    };
    const stops = style.stops
        .map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`)
        .join(", ");
    return `linear-gradient(${dirMap[style.direction]}, ${stops})`;
}
