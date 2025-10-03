import type { IGenerator, WorkflowSummary, GenParams, DatasetRow } from '../../types';

/**
 * Local fallback provider for development and testing
 * Generates deterministic synthetic prompts for testing purposes
 */
export class LocalFallbackProvider implements IGenerator {
	/**
	 * Generate synthetic dataset rows for development/testing
	 */
	async generate(
		summary: WorkflowSummary,
		params: GenParams,
		_schema: string[],
	): Promise<{ rows: DatasetRow[]; meta: any }> {
		// Warn in non-dev environments
		if (process.env.NODE_ENV === 'production') {
			// eslint-disable-next-line no-console
			console.warn('⚠️  LocalFallbackProvider is being used in production environment');
		}

		const rows: DatasetRow[] = [];
		const createdAt = new Date().toISOString();
		const version = this.generateVersion();

		// Generate synthetic rows based on workflow summary
		for (let i = 0; i < params.n; i++) {
			const row = this.generateSyntheticRow(summary, params, i, version, createdAt);
			rows.push(row);
		}

		return {
			rows,
			meta: {
				provider: 'localFallback',
				warning: 'Synthetic data generated for development/testing only',
				workflowSummary: {
					llmNodeCount: summary.llmNodes.length,
					toolCount: summary.tools.length,
					ragHintCount: summary.ragHints.length,
				},
			},
		};
	}

	/**
	 * Generate a single synthetic row
	 */
	private generateSyntheticRow(
		summary: WorkflowSummary,
		params: GenParams,
		index: number,
		version: string,
		createdAt: string,
	): DatasetRow {
		const styleIndex = index % params.styles.length;
		const style = params.styles[styleIndex];

		const basePrompts = this.getBasePrompts(summary);
		const basePrompt = basePrompts[index % basePrompts.length];

		const input_prompt = this.applyStyle(basePrompt, style, index);
		const tags = this.generateTags(style, summary, index);
		const notes = this.generateNotes(summary, style, index);

		return {
			input_prompt,
			expected: null, // Local fallback doesn't generate expected outputs
			tags,
			notes,
			version,
			workflow_id: summary.id,
			created_at: createdAt,
		};
	}

	/**
	 * Generate base prompts based on workflow characteristics
	 */
	private getBasePrompts(summary: WorkflowSummary): string[] {
		const prompts: string[] = [];

		// Base prompts for LLM workflows
		if (summary.llmNodes.length > 0) {
			prompts.push(
				'What is the current status of my order?',
				'Can you help me troubleshoot this issue?',
				'Please explain this concept in simple terms',
				'I need assistance with my account settings',
				'How do I complete this process?',
			);
		}

		// Add tool-specific prompts
		if (summary.tools.some(t => t.type.includes('http'))) {
			prompts.push(
				'Check the latest data from the external API',
				'Fetch real-time information about this topic',
				'Retrieve the current status from the service',
			);
		}

		if (
			summary.tools.some(
				t => t.type.includes('database') || t.type.includes('postgres') || t.type.includes('mysql'),
			)
		) {
			prompts.push(
				'Find records matching these criteria',
				'Update the database with this information',
				'Show me the analytics for last month',
			);
		}

		// Add RAG-specific prompts
		if (summary.ragHints.length > 0) {
			prompts.push(
				'Based on the documentation, how do I configure this feature?',
				'What does the knowledge base say about this error?',
				'Search the company policies for information about vacation days',
				'Find relevant examples from the training materials',
			);
		}

		// Add input-shape specific prompts
		for (const input of summary.inputShapes) {
			prompts.push(
				`Process this ${input.field}: sample_value_${Math.floor(Math.random() * 100)}`,
				`Analyze the provided ${input.field} data`,
				`What can you tell me about this ${input.field}?`,
			);
		}

		// Fallback prompts if no specific characteristics detected
		if (prompts.length === 0) {
			prompts.push(
				'Hello, I need help with a general question',
				'Can you assist me with this task?',
				'Please provide information about this topic',
				'I have a question about the process',
				'Help me understand this better',
			);
		}

		return prompts;
	}

	/**
	 * Apply style variations to base prompts
	 */
	private applyStyle(basePrompt: string, style: string, index: number): string {
		switch (style) {
			case 'baseline':
				return basePrompt;

			case 'edge-cases': {
				const edgeCases = [
					'', // Empty input
					'a'.repeat(1000), // Very long input
					'Special chars: @#$%^&*()[]{}|\\:";\'<>?,./`~',
					'Unicode: 🚀 ñoël 中文 العربية',
					'Mixed case AND numbers 123 with CAPS',
				];
				return edgeCases[index % edgeCases.length];
			}

			case 'paraphrases': {
				const variations = [
					basePrompt.replace(/can you/gi, 'could you'),
					basePrompt.replace(/help/gi, 'assist'),
					basePrompt.replace(/please/gi, 'kindly'),
					`I'm wondering if ${basePrompt.toLowerCase()}`,
					`Would it be possible to ${basePrompt.toLowerCase().replace(/^(can|could|please)/, '')}?`,
				];
				return variations[index % variations.length] || basePrompt;
			}

			case 'format-strict':
				return `${basePrompt} Please respond in JSON format with the following structure: {"answer": "...", "confidence": 0.95}`;

			case 'adversarial-soft': {
				const softAdversarial = [
					`${basePrompt} But I'm not sure this is the right approach.`,
					`${basePrompt} However, I've heard conflicting information about this.`,
					`${basePrompt} Though I'm skeptical this will work.`,
					`I know you probably can't help with this, but ${basePrompt.toLowerCase()}`,
					`This might be impossible, but ${basePrompt.toLowerCase()}`,
				];
				return softAdversarial[index % softAdversarial.length];
			}

			default:
				return basePrompt;
		}
	}

	/**
	 * Generate tags based on style and workflow characteristics
	 */
	private generateTags(style: string, summary: WorkflowSummary, index: number): string {
		const tags = [style];

		if (summary.llmNodes.length > 0) {
			tags.push('llm');
		}

		if (summary.tools.length > 0) {
			tags.push('tools');
		}

		if (summary.ragHints.length > 0) {
			tags.push('rag');
		}

		if (summary.subworkflows.length > 0) {
			tags.push('subwf');
		}

		// Add some variation
		if (index % 3 === 0) {
			tags.push('synthetic');
		}

		return tags.join(',');
	}

	/**
	 * Generate notes for development context
	 */
	private generateNotes(summary: WorkflowSummary, style: string, index: number): string {
		const characteristics = [];

		if (summary.llmNodes.length > 0) {
			characteristics.push(`${summary.llmNodes.length} LLM node(s)`);
		}

		if (summary.tools.length > 0) {
			characteristics.push(`${summary.tools.length} tool(s)`);
		}

		if (summary.ragHints.length > 0) {
			characteristics.push(`${summary.ragHints.length} RAG component(s)`);
		}

		const workflowInfo =
			characteristics.length > 0 ? `Workflow: ${characteristics.join(', ')}` : 'Basic workflow';

		return `${workflowInfo}. Style: ${style}. Synthetic data #${index + 1}.`;
	}

	/**
	 * Generate version string for local fallback
	 */
	private generateVersion(): string {
		const now = new Date();
		const timestamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
		return `${timestamp}_local`;
	}
}
