/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useCallback, useEffect, useState } from "react";
import {
    ChevronLeftIcon,
    EndCallIcon,
    MicOffSolidIcon,
    MicOnSolidIcon,
    VideoCallOffSolidIcon,
    VideoCallSolidIcon,
    VolumeOffSolidIcon,
    VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { IconButton } from "@vector-im/compound-web";

import { _t } from "../../../../languageHandler";
import { type Call, CallEvent } from "../../../../models/Call";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import defaultDispatcher from "../../../../dispatcher/dispatcher";
import { Action } from "../../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../../dispatcher/payloads/ViewRoomPayload";

interface Props {
    /** The active connected call this control bar drives. */
    call: Call;
}

export const RoomListCallControls: React.FC<Props> = ({ call }: Props) => {
    const client = useMatrixClientContext();
    const [audioEnabled, setAudioEnabled] = useState(call.audioEnabled);
    const [videoEnabled, setVideoEnabled] = useState(call.videoEnabled);
    const [deafened, setDeafened] = useState(call.deafened);

    // Sync states from the Call model whenever the active call changes
    useEffect(() => {
        setAudioEnabled(call.audioEnabled);
        setVideoEnabled(call.videoEnabled);
        setDeafened(call.deafened);
    }, [call]);

    // Subscribe to device mute events from the active call
    useEffect(() => {
        if (!call) return;
        const onDeviceMute = (): void => {
            setAudioEnabled(call.audioEnabled);
            setVideoEnabled(call.videoEnabled);
        };
        const onDeafen = (): void => {
            setDeafened(call.deafened);
        };
        call.on(CallEvent.DeviceMute, onDeviceMute);
        call.on(CallEvent.Deafen, onDeafen);
        return () => {
            call.off(CallEvent.DeviceMute, onDeviceMute);
            call.off(CallEvent.Deafen, onDeafen);
        };
    }, [call]);

    const room = call ? client.getRoom(call.roomId) : null;
    const roomName = room?.name ?? call?.roomId ?? "";

    const setDeviceMute = useCallback(
        async (state: { audio_enabled?: boolean; video_enabled?: boolean }): Promise<void> => {
            await call?.setDeviceMuteState(state);
        },
        [call],
    );

    const onAudioClick = useCallback(() => {
        const next = !audioEnabled;
        setAudioEnabled(next);
        void setDeviceMute({ audio_enabled: next }).catch(() => setAudioEnabled(!next));
    }, [audioEnabled, setDeviceMute]);

    const onVideoClick = useCallback(() => {
        const next = !videoEnabled;
        setVideoEnabled(next);
        void setDeviceMute({ video_enabled: next }).catch(() => setVideoEnabled(!next));
    }, [setDeviceMute, videoEnabled]);

    const onDeafenClick = useCallback(() => {
        const next = !deafened;
        setDeafened(next);
        void call?.setDeafened(next).catch(() => setDeafened(!next));
    }, [call, deafened]);

    const onNavigateToRoom = useCallback(() => {
        if (!call) return;
        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: call.roomId,
            view_call: true,
            metricsTrigger: "WebFloatingCallWindow",
        });
    }, [call]);

    const onDisconnect = useCallback(async () => {
        if (!call) return;
        try {
            await call.disconnect();
        } catch {
            // If disconnect fails (e.g. the widget iframe is already dead),
            // force the call to be destroyed so the UI updates immediately.
            call.destroy();
        }
    }, [call]);

    if (!call) return null;

    return (
        <div className="mx_RoomListCallControls" aria-label={_t("action|call")}>
            <div className="mx_RoomListCallControls_left">
                <IconButton size="32px" kind="secondary" onClick={onNavigateToRoom} tooltip={_t("voip|expand")}>
                    <ChevronLeftIcon />
                </IconButton>
                <span className="mx_RoomListCallControls_roomName">{roomName}</span>
            </div>
            <div className="mx_RoomListCallControls_center">
                <IconButton
                    size="32px"
                    kind={audioEnabled ? "secondary" : "primary"}
                    onClick={onAudioClick}
                    tooltip={audioEnabled ? _t("voip|disable_microphone") : _t("voip|enable_microphone")}
                    aria-pressed={!audioEnabled}
                >
                    {audioEnabled ? <MicOnSolidIcon /> : <MicOffSolidIcon />}
                </IconButton>
                <IconButton
                    size="32px"
                    kind={videoEnabled ? "secondary" : "primary"}
                    onClick={onVideoClick}
                    tooltip={videoEnabled ? _t("voip|disable_camera") : _t("voip|enable_camera")}
                    aria-pressed={!videoEnabled}
                >
                    {videoEnabled ? <VideoCallSolidIcon /> : <VideoCallOffSolidIcon />}
                </IconButton>
                <IconButton
                    size="32px"
                    kind={deafened ? "primary" : "secondary"}
                    onClick={onDeafenClick}
                    tooltip={deafened ? _t("common|unmute") : _t("common|mute")}
                    aria-pressed={deafened}
                >
                    {deafened ? <VolumeOffSolidIcon /> : <VolumeOnSolidIcon />}
                </IconButton>
            </div>
            <div className="mx_RoomListCallControls_right">
                <IconButton size="32px" kind="primary" onClick={onDisconnect} tooltip={_t("voip|hangup")}>
                    <EndCallIcon />
                </IconButton>
            </div>
        </div>
    );
};
