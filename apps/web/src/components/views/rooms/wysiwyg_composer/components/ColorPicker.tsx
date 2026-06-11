/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type ChangeEvent, useState } from "react";

import { _t } from "../../../../../languageHandler";
import Modal from "../../../../../Modal";
import BaseDialog from "../../../dialogs/BaseDialog";
import DialogButtons from "../../../elements/DialogButtons";
import { validateColor, validateGradientStops, type GradientDirection } from "../../../../../@types/message_style.ts";

interface PickerResultSolid { kind: "solid"; color: string }
interface PickerResultGradient { kind: "gradient"; direction: GradientDirection; stops: { color: string; position: number }[] }
type PickerResult = PickerResultSolid | PickerResultGradient;

interface ColorPickerProps {
    mode: "solid" | "gradient";
    initialStyle?: PickerResult;
    onFinished: (result?: PickerResult) => void;
}

const PRESET_COLORS = [
    "#ff0000", "#ff4400", "#ff8800", "#ffcc00", "#ffff00",
    "#88ff00", "#00ff00", "#00ff88", "#00ffcc", "#00ffff",
    "#0088ff", "#0000ff", "#4400ff", "#8800ff", "#cc00ff",
    "#ff00ff", "#ff0088", "#ff0044", "#000000", "#555555",
    "#888888", "#aaaaaa", "#cccccc", "#eeeeee", "#ffffff",
];

const DIRECTIONS: { value: GradientDirection; label: string }[] = [
    { value: "left-to-right", label: "→" },
    { value: "top-to-bottom", label: "↓" },
    { value: "diagonal-down", label: "↘" },
    { value: "diagonal-up", label: "↗" },
];

const DEFAULT_STOPS = [
    { color: "#ff0000", position: 0 },
    { color: "#0000ff", position: 1 },
];

export function openColorPicker(
    mode: "solid" | "gradient",
    initialStyle?: PickerResult,
): Promise<PickerResult | undefined> {
    const { finished } = Modal.createDialog(
        ColorPicker,
        { mode, initialStyle },
        "mx_CompoundDialog",
        false,
        true,
    );
    return finished.then(([result]) => result);
}

const SolidTab: React.FC<{
    selectedColor: string;
    onColorSelect: (color: string) => void;
}> = ({ selectedColor, onColorSelect }) => {
    return (
        <div className="mx_ColorPicker_solid">
            <div className="mx_ColorPicker_presets">
                {PRESET_COLORS.map((color) => (
                    <button
                        key={color}
                        className="mx_ColorPicker_swatch"
                        style={{ backgroundColor: color }}
                        aria-label={color}
                        onClick={() => onColorSelect(color)}
                        type="button"
                    >
                        {selectedColor === color && <span className="mx_ColorPicker_checkmark">✓</span>}
                    </button>
                ))}
            </div>
            <div className="mx_ColorPicker_custom">
                <label>{_t("composer|color_picker|custom_color")}</label>
                <input
                    type="color"
                    value={selectedColor}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onColorSelect(e.target.value)}
                />
            </div>
        </div>
    );
};

const GradientTab: React.FC<{
    direction: GradientDirection;
    stops: { color: string; position: number }[];
    onDirectionChange: (dir: GradientDirection) => void;
    onStopsChange: (stops: { color: string; position: number }[]) => void;
}> = ({ direction, stops, onDirectionChange, onStopsChange }) => {
    const updateStopColor = (index: number, color: string): void => {
        const newStops = [...stops];
        newStops[index] = { ...newStops[index], color };
        onStopsChange(newStops);
    };

    const updateStopPosition = (index: number, position: number): void => {
        const newStops = [...stops];
        newStops[index] = { ...newStops[index], position };
        onStopsChange(newStops);
    };

    const addStop = (): void => {
        if (stops.length >= 5) return;
        const lastPos = stops[stops.length - 1].position;
        const newPos = Math.min(lastPos + 0.2, 1);
        onStopsChange([...stops, { color: "#000000", position: newPos }]);
    };

    const removeStop = (index: number): void => {
        if (stops.length <= 2) return;
        const newStops = stops.filter((_, i) => i !== index);
        onStopsChange(newStops);
    };

    return (
        <div className="mx_ColorPicker_gradient">
            <div className="mx_ColorPicker_directions">
                <label>{_t("composer|color_picker|direction")}</label>
                <div className="mx_ColorPicker_direction_buttons">
                    {DIRECTIONS.map((d) => (
                        <button
                            key={d.value}
                            className={`mx_ColorPicker_direction_btn ${direction === d.value ? "mx_ColorPicker_direction_btn_active" : ""}`}
                            onClick={() => onDirectionChange(d.value)}
                            type="button"
                            aria-label={d.value}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="mx_ColorPicker_stops">
                {stops.map((stop, index) => (
                    <div key={index} className="mx_ColorPicker_stop">
                        <input
                            type="color"
                            value={stop.color}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => updateStopColor(index, e.target.value)}
                        />
                        <label className="mx_ColorPicker_stop_position_label">{_t("composer|color_picker|position")}</label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(stop.position * 100)}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                updateStopPosition(index, Number(e.target.value) / 100)
                            }
                            className="mx_ColorPicker_stop_position"
                        />
                        <span className="mx_ColorPicker_position_value">{Math.round(stop.position * 100)}%</span>
                        {stops.length > 2 && (
                            <button
                                type="button"
                                className="mx_ColorPicker_remove_stop"
                                onClick={() => removeStop(index)}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}
                {stops.length < 5 && (
                    <button type="button" className="mx_ColorPicker_add_stop" onClick={addStop}>
                        + {_t("composer|color_picker|add_stop")}
                    </button>
                )}
            </div>
        </div>
    );
};

const ColorPicker: React.FC<ColorPickerProps> = ({ mode, initialStyle, onFinished }) => {
    const [tab, setTab] = useState<"solid" | "gradient">(
        initialStyle?.kind === "gradient" ? "gradient" : mode,
    );
    const [solidColor, setSolidColor] = useState(
        initialStyle?.kind === "solid" ? initialStyle.color : "#ff0000",
    );
    const [gradientDirection, setGradientDirection] = useState<GradientDirection>(
        initialStyle?.kind === "gradient" ? initialStyle.direction : "left-to-right",
    );
    const [gradientStops, setGradientStops] = useState(
        initialStyle?.kind === "gradient" ? initialStyle.stops : DEFAULT_STOPS,
    );

    const handleApply = (): void => {
        if (tab === "solid") {
            if (!validateColor(solidColor)) return;
            onFinished({ kind: "solid", color: solidColor });
        } else {
            if (!validateGradientStops(gradientStops)) return;
            onFinished({ kind: "gradient", direction: gradientDirection, stops: gradientStops });
        }
    };

    return (
        <BaseDialog
            className="mx_ColorPicker"
            title={_t("composer|color_picker|title")}
            hasCancel={true}
            onFinished={onFinished}
        >
            <div className="mx_ColorPicker_tabs">
                <button
                    type="button"
                    className={`mx_ColorPicker_tab ${tab === "solid" ? "mx_ColorPicker_tab_active" : ""}`}
                    onClick={() => setTab("solid")}
                >
                    {_t("composer|color_picker|solid")}
                </button>
                <button
                    type="button"
                    className={`mx_ColorPicker_tab ${tab === "gradient" ? "mx_ColorPicker_tab_active" : ""}`}
                    onClick={() => setTab("gradient")}
                >
                    {_t("composer|color_picker|gradient")}
                </button>
            </div>
            <div className="mx_ColorPicker_content">
                {tab === "solid" ? (
                    <SolidTab selectedColor={solidColor} onColorSelect={setSolidColor} />
                ) : (
                    <GradientTab
                        direction={gradientDirection}
                        stops={gradientStops}
                        onDirectionChange={setGradientDirection}
                        onStopsChange={setGradientStops}
                    />
                )}
            </div>
            <DialogButtons
                primaryButton={_t("action|apply")}
                primaryIsSubmit={true}
                onCancel={() => onFinished(undefined)}
                onPrimaryButtonClick={handleApply}
            />
        </BaseDialog>
    );
};

export default ColorPicker;
