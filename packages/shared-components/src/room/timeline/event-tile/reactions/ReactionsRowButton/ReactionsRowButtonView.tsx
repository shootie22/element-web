/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type HTMLAttributes, type JSX, useEffect, useRef, useState } from "react";
import classNames from "classnames";

import { type ViewModel, useViewModel } from "../../../../../core/viewmodel";
import { ReactionsRowButtonTooltipView, type ReactionsRowButtonTooltipViewModel } from "../ReactionsRowButtonTooltip";
import styles from "./ReactionsRowButton.module.css";

export interface ReactionsRowButtonViewSnapshot extends Pick<
    HTMLAttributes<HTMLButtonElement>,
    "className" | "aria-label"
> {
    /**
     * The reaction content to display when not using a custom image.
     */
    content?: string;
    /**
     * The total number of reactions for this content.
     */
    count: number;
    /**
     * Whether the reaction button is selected by the current user.
     */
    isSelected: boolean;
    /**
     * Whether the reaction button is disabled.
     * @default false
     */
    isDisabled?: boolean;
    /**
     * Whether the reaction button is being removed.
     */
    isExiting?: boolean;
    /**
     * The image URL to render when using a custom reaction image.
     */
    imageSrc?: string;
    /**
     * Optional image URL to swap to while hovered, used for animated previews.
     */
    imageHoverSrc?: string;
    /**
     * The alt text for the custom reaction image.
     */
    imageAlt?: string;
    /**
     * Whether the button should play its entry animation.
     */
    animateEntry?: boolean;
    /**
     * Whether the count should roll when it changes.
     */
    animateCountChanges?: boolean;
    /**
     * View model for the tooltip wrapper.
     */
    tooltipVm: ReactionsRowButtonTooltipViewModel;
}

export interface ReactionsRowButtonViewActions {
    /**
     * Called when the user activates the reaction button.
     */
    onClick: () => void;
}

export type ReactionsRowButtonViewModel = ViewModel<ReactionsRowButtonViewSnapshot> & ReactionsRowButtonViewActions;

interface ReactionsRowButtonViewProps {
    /**
     * The view model for the reactions row button.
     */
    vm: ReactionsRowButtonViewModel;
}

/**
 * Renders a single reaction button within a reactions row.
 *
 * The button supports text or image reactions, selected and disabled
 * styling, and wraps its content in the reactions tooltip view.
 */
export function ReactionsRowButtonView({ vm }: Readonly<ReactionsRowButtonViewProps>): JSX.Element {
    const snapshot = useViewModel(vm) as ReactionsRowButtonViewSnapshot & { ariaLabel?: string };
    const { content, count, className, isSelected, isDisabled, imageSrc, imageHoverSrc, imageAlt, tooltipVm } =
        snapshot;
    const [isImageHovered, setIsImageHovered] = useState(false);
    const previousCountRef = useRef(count);
    const [countAnimation, setCountAnimation] = useState<"increment" | "decrement" | undefined>();
    const animateEntry = snapshot.animateEntry !== false;
    const animateCountChanges = snapshot.animateCountChanges !== false;
    const ariaLabel = snapshot["aria-label"] ?? snapshot.ariaLabel;
    const ariaDisabled = isDisabled ? true : undefined;
    const classes = classNames(className, styles.reactionsRowButton, {
        [styles.reactionsRowButtonSelected]: isSelected,
        [styles.reactionsRowButtonDisabled]: isDisabled,
        [styles.reactionsRowButtonExit]: snapshot.isExiting,
        [styles.reactionsRowButtonCountIncremented]: countAnimation === "increment",
        [styles.reactionsRowButtonCountDecremented]: countAnimation === "decrement",
    });

    useEffect(() => {
        if (!animateCountChanges) {
            setCountAnimation(undefined);
            previousCountRef.current = count;
            return;
        }

        const previousCount = previousCountRef.current;
        previousCountRef.current = count;

        if (previousCount === count) return;

        setCountAnimation(count > previousCount ? "increment" : "decrement");
        const timeout = window.setTimeout(() => {
            setCountAnimation(undefined);
        }, 220);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [animateCountChanges, count]);

    const reactionContent = imageSrc ? (
        <img
            className={styles.reactionsRowButtonContent}
            alt={imageAlt ?? ""}
            src={isImageHovered && imageHoverSrc ? imageHoverSrc : imageSrc}
            width="16"
            height="16"
        />
    ) : (
        <span className={styles.reactionsRowButtonContent} aria-hidden="true">
            {content ?? ""}
        </span>
    );

    return (
        <ReactionsRowButtonTooltipView vm={tooltipVm}>
            <button
                type="button"
                className={classNames(classes, {
                    [styles.reactionsRowButtonEnter]: animateEntry && !snapshot.isExiting,
                })}
                tabIndex={0}
                aria-label={ariaLabel}
                aria-disabled={ariaDisabled}
                onClick={isDisabled ? undefined : vm.onClick}
                onMouseEnter={imageHoverSrc ? () => setIsImageHovered(true) : undefined}
                onMouseLeave={imageHoverSrc ? () => setIsImageHovered(false) : undefined}
                onFocus={imageHoverSrc ? () => setIsImageHovered(true) : undefined}
                onBlur={imageHoverSrc ? () => setIsImageHovered(false) : undefined}
            >
                {reactionContent}
                <span className={styles.reactionsRowButtonCount} aria-hidden="true" key={count}>
                    {count}
                </span>
            </button>
        </ReactionsRowButtonTooltipView>
    );
}
