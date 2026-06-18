/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { type Call, CallEvent, type CallMediaState } from "../../../../models/Call";
import ActiveWidgetStore, { ActiveWidgetStoreEvent } from "../../../../stores/ActiveWidgetStore";
import PersistentApp from "../../elements/PersistentApp";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import { useActiveLocalCall } from "../../../../hooks/useActiveLocalCall";
import { RoomListCallControls } from "./RoomListCallControls";
import { CallAvatarRow } from "./CallAvatarRow";

const EMPTY_MEDIA_STATE: CallMediaState = { participants: [], anyVideo: false };

/**
 * The global call panel, pinned at the bottom of the room list. It is shown
 * exactly while this client is joined to a call (derived from MatrixRTC
 * membership, not the widget connection state). Above a native control bar it
 * shows either a compact row of speaking-aware participant avatars (audio-only)
 * or — when someone shares their camera/screen and the call isn't already
 * on-screen in its own room — the live call widget reparented into the panel.
 */
export const RoomListCallPanel: React.FC = (): JSX.Element | null => {
    const client = useMatrixClientContext();
    const call = useActiveLocalCall(client);

    if (!call) return null;
    return <RoomListCallPanelInner call={call} client={client} />;
};

interface InnerProps {
    call: Call;
    client: ReturnType<typeof useMatrixClientContext>;
}

const RoomListCallPanelInner: React.FC<InnerProps> = ({ call, client }: InnerProps): JSX.Element => {
    const [mediaState, setMediaState] = useState<CallMediaState>(() => call.mediaState ?? EMPTY_MEDIA_STATE);

    useEffect(() => {
        setMediaState(call.mediaState ?? EMPTY_MEDIA_STATE);
        const onMediaState = (state: CallMediaState): void => setMediaState(state);
        call.on(CallEvent.MediaState, onMediaState);
        return () => {
            call.off(CallEvent.MediaState, onMediaState);
        };
    }, [call]);

    // Track whether the call widget is currently docked elsewhere (i.e. the user
    // is viewing the call's own room). If so, we must not provide a second
    // placeholder for the single persisted iframe.
    const widgetId = call.widget.id;
    const roomId = call.roomId;
    const isDockedNow = useCallback(() => ActiveWidgetStore.instance.isDocked(widgetId, roomId), [widgetId, roomId]);
    const [docked, setDocked] = useState<boolean>(isDockedNow);
    useEffect(() => {
        const update = (): void => setDocked(isDockedNow());
        update();
        ActiveWidgetStore.instance.on(ActiveWidgetStoreEvent.Dock, update);
        ActiveWidgetStore.instance.on(ActiveWidgetStoreEvent.Undock, update);
        ActiveWidgetStore.instance.on(ActiveWidgetStoreEvent.Persistence, update);
        return () => {
            ActiveWidgetStore.instance.off(ActiveWidgetStoreEvent.Dock, update);
            ActiveWidgetStore.instance.off(ActiveWidgetStoreEvent.Undock, update);
            ActiveWidgetStore.instance.off(ActiveWidgetStoreEvent.Persistence, update);
        };
    }, [isDockedNow]);

    const showIframe = mediaState.anyVideo && !docked;

    // The single persisted iframe is repositioned over whichever placeholder is
    // mounted; call this whenever our media region appears or resizes.
    const movePersistedElement = useRef<() => void>(null);
    const videoRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (!showIframe) return;
        movePersistedElement.current?.();
        const node = videoRef.current;
        if (!node || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => movePersistedElement.current?.());
        observer.observe(node);
        return () => observer.disconnect();
    }, [showIframe]);

    const room = client.getRoom(roomId);

    return (
        <div className="mx_RoomListCallPanel">
            <div className="mx_RoomListCallPanel_media">
                {showIframe ? (
                    <div className="mx_RoomListCallPanel_video" ref={videoRef}>
                        <PersistentApp
                            persistentWidgetId={widgetId}
                            persistentRoomId={roomId}
                            movePersistedElement={movePersistedElement}
                        />
                    </div>
                ) : (
                    <CallAvatarRow participants={mediaState.participants} room={room} />
                )}
            </div>
            <RoomListCallControls call={call} />
        </div>
    );
};
