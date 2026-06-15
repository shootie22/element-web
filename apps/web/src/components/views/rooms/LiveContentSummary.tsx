/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type FC } from "react";
import { VideoCallSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import MemberAvatar from "../avatars/MemberAvatar";
import type { RoomMember } from "matrix-js-sdk/src/matrix";

export enum LiveContentType {
    Video,
}

interface Props {
    type: LiveContentType;
    text: string;
    active: boolean;
    participantCount: number;
    participants?: RoomMember[];
}

const MAX_VISIBLE = 4;

/**
 * Summary line used to call out live, interactive content such as calls.
 */
export const LiveContentSummary: FC<Props> = ({ text, active, participantCount, participants }) => {
    if (!active || !participants || participants.length === 0) {
        return (
            <span className="mx_LiveContentSummary">
                <span className="mx_LiveContentSummary_text mx_LiveContentSummary_text_active">
                    <VideoCallSolidIcon />
                    {text}
                </span>
            </span>
        );
    }

    const visible = participants.slice(0, MAX_VISIBLE);
    const remaining = participants.length - MAX_VISIBLE;

    return (
        <span className="mx_LiveContentSummary">
            <span className="mx_LiveContentSummary_avatars">
                {visible.map((member) => (
                    <MemberAvatar key={member.userId} member={member} size="18px" />
                ))}
                {remaining > 0 && <span className="mx_LiveContentSummary_overflow">+{remaining}</span>}
            </span>
        </span>
    );
};
