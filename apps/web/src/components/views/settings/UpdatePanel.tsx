/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useRef, useState } from "react";

import { UpdateCheckStatus, type UpdateLogEntry, type UpdateVersionInfo } from "../../../BasePlatform";
import PlatformPeg from "../../../PlatformPeg";
import { _t } from "../../../languageHandler";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { useDispatcher } from "../../../hooks/useDispatcher";
import { type CheckUpdatesPayload } from "../../../dispatcher/payloads/CheckUpdatesPayload";
import SettingsStore from "../../../settings/SettingsStore";
import AccessibleButton from "../elements/AccessibleButton";

const SIMULATE_SCENARIOS = ["success", "slow", "error", "verify-fail"] as const;
type SimulateScenario = (typeof SIMULATE_SCENARIOS)[number];

function formatDate(date?: string | Date): string | undefined {
    if (!date) return undefined;
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatBytesPerSecond(bps?: number): string {
    if (!bps || bps <= 0) return "";
    const mb = bps / (1024 * 1024);
    if (mb >= 1) return ` · ${mb.toFixed(1)} MB/s`;
    return ` · ${(bps / 1024).toFixed(0)} KB/s`;
}

const UpdatePanel: React.FC = () => {
    const [state, setState] = useState<CheckUpdatesPayload | null>(null);
    const [log, setLog] = useState<UpdateLogEntry[]>([]);
    const [versionInfo, setVersionInfo] = useState<UpdateVersionInfo | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    const developerMode = SettingsStore.getValue("developerMode");

    const refreshVersionInfo = useCallback(async (): Promise<void> => {
        const info = (await PlatformPeg.get()?.getUpdateVersionInfo?.()) ?? null;
        setVersionInfo(info);
    }, []);

    useEffect(() => {
        void refreshVersionInfo();
        // Seed from an update that may already be downloaded and waiting.
        void PlatformPeg.get()
            ?.getPendingUpdate()
            .then((pending) => {
                if (pending) setState({ action: Action.CheckUpdates, ...pending } as CheckUpdatesPayload);
            });
    }, [refreshVersionInfo]);

    useDispatcher(dis, (payload) => {
        if (payload.action !== Action.CheckUpdates) return;
        const update = payload as CheckUpdatesPayload;
        setState(update);
        if (update.logLine) {
            setLog((prev) => [...prev, update.logLine!]);
        }
        if (update.status === UpdateCheckStatus.Ready || update.status === UpdateCheckStatus.NotAvailable) {
            void refreshVersionInfo();
        }
    });

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ block: "nearest" });
    }, [log]);

    const status = state?.status;
    const platform = PlatformPeg.get();

    const onCheck = (): void => {
        setLog([]);
        platform?.startUpdateCheck();
    };
    const onDownload = (): void => platform?.startUpdateDownload();
    const onRestart = (): void => platform?.installUpdate();
    const onSimulate = (scenario: SimulateScenario): void => {
        setLog([]);
        platform?.simulateUpdate(scenario);
    };

    const percent = status === UpdateCheckStatus.Downloading ? (state?.progress?.percent ?? 0) : 0;
    const isDownloading = status === UpdateCheckStatus.Downloading;
    const isReady = status === UpdateCheckStatus.Ready;
    const isAvailable = status === UpdateCheckStatus.Available;
    const isBusy = status === UpdateCheckStatus.Checking || isDownloading;

    let statusLine: JSX.Element | undefined;
    if (status === UpdateCheckStatus.Checking) {
        statusLine = <p>{_t("update|checking")}</p>;
    } else if (status === UpdateCheckStatus.NotAvailable) {
        statusLine = <p>{_t("update|up_to_date")}</p>;
    } else if (status === UpdateCheckStatus.Error) {
        statusLine = (
            <p className="mx_UpdatePanel_error">
                {_t("update|error_encountered", { errorDetail: state?.detail ?? "" })}
            </p>
        );
    } else if (isReady) {
        statusLine = <p>{_t("update|ready_description", { version: state?.releaseName ?? "" })}</p>;
    }

    return (
        <div className="mx_UpdatePanel" data-testid="mx_UpdatePanel">
            {/* Versions */}
            <div className="mx_UpdatePanel_versions">
                <div>
                    <strong>{_t("update|current_version")}</strong>
                    {": "}
                    {versionInfo?.currentVersion ?? "—"}
                    {formatDate(versionInfo?.currentReleaseDate) ? (
                        <span className="mx_UpdatePanel_dim">
                            {" "}
                            ({_t("update|released_on", { date: formatDate(versionInfo?.currentReleaseDate)! })})
                        </span>
                    ) : null}
                </div>
                {versionInfo?.latestVersion ? (
                    <div>
                        <strong>{_t("update|latest_version")}</strong>
                        {": "}
                        {versionInfo.latestVersion}
                        {formatDate(versionInfo.latestReleaseDate) ? (
                            <span className="mx_UpdatePanel_dim">
                                {" "}
                                ({_t("update|released_on", { date: formatDate(versionInfo.latestReleaseDate)! })})
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {statusLine}

            {/* Release notes */}
            {state?.releaseNotes ? (
                <details className="mx_UpdatePanel_notes">
                    <summary>{_t("update|release_notes_heading")}</summary>
                    <pre>{state.releaseNotes}</pre>
                </details>
            ) : null}

            {/* Progress bar */}
            {isDownloading ? (
                <div className="mx_UpdatePanel_progress">
                    <div
                        style={{ height: 8, borderRadius: 4, background: "var(--cpd-color-bg-subtle-secondary)" }}
                        role="progressbar"
                        aria-valuenow={Math.round(percent * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        <div
                            style={{
                                width: `${Math.round(percent * 100)}%`,
                                height: "100%",
                                borderRadius: 4,
                                background: "var(--cpd-color-text-action-accent)",
                                transition: "width 120ms linear",
                            }}
                        />
                    </div>
                    <span className="mx_UpdatePanel_dim">
                        {Math.round(percent * 100)}%{formatBytesPerSecond(state?.progress?.bytesPerSecond)}
                    </span>
                </div>
            ) : null}

            {/* Actions */}
            <div className="mx_UpdatePanel_actions">
                <AccessibleButton kind="primary_outline" onClick={onCheck} disabled={isBusy}>
                    {_t("update|check_action")}
                </AccessibleButton>
                {isAvailable ? (
                    <AccessibleButton kind="primary" onClick={onDownload}>
                        {_t("update|download_action")}
                    </AccessibleButton>
                ) : null}
                <AccessibleButton kind="primary" onClick={onRestart} disabled={!isReady}>
                    {_t("update|restart_action")}
                </AccessibleButton>
            </div>

            {/* Log */}
            {log.length > 0 ? (
                <details className="mx_UpdatePanel_log">
                    <summary>{_t("update|log_heading")}</summary>
                    <div className="mx_UpdatePanel_logBody">
                        {log.map((line, i) => (
                            <div key={i} className={`mx_UpdatePanel_logLine mx_UpdatePanel_logLine_${line.level}`}>
                                <span className="mx_UpdatePanel_dim">{new Date(line.ts).toLocaleTimeString()} </span>
                                {line.message}
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </details>
            ) : null}

            {/* Developer: simulate */}
            {developerMode ? (
                <div className="mx_UpdatePanel_developer">
                    <h4>{_t("update|developer_heading")}</h4>
                    <p className="mx_UpdatePanel_dim">{_t("update|simulate_description")}</p>
                    <div className="mx_UpdatePanel_actions">
                        {SIMULATE_SCENARIOS.map((scenario) => (
                            <AccessibleButton
                                key={scenario}
                                kind="secondary"
                                onClick={() => onSimulate(scenario)}
                                disabled={isBusy}
                            >
                                {`${_t("update|simulate_action")}: ${scenario}`}
                            </AccessibleButton>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default UpdatePanel;
