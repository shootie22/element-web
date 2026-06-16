/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    MicOffSolidIcon,
    MicOnSolidIcon,
    VideoCallOffSolidIcon,
    VideoCallSolidIcon,
    VolumeOffSolidIcon,
    VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { IconButton } from "@vector-im/compound-web";

import { _t } from "../../../../languageHandler";
import { CallStore, CallStoreEvent } from "../../../../stores/CallStore";
import { type Call } from "../../../../models/Call";

export const RoomListCallControls: React.FC = () => {
    const [connectedCalls, setConnectedCalls] = useState<Set<Call>>(() => new Set(CallStore.instance.connectedCalls));
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [deafened, setDeafened] = useState(false);

    useEffect(() => {
        const onConnectedCalls = (calls: Set<Call>): void => {
            setConnectedCalls(new Set(calls));
        };
        CallStore.instance.on(CallStoreEvent.ConnectedCalls, onConnectedCalls);
        return () => {
            CallStore.instance.off(CallStoreEvent.ConnectedCalls, onConnectedCalls);
        };
    }, []);

    const call = useMemo(() => [...connectedCalls][0], [connectedCalls]);

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

    if (!call) return null;

    return (
        <div className="mx_RoomListCallControls" aria-label={_t("action|call")}>
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
    );
};
