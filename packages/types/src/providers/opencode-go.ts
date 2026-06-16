import type { ModelInfo } from "../model.js"

// Opencode "Go" plan — OpenAI-compatible gateway.
// https://opencode.ai/docs/go/ · base URL: https://opencode.ai/zen/go/v1
//
// The full model list (and metadata) is fetched dynamically from
// `https://opencode.ai/zen/go/v1/models`, so models can be switched on the fly.
// The values below are only a fallback used before the live list resolves.
export const opencodeGoDefaultModelId = "deepseek-v4-pro"

export const opencodeGoDefaultModelInfo: ModelInfo = {
	maxTokens: 32_768,
	contextWindow: 1_048_576,
	supportsImages: false,
	supportsPromptCache: false,
	// DeepSeek V4 Pro exposes OpenAI-style `reasoning_effort` (low/medium/high),
	// plus the DeepSeek-flavoured "max" tier (no thinking-budget equivalent).
	// The dropdown is surfaced in Settings when this flag is set on the
	// resolved model info, so the default fallback must advertise the
	// capability even before the live /v1/models catalog resolves.
	supportsReasoningEffort: ["low", "medium", "high", "max"],
	// Model-level default effort. The user-selected value (apiConfiguration
	// .reasoningEffort) takes precedence at request time; this is the fallback
	// when the user hasn't picked one.
	reasoningEffort: "medium",
	// Pricing is intentionally omitted: ModelInfoView renders a `0` field as "$0.00 / 1M tokens"
	// (implying the service is free), so we leave it unknown — consistent with the dynamically
	// fetched models, which also leave price fields absent. See PR #319 review.
	description:
		"DeepSeek V4 Pro (Opencode Go plan). 1M context, configurable reasoning effort (low/medium/high/max). " +
		"Available models and metadata are resolved dynamically from /v1/models.",
}

export const minimaxM3ModelId = "minimax-m3"

export const minimaxM3ModelInfo: ModelInfo = {
	maxTokens: 32_768,
	contextWindow: 1_048_576,
	supportsImages: false,
	supportsPromptCache: false,
	// MiniMax M3 exposes OpenAI-style `reasoning_effort` (low/medium/high),
	// plus the DeepSeek-flavoured "max" tier via the Opencode Go gateway.
	supportsReasoningEffort: ["low", "medium", "high", "max"],
	reasoningEffort: "medium",
	description:
		"MiniMax M3 (Opencode Go plan). 1M context, configurable reasoning effort (low/medium/high/max). " +
		"Available models and metadata are resolved dynamically from /v1/models.",
}

export const OPENCODE_GO_DEFAULT_TEMPERATURE = 0
