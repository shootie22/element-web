/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { composeStories } from "@storybook/react-vite";
import { fireEvent, render, screen } from "@test-utils";
import React from "react";
import { describe, it, expect } from "vitest";

import { useMockedViewModel } from "../../../../../core/viewmodel";
import * as stories from "./ReactionsRowButton.stories";
import {
    ReactionsRowButtonView,
    type ReactionsRowButtonViewActions,
    type ReactionsRowButtonViewSnapshot,
} from "./ReactionsRowButtonView";

const { Default, Selected } = composeStories(stories);

function ReactionButtonWithHoverImage(): React.JSX.Element {
    const tooltipVm = useMockedViewModel({}, {});
    const vm = useMockedViewModel<ReactionsRowButtonViewSnapshot, ReactionsRowButtonViewActions>(
        {
            count: 1,
            isSelected: false,
            imageSrc: "https://example.org/reaction-thumbnail.png",
            imageHoverSrc: "https://example.org/reaction.gif",
            imageAlt: "party",
            tooltipVm,
        },
        {
            onClick: () => {},
        },
    );

    return <ReactionsRowButtonView vm={vm} />;
}

describe("ReactionsRowButton", () => {
    it("renders the default reaction button", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
    });

    it("renders the selected reaction button", () => {
        const { container } = render(<Selected />);
        expect(container).toMatchSnapshot();
    });

    it("swaps custom reaction image source while hovered or focused", () => {
        render(<ReactionButtonWithHoverImage />);
        const button = screen.getByRole("button");
        const image = screen.getByRole("img", { name: "party" });

        expect(image).toHaveAttribute("src", "https://example.org/reaction-thumbnail.png");

        fireEvent.mouseEnter(button);
        expect(image).toHaveAttribute("src", "https://example.org/reaction.gif");

        fireEvent.mouseLeave(button);
        expect(image).toHaveAttribute("src", "https://example.org/reaction-thumbnail.png");

        fireEvent.focus(button);
        expect(image).toHaveAttribute("src", "https://example.org/reaction.gif");
    });

    it("animates the count when it increments", () => {
        const { rerender } = render(<Default count={1} />);

        rerender(<Default count={2} />);

        expect(screen.getByRole("button").className).toContain("reactionsRowButtonCountIncremented");
    });
});
