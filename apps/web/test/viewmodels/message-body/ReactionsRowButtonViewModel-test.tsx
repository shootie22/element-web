/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import {
    EventStatus,
    EventType,
    type MatrixClient,
    type MatrixEvent,
    RelationType,
    type Room,
    RoomEvent,
} from "matrix-js-sdk/src/matrix";

import {
    ReactionsRowButtonViewModel,
    type ReactionsRowButtonViewModelProps,
} from "../../../src/viewmodels/room/timeline/event-tile/reactions/ReactionsRowButtonViewModel";
import { type ReactionsRowButtonTooltipViewModel } from "../../../src/viewmodels/room/timeline/event-tile/reactions/ReactionsRowButtonTooltipViewModel";
import { createTestClient, mkEvent, mkStubRoom } from "../../test-utils";
import dis from "../../../src/dispatcher/dispatcher";
import SettingsStore from "../../../src/settings/SettingsStore";

jest.mock("../../../src/dispatcher/dispatcher");
jest.mock("../../../src/customisations/Media", () => ({
    mediaFromMxc: jest.fn(() => ({
        srcHttp: "https://example.org/_matrix/media/reaction.gif",
        getThumbnailOfSourceHttp: jest.fn(() => "https://example.org/_matrix/media/reaction-thumbnail.png"),
    })),
}));

describe("ReactionsRowButtonViewModel", () => {
    let client: MatrixClient;
    let room: Room;
    let mxEvent: MatrixEvent;

    const createReactionEvent = (senderId: string, key = "👍"): MatrixEvent => {
        return mkEvent({
            event: true,
            type: "m.reaction",
            room: room.roomId,
            user: senderId,
            content: {
                "m.relates_to": {
                    rel_type: "m.annotation",
                    event_id: mxEvent.getId(),
                    key,
                },
            },
        });
    };

    const createProps = (overrides?: Partial<ReactionsRowButtonViewModelProps>): ReactionsRowButtonViewModelProps => ({
        client,
        mxEvent,
        content: "👍",
        count: 2,
        reactionEvents: [createReactionEvent("@alice:example.org"), createReactionEvent("@bob:example.org")],
        disabled: false,
        customReactionImagesEnabled: false,
        ...overrides,
    });

    const getTooltipVm = (vm: ReactionsRowButtonViewModel): ReactionsRowButtonTooltipViewModel =>
        vm.getSnapshot().tooltipVm as ReactionsRowButtonTooltipViewModel;
    const getAriaLabel = (vm: ReactionsRowButtonViewModel): string | undefined =>
        (vm.getSnapshot() as { ariaLabel?: string }).ariaLabel;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(SettingsStore, "getValue").mockImplementation((settingName: string) => {
            if (settingName === "autoplayGifs") return false;
            if (settingName === "Tweaks.playAnimatedReactionImagesOnHover") return false;
            return false;
        });
        client = createTestClient();
        room = mkStubRoom("!room:example.org", "Test Room", client);
        jest.spyOn(client, "getRoom").mockReturnValue(room);
        mxEvent = mkEvent({
            event: true,
            type: "m.room.message",
            room: room.roomId,
            user: "@sender:example.org",
            content: { body: "Test message", msgtype: "m.text" },
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("updates count with merge and does not touch tooltip props", () => {
        const vm = new ReactionsRowButtonViewModel(createProps());
        const tooltipSetPropsSpy = jest.spyOn(getTooltipVm(vm), "setProps");
        const listener = jest.fn();
        vm.subscribe(listener);

        vm.setCount(5);

        expect(vm.getSnapshot().count).toBe(5);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(tooltipSetPropsSpy).not.toHaveBeenCalled();

        vm.setCount(6);

        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("includes an ariaLabel in the snapshot", () => {
        const vm = new ReactionsRowButtonViewModel(createProps());

        expect(getAriaLabel(vm)).toContain("reacted with 👍");
    });

    it("falls back when no room is available", () => {
        jest.spyOn(client, "getRoom").mockReturnValue(null);

        const vm = new ReactionsRowButtonViewModel(createProps());

        expect(getAriaLabel(vm)).toBeUndefined();
        expect(vm.getSnapshot().content).toBe("👍");
        expect(vm.getSnapshot().count).toBe(2);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("renders custom reaction images as thumbnails when gif autoplay is disabled", () => {
        const reactionEvent = createReactionEvent("@alice:example.org", "mxc://example.org/reaction");
        reactionEvent.getContent()["shortcode"] = "party";

        const vm = new ReactionsRowButtonViewModel(
            createProps({
                content: "mxc://example.org/reaction",
                reactionEvents: [reactionEvent],
                customReactionImagesEnabled: true,
            }),
        );

        expect(vm.getSnapshot()).toMatchObject({
            imageSrc: "https://example.org/_matrix/media/reaction-thumbnail.png",
            imageHoverSrc: "https://example.org/_matrix/media/reaction.gif",
            imageAlt: "party",
        });
        expect(getAriaLabel(vm)).toContain("reacted with party");
    });

    it("renders custom reaction image sources when gif autoplay is enabled", () => {
        jest.spyOn(SettingsStore, "getValue").mockImplementation((settingName: string) => {
            if (settingName === "autoplayGifs") return true;
            if (settingName === "Tweaks.playAnimatedReactionImagesOnHover") return false;
            return false;
        });
        const reactionEvent = createReactionEvent("@alice:example.org", "mxc://example.org/reaction");

        const vm = new ReactionsRowButtonViewModel(
            createProps({
                content: "mxc://example.org/reaction",
                reactionEvents: [reactionEvent],
                customReactionImagesEnabled: true,
            }),
        );

        expect(vm.getSnapshot()).toMatchObject({
            imageSrc: "https://example.org/_matrix/media/reaction.gif",
            imageHoverSrc: undefined,
        });
    });

    it("renders custom reaction image sources only on hover when the hover-only tweak is enabled", () => {
        jest.spyOn(SettingsStore, "getValue").mockImplementation((settingName: string) => {
            if (settingName === "autoplayGifs") return true;
            if (settingName === "Tweaks.playAnimatedReactionImagesOnHover") return true;
            return false;
        });
        const reactionEvent = createReactionEvent("@alice:example.org", "mxc://example.org/reaction");

        const vm = new ReactionsRowButtonViewModel(
            createProps({
                content: "mxc://example.org/reaction",
                reactionEvents: [reactionEvent],
                customReactionImagesEnabled: true,
                playAnimatedReactionImagesOnHover: true,
            }),
        );

        expect(vm.getSnapshot()).toMatchObject({
            imageSrc: "https://example.org/_matrix/media/reaction-thumbnail.png",
            imageHoverSrc: "https://example.org/_matrix/media/reaction.gif",
        });
    });

    it("updates selected state with myReactionEvent without touching tooltip props", () => {
        const vm = new ReactionsRowButtonViewModel(createProps());
        const tooltipSetPropsSpy = jest.spyOn(getTooltipVm(vm), "setProps");
        const listener = jest.fn();
        vm.subscribe(listener);
        const myReactionEvent = createReactionEvent("@me:example.org");

        vm.setMyReactionEvent(myReactionEvent);

        expect(vm.getSnapshot().isSelected).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(tooltipSetPropsSpy).not.toHaveBeenCalled();
    });

    it("updates disabled state without touching tooltip props", () => {
        const vm = new ReactionsRowButtonViewModel(createProps({ disabled: false }));
        const tooltipSetPropsSpy = jest.spyOn(getTooltipVm(vm), "setProps");

        vm.setDisabled(true);

        expect(vm.getSnapshot().isDisabled).toBe(true);
        expect(tooltipSetPropsSpy).not.toHaveBeenCalled();
    });

    it("setReactionData forwards to tooltip via setProps and updates snapshot content", () => {
        const vm = new ReactionsRowButtonViewModel(createProps());
        const tooltipSetPropsSpy = jest.spyOn(getTooltipVm(vm), "setProps");
        const reactionEvents = [createReactionEvent("@carol:example.org", "👎")];

        vm.setReactionData("👎", reactionEvents, false);

        expect(vm.getSnapshot().content).toBe("👎");
        expect(tooltipSetPropsSpy).toHaveBeenCalledWith({
            content: "👎",
            reactionEvents,
            customReactionImagesEnabled: false,
        });

        vm.setReactionData("👎", reactionEvents, false);

        expect(tooltipSetPropsSpy).toHaveBeenCalledTimes(2);
    });

    it("redacts reaction on click when myReactionEvent exists", () => {
        const myReactionEvent = createReactionEvent("@me:example.org");
        const vm = new ReactionsRowButtonViewModel(createProps({ myReactionEvent }));

        vm.onClick();

        expect(client.redactEvent).toHaveBeenCalledWith(room.roomId, myReactionEvent.getId());
        expect(client.sendEvent).not.toHaveBeenCalled();
    });

    it("does not send duplicate redactions when removing the same reaction repeatedly", async () => {
        jest.useFakeTimers();
        const myReactionEvent = createReactionEvent("@me:example.org");
        const vm = new ReactionsRowButtonViewModel(createProps({ myReactionEvent }));
        let resolveRedaction!: () => void;
        jest.spyOn(client, "redactEvent").mockReturnValue(
            new Promise<void>((resolve) => {
                resolveRedaction = resolve;
            }),
        );

        vm.onClick();
        vm.onClick();

        expect(client.redactEvent).toHaveBeenCalledTimes(1);
        expect(client.redactEvent).toHaveBeenCalledWith(room.roomId, myReactionEvent.getId());
        expect(client.sendEvent).not.toHaveBeenCalled();

        resolveRedaction();
        await Promise.resolve();
        jest.advanceTimersByTime(500);
        jest.useRealTimers();
    });

    it("cancels pending reaction local echo on click when myReactionEvent is not sent", () => {
        const myReactionEvent = createReactionEvent("@me:example.org");
        myReactionEvent.status = EventStatus.NOT_SENT;
        const vm = new ReactionsRowButtonViewModel(createProps({ myReactionEvent }));

        vm.onClick();

        expect(client.cancelPendingEvent).toHaveBeenCalledWith(myReactionEvent);
        expect(client.redactEvent).not.toHaveBeenCalled();
        expect(client.sendEvent).not.toHaveBeenCalled();
    });

    it("defers removing a sending reaction local echo until it can be redacted", () => {
        const myReactionEvent = createReactionEvent("@me:example.org");
        myReactionEvent.status = EventStatus.SENDING;
        const vm = new ReactionsRowButtonViewModel(createProps({ myReactionEvent }));

        vm.onClick();

        expect(client.cancelPendingEvent).not.toHaveBeenCalled();
        expect(client.redactEvent).not.toHaveBeenCalled();
        expect(client.sendEvent).not.toHaveBeenCalled();

        myReactionEvent.status = null;
        room.emit(RoomEvent.LocalEchoUpdated, myReactionEvent, room);

        expect(client.redactEvent).toHaveBeenCalledWith(room.roomId, myReactionEvent.getId());
        expect(client.sendEvent).not.toHaveBeenCalled();
    });

    it("sends reaction and dispatches message_sent when no myReactionEvent exists", () => {
        const vm = new ReactionsRowButtonViewModel(createProps());

        vm.onClick();

        expect(client.sendEvent).toHaveBeenCalledWith(room.roomId, EventType.Reaction, {
            "m.relates_to": {
                rel_type: RelationType.Annotation,
                event_id: mxEvent.getId(),
                key: "👍",
            },
        });
        expect(dis.dispatch).toHaveBeenCalledWith({ action: "message_sent" });
    });

    it("cancels a stale failed pending reaction instead of sending another reaction", () => {
        const pendingReactionEvent = createReactionEvent(client.getSafeUserId());
        pendingReactionEvent.status = EventStatus.NOT_SENT;
        jest.spyOn(room, "getPendingEvents").mockReturnValue([pendingReactionEvent]);
        const vm = new ReactionsRowButtonViewModel(createProps());

        vm.onClick();

        expect(client.cancelPendingEvent).toHaveBeenCalledWith(pendingReactionEvent);
        expect(client.sendEvent).not.toHaveBeenCalled();
        expect(dis.dispatch).not.toHaveBeenCalledWith({ action: "message_sent" });
    });

    it("redacts an own relation reaction found in the room when props are stale", () => {
        const myReactionEvent = createReactionEvent(client.getSafeUserId());
        jest.spyOn(room.relations, "getChildEventsForEvent").mockReturnValue({
            getAnnotationsBySender: () => ({
                [client.getSafeUserId()]: new Set([myReactionEvent]),
            }),
        } as never);
        const vm = new ReactionsRowButtonViewModel(createProps());

        vm.onClick();

        expect(client.redactEvent).toHaveBeenCalledWith(room.roomId, myReactionEvent.getId());
        expect(client.sendEvent).not.toHaveBeenCalled();
    });

    it("redacts a just-sent reaction instead of sending a duplicate when clicked again before send settles", async () => {
        jest.useFakeTimers();
        const vm = new ReactionsRowButtonViewModel(createProps());
        let resolveSend!: (response: { event_id: string }) => void;
        jest.spyOn(client, "sendEvent").mockReturnValue(
            new Promise((resolve) => {
                resolveSend = resolve;
            }),
        );
        jest.spyOn(client, "redactEvent").mockResolvedValue({});

        vm.onClick();
        vm.onClick();

        expect(client.sendEvent).toHaveBeenCalledTimes(1);
        expect(client.redactEvent).not.toHaveBeenCalled();

        resolveSend({ event_id: "$reaction-event" });
        await Promise.resolve();
        await Promise.resolve();

        expect(client.redactEvent).toHaveBeenCalledWith(room.roomId, "$reaction-event");
        expect(client.sendEvent).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(500);
        jest.useRealTimers();
    });

    it("cancels the failed reaction local echo when a send is rejected", async () => {
        const failedReactionEvent = createReactionEvent(client.getSafeUserId());
        failedReactionEvent.status = EventStatus.NOT_SENT;
        const error = new Error("Duplicate annotation") as Error & { event: MatrixEvent };
        error.event = failedReactionEvent;
        jest.spyOn(client, "sendEvent").mockRejectedValue(error);
        const vm = new ReactionsRowButtonViewModel(createProps());

        vm.onClick();
        await Promise.resolve();
        await Promise.resolve();

        expect(client.cancelPendingEvent).toHaveBeenCalledWith(failedReactionEvent);
        expect(client.sendEvent).toHaveBeenCalledTimes(1);
    });

    it("does nothing on click when disabled", () => {
        const vm = new ReactionsRowButtonViewModel(createProps({ disabled: true }));

        vm.onClick();

        expect(client.redactEvent).not.toHaveBeenCalled();
        expect(client.sendEvent).not.toHaveBeenCalled();
        expect(dis.dispatch).not.toHaveBeenCalled();
    });
});
