import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { opencodeGoDefaultModelId, opencodeGoDefaultModelInfo, OPENCODE_GO_DEFAULT_TEMPERATURE } from "@roo-code/types"

import { ApiHandlerOptions } from "../../shared/api"

import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { RouterProvider } from "./router-provider"

/**
 * Values the opencode-go gateway accepts on `reasoning_effort`. The OpenAI
 * Chat Completions standard defines "low / medium / high" — we forward those
 * verbatim, plus "max" which the gateway (and the underlying DeepSeek
 * reasoner) accept as a step above "high". Extended values like "minimal",
 * "xhigh", or "none" are intentionally dropped — the gateway forwards the
 * field verbatim, so sending an unsupported value would be a hard error.
 */
const OPENCODE_GO_REASONING_EFFORTS = ["low", "medium", "high", "max"] as const
type OpencodeGoReasoningEffort = (typeof OPENCODE_GO_REASONING_EFFORTS)[number]

/**
 * Request body shape accepted by the opencode-go gateway. Identical to
 * `OpenAI.Chat.ChatCompletionCreateParams`, but `reasoning_effort` is
 * widened to include "max" — the OpenAI SDK type only declares the
 * "low | medium | high" triple, so we `Omit` the original field and
 * re-add the wider one. Cast back at the `.create()` call site.
 */
type OpencodeGoChatCompletionCreateParams = Omit<OpenAI.Chat.ChatCompletionCreateParams, "reasoning_effort"> & {
	reasoning_effort?: "low" | "medium" | "high" | "max"
}

/**
 * Resolves the effective `reasoning_effort` to send with a request.
 *
 * Resolution order:
 *  1. User's explicit setting on `apiConfiguration` (set via Settings dropdown).
 *  2. Model's catalog default (`info.reasoningEffort`).
 *  3. Provider-level fallback ("medium").
 *
 * Returns `undefined` when:
 *  - Reasoning is explicitly disabled by the user (`enableReasoningEffort === false`
 *    or `reasoningEffort === "disable"`).
 *  - The resolved model does not support reasoning effort
 *    (`supportsReasoningEffort === false`).
 *  - The model declares a capability array and the resolved value isn't in it.
 *  - The resolved value isn't one of the three values accepted by the OpenAI
 *    Chat Completions API.
 *
 * Note: This capability gate is stricter than the other RouterProvider-based
 * handlers (e.g. openai.ts, requesty.ts), which only filter values downstream
 * of `shouldUseReasoningEffort`. The opencode-go gateway forwards
 * `reasoning_effort` verbatim, so we drop the field on the client side rather
 * than risk the upstream rejecting an unsupported value.
 */
const resolveReasoningEffort = (
	options: ApiHandlerOptions,
	modelInfo: {
		reasoningEffort?: string
		supportsReasoningEffort?: boolean | readonly string[]
	},
): OpencodeGoReasoningEffort | undefined => {
	// User explicitly disabled reasoning → omit.
	if (options.enableReasoningEffort === false || options.reasoningEffort === "disable") {
		return undefined
	}

	// Model declares it doesn't support reasoning → omit even if the user
	// selected an effort (the gateway will reject the field).
	if (modelInfo.supportsReasoningEffort === false) {
		return undefined
	}

	// Resolve the raw value: user setting → model default → "medium"
	const raw = (options.reasoningEffort as string | undefined) ?? modelInfo.reasoningEffort ?? "medium"

	// If the model advertises a capability array, only honour values in it.
	if (Array.isArray(modelInfo.supportsReasoningEffort) && !modelInfo.supportsReasoningEffort.includes(raw)) {
		return undefined
	}

	// Finally, drop values the OpenAI Chat Completions API doesn't accept.
	return (OPENCODE_GO_REASONING_EFFORTS as readonly string[]).includes(raw)
		? (raw as OpencodeGoReasoningEffort)
		: undefined
}

/**
 * API handler for the Opencode "Go" subscription plan.
 *
 * Routes requests through the OpenAI-compatible gateway at
 * `https://opencode.ai/zen/go/v1`, delegating model resolution and streaming
 * logic to the shared {@link RouterProvider} base class.
 *
 * Exposes the Go subscription's models as a first-class provider with a dynamic
 * model list (fetched from `/v1/models`) so users can switch models on the fly,
 * instead of configuring each one manually as a separate OpenAI-Compatible
 * provider (#172).
 *
 * Supports text generation, reasoning content (GLM/DeepSeek), tool calls,
 * configurable `reasoning_effort` (low/medium/high/max), and non-streaming
 * prompt completion.
 */
export class OpencodeGoHandler extends RouterProvider implements SingleCompletionHandler {
	/** Creates a new handler bound to the user's Go API key and selected model. */
	constructor(options: ApiHandlerOptions) {
		super({
			options,
			name: "opencode-go",
			baseURL: "https://opencode.ai/zen/go/v1",
			apiKey: options.opencodeGoApiKey,
			modelId: options.opencodeGoModelId,
			defaultModelId: opencodeGoDefaultModelId,
			defaultModelInfo: opencodeGoDefaultModelInfo,
		})
	}

	/**
	 * Streams a chat completion response, yielding typed chunks for text,
	 * reasoning, partial tool calls, and token usage.
	 */
	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId, info } = await this.fetchModel()

		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		const reasoningEffort = resolveReasoningEffort(this.options, info)

		const body: OpencodeGoChatCompletionCreateParams = {
			model: modelId,
			messages: openAiMessages,
			temperature: this.supportsTemperature(modelId)
				? (this.options.modelTemperature ?? OPENCODE_GO_DEFAULT_TEMPERATURE)
				: undefined,
			max_completion_tokens: info.maxTokens,
			stream: true,
			stream_options: { include_usage: true },
			tools: this.convertToolsForOpenAI(metadata?.tools),
			tool_choice: metadata?.tool_choice,
			parallel_tool_calls: metadata?.parallelToolCalls ?? true,
			// Conditional spread: omit the field entirely when reasoning is off or
			// the resolved value isn't supported by the gateway.
			...(reasoningEffort && { reasoning_effort: reasoningEffort }),
		}

		const completion = await this.client.chat.completions.create(
			body as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
		)

		for await (const chunk of completion) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield { type: "text", text: delta.content }
			}

			// Several Go-plan models (GLM, DeepSeek) stream reasoning via this field.
			if (delta && "reasoning_content" in delta && delta.reasoning_content) {
				yield { type: "reasoning", text: (delta.reasoning_content as string | undefined) || "" }
			}

			// Emit raw tool call chunks - NativeToolCallParser handles state management.
			if (delta?.tool_calls) {
				for (const toolCall of delta.tool_calls) {
					yield {
						type: "tool_call_partial",
						index: toolCall.index,
						id: toolCall.id,
						name: toolCall.function?.name,
						arguments: toolCall.function?.arguments,
					}
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
					cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || undefined,
				}
			}
		}
	}

	/**
	 * Performs a non-streaming chat completion and returns the full response text.
	 *
	 * @param prompt - The user prompt to send as a single user message.
	 * @returns The model's reply text, or an empty string if no content is returned.
	 * @throws Error with an Opencode Go-specific prefix if the request fails.
	 */
	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId, info } = await this.fetchModel()

		try {
			const requestOptions: OpencodeGoChatCompletionCreateParams = {
				model: modelId,
				messages: [{ role: "user", content: prompt }],
				stream: false,
			}

			if (this.supportsTemperature(modelId)) {
				requestOptions.temperature = this.options.modelTemperature ?? OPENCODE_GO_DEFAULT_TEMPERATURE
			}

			requestOptions.max_completion_tokens = info.maxTokens

			const reasoningEffort = resolveReasoningEffort(this.options, info)
			if (reasoningEffort) {
				requestOptions.reasoning_effort = reasoningEffort
			}

			const response = await this.client.chat.completions.create(
				requestOptions as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
			)
			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Opencode Go completion error: ${error.message}`)
			}
			throw error
		}
	}
}
