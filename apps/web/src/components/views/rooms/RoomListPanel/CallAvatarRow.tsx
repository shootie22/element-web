/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { type RoomMember } from "matrix-js-sdk/src/matrix";

import MemberAvatar from "../../avatars/MemberAvatar";
import { type CallMediaParticipant } from "../../../../models/Call";

export interface CallParticipantSlot {
    userId: string;
    deviceId: string;
}

interface Props {
    participants: CallMediaParticipant[];
    callParticipants: Map<RoomMember, Set<string>>;
    participantOrder: CallParticipantSlot[];
}

const MAX_VISIBLE = 6;
const AVATAR_SIZE = "32px";
const getParticipantSlotKey = (userId: string, deviceId: string): string =>
    `${userId}\u0000${deviceId}`;

/**
 * A compact, Discord-style row of circular participant avatars for the global
 * call panel. Each avatar shows a ring that brightens while that participant is
 * speaking.
 */
export const CallAvatarRow: React.FC<Props> = ({
    participants,
    callParticipants,
    participantOrder,
}: Props): JSX.Element | null => {
    const memberByUserId = new Map(
        [...callParticipants.keys()].map((member) => [member.userId, member]),
    );
    const mediaBySlot = new Map(
        participants.map((participant) => [
            getParticipantSlotKey(participant.userId, participant.deviceId),
            participant,
        ]),
    );
    const mediaByUserId = new Map(
        participants.map((participant) => [participant.userId, participant]),
    );
    const rowParticipants = participantOrder.flatMap(({ userId, deviceId }) => {
        const member = memberByUserId.get(userId);
        if (!member) return [];

        const mediaParticipant =
            mediaBySlot.get(getParticipantSlotKey(userId, deviceId)) ??
            mediaByUserId.get(userId);
        return [
            {
                userId,
                deviceId,
                displayName: mediaParticipant?.displayName || member.name,
                speaking: mediaParticipant?.speaking ?? false,
                sharingCamera: mediaParticipant?.sharingCamera ?? false,
                sharingScreen: mediaParticipant?.sharingScreen ?? false,
                local: mediaParticipant?.local ?? false,
            },
        ];
    });

    if (rowParticipants.length === 0) return null;

    const visible = rowParticipants.slice(0, MAX_VISIBLE);
    const overflow = rowParticipants.length - visible.length;

    return (
        <div className="mx_CallAvatarRow">
            {visible.map((p) => {
                const member = memberByUserId.get(p.userId) ?? null;
                return (
                    <span
                        key={getParticipantSlotKey(p.userId, p.deviceId)}
                        className="mx_CallAvatarRow_avatar"
                        data-speaking={p.speaking}
                    >
                        <MemberAvatar
                            member={member}
                            fallbackUserId={p.userId}
                            title={p.displayName || member?.name}
                            size={AVATAR_SIZE}
                        />
                    </span>
                );
            })}
            {overflow > 0 && (
                <span className="mx_CallAvatarRow_overflow">{`+${overflow}`}</span>
            )}
        </div>
    );
};
