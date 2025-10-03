import type { IGenerator, WorkflowSummary, GenParams, DatasetRow, AIGatewayCfg } from '../../types';

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface ChatCompletionRequest {
	messages: ChatMessage[];
}

interface ChatCompletionResponse {
	choices: Array<{
		message: {
			content: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * AI Gateway provider for generating prompt datasets
 * Integrates with Ostinato/Outshift AI Gateway Chat Completions endpoint
 */
export class AIGatewayProvider implements IGenerator {
	private readonly config: AIGatewayCfg;
	private lastRequestTime = 0;

	constructor(config: AIGatewayCfg) {
		this.config = {
			timeoutMs: 60000,
			rateLimitRps: 2,
			...config,
		};
	}

	/**
	 * Generate dataset rows using AI Gateway
	 */
	async generate(
		summary: WorkflowSummary,
		params: GenParams,
		schema: string[],
	): Promise<{ rows: DatasetRow[]; meta: any }> {
		const chunks = this.chunkRequests(params.n);
		const allRows: DatasetRow[] = [];
		let totalRejected = 0;
		const firstErrors: string[] = [];

		for (const chunkSize of chunks) {
			try {
				await this.enforceRateLimit();

				const chunkParams = { ...params, n: chunkSize };
				const chunkResult = await this.generateChunk(summary, chunkParams, schema);

				allRows.push(...chunkResult.rows);
				totalRejected += chunkResult.rejectedCount || 0;

				if (chunkResult.firstErrors) {
					firstErrors.push(...chunkResult.firstErrors.slice(0, 3 - firstErrors.length));
				}
			} catch (error) {
				const errorMsg = `Chunk generation failed: ${(error as Error).message}`;
				firstErrors.push(errorMsg);

				// If we have very few valid rows, fail the entire operation
				if (allRows.length < params.n * 0.1) {
					throw new Error(`Generation failed with insufficient valid rows: ${errorMsg}`);
				}
			}
		}

		// Validate we have enough rows
		if (allRows.length < params.n * 0.9) {
			throw new Error(
				`Generated ${allRows.length} rows but expected at least ${Math.floor(params.n * 0.9)}. ` +
					`Rejected: ${totalRejected}. First errors: ${firstErrors.slice(0, 3).join('; ')}`,
			);
		}

		return {
			rows: allRows.slice(0, params.n), // Trim to exact count requested
			meta: {
				provider: 'aiGateway',
				connection: this.config.appEndpoint,
				rejectedCount: totalRejected,
				firstErrors: firstErrors.slice(0, 3),
			},
		};
	}

	/**
	 * Generate a single chunk of dataset rows
	 */
	private async generateChunk(
		summary: WorkflowSummary,
		params: GenParams,
		schema: string[],
	): Promise<{ rows: DatasetRow[]; rejectedCount: number; firstErrors: string[] }> {
		const systemPrompt = this.buildSystemPrompt();
		const userPayload = this.buildUserPayload(summary, params, schema);

		const request: ChatCompletionRequest = {
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: JSON.stringify(userPayload) },
			],
		};

		let response: ChatCompletionResponse;
		try {
			response = await this.makeRequest(request);
		} catch (error) {
			// Single retry with format-only message on failure
			const retryRequest: ChatCompletionRequest = {
				messages: [
					{
						role: 'system',
						content: 'Fix the format. Output only valid JSONL with the required fields.',
					},
					{ role: 'user', content: 'Please retry with proper JSONL format.' },
				],
			};
			response = await this.makeRequest(retryRequest);
		}

		return this.parseResponse(response, summary.id, schema);
	}

	/**
	 * Build the system prompt for the AI Gateway
	 */
	private buildSystemPrompt(): string {
		return `You generate evaluation datasets for an n8n AI workflow.
Output MUST be newline-delimited JSON (JSONL), one object per line, fields:
input_prompt, expected, tags, notes, version, workflow_id, created_at.
No prose or markdown. Keep inputs realistic, diverse, and aligned to the workflow summary, tools, and constraints.`;
	}

	/**
	 * Build the user payload with workflow summary and parameters
	 */
	private buildUserPayload(summary: WorkflowSummary, params: GenParams, schema: string[]) {
		return {
			workflowSummary: summary,
			params,
			schema,
		};
	}

	/**
	 * Make HTTP request to AI Gateway
	 */
	private async makeRequest(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
		const url = `${this.config.appEndpoint}/chat/completions`;

		const fetchOptions = {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(this.config.timeoutMs || 60000),
		};

		const response = await fetch(url, fetchOptions);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`AI Gateway request failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		return (await response.json()) as ChatCompletionResponse;
	}

	/**
	 * Parse the Chat Completions response and extract dataset rows
	 */
	private parseResponse(
		response: ChatCompletionResponse,
		workflowId: string,
		schema: string[],
	): { rows: DatasetRow[]; rejectedCount: number; firstErrors: string[] } {
		const rows: DatasetRow[] = [];
		const firstErrors: string[] = [];
		let rejectedCount = 0;

		const content = response.choices[0]?.message?.content;
		if (!content) {
			throw new Error('No content in AI Gateway response');
		}

		const lines = content.split('\n').filter(line => line.trim());
		const version = this.generateVersion();
		const createdAt = new Date().toISOString();

		for (const line of lines) {
			try {
				const parsed = JSON.parse(line.trim());

				// Validate and coerce the row
				const row = this.validateAndCoerceRow(parsed, workflowId, version, createdAt, schema);
				if (row) {
					rows.push(row);
				} else {
					rejectedCount++;
					if (firstErrors.length < 3) {
						firstErrors.push(`Invalid row format: missing required fields`);
					}
				}
			} catch (parseError) {
				rejectedCount++;
				if (firstErrors.length < 3) {
					firstErrors.push(`JSON parse error: ${(parseError as Error).message}`);
				}
			}
		}

		return { rows, rejectedCount, firstErrors };
	}

	/**
	 * Validate and coerce a row to match the dataset schema
	 */
	private validateAndCoerceRow(
		parsed: any,
		workflowId: string,
		version: string,
		createdAt: string,
		_schema: string[],
	): DatasetRow | null {
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}

		// Ensure required field is present
		if (!parsed.input_prompt || typeof parsed.input_prompt !== 'string') {
			return null;
		}

		const row: DatasetRow = {
			input_prompt: parsed.input_prompt,
			expected: parsed.expected ? String(parsed.expected) : null,
			tags: parsed.tags ? String(parsed.tags) : undefined,
			notes: parsed.notes ? String(parsed.notes) : undefined,
			version: parsed.version || version,
			workflow_id: parsed.workflow_id || workflowId,
			created_at: parsed.created_at || createdAt,
		};

		return row;
	}

	/**
	 * Split large requests into manageable chunks
	 */
	private chunkRequests(totalCount: number): number[] {
		const chunkSize = 200; // Default chunk size
		const chunks: number[] = [];

		let remaining = totalCount;
		while (remaining > 0) {
			const currentChunk = Math.min(remaining, chunkSize);
			chunks.push(currentChunk);
			remaining -= currentChunk;
		}

		return chunks;
	}

	/**
	 * Enforce rate limiting if configured
	 */
	private async enforceRateLimit(): Promise<void> {
		if (!this.config.rateLimitRps) {
			return;
		}

		const minInterval = 1000 / this.config.rateLimitRps;
		const elapsed = Date.now() - this.lastRequestTime;

		if (elapsed < minInterval) {
			const delay = minInterval - elapsed;
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		this.lastRequestTime = Date.now();
	}

	/**
	 * Generate version string with timestamp and connection info
	 */
	private generateVersion(): string {
		const now = new Date();
		const timestamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');

		// Extract connection ID from endpoint if possible
		const urlParts = this.config.appEndpoint.split('/');
		const connectionId = urlParts[urlParts.length - 1] || 'default';

		return `${timestamp}_${connectionId}`;
	}
}
