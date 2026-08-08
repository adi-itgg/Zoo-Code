import { useCallback, useState, useEffect, useRef } from "react"
import { VSCodeTextField, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import {
	type ProviderSettings,
	type OrganizationAllowList,
	type RouterModels,
	type ExtensionMessage,
	opencodeGoDefaultModelId,
} from "@roo-code/types"

import type { RouterName } from "@roo/api"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { Button } from "@src/components/ui"

import { inputEventTransform } from "../transforms"
import { ModelPicker } from "../ModelPicker"

type OpenCodeGoProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	routerModels?: RouterModels
	organizationAllowList: OrganizationAllowList
	modelValidationError?: string
	simplifySettings?: boolean
}

export const OpenCodeGo = ({
	apiConfiguration,
	setApiConfigurationField,
	routerModels,
	organizationAllowList,
	modelValidationError,
	simplifySettings,
}: OpenCodeGoProps) => {
	const { t } = useAppTranslation()
	const [refreshStatus, setRefreshStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
	const [refreshError, setRefreshError] = useState<string | undefined>()
	const errorJustReceived = useRef(false)

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "singleRouterModelFetchResponse" && !message.success) {
				const providerName = message.values?.provider as RouterName
				if (providerName === "opencode-go") {
					errorJustReceived.current = true
					setRefreshStatus("error")
					setRefreshError(message.error)
				}
			} else if (message.type === "routerModels") {
				if (refreshStatus === "loading") {
					if (!errorJustReceived.current) {
						setRefreshStatus("success")
					}
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [refreshStatus])

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const handleRefreshModels = useCallback(() => {
		errorJustReceived.current = false
		setRefreshStatus("loading")
		setRefreshError(undefined)
		vscode.postMessage({
			type: "requestRouterModels",
			values: { provider: "opencode-go", refresh: true, opencodeGoApiKey: apiConfiguration.opencodeGoApiKey },
		})
	}, [apiConfiguration.opencodeGoApiKey])

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.opencodeGoApiKey || ""}
				type="password"
				onInput={handleInputChange("opencodeGoApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.opencodeGoApiKey")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.opencodeGoApiKey && (
				<VSCodeButtonLink href="https://opencode.ai/docs/go/" appearance="primary" style={{ width: "100%" }}>
					{t("settings:providers.getOpencodeGoApiKey")}
				</VSCodeButtonLink>
			)}
			<Button
				variant="outline"
				onClick={handleRefreshModels}
				disabled={refreshStatus === "loading"}
				className="w-full">
				<div className="flex items-center gap-2">
					{refreshStatus === "loading" ? (
						<span className="codicon codicon-loading codicon-modifier-spin" />
					) : (
						<span className="codicon codicon-refresh" />
					)}
					{t("settings:providers.refreshModels.label")}
				</div>
			</Button>
			{refreshStatus === "loading" && (
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:providers.refreshModels.loading")}
				</div>
			)}
			{refreshStatus === "success" && (
				<div className="text-sm text-vscode-foreground">{t("settings:providers.refreshModels.success")}</div>
			)}
			{refreshStatus === "error" && (
				<div className="text-sm text-vscode-errorForeground">
					{refreshError || t("settings:providers.refreshModels.error")}
				</div>
			)}
			<ModelPicker
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				defaultModelId={opencodeGoDefaultModelId}
				models={routerModels?.["opencode-go"] ?? {}}
				modelIdKey="opencodeGoModelId"
				serviceName="Opencode Go"
				serviceUrl="https://opencode.ai/docs/go/"
				organizationAllowList={organizationAllowList}
				errorMessage={modelValidationError}
				simplifySettings={simplifySettings}
			/>
			{apiConfiguration.opencodeGoModelId &&
				(() => {
					const modelId = apiConfiguration.opencodeGoModelId
					const custom = apiConfiguration.opencodeGoCustomModels?.[modelId]
					const updateCustom = (patch: Record<string, unknown>) =>
						setApiConfigurationField("opencodeGoCustomModels", {
							...apiConfiguration.opencodeGoCustomModels,
							[modelId]: { ...custom, ...patch },
						})

					return (
						<div className="mt-3 border border-vscode-input-border p-2 space-y-2">
							<div className="font-medium">Custom model metadata</div>
							<VSCodeDropdown
								value={custom?.protocol ?? "openai"}
								onChange={(event) =>
									updateCustom({
										protocol: (event.target as HTMLSelectElement).value as "openai" | "anthropic",
									})
								}>
								<VSCodeOption value="openai">OpenAI-compatible</VSCodeOption>
								<VSCodeOption value="anthropic">Anthropic Messages</VSCodeOption>
							</VSCodeDropdown>
							<VSCodeTextField
								value={custom?.contextWindow?.toString() ?? ""}
								type="text"
								placeholder="Context window"
								onInput={(event) =>
									updateCustom({ contextWindow: Number((event.target as HTMLInputElement).value) })
								}
							/>
							<VSCodeTextField
								value={custom?.maxTokens?.toString() ?? ""}
								type="text"
								placeholder="Max output tokens"
								onInput={(event) =>
									updateCustom({ maxTokens: Number((event.target as HTMLInputElement).value) })
								}
							/>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={custom?.supportsImages ?? false}
									onChange={(event) => updateCustom({ supportsImages: event.target.checked })}
								/>
								Supports vision
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={custom?.supportsReasoningEffort === true}
									onChange={(event) =>
										updateCustom({
											supportsReasoningEffort: event.target.checked ? true : undefined,
										})
									}
								/>
								Supports reasoning
							</label>
						</div>
					)
				})()}
		</>
	)
}
