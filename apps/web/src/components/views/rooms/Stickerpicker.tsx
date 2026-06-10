/*
Copyright 2018-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import classNames from "classnames";
import React, { type JSX, useEffect, useRef, useState } from "react";
import { type Room, ClientEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { type IWidget } from "matrix-widget-api";
import { StickerIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t, _td } from "../../../languageHandler";
import AppTile from "../elements/AppTile";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import dis from "../../../dispatcher/dispatcher";
import AccessibleButton from "../elements/AccessibleButton";
import WidgetUtils, { type UserWidget } from "../../../utils/WidgetUtils";
import PersistedElement from "../elements/PersistedElement";
import { IntegrationManagers } from "../../../integrations/IntegrationManagers";
import ContextMenu, { aboveLeftOf, type MenuProps, useContextMenu } from "../../structures/ContextMenu";
import { WidgetType } from "../../../widgets/WidgetType";
import { WidgetMessagingStore } from "../../../stores/widgets/WidgetMessagingStore";
import { type ActionPayload } from "../../../dispatcher/payloads";
import type ScalarAuthClient from "../../../ScalarAuthClient";
import RightPanelStore from "../../../stores/right-panel/RightPanelStore";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import SettingsStore from "../../../settings/SettingsStore";
import { ImagePackStickerPicker } from "./ImagePackStickerPicker";
import { CollapsibleButton } from "./CollapsibleButton";
import UIStore from "../../../stores/UIStore";
import { useSettingValue } from "../../../hooks/useSettings";

// This should be below the dialog level (4000), but above the rest of the UI (1000-2000).
// We sit in a context menu, so this should be given to the context menu.
const STICKERPICKER_Z_INDEX = 3500;
const STICKER_PICKER_WIDTH_STORAGE_KEY = "mx_sticker_picker_width";
const STICKER_PICKER_MIN_WIDTH = 340;
const STICKER_PICKER_MAX_WIDTH = 768;
const STICKER_PICKER_GRID_PADDING = 16;
const STICKER_PICKER_ITEM_WIDTH = 76;

// Key to store the widget's AppTile under in PersistedElement
const PERSISTED_ELEMENT_KEY = "stickerPicker";

interface IProps {
    room: Room;
    threadId?: string | null;
    isStickerPickerOpen: boolean;
    menuPosition: MenuProps;
    pickerWidth: number;
    isResizable: boolean;
    setStickerPickerOpen: (isStickerPickerOpen: boolean) => void;
    onResizePointerDown(this: void, ev: React.PointerEvent): void;
}

interface IState {
    imError: string | null;
    stickerpickerWidget: UserWidget | null;
    widgetId: string | null;
    showLegacyPicker: boolean;
}

interface StickerButtonProps {
    room: Room;
    threadId?: string | null;
    menuPosition?: MenuProps;
    className?: string;
}

function clampStickerPickerWidth(width: number): number {
    const viewportMax = Math.max(STICKER_PICKER_MIN_WIDTH, UIStore.instance.windowWidth - 24);
    return Math.max(STICKER_PICKER_MIN_WIDTH, Math.min(width, STICKER_PICKER_MAX_WIDTH, viewportMax));
}

function readStickerPickerWidth(): number {
    const storedWidth = Number(window.localStorage.getItem(STICKER_PICKER_WIDTH_STORAGE_KEY));
    return clampStickerPickerWidth(Number.isFinite(storedWidth) ? storedWidth : STICKER_PICKER_MIN_WIDTH);
}

function columnCountForWidth(width: number): number {
    return Math.max(4, Math.floor((width - STICKER_PICKER_GRID_PADDING) / STICKER_PICKER_ITEM_WIDTH));
}

export function StickerButton({ room, threadId, menuPosition, className }: StickerButtonProps): JSX.Element {
    const [menuDisplayed, button, openMenu, closeMenu, setMenuDisplayed] = useContextMenu();
    const [pickerWidth, setPickerWidth] = useState(readStickerPickerWidth);
    const resizeAnimationFrame = useRef<number | null>(null);
    const useAccentButtons = useSettingValue("Tweaks.accentEmojiStickerButtons");
    const useResizablePickers = useSettingValue("Tweaks.resizableEmojiStickerPickers");
    const effectivePickerWidth = useResizablePickers ? pickerWidth : STICKER_PICKER_MIN_WIDTH;
    const computedClassName = classNames("mx_StickerButton", className, {
        mx_StickerButton_highlight: menuDisplayed,
        mx_StickerButton_accent: useAccentButtons,
    });
    const position = button.current
        ? (menuPosition ?? aboveLeftOf(button.current.getBoundingClientRect()))
        : undefined;

    useEffect(() => {
        const dispatcherRef = dis.register((payload: ActionPayload) => {
            switch (payload.action) {
                case "stickerpicker_toggle":
                    setMenuDisplayed(!menuDisplayed);
                    break;
                case "stickerpicker_close":
                    setMenuDisplayed(false);
                    break;
            }
        });
        return () => dis.unregister(dispatcherRef);
    }, [menuDisplayed, setMenuDisplayed]);

    useEffect(() => {
        return () => {
            if (resizeAnimationFrame.current !== null) {
                window.cancelAnimationFrame(resizeAnimationFrame.current);
            }
        };
    }, []);

    const onResizePointerDown = (ev: React.PointerEvent): void => {
        ev.preventDefault();
        ev.stopPropagation();

        const startX = ev.clientX;
        const startWidth = pickerWidth;
        let nextWidth = pickerWidth;

        const onPointerMove = (moveEv: PointerEvent): void => {
            nextWidth = clampStickerPickerWidth(startWidth + startX - moveEv.clientX);
            if (resizeAnimationFrame.current === null) {
                resizeAnimationFrame.current = window.requestAnimationFrame(() => {
                    resizeAnimationFrame.current = null;
                    setPickerWidth(nextWidth);
                });
            }
        };
        const onPointerUp = (): void => {
            if (resizeAnimationFrame.current !== null) {
                window.cancelAnimationFrame(resizeAnimationFrame.current);
                resizeAnimationFrame.current = null;
            }
            setPickerWidth(nextWidth);
            window.localStorage.setItem(STICKER_PICKER_WIDTH_STORAGE_KEY, String(nextWidth));
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
    };

    return (
        <>
            <CollapsibleButton
                id="stickersButton"
                className={computedClassName}
                onClick={() => setMenuDisplayed(!menuDisplayed)}
                title={menuDisplayed ? _t("composer|close_sticker_picker") : _t("common|sticker")}
                inputRef={button}
            >
                <StickerIcon />
            </CollapsibleButton>
            {menuDisplayed && position && (
                <Stickerpicker
                    room={room}
                    threadId={threadId}
                    isStickerPickerOpen={menuDisplayed}
                    menuPosition={position}
                    pickerWidth={effectivePickerWidth}
                    isResizable={useResizablePickers}
                    setStickerPickerOpen={(isOpen) => {
                        if (isOpen) {
                            openMenu();
                        } else {
                            closeMenu();
                        }
                    }}
                    onResizePointerDown={onResizePointerDown}
                />
            )}
        </>
    );
}

class Stickerpicker extends React.PureComponent<IProps, IState> {
    public static defaultProps: Partial<IProps> = {
        threadId: null,
    };

    public static currentWidget?: UserWidget;

    private dispatcherRef?: string;

    private prevSentVisibility?: boolean;

    private popoverHeight = 300;
    // This is loaded by _acquireScalarClient on an as-needed basis.
    private scalarClient: ScalarAuthClient | null = null;

    public constructor(props: IProps) {
        super(props);
        this.state = {
            imError: null,
            stickerpickerWidget: null,
            widgetId: null,
            showLegacyPicker: false,
        };
    }

    private async acquireScalarClient(): Promise<void | undefined | null | ScalarAuthClient> {
        if (this.scalarClient) return Promise.resolve(this.scalarClient);
        // TODO: Pick the right manager for the widget
        if (IntegrationManagers.sharedInstance().hasManager()) {
            this.scalarClient = IntegrationManagers.sharedInstance().getPrimaryManager()?.getScalarClient() ?? null;
            return this.scalarClient
                ?.connect()
                .then(() => {
                    this.forceUpdate();
                    return this.scalarClient;
                })
                .catch((e) => {
                    this.imError(_td("integration_manager|error_connecting_heading"), e);
                });
        } else {
            IntegrationManagers.sharedInstance().openNoManagerDialog();
        }
    }

    private removeStickerpickerWidgets = async (): Promise<void> => {
        const scalarClient = await this.acquireScalarClient();
        logger.log("Removing Stickerpicker widgets");
        if (this.state.widgetId) {
            if (scalarClient) {
                scalarClient
                    .disableWidgetAssets(WidgetType.STICKERPICKER, this.state.widgetId)
                    .then(() => {
                        logger.log("Assets disabled");
                    })
                    .catch(() => {
                        logger.error("Failed to disable assets");
                    });
            } else {
                logger.error("Cannot disable assets: no scalar client");
            }
        } else {
            logger.warn("No widget ID specified, not disabling assets");
        }

        this.props.setStickerPickerOpen(false);
        WidgetUtils.removeStickerpickerWidgets(this.props.room.client)
            .then(() => {
                this.forceUpdate();
            })
            .catch((e) => {
                logger.error("Failed to remove sticker picker widget", e);
            });
    };

    public componentDidMount(): void {
        // Close the sticker picker when the window resizes
        window.addEventListener("resize", this.onResize);

        this.dispatcherRef = dis.register(this.onAction);

        // Track updates to widget state in account data
        MatrixClientPeg.safeGet().on(ClientEvent.AccountData, this.updateWidget);

        RightPanelStore.instance.on(UPDATE_EVENT, this.onRightPanelStoreUpdate);
        // Initialise widget state from current account data
        this.updateWidget();
    }

    public componentWillUnmount(): void {
        const client = MatrixClientPeg.get();
        if (client) client.removeListener(ClientEvent.AccountData, this.updateWidget);
        RightPanelStore.instance.off(UPDATE_EVENT, this.onRightPanelStoreUpdate);
        window.removeEventListener("resize", this.onResize);
        dis.unregister(this.dispatcherRef);
    }

    public componentDidUpdate(): void {
        this.sendVisibilityToWidget(this.props.isStickerPickerOpen);
    }

    private imError(errorMsg: TranslationKey, e: Error): void {
        logger.error(errorMsg, e);
        this.setState({
            imError: _t(errorMsg),
        });
        this.props.setStickerPickerOpen(false);
    }

    private updateWidget = (): void => {
        const stickerpickerWidget = WidgetUtils.getStickerpickerWidgets(this.props.room.client)[0];
        if (!stickerpickerWidget) {
            Stickerpicker.currentWidget = undefined;
            this.setState({ stickerpickerWidget: null, widgetId: null });
            return;
        }

        const currentWidget = Stickerpicker.currentWidget;
        const currentUrl = currentWidget?.content?.url ?? null;
        const newUrl = stickerpickerWidget?.content?.url ?? null;

        if (newUrl !== currentUrl) {
            // Destroy the existing frame so a new one can be created
            PersistedElement.destroyElement(PERSISTED_ELEMENT_KEY);
        }

        Stickerpicker.currentWidget = stickerpickerWidget;
        this.setState({
            stickerpickerWidget,
            widgetId: stickerpickerWidget ? stickerpickerWidget.id : null,
        });
    };

    private onAction = (payload: ActionPayload): void => {
        switch (payload.action) {
            case "user_widget_updated":
                this.forceUpdate();
                break;
            case "stickerpicker_close":
                this.props.setStickerPickerOpen(false);
                break;
            case "show_left_panel":
            case "hide_left_panel":
                this.props.setStickerPickerOpen(false);
                break;
        }
    };

    private onRightPanelStoreUpdate = (): void => {
        this.props.setStickerPickerOpen(false);
    };

    private defaultStickerpickerContent(): JSX.Element {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const imgSrc = require("../../../../res/img/stickerpack-placeholder.png");
        return (
            <AccessibleButton onClick={this.launchManageIntegrations} className="mx_Stickers_contentPlaceholder">
                <p>{_t("stickers|empty")}</p>
                <p className="mx_Stickers_addLink">{_t("stickers|empty_add_prompt")}</p>
                <img src={imgSrc} alt="" />
            </AccessibleButton>
        );
    }

    private errorStickerpickerContent(): JSX.Element {
        return (
            <div style={{ textAlign: "center" }} className="error">
                <p> {this.state.imError} </p>
            </div>
        );
    }

    private sendVisibilityToWidget(visible: boolean): void {
        if (!this.state.stickerpickerWidget) return;
        const messaging = WidgetMessagingStore.instance.getMessagingForUid(
            WidgetUtils.calcWidgetUid(this.state.stickerpickerWidget.id),
        );
        if (messaging?.widgetApi && visible !== this.prevSentVisibility) {
            messaging.widgetApi.updateVisibility(visible).catch((err) => {
                logger.error("Error updating widget visibility: ", err);
            });
            this.prevSentVisibility = visible;
        }
    }

    private openLegacyPicker = (): void => {
        this.setState({ showLegacyPicker: true });
    };

    public getStickerpickerContent(): JSX.Element {
        const showLegacyButton = SettingsStore.getValue("feature_legacy_stickerpicker");
        if (!this.state.showLegacyPicker) {
            return (
                <ImagePackStickerPicker
                    room={this.props.room}
                    threadId={this.props.threadId}
                    showLegacyButton={showLegacyButton}
                    onFinished={this.onFinished}
                    onOpenLegacy={this.openLegacyPicker}
                    columnCount={columnCountForWidth(this.props.pickerWidth)}
                />
            );
        }

        return this.getLegacyStickerpickerContent();
    }

    private getLegacyStickerpickerContent(): JSX.Element {
        // Handle integration manager errors
        if (this.state.imError) {
            return this.errorStickerpickerContent();
        }

        // Stickers
        // TODO - Add support for Stickerpickers from multiple app stores.
        // Render content from multiple stickerpack sources, each within their
        // own iframe, within the stickerpicker UI element.
        const stickerpickerWidget = this.state.stickerpickerWidget;
        let stickersContent: JSX.Element | undefined;

        // Use a separate ReactDOM tree to render the AppTile separately so that it persists and does
        // not unmount when we (a) close the sticker picker (b) switch rooms. It's properties are still
        // updated.

        // Load stickerpack content
        if (!!stickerpickerWidget?.content?.url) {
            // Set default name
            stickerpickerWidget.content.name = stickerpickerWidget.content.name || _t("common|stickerpack");

            // FIXME: could this use the same code as other apps?
            const stickerApp: IWidget = {
                id: stickerpickerWidget.id,
                url: stickerpickerWidget.content.url,
                name: stickerpickerWidget.content.name,
                type: stickerpickerWidget.content.type,
                data: stickerpickerWidget.content.data,
                creatorUserId: stickerpickerWidget.content.creatorUserId || stickerpickerWidget.sender,
            };

            stickersContent = (
                <div className="mx_Stickers_content_container">
                    <div
                        id="stickersContent"
                        className="mx_Stickers_content"
                        style={{
                            border: "none",
                            height: this.popoverHeight,
                            width: this.props.pickerWidth,
                        }}
                    >
                        <PersistedElement persistKey={PERSISTED_ELEMENT_KEY} zIndex={STICKERPICKER_Z_INDEX}>
                            <AppTile
                                app={stickerApp}
                                room={this.props.room}
                                threadId={this.props.threadId}
                                fullWidth={true}
                                userId={MatrixClientPeg.safeGet().credentials.userId!}
                                creatorUserId={
                                    stickerpickerWidget.sender || MatrixClientPeg.safeGet().credentials.userId!
                                }
                                waitForIframeLoad={true}
                                showMenubar={true}
                                onEditClick={this.launchManageIntegrations}
                                onDeleteClick={this.removeStickerpickerWidgets}
                                showTitle={false}
                                showPopout={false}
                                handleMinimisePointerEvents={true}
                                userWidget={true}
                                showLayoutButtons={false}
                            />
                        </PersistedElement>
                    </div>
                </div>
            );
        } else {
            // Default content to show if stickerpicker widget not added
            stickersContent = this.defaultStickerpickerContent();
        }
        return stickersContent;
    }

    /**
     * Called when the window is resized
     */
    private onResize = (): void => {
        if (this.props.isStickerPickerOpen) {
            this.props.setStickerPickerOpen(false);
        }
    };

    /**
     * The stickers picker was hidden
     */
    private onFinished = (): void => {
        if (this.props.isStickerPickerOpen) {
            this.props.setStickerPickerOpen(false);
        }
        if (this.state.showLegacyPicker) {
            this.setState({ showLegacyPicker: false });
        }
    };

    /**
     * Launch the integration manager on the stickers integration page
     */
    private launchManageIntegrations = (): void => {
        // noinspection JSIgnoredPromiseFromCall
        IntegrationManagers.sharedInstance()
            ?.getPrimaryManager()
            ?.open(this.props.room, `type_${WidgetType.STICKERPICKER.preferred}`, this.state.widgetId ?? undefined);
    };

    public render(): React.ReactNode {
        if (!this.props.isStickerPickerOpen) return null;
        const width = this.props.pickerWidth;
        const height = this.state.showLegacyPicker ? this.popoverHeight : 380;

        return (
            <ContextMenu
                onFinished={this.onFinished}
                zIndex={STICKERPICKER_Z_INDEX}
                managed={false}
                focusLock
                {...this.props.menuPosition}
            >
                <div className="mx_StickerButton_picker" style={{ width, height }}>
                    {this.props.isResizable && (
                        <div
                            className="mx_StickerButton_pickerResizeHandle"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={_t("emoji_picker|resize")}
                            onPointerDown={this.props.onResizePointerDown}
                        />
                    )}
                    {this.getStickerpickerContent()}
                </div>
            </ContextMenu>
        );
    }
}
