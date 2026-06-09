/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useState } from "react";
import { ClientEvent, RoomStateEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { getFavoriteImagePackRoomIds, isImagePackEventType } from "../image-packs";
import { useTypedEventEmitter } from "./useEventEmitter";

export function useImagePackUpdate(client?: MatrixClient): number {
    const [version, setVersion] = useState(0);
    const bump = useCallback((): void => setVersion((current) => current + 1), []);
    const onImagePackEvent = useCallback(
        (event: MatrixEvent): void => {
            if (isImagePackEventType(event.getType())) {
                bump();
            }
        },
        [bump],
    );
    const onRoom = useCallback(
        (room: Room): void => {
            if (client && getFavoriteImagePackRoomIds(client).includes(room.roomId)) {
                bump();
            }
        },
        [bump, client],
    );

    useTypedEventEmitter(client, ClientEvent.AccountData, onImagePackEvent);
    useTypedEventEmitter(client, RoomStateEvent.Events, onImagePackEvent);
    useTypedEventEmitter(client, ClientEvent.Room, onRoom);

    return version;
}

export function useImagePackRoomUpdate(room?: Room | null): number {
    return useImagePackUpdate(room?.client);
}
