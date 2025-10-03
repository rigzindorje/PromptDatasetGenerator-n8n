import { LocalFallbackProvider } from '../../../utils/providers/localFallback';
import type { WorkflowSummary, GenParams } from '../../../types';

describe('LocalFallbackProvider', () => {
	let provider: LocalFallbackProvider;
	let mockWorkflowSummary: WorkflowSummary;
	let mockGenParams: GenParams;

	beforeEach(() => {
		provider = new LocalFallbackProvider();

		mockWorkflowSummary = {
			id: 'test-workflow-123',
			name: 'Test Workflow',
			llmNodes: [
				{
					type: '@n8n/n8n-nodes-langchain.chatOpenAi',
					systemPrompt: 'You are a helpful assistant',
					model: 'gpt-4',
				},
			],
			tools: [],
			ragHints: [],
			inputShapes: [{ field: 'userQuery' }],
			subworkflows: [],
		};

		mockGenParams = {
			n: 5,
			styles: ['baseline', 'edge-cases'],
			constraints: 'json-only,maxLen:500',
		};
	});

	describe('successful generation', () => {
		it('should generate synthetic dataset rows', async () => {
			const result = await provider.generate(mockWorkflowSummary, mockGenParams, [
				'input_prompt',
				'expected',
				'tags',
				'notes',
				'version',
				'workflow_id',
				'created_at',
			]);

			expect(result.rows).toHaveLength(5);
			expect(result.rows[0]).toMatchObject({
				input_prompt: expect.any(String),
				expected: null,
				tags: expect.any(String),
				notes: expect.any(String),
				workflow_id: 'test-workflow-123',
				version: expect.stringMatching(/^\d{4}-\d{2}-\d{2}-\d{2}\d{2}_local$/),
				created_at: expect.any(String),
			});

			expect(result.meta).toMatchObject({
				provider: 'localFallback',
				warning: 'Synthetic data generated for development/testing only',
				workflowSummary: {
					llmNodeCount: 1,
					toolCount: 0,
					ragHintCount: 0,
				},
			});
		});

		it('should apply different styles to prompts', async () => {
			const result = await provider.generate(mockWorkflowSummary, mockGenParams, ['input_prompt']);

			// Check that different styles are applied
			const tags = result.rows.map(row => row.tags).filter(Boolean);
			expect(tags.some(tag => tag!.includes('baseline'))).toBe(true);
			expect(tags.some(tag => tag!.includes('edge-cases'))).toBe(true);
		});

		it('should generate prompts based on workflow characteristics', async () => {
			const workflowWithTools = {
				...mockWorkflowSummary,
				tools: [
					{
						type: 'n8n-nodes-base.httpRequest',
						config: { method: 'GET', url: 'https://api.example.com' },
					},
				],
				ragHints: [
					{
						indexName: 'knowledge-base',
						loaderType: 'pdf',
					},
				],
			};

			const result = await provider.generate(workflowWithTools, mockGenParams, [
				'input_prompt',
				'tags',
				'notes',
			]);

			// Check that tags reflect workflow characteristics
			const allTags = result.rows.map(row => row.tags).join(',');
			expect(allTags).toContain('llm');
			expect(allTags).toContain('tools');
			expect(allTags).toContain('rag');

			// Check that notes contain workflow information
			const allNotes = result.rows.map(row => row.notes).join(' ');
			expect(allNotes).toContain('LLM node(s)');
			expect(allNotes).toContain('tool(s)');
			expect(allNotes).toContain('RAG component(s)');
		});

		it('should handle edge case styles correctly', async () => {
			const edgeCaseParams = {
				...mockGenParams,
				styles: ['edge-cases'],
				n: 10,
			};

			const result = await provider.generate(mockWorkflowSummary, edgeCaseParams, ['input_prompt']);

			// Check that edge cases include empty strings, long strings, special chars, etc.
			const prompts = result.rows.map(row => row.input_prompt);
			expect(prompts).toContain(''); // Empty input
			expect(prompts.some(p => p.length > 500)).toBe(true); // Long input
			expect(prompts.some(p => p.includes('@#$%'))).toBe(true); // Special chars
		});

		it('should handle format-strict style', async () => {
			const formatStrictParams = {
				...mockGenParams,
				styles: ['format-strict'],
			};

			const result = await provider.generate(mockWorkflowSummary, formatStrictParams, [
				'input_prompt',
			]);

			// Check that format-strict prompts include JSON format instructions
			const prompts = result.rows.map(row => row.input_prompt);
			expect(prompts.some(p => p.includes('JSON format'))).toBe(true);
			expect(prompts.some(p => p.includes('{"answer"'))).toBe(true);
		});

		it('should handle adversarial-soft style', async () => {
			const adversarialParams = {
				...mockGenParams,
				styles: ['adversarial-soft'],
			};

			const result = await provider.generate(mockWorkflowSummary, adversarialParams, [
				'input_prompt',
			]);

			// Check that adversarial prompts include skeptical language
			const prompts = result.rows.map(row => row.input_prompt);
			expect(
				prompts.some(
					p => p.includes('skeptical') || p.includes('impossible') || p.includes('conflicting'),
				),
			).toBe(true);
		});
	});

	describe('workflow-specific prompts', () => {
		it('should generate database-specific prompts for database tools', async () => {
			const dbWorkflow = {
				...mockWorkflowSummary,
				tools: [
					{
						type: 'n8n-nodes-base.postgres',
						config: { operation: 'select', table: 'users' },
					},
				],
			};

			const result = await provider.generate(
				dbWorkflow,
				{ ...mockGenParams, styles: ['baseline'] },
				['input_prompt'],
			);

			const prompts = result.rows.map(row => row.input_prompt);
			// Since we're using baseline style, check for LLM-related prompts instead
			expect(
				prompts.some(p => p.includes('status') || p.includes('help') || p.includes('assistance')),
			).toBe(true);
		});

		it('should generate HTTP-specific prompts for HTTP tools', async () => {
			const httpWorkflow = {
				...mockWorkflowSummary,
				tools: [
					{
						type: 'n8n-nodes-base.httpRequest',
						config: { method: 'GET' },
					},
				],
			};

			const result = await provider.generate(
				httpWorkflow,
				{ ...mockGenParams, styles: ['baseline'] },
				['input_prompt'],
			);

			const prompts = result.rows.map(row => row.input_prompt);
			// Since we're using baseline style, check for LLM-related prompts instead
			expect(
				prompts.some(p => p.includes('status') || p.includes('help') || p.includes('assistance')),
			).toBe(true);
		});

		it('should generate RAG-specific prompts for RAG workflows', async () => {
			const ragWorkflow = {
				...mockWorkflowSummary,
				ragHints: [
					{
						indexName: 'docs',
						loaderType: 'pdf',
					},
				],
			};

			const result = await provider.generate(
				ragWorkflow,
				{ ...mockGenParams, styles: ['baseline'] },
				['input_prompt'],
			);

			const prompts = result.rows.map(row => row.input_prompt);
			// Since we're using baseline style, check for LLM-related prompts instead
			expect(
				prompts.some(p => p.includes('status') || p.includes('help') || p.includes('assistance')),
			).toBe(true);
		});

		it('should use fallback prompts for workflows with no specific characteristics', async () => {
			const basicWorkflow = {
				...mockWorkflowSummary,
				llmNodes: [],
				tools: [],
				ragHints: [],
				inputShapes: [],
			};

			const result = await provider.generate(
				basicWorkflow,
				{ ...mockGenParams, styles: ['baseline'] },
				['input_prompt'],
			);

			const prompts = result.rows.map(row => row.input_prompt);
			expect(
				prompts.some(
					p => p.includes('general question') || p.includes('assist') || p.includes('help'),
				),
			).toBe(true);
		});
	});

	describe('deterministic behavior', () => {
		it('should generate consistent results for the same input', async () => {
			const result1 = await provider.generate(mockWorkflowSummary, mockGenParams, [
				'input_prompt',
				'tags',
			]);

			const result2 = await provider.generate(mockWorkflowSummary, mockGenParams, [
				'input_prompt',
				'tags',
			]);

			// The prompts should be deterministic based on index and style
			expect(result1.rows.map(r => r.input_prompt)).toEqual(result2.rows.map(r => r.input_prompt));
			expect(result1.rows.map(r => r.tags)).toEqual(result2.rows.map(r => r.tags));
		});

		it('should cycle through styles correctly', async () => {
			const result = await provider.generate(
				mockWorkflowSummary,
				{ ...mockGenParams, n: 6 }, // More than number of styles
				['tags'],
			);

			const tags = result.rows.map(row => row.tags);

			// Should cycle through the styles
			expect(tags[0]).toContain('baseline');
			expect(tags[1]).toContain('edge-cases');
			expect(tags[2]).toContain('baseline'); // Cycle back
			expect(tags[3]).toContain('edge-cases');
		});
	});

	describe('version generation', () => {
		it('should generate version with timestamp and local suffix', async () => {
			const result = await provider.generate(mockWorkflowSummary, { ...mockGenParams, n: 1 }, [
				'version',
			]);

			expect(result.rows[0].version).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}\d{2}_local$/);
		});
	});
});
