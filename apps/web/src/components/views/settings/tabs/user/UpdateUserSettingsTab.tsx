/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import { _t } from "../../../../../languageHandler";
import { SettingsSection } from "../../shared/SettingsSection";
import { SettingsSubsection } from "../../shared/SettingsSubsection";
import SettingsTab from "../SettingsTab";
import UpdatePanel from "../../UpdatePanel";

export default function UpdateUserSettingsTab(): React.ReactNode {
    return (
        <SettingsTab data-testid="mx_UpdateUserSettingsTab">
            <SettingsSection heading={_t("update|panel_heading")}>
                <SettingsSubsection>
                    <UpdatePanel />
                </SettingsSubsection>
            </SettingsSection>
        </SettingsTab>
    );
}
