import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface LlmConfig {
	provider: "anthropic" | "openai";
	model: string;
	apiKey: string;
}

export interface LlmResponse {
	text: string;
}

let _config: LlmConfig | null = null;
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

export function configureLlm(config: LlmConfig): void {
	_config = config;
	_anthropic = null;
	_openai = null;
}

export function isLlmConfigured(): boolean {
	return _config !== null;
}

function getAnthropicClient(): Anthropic {
	if (!_anthropic) {
		_anthropic = new Anthropic({ apiKey: _config!.apiKey });
	}
	return _anthropic;
}

function getOpenAIClient(): OpenAI {
	if (!_openai) {
		_openai = new OpenAI({ apiKey: _config!.apiKey });
	}
	return _openai;
}

/**
 * Send a structured prompt to the configured LLM and get a text response.
 * This is the only LLM call surface — everything goes through here.
 */
export async function llmCall(system: string, prompt: string, maxTokens = 2048): Promise<LlmResponse> {
	if (!_config) {
		throw new Error("LLM not configured. Set LLM_API_KEY env var and run @setup.");
	}

	if (_config.provider === "anthropic") {
		const client = getAnthropicClient();
		const msg = await client.messages.create({
			model: _config.model,
			max_tokens: maxTokens,
			system,
			messages: [{ role: "user", content: prompt }],
		});
		const text = msg.content
			.filter((b): b is Anthropic.TextBlock => b.type === "text")
			.map((b) => b.text)
			.join("");
		return { text };
	}

	// OpenAI
	const client = getOpenAIClient();
	const completion = await client.chat.completions.create({
		model: _config.model,
		max_tokens: maxTokens,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: prompt },
		],
	});
	return { text: completion.choices[0]?.message?.content ?? "" };
}
