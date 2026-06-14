// npx vitest run src/api/providers/__tests__/opencode-go.spec.ts

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({}))

import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { opencodeGoDefaultModelId } from "@roo-code/types"

import { OpencodeGoHandler } from "../opencode-go"
import { ApiHandlerOptions } from "../../../shared/api"

vitest.mock("openai")
vitest.mock("delay", () => ({
	default: vitest.fn(function () {
		return Promise.resolve()
	}),
}))
vitest.mock("../fetchers/modelCache", () => ({
	getModels: vitest.fn().mockImplementation(function () {
		return Promise.resolve({
			[opencodeGoDefaultModelId]: {
				maxTokens: 32768,
				contextWindow: 1048576,
				supportsImages: false,
				supportsPromptCache: false,
				supportsReasoningEffort: ["low", "medium", "high"],
				reasoningEffort: "medium",
				description: "DeepSeek V4 Pro (mock)",
			},
			"glm-5.1": {
				maxTokens: 32768,
				contextWindow: 200000,
				supportsImages: false,
				supportsPromptCache: false,
				description: "GLM 5.1",
			},
			"no-reasoning-model": {
				maxTokens: 8192,
				contextWindow: 32000,
				supportsImages: false,
				supportsPromptCache: false,
				supportsReasoningEffort: false,
				reasoningEffort: "medium",
				description: "Model that explicitly opts out of reasoning",
			},
			"limited-reasoning-model": {
				maxTokens: 16384,
				contextWindow: 128000,
				supportsImages: false,
				supportsPromptCache: false,
				supportsReasoningEffort: ["low", "high"],
				reasoningEffort: "medium",
				description: "Model with a restricted capability set",
			},
		})
	}),
	getModelsFromCache: vitest.fn().mockReturnValue(undefined),
}))

const mockCreate = vitest.fn()

;(OpenAI as any).mockImplementation(function () {
	return {
		chat: { completions: { create: mockCreate } },
	}
})

describe("OpencodeGoHandler", () => {
	const mockOptions: ApiHandlerOptions = {
		opencodeGoApiKey: "test-key",
		opencodeGoModelId: opencodeGoDefaultModelId,
	}

	beforeEach(() => {
		vitest.clearAllMocks()
		mockCreate.mockClear()
	})

	it("initializes the OpenAI client with the Opencode Go base URL and key", () => {
		const handler = new OpencodeGoHandler(mockOptions)
		expect(handler).toBeInstanceOf(OpencodeGoHandler)
		expect(OpenAI).toHaveBeenCalledWith(
			expect.objectContaining({
				baseURL: "https://opencode.ai/zen/go/v1",
				apiKey: "test-key",
			}),
		)
	})

	describe("fetchModel", () => {
		it("returns the configured model info", async () => {
			const handler = new OpencodeGoHandler(mockOptions)
			const result = await handler.fetchModel()
			expect(result.id).toBe(opencodeGoDefaultModelId)
			expect(result.info.maxTokens).toBe(32768)
			expect(result.info.contextWindow).toBe(1048576)
			expect(result.info.supportsPromptCache).toBe(false)
			expect(result.info.supportsReasoningEffort).toEqual(["low", "medium", "high"])
			expect(result.info.reasoningEffort).toBe("medium")
		})

		it("falls back to the default model id when none is configured", async () => {
			const handler = new OpencodeGoHandler({ opencodeGoApiKey: "test-key" })
			const result = await handler.fetchModel()
			expect(result.id).toBe(opencodeGoDefaultModelId)
		})

		it("defaults to DeepSeek V4 Pro", async () => {
			// Guard against accidental default-model drift: this provider is meant
			// to land new users on DeepSeek V4 Pro so the reasoning-effort UI is
			// visible out of the box.
			expect(opencodeGoDefaultModelId).toBe("deepseek-v4-pro")
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			mockCreate.mockImplementation(async () => ({
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [
							{
								delta: {
									content: "Hello",
									reasoning_content: "thinking…",
									tool_calls: [
										{
											index: 0,
											id: "call_1",
											function: { name: "read_file", arguments: '{"path":' },
										},
									],
								},
								index: 0,
							},
						],
						usage: null,
					}
					yield {
						choices: [{ delta: {}, index: 0 }],
						usage: {
							prompt_tokens: 12,
							completion_tokens: 7,
							total_tokens: 19,
							prompt_tokens_details: { cached_tokens: 4 },
						},
					}
				},
			}))
		})

		it("streams text, reasoning, tool-call and usage chunks", async () => {
			const handler = new OpencodeGoHandler(mockOptions)
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]

			const chunks = []
			for await (const chunk of handler.createMessage("You are helpful.", messages)) {
				chunks.push(chunk)
			}

			expect(chunks).toContainEqual({ type: "text", text: "Hello" })
			expect(chunks).toContainEqual({ type: "reasoning", text: "thinking…" })
			expect(chunks).toContainEqual({
				type: "tool_call_partial",
				index: 0,
				id: "call_1",
				name: "read_file",
				arguments: '{"path":',
			})
			expect(chunks).toContainEqual({
				type: "usage",
				inputTokens: 12,
				outputTokens: 7,
				cacheReadTokens: 4,
			})
		})

		it("requests a streaming completion with usage included", async () => {
			const handler = new OpencodeGoHandler(mockOptions)
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk // drain
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: opencodeGoDefaultModelId,
					stream: true,
					stream_options: { include_usage: true },
					max_completion_tokens: 32768,
					temperature: expect.any(Number),
				}),
			)
		})

		it("uses the model-default reasoning effort when the user hasn't set one", async () => {
			const handler = new OpencodeGoHandler(mockOptions)
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: "medium" }))
		})

		it("uses the user-selected reasoning effort from apiConfiguration", async () => {
			const handler = new OpencodeGoHandler({ ...mockOptions, reasoningEffort: "high" })
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: "high" }))
		})

		it("omits reasoning_effort when the user has explicitly disabled it", async () => {
			const handler = new OpencodeGoHandler({
				...mockOptions,
				enableReasoningEffort: false,
				reasoningEffort: "disable",
			})
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			const lastCall = mockCreate.mock.calls.at(-1)?.[0] as Record<string, unknown>
			expect(lastCall).not.toHaveProperty("reasoning_effort")
		})

		it("filters out extended reasoning-effort values the gateway doesn't accept", async () => {
			// "xhigh" is a valid user-facing setting but not part of the
			// OpenAI Chat Completions triple, so it must be dropped before send.
			const handler = new OpencodeGoHandler({ ...mockOptions, reasoningEffort: "xhigh" as any })
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			const lastCall = mockCreate.mock.calls.at(-1)?.[0] as Record<string, unknown>
			expect(lastCall).not.toHaveProperty("reasoning_effort")
		})

		it("omits reasoning_effort when the resolved model declares supportsReasoningEffort=false", async () => {
			// Even though the user picked "high" and the model catalog has a
			// "medium" default, an explicit `false` from the catalog wins —
			// the gateway will reject the field, so we drop it client-side.
			const handler = new OpencodeGoHandler({
				...mockOptions,
				opencodeGoModelId: "no-reasoning-model",
				reasoningEffort: "high",
			})
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			const lastCall = mockCreate.mock.calls.at(-1)?.[0] as Record<string, unknown>
			expect(lastCall).not.toHaveProperty("reasoning_effort")
		})

		it("honours the model's capability array when the user picks a value inside it", async () => {
			const handler = new OpencodeGoHandler({
				...mockOptions,
				opencodeGoModelId: "limited-reasoning-model",
				reasoningEffort: "low",
			})
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: "low" }))
		})

		it("drops the field when the resolved value isn't in the model's capability array", async () => {
			// "limited-reasoning-model" declares supportsReasoningEffort=["low","high"]
			// with a default of "medium", so the model-default resolution must NOT
			// be sent — the gateway would reject "medium" since the model didn't
			// opt in to it.
			const handler = new OpencodeGoHandler({
				...mockOptions,
				opencodeGoModelId: "limited-reasoning-model",
			})
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			for await (const _chunk of handler.createMessage("sys", messages)) {
				void _chunk
			}

			const lastCall = mockCreate.mock.calls.at(-1)?.[0] as Record<string, unknown>
			expect(lastCall).not.toHaveProperty("reasoning_effort")
		})
	})

	describe("completePrompt", () => {
		it("returns the message content for a non-streaming completion", async () => {
			mockCreate.mockResolvedValue({ choices: [{ message: { content: "the answer" } }] })
			const handler = new OpencodeGoHandler(mockOptions)
			expect(await handler.completePrompt("ping")).toBe("the answer")
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: opencodeGoDefaultModelId,
					stream: false,
					max_completion_tokens: 32768,
				}),
			)
		})

		it("wraps errors with an Opencode Go-specific message", async () => {
			mockCreate.mockRejectedValue(new Error("boom"))
			const handler = new OpencodeGoHandler(mockOptions)
			await expect(handler.completePrompt("ping")).rejects.toThrow("Opencode Go completion error: boom")
		})

		it("forwards the resolved reasoning_effort on the non-streaming path", async () => {
			mockCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })
			const handler = new OpencodeGoHandler({ ...mockOptions, reasoningEffort: "low" })
			await handler.completePrompt("ping")
			expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: "low", stream: false }))
		})

		it("omits reasoning_effort when reasoning is disabled", async () => {
			mockCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })
			const handler = new OpencodeGoHandler({
				...mockOptions,
				enableReasoningEffort: false,
				reasoningEffort: "disable",
			})
			await handler.completePrompt("ping")
			expect(mockCreate).toHaveBeenCalledWith(
				expect.not.objectContaining({ reasoning_effort: expect.anything() }),
			)
		})
	})
})
