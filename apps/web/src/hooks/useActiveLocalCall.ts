/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import {
    type MatrixRTCSession,
    MatrixRTCSessionEvent,
    MatrixRTCSessionManagerEvents,
} from "matrix-js-sdk/src/matrixrtc";

import { type Call } from "../models/Call";
import { CallStore, CallStoreEvent } from "../stores/CallStore";

/**
 * Finds the room in which this very client (user + device) is currently an
 * active member of the MatrixRTC session, if any.
 *
 * This is the ground truth for "am I in a call": it is derived from the call
 * membership room state (which the Element Call widget publishes and the client
 * tracks), independent of any transient widget action or the call widget's
 * connection state. That makes it far more reliable than gating on
 * {@link CallStore.connectedCalls}, which only updates when the widget happens
 * to deliver its `io.element.join` action in time.
 */
function findLocalCallRoomId(client: MatrixClient): string | null {
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (!userId || !deviceId) return null;

    for (const room of client.getRooms()) {
        const session = client.matrixRTC.getActiveRoomSession(room);
        if (!session) continue;
        if (session.memberships.some((m) => m.sender === userId && m.deviceId === deviceId)) {
            return room.roomId;
        }
    }
    return null;
}

/**
 * Returns the {@link Call} for the room this client is currently joined to via
 * MatrixRTC, or null when not in a call. Updates as the local membership and the
 * tracked call change, so consumers (e.g. the global call panel) can show/hide
 * themselves reliably.
 */
export function useActiveLocalCall(client: MatrixClient): Call | null {
    const [call, setCall] = useState<Call | null>(null);

    useEffect(() => {
        const attached = new Set<MatrixRTCSession>();

        const recompute = (): void => {
            const roomId = findLocalCallRoomId(client);
            setCall(roomId ? CallStore.instance.getCall(roomId) : null);
        };

        const attach = (session: MatrixRTCSession): void => {
            if (attached.has(session)) return;
            attached.add(session);
            session.on(MatrixRTCSessionEvent.MembershipsChanged, recompute);
        };

        const onSessionStarted = (_roomId: string, session: MatrixRTCSession): void => {
            attach(session);
            recompute();
        };
        const onSessionEnded = (_roomId: string, session: MatrixRTCSession): void => {
            session.off(MatrixRTCSessionEvent.MembershipsChanged, recompute);
            attached.delete(session);
            recompute();
        };

        // Attach to sessions that are already active when we mount.
        for (const room of client.getRooms()) {
            const session = client.matrixRTC.getActiveRoomSession(room);
            if (session) attach(session);
        }

        client.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, onSessionStarted);
        client.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, onSessionEnded);
        // Re-resolve the Call object once CallStore (re)tracks the room, so we
        // pick up the call even if its tracking lands after the membership does.
        CallStore.instance.on(CallStoreEvent.Call, recompute);
        recompute();

        return () => {
            client.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, onSessionStarted);
            client.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, onSessionEnded);
            CallStore.instance.off(CallStoreEvent.Call, recompute);
            for (const session of attached) session.off(MatrixRTCSessionEvent.MembershipsChanged, recompute);
            attached.clear();
        };
    }, [client]);

    return call;
}
