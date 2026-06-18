/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import {
    BaseViewModel,
    type ReactionsRowButtonViewSnapshot,
    type ReactionsRowButtonViewModel as ReactionsRowButtonViewModelInterface,
} from "@element-hq/web-shared-components";

import { mediaFromMxc } from "../../../../../customisations/Media";
import { _t } from "../../../../../languageHandler";
import { formatList } from "../../../../../utils/FormattingUtils";
import SettingsStore from "../../../../../settings/SettingsStore";
import { ReactionsRowButtonTooltipViewModel } from "./ReactionsRowButtonTooltipViewModel";
import { REACTION_SHORTCODE_KEY } from "./reactionShortcode";
import { toggleOwnReaction } from "./toggleOwnReaction";

export interface ReactionsRowButtonViewModelProps {
    /**
     * The Matrix client instance.
     */
    client: MatrixClient;
    /**
     * The event we're displaying reactions for.
     */
    mxEvent: MatrixEvent;
    /**
     * The reaction content / key / emoji.
     */
    content: string;
    /**
     * The count of votes for this key.
     */
    count: number;
    /**
     * The CSS class name.
     */
    className?: string;
    /**
     * A list of Matrix reaction events for this key.
     */
    reactionEvents: MatrixEvent[];
    /**
     * A possible Matrix event if the current user has voted for this type.
     */
    myReactionEvent?: MatrixEvent;
    /**
     * Whether to prevent quick-reactions by clicking on this reaction.
     */
    disabled?: boolean;
    /**
     * Whether the reaction button is being removed.
     */
    isExiting?: boolean;
    /**
     * Whether to render custom image reactions.
     */
    customReactionImagesEnabled?: boolean;
    /**
     * Whether to animate newly added reaction buttons.
     */
    animateReactionEntries?: boolean;
    /**
     * Whether to animate changes to the reaction count.
     */
    animateReactionCountChanges?: boolean;
    /**
     * Whether animated reaction images should only play while hovered.
     */
    playAnimatedReactionImagesOnHover?: boolean;
}

export class ReactionsRowButtonViewModel
    extends BaseViewModel<ReactionsRowButtonViewSnapshot, ReactionsRowButtonViewModelProps>
    implements ReactionsRowButtonViewModelInterface
{
    private readonly tooltipVm: ReactionsRowButtonTooltipViewModel;
    private static readonly getAriaLabel = (snapshot: ReactionsRowButtonViewSnapshot): string | undefined =>
        (snapshot as ReactionsRowButtonViewSnapshot & { ariaLabel?: string }).ariaLabel;

    private static readonly computeSnapshot = (
        props: ReactionsRowButtonViewModelProps,
        tooltipVm: ReactionsRowButtonTooltipViewModel,
    ): ReactionsRowButtonViewSnapshot => {
        const {
            client,
            mxEvent,
            content,
            count,
            className,
            reactionEvents,
            myReactionEvent,
            disabled,
            isExiting,
            customReactionImagesEnabled,
            animateReactionEntries,
            animateReactionCountChanges,
            playAnimatedReactionImagesOnHover,
        } = props;

        const room = client.getRoom(mxEvent.getRoomId());
        let ariaLabel: string | undefined;
        let customReactionName: string | undefined;

        if (room) {
            const senders: string[] = [];
            for (const reactionEvent of reactionEvents) {
                const member = room.getMember(reactionEvent.getSender()!);
                senders.push(member?.name || reactionEvent.getSender()!);
                customReactionName =
                    (customReactionImagesEnabled && REACTION_SHORTCODE_KEY.findIn(reactionEvent.getContent())) ||
                    undefined;
            }

            const reactors = formatList(senders, 6);
            if (content) {
                ariaLabel = _t("timeline|reactions|label", {
                    reactors,
                    content: customReactionName || content,
                });
            } else {
                ariaLabel = reactors;
            }
        }

        let imageSrc: string | undefined;
        let imageHoverSrc: string | undefined;
        let imageAlt: string | undefined;
        if (customReactionImagesEnabled && content.startsWith("mxc://")) {
            const media = mediaFromMxc(content);
            const src = media.srcHttp ?? undefined;
            const thumbnail = media.getThumbnailOfSourceHttp(32, 32) ?? undefined;
            const autoplayGifs = SettingsStore.getValue("autoplayGifs") as boolean;
            const resolved = playAnimatedReactionImagesOnHover
                ? (thumbnail ?? src)
                : autoplayGifs
                  ? src
                  : (thumbnail ?? src);
            if (resolved) {
                imageSrc = resolved;
                imageHoverSrc = src && src !== resolved ? src : undefined;
                imageAlt = customReactionName || _t("timeline|reactions|custom_reaction_fallback_label");
            }
        }

        const snapshot = {
            content,
            count,
            className,
            ariaLabel,
            isSelected: !!myReactionEvent,
            isDisabled: !!disabled,
            isExiting: !!isExiting,
            imageSrc,
            imageHoverSrc,
            imageAlt,
            tooltipVm,
            animateEntry: animateReactionEntries,
            animateCountChanges: animateReactionCountChanges,
        };

        return snapshot;
    };

    public constructor(props: ReactionsRowButtonViewModelProps) {
        const tooltipVm = new ReactionsRowButtonTooltipViewModel({
            client: props.client,
            mxEvent: props.mxEvent,
            content: props.content,
            reactionEvents: props.reactionEvents,
            customReactionImagesEnabled: props.customReactionImagesEnabled,
        });
        super(props, ReactionsRowButtonViewModel.computeSnapshot(props, tooltipVm));
        this.tooltipVm = tooltipVm;
        this.disposables.track(tooltipVm);
        const autoplayGifsWatcherRef = SettingsStore.watchSetting("autoplayGifs", null, () => {
            this.setSnapshot(ReactionsRowButtonViewModel.computeSnapshot(this.props, this.tooltipVm));
        });
        this.disposables.track(() => SettingsStore.unwatchSetting(autoplayGifsWatcherRef));
    }

    private setSnapshot(nextSnapshot: ReactionsRowButtonViewSnapshot): void {
        const currentSnapshot = this.snapshot.current;

        if (
            nextSnapshot.content === currentSnapshot.content &&
            nextSnapshot.count === currentSnapshot.count &&
            ReactionsRowButtonViewModel.getAriaLabel(nextSnapshot) ===
                ReactionsRowButtonViewModel.getAriaLabel(currentSnapshot) &&
            nextSnapshot.isSelected === currentSnapshot.isSelected &&
            nextSnapshot.isDisabled === currentSnapshot.isDisabled &&
            nextSnapshot.isExiting === currentSnapshot.isExiting &&
            nextSnapshot.imageSrc === currentSnapshot.imageSrc &&
            nextSnapshot.imageHoverSrc === currentSnapshot.imageHoverSrc &&
            nextSnapshot.imageAlt === currentSnapshot.imageAlt &&
            nextSnapshot.animateEntry === currentSnapshot.animateEntry &&
            nextSnapshot.animateCountChanges === currentSnapshot.animateCountChanges
        ) {
            return;
        }

        this.snapshot.set(nextSnapshot);
    }

    public setReactionData(
        content: string,
        reactionEvents: MatrixEvent[],
        customReactionImagesEnabled?: boolean,
        isExiting?: boolean,
        animateReactionEntries?: boolean,
        animateReactionCountChanges?: boolean,
        playAnimatedReactionImagesOnHover?: boolean,
    ): void {
        this.props = {
            ...this.props,
            content,
            reactionEvents,
            customReactionImagesEnabled,
            isExiting,
            animateReactionEntries,
            animateReactionCountChanges,
            playAnimatedReactionImagesOnHover,
        };

        this.tooltipVm.setProps({ content, reactionEvents, customReactionImagesEnabled });
        this.setSnapshot(ReactionsRowButtonViewModel.computeSnapshot(this.props, this.tooltipVm));
    }

    public setCount(count: number): void {
        this.props = { ...this.props, count };
        this.snapshot.merge({ count });
    }

    public setMyReactionEvent(myReactionEvent?: MatrixEvent): void {
        this.props = { ...this.props, myReactionEvent };
        this.snapshot.merge({ isSelected: !!myReactionEvent });
    }

    public setDisabled(disabled?: boolean): void {
        this.props = { ...this.props, disabled };
        this.snapshot.merge({ isDisabled: !!disabled });
    }

    public onClick = (): void => {
        const { client, mxEvent, myReactionEvent, content, disabled } = this.props;
        if (disabled) return;

        toggleOwnReaction({
            client,
            mxEvent,
            reaction: content,
            myReactionEvent,
            canSelfRedact: true,
        });
    };
}
