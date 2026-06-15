/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, {
    type JSX,
    type MouseEventHandler,
    type ReactNode,
    type RefObject,
    type SVGProps,
    useState,
    useEffect,
    useId,
} from "react";
import { type FormattingFunctions, type AllActionStates, type ActionState } from "@vector-im/matrix-wysiwyg";
import classNames from "classnames";
import BoldIcon from "@vector-im/compound-design-tokens/assets/web/icons/bold";
import BulletedListIcon from "@vector-im/compound-design-tokens/assets/web/icons/list-bulleted";
import CodeBlockIcon from "@vector-im/compound-design-tokens/assets/web/icons/code";
import UnIndentIcon from "@vector-im/compound-design-tokens/assets/web/icons/indent-decrease";
import IndentIcon from "@vector-im/compound-design-tokens/assets/web/icons/indent-increase";
import InlineCodeIcon from "@vector-im/compound-design-tokens/assets/web/icons/inline-code";
import ItalicIcon from "@vector-im/compound-design-tokens/assets/web/icons/italic";
import NumberedListIcon from "@vector-im/compound-design-tokens/assets/web/icons/list-numbered";
import QuoteIcon from "@vector-im/compound-design-tokens/assets/web/icons/quote";
import StrikeThroughIcon from "@vector-im/compound-design-tokens/assets/web/icons/strikethrough";
import UnderlineIcon from "@vector-im/compound-design-tokens/assets/web/icons/underline";
import LinkIcon from "@vector-im/compound-design-tokens/assets/web/icons/link";

import { _t } from "../../../../../languageHandler";
import AccessibleButton, { type ButtonEvent } from "../../../elements/AccessibleButton";
import { openLinkModal } from "./LinkModal";
import { useComposerContext } from "../ComposerContext";
import { KeyboardShortcut } from "../../../settings/KeyboardShortcut";
import { type KeyCombo } from "../../../../../KeyBindingsManager";
import { openColorPicker } from "./ColorPicker";
import { applySolidColorToSelection, applyGradientToSelection } from "../utils/color";
import { setSelection } from "../utils/selection";
import { storeRange, setDefaultStyle, getDefaultStyle, onDefaultStyleChange } from "../hooks/useColorPersistence";
import SettingsStore from "../../../../../settings/SettingsStore";
import { MatrixClientPeg } from "../../../../../MatrixClientPeg";
import {
    MESSAGE_STYLE_ACCOUNT_DATA_TYPE,
    type MessageStyle,
    type GradientDirection,
    type GradientStop,
} from "../../../../../@types/message_style.ts";

interface ButtonProps {
    icon: ReactNode;
    actionState: ActionState;
    onClick: MouseEventHandler<HTMLButtonElement>;
    label: string;
    keyCombo?: KeyCombo;
}

interface DefaultStyle {
    color?: string;
    direction?: GradientDirection;
    stops?: GradientStop[];
}

const EDITOR_SELECTOR = ".mx_WysiwygComposer_Editor_content[contenteditable]";

const GRADIENT_SVG_COORDS: Record<string, { x1: string; y1: string; x2: string; y2: string }> = {
    "left-to-right": { x1: "0", y1: "0", x2: "1", y2: "0" },
    "top-to-bottom": { x1: "0", y1: "0", x2: "0", y2: "1" },
    "diagonal-down": { x1: "0", y1: "0", x2: "1", y2: "1" },
    "diagonal-up": { x1: "0", y1: "1", x2: "1", y2: "0" },
};

function ColorIcon({
    currentStyle,
    ...props
}: SVGProps<SVGSVGElement> & { currentStyle: DefaultStyle | null }): JSX.Element {
    const gradId = `cig-${useId()}`;
    const fillColor = currentStyle?.color ?? currentStyle?.stops?.[0]?.color ?? "currentColor";

    if (currentStyle?.direction && currentStyle?.stops && currentStyle.stops.length >= 2) {
        const coords = GRADIENT_SVG_COORDS[currentStyle.direction] ?? GRADIENT_SVG_COORDS["left-to-right"];
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
                <defs>
                    <linearGradient id={gradId} x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2}>
                        {currentStyle.stops.map((s, i) => (
                            <stop key={i} offset={`${Math.round(s.position * 100)}%`} stopColor={s.color} />
                        ))}
                    </linearGradient>
                </defs>
                <path
                    d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                />
                <circle cx="12" cy="12" r="4" fill={`url(#${gradId})`} />
            </svg>
        );
    }

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <circle cx="12" cy="12" r="4" fill={fillColor} />
        </svg>
    );
}

function Button({ label, keyCombo, onClick, actionState, icon }: ButtonProps): JSX.Element {
    return (
        <AccessibleButton
            element="button"
            onClick={onClick as (e: ButtonEvent) => void}
            aria-label={label}
            disabled={actionState === "disabled"}
            className={classNames("mx_FormattingButtons_Button", {
                mx_FormattingButtons_active: actionState === "reversed",
                mx_FormattingButtons_Button_hover: actionState === "enabled",
                mx_FormattingButtons_disabled: actionState === "disabled",
            })}
            title={actionState === "disabled" ? undefined : label}
            caption={
                keyCombo && (
                    <KeyboardShortcut value={keyCombo} className="mx_FormattingButtons_Tooltip_KeyboardShortcut" />
                )
            }
            placement="top"
        >
            {icon}
        </AccessibleButton>
    );
}

function computeAndStoreRange(
    editor: HTMLElement | null,
    color?: string,
    direction?: "left-to-right" | "top-to-bottom" | "diagonal-down" | "diagonal-up",
    stops?: { color: string; position: number }[],
): void {
    if (!editor) return;
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const text = range.toString();
    if (!text) return;
    const preRange = document.createRange();
    preRange.selectNodeContents(editor);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + text.length;
    storeRange({ editor, startOffset, endOffset, text, color, direction, stops });
}

interface FormattingButtonsProps {
    composer: FormattingFunctions;
    actionStates: AllActionStates;
    editorRef?: RefObject<HTMLDivElement | null>;
    /**
     * Whether all buttons should be disabled
     */
    disabled?: boolean;
}

function getEditor(editorRef?: RefObject<HTMLDivElement | null>): HTMLElement | null {
    return editorRef?.current ?? document.querySelector<HTMLElement>(EDITOR_SELECTOR);
}

export function FormattingButtons({
    composer,
    actionStates,
    editorRef,
    disabled,
}: FormattingButtonsProps): JSX.Element {
    const composerContext = useComposerContext();
    const isInList = actionStates.unorderedList === "reversed" || actionStates.orderedList === "reversed";
    const enableColoredMessages = SettingsStore.getValue("Tweaks.enableColoredMessages");
    const [currentStyle, setCurrentStyle] = useState<DefaultStyle | null>(getDefaultStyle);

    useEffect(() => onDefaultStyleChange(() => setCurrentStyle(getDefaultStyle())), []);

    return (
        <div className="mx_FormattingButtons">
            <Button
                actionState={disabled ? "disabled" : actionStates.bold}
                label={_t("composer|format_bold")}
                keyCombo={{ ctrlOrCmdKey: true, key: "b" }}
                onClick={() => composer.bold()}
                icon={<BoldIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.italic}
                label={_t("composer|format_italic")}
                keyCombo={{ ctrlOrCmdKey: true, key: "i" }}
                onClick={() => composer.italic()}
                icon={<ItalicIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.underline}
                label={_t("composer|format_underline")}
                keyCombo={{ ctrlOrCmdKey: true, key: "u" }}
                onClick={() => composer.underline()}
                icon={<UnderlineIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.strikeThrough}
                label={_t("composer|format_strikethrough")}
                onClick={() => composer.strikeThrough()}
                icon={<StrikeThroughIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.unorderedList}
                label={_t("composer|format_unordered_list")}
                onClick={() => composer.unorderedList()}
                icon={<BulletedListIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.orderedList}
                label={_t("composer|format_ordered_list")}
                onClick={() => composer.orderedList()}
                icon={<NumberedListIcon className="mx_FormattingButtons_Icon" />}
            />
            {isInList && (
                <Button
                    actionState={disabled ? "disabled" : actionStates.indent}
                    label={_t("composer|format_increase_indent")}
                    onClick={() => composer.indent()}
                    icon={<IndentIcon className="mx_FormattingButtons_Icon" />}
                />
            )}
            {isInList && (
                <Button
                    actionState={disabled ? "disabled" : actionStates.unindent}
                    label={_t("composer|format_decrease_indent")}
                    onClick={() => composer.unindent()}
                    icon={<UnIndentIcon className="mx_FormattingButtons_Icon" />}
                />
            )}
            <Button
                actionState={disabled ? "disabled" : actionStates.quote}
                label={_t("action|quote")}
                onClick={() => composer.quote()}
                icon={<QuoteIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.inlineCode}
                label={_t("composer|format_inline_code")}
                keyCombo={{ ctrlOrCmdKey: true, key: "e" }}
                onClick={() => composer.inlineCode()}
                icon={<InlineCodeIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.codeBlock}
                label={_t("composer|format_code_block")}
                onClick={() => composer.codeBlock()}
                icon={<CodeBlockIcon className="mx_FormattingButtons_Icon" />}
            />
            <Button
                actionState={disabled ? "disabled" : actionStates.link}
                label={_t("composer|format_link")}
                onClick={() => openLinkModal(composer, composerContext, actionStates.link === "reversed")}
                icon={<LinkIcon className="mx_FormattingButtons_Icon" />}
            />
            {enableColoredMessages && (
                <Button
                    actionState={disabled ? "disabled" : "enabled"}
                    label={_t("composer|color_picker|text_color")}
                    onClick={async () => {
                        const sel = document.getSelection();
                        const hasSelection = sel && !sel.isCollapsed && sel.rangeCount > 0;
                        const savedSelection =
                            hasSelection && sel
                                ? {
                                      anchorNode: sel.anchorNode,
                                      anchorOffset: sel.anchorOffset,
                                      focusNode: sel.focusNode,
                                      focusOffset: sel.focusOffset,
                                      isForward:
                                          sel.getRangeAt(0).startContainer === sel.anchorNode &&
                                          sel.getRangeAt(0).startOffset === sel.anchorOffset,
                                  }
                                : composerContext.selection;
                        const curStyle = getDefaultStyle();
                        const isGradient = curStyle && "direction" in curStyle && curStyle.direction;
                        const initialStyle = curStyle
                            ? isGradient
                                ? {
                                      kind: "gradient" as const,
                                      direction: curStyle.direction!,
                                      stops: curStyle.stops!,
                                  }
                                : { kind: "solid" as const, color: curStyle.color ?? "#ff0000" }
                            : undefined;
                        const result = await openColorPicker(isGradient ? "gradient" : "solid", initialStyle);
                        if (!result) return;
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        const editor = getEditor(editorRef);
                        editor?.focus();
                        await setSelection(savedSelection);
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        if (result.kind === "solid") {
                            setDefaultStyle({ color: result.color });
                            computeAndStoreRange(editor, result.color);
                            applySolidColorToSelection(result.color);
                        } else {
                            setDefaultStyle({ direction: result.direction, stops: result.stops });
                            computeAndStoreRange(editor, undefined, result.direction, result.stops);
                            applyGradientToSelection(result.direction, result.stops);
                        }
                        const client = MatrixClientPeg.get();
                        if (!client) return;
                        const currentData = client.getAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE)?.getContent() ?? {};
                        await client.setAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE, {
                            ...currentData,
                            version: 1,
                            defaultStyle: result as MessageStyle | null,
                        });
                    }}
                    icon={<ColorIcon currentStyle={currentStyle} className="mx_FormattingButtons_Icon" />}
                />
            )}
        </div>
    );
}
