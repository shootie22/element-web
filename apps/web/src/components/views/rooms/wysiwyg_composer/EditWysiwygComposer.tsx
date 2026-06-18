/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type RefObject, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import classNames from "classnames";

import type EditorStateTransfer from "../../../../utils/EditorStateTransfer";
import { WysiwygComposer } from "./components/WysiwygComposer";
import { EditionButtons } from "./components/EditionButtons";
import { useWysiwygEditActionHandler } from "./hooks/useWysiwygEditActionHandler";
import { useEditing } from "./hooks/useEditing";
import { useInitialContent } from "./hooks/useInitialContent";
import { ComposerContext, getDefaultContextValue } from "./ComposerContext";
import { type ComposerFunctions } from "./types";
import { getKeyBindingsManager } from "../../../../KeyBindingsManager";
import { KeyBindingAction } from "../../../../accessibility/KeyboardShortcuts";

interface ContentProps {
    disabled?: boolean;
    composerFunctions: ComposerFunctions;
    ref?: RefObject<HTMLElement | null>;
    onComposerElementChange?: (element: HTMLElement | null) => void;
}

const Content = function Content({
    disabled = false,
    composerFunctions,
    ref,
    onComposerElementChange,
}: ContentProps): ReactNode {
    useEffect(() => {
        onComposerElementChange?.(ref?.current ?? null);

        return () => {
            onComposerElementChange?.(null);
        };
    }, [onComposerElementChange, ref]);

    useWysiwygEditActionHandler(disabled, ref, composerFunctions);
    return null;
};

interface EditWysiwygComposerProps {
    disabled?: boolean;
    onChange?: (content: string) => void;
    editorStateTransfer: EditorStateTransfer;
    className?: string;
}

// Default needed for React.lazy
export default function EditWysiwygComposer({
    editorStateTransfer,
    className,
    ...props
}: EditWysiwygComposerProps): JSX.Element {
    const defaultContextValue = useMemo(() => getDefaultContextValue({ editorStateTransfer }), [editorStateTransfer]);
    const editComposerRef = useRef<HTMLElement | null>(null);
    const onComposerElementChange = useCallback((element: HTMLElement | null): void => {
        editComposerRef.current = element;
    }, []);
    const initialContent = useInitialContent(editorStateTransfer);
    const initialContentHtml = initialContent?.content;
    const isReady = !editorStateTransfer || initialContentHtml !== undefined;

    const { editMessage, endEditing, onChange, isSaveDisabled } = useEditing(
        editorStateTransfer,
        initialContentHtml,
        editComposerRef,
    );
    const onWindowKeyDown = useCallback(
        (event: KeyboardEvent): void => {
            if (event.defaultPrevented) return;
            if (getKeyBindingsManager().getMessageComposerAction(event) !== KeyBindingAction.CancelReplyOrEdit) return;

            event.preventDefault();
            event.stopPropagation();
            endEditing();
        },
        [endEditing],
    );

    useEffect(() => {
        window.addEventListener("keydown", onWindowKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onWindowKeyDown, { capture: true });
    }, [onWindowKeyDown]);

    if (!isReady) {
        return <></>;
    }

    return (
        <ComposerContext.Provider value={defaultContextValue}>
            <WysiwygComposer
                className={classNames("mx_EditWysiwygComposer", className)}
                initialContent={initialContentHtml}
                initialColorDecorations={initialContent?.colorDecorations}
                onChange={onChange}
                onSend={editMessage}
                {...props}
            >
                {(ref, composerFunctions) => (
                    <>
                        <Content
                            disabled={props.disabled}
                            ref={ref}
                            onComposerElementChange={onComposerElementChange}
                            composerFunctions={composerFunctions}
                        />
                        <EditionButtons
                            onCancelClick={endEditing}
                            onSaveClick={editMessage}
                            isSaveDisabled={isSaveDisabled}
                        />
                    </>
                )}
            </WysiwygComposer>
        </ComposerContext.Provider>
    );
}
