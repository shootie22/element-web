/*
Copyright 2026 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import { _t } from "../../../../../languageHandler";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import SettingsFlag from "../../../elements/SettingsFlag";
import { SettingsSection } from "../../shared/SettingsSection";
import { SettingsSubsection } from "../../shared/SettingsSubsection";
import SettingsTab from "../SettingsTab";

export default function TweaksUserSettingsTab(): React.ReactNode {
    return (
        <SettingsTab data-testid="mx_TweaksUserSettingsTab">
            <SettingsSection>
                <SettingsSubsection heading={_t("settings|tweaks|emoji_stickers_heading")} formWrap>
                    <SettingsFlag name="MessageComposerInput.showStickersButton" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.accentEmojiStickerButtons" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.resizableEmojiStickerPickers" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag
                        name="Tweaks.mixCustomEmojisWithFrequentlyUsed"
                        level={SettingLevel.ACCOUNT}
                    />
                </SettingsSubsection>

                <SettingsSubsection heading={_t("settings|tweaks|animated_media_heading")} formWrap>
                    <SettingsFlag name="Tweaks.playAnimatedReactionImagesOnHover" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.playAnimatedStickersOnHover" level={SettingLevel.ACCOUNT} />
                </SettingsSubsection>

                <SettingsSubsection heading={_t("settings|tweaks|composer_heading")} formWrap>
                    <SettingsFlag name="Tweaks.enableColoredMessages" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="MessageComposerInput.insertTrailingColon" level={SettingLevel.ACCOUNT} />
                </SettingsSubsection>

                <SettingsSubsection heading={_t("settings|tweaks|reactions_heading")} formWrap>
                    <SettingsFlag name="Tweaks.animateReactionEntries" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.animateReactionCountChanges" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.showQuickReactionsOnHover" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.showQuickReactionsOnContextMenu" level={SettingLevel.ACCOUNT} />
                </SettingsSubsection>

                <SettingsSubsection heading={_t("settings|tweaks|timeline_heading")} formWrap>
                    <SettingsFlag name="Tweaks.animateMessageEntries" level={SettingLevel.ACCOUNT} />
                    <SettingsFlag name="Tweaks.useLegacyTypingIndicator" level={SettingLevel.ACCOUNT} />
                </SettingsSubsection>

                <SettingsSubsection heading={_t("settings|tweaks|calls_heading")} formWrap>
                    <SettingsFlag name="Tweaks.startWithCameraMuted" level={SettingLevel.ACCOUNT} />
                </SettingsSubsection>

                <SettingsSubsection heading={_t("settings|tweaks|room_list_heading")} formWrap>
                    <SettingsFlag name="Tweaks.showRoomListFilters" level={SettingLevel.ACCOUNT} />
                </SettingsSubsection>
            </SettingsSection>
        </SettingsTab>
    );
}
