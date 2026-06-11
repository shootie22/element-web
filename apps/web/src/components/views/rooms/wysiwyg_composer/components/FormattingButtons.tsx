/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type MouseEventHandler, type ReactNode, type SVGProps } from "react";
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
import { storeRange } from "../hooks/useColorPersistence";
import SettingsStore from "../../../../../settings/SettingsStore";
import { MatrixClientPeg } from "../../../../../MatrixClientPeg";
import {
    MESSAGE_STYLE_ACCOUNT_DATA_TYPE,
    type MessageStyle,
} from "../../../../../@types/message_style.ts";

interface ButtonProps {
    icon: ReactNode;
    actionState: ActionState;
    onClick: MouseEventHandler<HTMLButtonElement>;
    label: string;
    keyCombo?: KeyCombo;
}

function ColorIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
    );
}

function StyleIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M4 17L8 5H10L14 17M6 13H12M16 5H20V17H16V5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
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
    color?: string,
    direction?: "left-to-right" | "top-to-bottom" | "diagonal-down" | "diagonal-up",
    stops?: { color: string; position: number }[],
): void {
    const editor = document.querySelector<HTMLElement>("[contenteditable]");
    if (!editor) return;
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(editor);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + range.toString().length;
    storeRange({ startOffset, endOffset, color, direction, stops });
}

interface FormattingButtonsProps {
    composer: FormattingFunctions;
    actionStates: AllActionStates;
    /**
     * Whether all buttons should be disabled
     */
    disabled?: boolean;
}

export function FormattingButtons({ composer, actionStates, disabled }: FormattingButtonsProps): JSX.Element {
    const composerContext = useComposerContext();
    const isInList = actionStates.unorderedList === "reversed" || actionStates.orderedList === "reversed";
    const enableColoredMessages = SettingsStore.getValue("Tweaks.enableColoredMessages");
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
                        const result = await openColorPicker("solid");
                        if (!result) return;
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        await setSelection(composerContext.selection);
                        document.querySelector<HTMLElement>("[contenteditable]")?.focus();
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        if (result.kind === "solid") {
                            computeAndStoreRange(result.color);
                            applySolidColorToSelection(result.color);
                        } else {
                            computeAndStoreRange(undefined, result.direction, result.stops);
                            applyGradientToSelection(result.direction, result.stops);
                        }
                    }}
                    icon={<ColorIcon className="mx_FormattingButtons_Icon" />}
                />
            )}
            {enableColoredMessages && (
                <Button
                    actionState={disabled ? "disabled" : "enabled"}
                    label={_t("composer|color_picker|default_style")}
                    onClick={async () => {
                        const result = await openColorPicker("gradient");
                        if (!result) return;
                        const client = MatrixClientPeg.get();
                        if (!client) return;
                        const currentData = client.getAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE)?.getContent() ?? {};
                        await client.setAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE, {
                            ...currentData,
                            version: 1,
                            defaultStyle: result as MessageStyle | null,
                        });
                    }}
                    icon={<StyleIcon className="mx_FormattingButtons_Icon" />}
                />
            )}
        </div>
    );
}
