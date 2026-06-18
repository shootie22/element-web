/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { type RoomMember } from "matrix-js-sdk/src/matrix";

import { type Call, CallEvent, type CallMediaState } from "../../../../models/Call";
import ActiveWidgetStore, { ActiveWidgetStoreEvent } from "../../../../stores/ActiveWidgetStore";
import PersistentApp from "../../elements/PersistentApp";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import { useActiveLocalCall } from "../../../../hooks/useActiveLocalCall";
import { useSettingValue } from "../../../../hooks/useSettings";
import { RoomListCallControls } from "./RoomListCallControls";
import { CallAvatarRow, type CallParticipantSlot } from "./CallAvatarRow";

const EMPTY_MEDIA_STATE: CallMediaState = { participants: [], anyVideo: false };

const getParticipantSlots = (participants: Map<RoomMember, Set<string>>): CallParticipantSlot[] =>
    [...participants.entries()].flatMap(([member, devices]) => {
        const deviceIds = devices.size > 0 ? [...devices] : [""];
        return deviceIds.map((deviceId) => ({
            userId: member.userId,
            deviceId,
        }));
    });

const getParticipantSlotKey = ({ userId, deviceId }: CallParticipantSlot): string => `${userId}\u0000${deviceId}`;

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
    return <RoomListCallPanelInner call={call} />;
};

interface InnerProps {
    call: Call;
}

const RoomListCallPanelInner: React.FC<InnerProps> = ({ call }: InnerProps): JSX.Element => {
    const [mediaState, setMediaState] = useState<CallMediaState>(() => call.mediaState ?? EMPTY_MEDIA_STATE);
    const [callParticipants, setCallParticipants] = useState<Map<RoomMember, Set<string>>>(() => call.participants);
    const [participantOrder, setParticipantOrder] = useState<CallParticipantSlot[]>(() =>
        getParticipantSlots(call.participants),
    );

    useEffect(() => {
        setMediaState(call.mediaState ?? EMPTY_MEDIA_STATE);
        const onMediaState = (state: CallMediaState): void => setMediaState(state);
        call.on(CallEvent.MediaState, onMediaState);
        return () => {
            call.off(CallEvent.MediaState, onMediaState);
        };
    }, [call]);

    useEffect(() => {
        setCallParticipants(call.participants);
        setParticipantOrder(getParticipantSlots(call.participants));
        const onParticipants = (participants: Map<RoomMember, Set<string>>): void => {
            setCallParticipants(participants);
            const nextSlots = getParticipantSlots(participants);
            const nextSlotKeys = new Set(nextSlots.map(getParticipantSlotKey));
            setParticipantOrder((current) => {
                const currentSlotKeys = new Set(current.map(getParticipantSlotKey));
                return [
                    ...current.filter((slot) => nextSlotKeys.has(getParticipantSlotKey(slot))),
                    ...nextSlots.filter((slot) => !currentSlotKeys.has(getParticipantSlotKey(slot))),
                ];
            });
        };
        call.on(CallEvent.Participants, onParticipants);
        return () => {
            call.off(CallEvent.Participants, onParticipants);
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

    const includeSelf = useSettingValue("Tweaks.callPanelShowOwnFeed");

    // Count the video feeds the panel would actually show (a participant can have
    // both a camera and a screenshare). Honour the "include own feed" setting.
    const feedCount = mediaState.participants.reduce((n, p) => {
        if (!includeSelf && p.local) return n;
        return n + (p.sharingCamera ? 1 : 0) + (p.sharingScreen ? 1 : 0);
    }, 0);

    // Host the single persisted call iframe in the panel whenever we're in the
    // call but not viewing its own room. Keeping a host mounted means the iframe
    // stays `display: block` (PersistedElement hides the iframe with
    // `display: none` when no host is mounted, which suspends its audio). We do
    // this even for audio-only calls — there we host it in a collapsed,
    // zero-height slot so audio keeps playing while nothing is shown. The
    // visible video region is only rendered when there are feeds to display.
    const hostIframe = !docked;
    const showVideo = hostIframe && feedCount > 0;

    // Keep the widget in feed-only mode the whole time we might host it (i.e.
    // whenever it isn't docked in its own room), not just once video appears.
    // This ensures the chrome-less view is already active before the iframe
    // becomes visible, avoiding a flash of the full widget UI. It flips back to
    // the full UI only when docked (the user is viewing the call's own room).
    useEffect(() => {
        const feedOnly = !docked;
        void call.setFeedOnly(feedOnly, includeSelf);
        return () => {
            void call.setFeedOnly(false, includeSelf);
        };
    }, [call, docked, includeSelf]);

    // Re-assert feed-only mode right as we're about to reveal the iframe, in case
    // the initial toggle was missed before the widget's action listener attached.
    useEffect(() => {
        if (hostIframe) void call.setFeedOnly(true, includeSelf);
    }, [hostIframe, call, includeSelf]);

    // The single persisted iframe is repositioned over whichever placeholder is
    // mounted; call this whenever our media region appears or resizes.
    const movePersistedElement = useRef<() => void>(null);
    const videoRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (!hostIframe) return;
        movePersistedElement.current?.();
        const node = videoRef.current;
        if (!node || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => movePersistedElement.current?.());
        observer.observe(node);
        return () => observer.disconnect();
    }, [hostIframe]);

    // Fade the iframe in once it's mounted: it starts hidden so the brief moment
    // before element-call switches to the chrome-less feed-only view is masked,
    // then smoothly appears.
    const [iframeVisible, setIframeVisible] = useState(false);
    useEffect(() => {
        if (!showVideo) {
            setIframeVisible(false);
            return;
        }
        setIframeVisible(false);
        const timer = window.setTimeout(() => setIframeVisible(true), 150);
        return () => window.clearTimeout(timer);
    }, [showVideo]);

    // Give each feed a 16:9 slot, stacked (capped so the panel can't grow without
    // bound); the widget fills the region with the stacked feeds.
    const slots = Math.min(Math.max(feedCount, 1), 3);
    const videoStyle: React.CSSProperties = {
        aspectRatio: `16 / ${9 * slots}`,
    };
    const persistedStyle: React.CSSProperties = {
        opacity: iframeVisible ? 1 : 0,
        transition: "opacity 250ms ease-out",
    };

    return (
        <div className="mx_RoomListCallPanel">
            <div className="mx_RoomListCallPanel_media">
                {hostIframe && (
                    <div
                        className={classNames("mx_RoomListCallPanel_video", {
                            "mx_RoomListCallPanel_video--audioOnly": !showVideo,
                        })}
                        ref={videoRef}
                        style={showVideo ? videoStyle : undefined}
                    >
                        <PersistentApp
                            persistentWidgetId={widgetId}
                            persistentRoomId={roomId}
                            movePersistedElement={movePersistedElement}
                            // When audio-only we still mount the iframe (so it keeps
                            // playing) but keep it fully transparent on top of the
                            // collapsed slot.
                            style={showVideo ? persistedStyle : { opacity: 0 }}
                        />
                    </div>
                )}
                <CallAvatarRow
                    participants={mediaState.participants}
                    callParticipants={callParticipants}
                    participantOrder={participantOrder}
                />
            </div>
            <RoomListCallControls call={call} />
        </div>
    );
};
