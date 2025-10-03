import { autodescribe } from '../../utils/autodescribe';

describe('autodescribe', () => {
	describe('basic workflow analysis', () => {
		it('should extract workflow basic info', () => {
			const workflowJson = {
				id: 'test-workflow-123',
				name: 'Test Workflow',
				nodes: [],
			};

			const result = autodescribe(workflowJson);

			expect(result).toEqual({
				id: 'test-workflow-123',
				name: 'Test Workflow',
				llmNodes: [],
				tools: [],
				ragHints: [],
				inputShapes: [],
				subworkflows: [],
			});
		});

		it('should detect LLM nodes', () => {
			const workflowJson = {
				id: 'llm-workflow',
				name: 'LLM Test',
				nodes: [
					{
						id: 'node1',
						name: 'OpenAI Chat',
						type: '@n8n/n8n-nodes-langchain.chatOpenAi',
						parameters: {
							systemMessage: 'You are a helpful assistant',
							model: 'gpt-4',
							temperature: 0.7,
							maxTokens: 1000,
						},
					},
				],
			};

			const result = autodescribe(workflowJson);

			expect(result.llmNodes).toHaveLength(1);
			expect(result.llmNodes[0]).toEqual({
				type: '@n8n/n8n-nodes-langchain.chatOpenAi',
				systemPrompt: 'You are a helpful assistant',
				model: 'gpt-4',
				temperature: 0.7,
				maxTokens: 1000,
			});
		});

		it('should detect tool nodes', () => {
			const workflowJson = {
				id: 'tool-workflow',
				name: 'Tool Test',
				nodes: [
					{
						id: 'node1',
						name: 'HTTP Request',
						type: 'n8n-nodes-base.httpRequest',
						parameters: {
							method: 'POST',
							url: 'https://api.example.com/data',
							authentication: 'bearer',
						},
					},
					{
						id: 'node2',
						name: 'PostgreSQL',
						type: 'n8n-nodes-base.postgres',
						parameters: {
							operation: 'insert',
							table: 'users',
						},
					},
				],
			};

			const result = autodescribe(workflowJson);

			expect(result.tools).toHaveLength(2);
			expect(result.tools[0]).toEqual({
				type: 'n8n-nodes-base.httpRequest',
				config: {
					method: 'POST',
					url: 'https://api.example.com/data',
					authentication: 'bearer',
				},
			});
			expect(result.tools[1]).toEqual({
				type: 'n8n-nodes-base.postgres',
				config: {
					operation: 'insert',
					table: 'users',
				},
			});
		});

		it('should extract input shapes from expressions', () => {
			const workflowJson = {
				id: 'input-workflow',
				name: 'Input Test',
				nodes: [
					{
						id: 'node1',
						name: 'Process Data',
						type: 'n8n-nodes-base.code',
						parameters: {
							jsCode: 'return { result: {{$json.userQuery}} + {{$input.context}} };',
						},
					},
				],
			};

			const result = autodescribe(workflowJson);

			expect(result.inputShapes).toHaveLength(2);
			expect(result.inputShapes).toEqual(
				expect.arrayContaining([{ field: 'userQuery' }, { field: 'context' }]),
			);
		});

		it('should detect sub-workflows when enabled', () => {
			const workflowJson = {
				id: 'parent-workflow',
				name: 'Parent Workflow',
				nodes: [
					{
						id: 'node1',
						name: 'Execute Sub-workflow',
						type: 'n8n-nodes-base.executeWorkflow',
						parameters: {
							workflowId: 'sub-workflow-123',
						},
					},
				],
			};

			const result = autodescribe(workflowJson, { includeSubs: true });

			expect(result.subworkflows).toHaveLength(1);
			expect(result.subworkflows[0]).toEqual({
				id: 'sub-workflow-123',
				name: 'Execute Sub-workflow',
			});
		});

		it('should not detect sub-workflows when disabled', () => {
			const workflowJson = {
				id: 'parent-workflow',
				name: 'Parent Workflow',
				nodes: [
					{
						id: 'node1',
						name: 'Execute Sub-workflow',
						type: 'n8n-nodes-base.executeWorkflow',
						parameters: {
							workflowId: 'sub-workflow-123',
						},
					},
				],
			};

			const result = autodescribe(workflowJson, { includeSubs: false });

			expect(result.subworkflows).toHaveLength(0);
		});
	});

	describe('edge cases', () => {
		it('should handle empty workflow', () => {
			const workflowJson = {
				id: 'empty-workflow',
				name: 'Empty',
				nodes: [],
			};

			const result = autodescribe(workflowJson);

			expect(result.llmNodes).toHaveLength(0);
			expect(result.tools).toHaveLength(0);
			expect(result.ragHints).toHaveLength(0);
			expect(result.inputShapes).toHaveLength(0);
		});

		it('should handle nodes with missing parameters', () => {
			const workflowJson = {
				id: 'minimal-workflow',
				name: 'Minimal',
				nodes: [
					{
						id: 'node1',
						name: 'OpenAI Chat',
						type: '@n8n/n8n-nodes-langchain.chatOpenAi',
						// No parameters
					},
				],
			};

			const result = autodescribe(workflowJson);

			expect(result.llmNodes).toHaveLength(1);
			expect(result.llmNodes[0]).toEqual({
				type: '@n8n/n8n-nodes-langchain.chatOpenAi',
				systemPrompt: undefined,
				model: undefined,
				temperature: undefined,
				maxTokens: undefined,
			});
		});

		it('should prevent infinite recursion with cycle detection', () => {
			const workflowJson = {
				id: 'cycle-workflow',
				name: 'Cycle Test',
				nodes: [],
			};

			const visited = new Set<string>();
			visited.add('cycle-workflow');

			const result = autodescribe(workflowJson, {}, visited);

			expect(result).toEqual({
				id: 'cycle-workflow',
				name: 'Cycle Test',
				llmNodes: [],
				tools: [],
				ragHints: [],
				inputShapes: [],
				subworkflows: [],
			});
		});

		it('should deduplicate input shapes', () => {
			const workflowJson = {
				id: 'duplicate-inputs',
				name: 'Duplicate Test',
				nodes: [
					{
						id: 'node1',
						name: 'First Node',
						type: 'n8n-nodes-base.code',
						parameters: {
							jsCode: 'return {{$json.userQuery}};',
						},
					},
					{
						id: 'node2',
						name: 'Second Node',
						type: 'n8n-nodes-base.code',
						parameters: {
							jsCode: 'const query = {{$json.userQuery}}; return query;',
						},
					},
				],
			};

			const result = autodescribe(workflowJson);

			expect(result.inputShapes).toHaveLength(1);
			expect(result.inputShapes[0]).toEqual({ field: 'userQuery' });
		});
	});
});
