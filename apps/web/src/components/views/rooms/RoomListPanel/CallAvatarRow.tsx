/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import MemberAvatar from "../../avatars/MemberAvatar";
import { type CallMediaParticipant } from "../../../../models/Call";

interface Props {
    participants: CallMediaParticipant[];
    room: Room | null;
}

const MAX_VISIBLE = 6;
const AVATAR_SIZE = "32px";

/**
 * A compact, Discord-style row of circular participant avatars for the global
 * call panel. Each avatar shows a ring that brightens while that participant is
 * speaking.
 */
export const CallAvatarRow: React.FC<Props> = ({ participants, room }: Props): JSX.Element | null => {
    if (participants.length === 0) return null;

    // Speakers first so the most relevant avatars stay visible when overflowing.
    const ordered = [...participants].sort((a, b) => Number(b.speaking) - Number(a.speaking));
    const visible = ordered.slice(0, MAX_VISIBLE);
    const overflow = ordered.length - visible.length;

    return (
        <div className="mx_CallAvatarRow">
            {visible.map((p) => (
                <span key={`${p.userId}:${p.deviceId}`} className="mx_CallAvatarRow_avatar" data-speaking={p.speaking}>
                    <MemberAvatar
                        member={room?.getMember(p.userId) ?? null}
                        fallbackUserId={p.userId}
                        title={p.displayName}
                        size={AVATAR_SIZE}
                    />
                </span>
            ))}
            {overflow > 0 && <span className="mx_CallAvatarRow_overflow">{`+${overflow}`}</span>}
        </div>
    );
};
