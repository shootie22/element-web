/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    MESSAGE_STYLE_ACCOUNT_DATA_TYPE,
    type MessageStyleAccountData,
    type MessageStyle,
    validateMessageStyle,
} from "../../@types/message_style.ts";
import MatrixClientBackedController from "./MatrixClientBackedController.ts";

declare module "matrix-js-sdk/src/types" {
    interface AccountDataEvents {
        [MESSAGE_STYLE_ACCOUNT_DATA_TYPE]: MessageStyleAccountData;
    }
}

export default class MessageStyleController extends MatrixClientBackedController {
    public static readonly default: MessageStyleAccountData = {
        version: 1,
        defaultStyle: null,
    };

    public getValue(): MessageStyle | null {
        const content = this.client
            ?.getAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE)
            ?.getContent<MessageStyleAccountData>();
        if (!content?.defaultStyle || !validateMessageStyle(content.defaultStyle)) {
            return null;
        }
        return content.defaultStyle;
    }

    public get settingDisabled(): false {
        return false;
    }

    public async setDefaultStyle(style: MessageStyle | null): Promise<void> {
        if (!this.client) return;
        const content: MessageStyleAccountData = {
            version: 1,
            defaultStyle: style,
        };
        await this.client.setAccountData(MESSAGE_STYLE_ACCOUNT_DATA_TYPE, content);
    }
}
