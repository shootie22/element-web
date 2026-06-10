/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen, waitFor } from "jest-matrix-react";
import userEvent from "@testing-library/user-event";
import { mocked } from "jest-mock";

import { ImagePackSettings } from "../../../../../src/components/views/settings/ImagePackSettings";
import { ACCOUNT_IMAGE_PACK_EVENT, IMAGE_PACK_ROOMS_EVENT } from "../../../../../src/image-packs";
import { mkEvent, stubClient } from "../../../../test-utils";

const BASE64_GIF = "R0lGODlhAQABAAAAACw=";

function imageFile(name: string): File {
    return new File([Uint8Array.from(atob(BASE64_GIF), (c) => c.charCodeAt(0))], name, {
        type: "image/gif",
    });
}

describe("<ImagePackSettings />", () => {
    beforeEach(() => {
        stubClient();
    });

    it("uses plain-language labels for the account pack editor", () => {
        render(<ImagePackSettings mode="account" />);

        expect(screen.getByRole("heading", { name: "My emoji & sticker pack" })).toBeInTheDocument();
        expect(screen.getByLabelText("Pack name")).toBeInTheDocument();
        expect(screen.getByText("Packs used everywhere")).toBeInTheDocument();
    });

    it("uploads a pack avatar and saves its MXC URL", async () => {
        const user = userEvent.setup();
        const client = stubClient();
        mocked(client.uploadContent).mockResolvedValue({ content_uri: "mxc://server/avatar" });

        render(<ImagePackSettings mode="account" />);
        await user.upload(screen.getByLabelText("Upload avatar"), imageFile("avatar.gif"));
        await waitFor(() => expect(client.uploadContent).toHaveBeenCalled());

        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(client.setAccountData).toHaveBeenCalledWith(
                ACCOUNT_IMAGE_PACK_EVENT,
                expect.objectContaining({
                    pack: expect.objectContaining({ avatar_url: "mxc://server/avatar" }),
                }),
            ),
        );
    });

    it("bulk uploads images and skips duplicate shortcodes", async () => {
        const user = userEvent.setup();
        const client = stubClient();
        mocked(client.uploadContent)
            .mockResolvedValueOnce({ content_uri: "mxc://server/cat-1" })
            .mockResolvedValueOnce({ content_uri: "mxc://server/cat-2" });

        render(<ImagePackSettings mode="account" />);
        await user.upload(screen.getByLabelText("Upload images"), [imageFile("cat.gif"), imageFile("cat.png")]);

        await waitFor(() => expect(screen.getByText("Upload complete: 1 added, 1 skipped.")).toBeInTheDocument());
        expect(screen.getByDisplayValue("cat")).toBeInTheDocument();
    });

    it("shows inline validation and blocks saving invalid pack images", async () => {
        const user = userEvent.setup();
        const client = stubClient();
        mocked(client.getAccountData).mockImplementation((type) =>
            mkEvent({
                user: "@user:example.com",
                room: undefined,
                type,
                event: true,
                content:
                    type === ACCOUNT_IMAGE_PACK_EVENT
                        ? {
                              pack: { display_name: "Broken pack", usage: ["emoticon", "sticker"] },
                              images: {
                                  "bad shortcode": { url: "mxc://server/cat", body: "Cat" },
                                  "cat": { url: "mxc://server/cat", body: "Cat duplicate" },
                              },
                          }
                        : {},
            }),
        );

        render(<ImagePackSettings mode="account" />);
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("3 issue(s) need fixing before this pack can be saved.")).toBeInTheDocument();
        expect(screen.getAllByText("This image is already in the pack.")).toHaveLength(2);
        expect(client.setAccountData).not.toHaveBeenCalledWith(IMAGE_PACK_ROOMS_EVENT, expect.anything());
    });
});
