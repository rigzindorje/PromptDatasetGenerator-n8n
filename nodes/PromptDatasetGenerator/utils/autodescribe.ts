import type { WorkflowSummary, AutoDescribeOptions } from '../types';

interface WorkflowNode {
	id: string;
	name: string;
	type: string;
	typeVersion?: number;
	position?: [number, number];
	parameters?: Record<string, any>;
	credentials?: Record<string, any>;
}

interface WorkflowJSON {
	id: string;
	name: string;
	nodes: WorkflowNode[];
	connections?: Record<string, any>;
	settings?: Record<string, any>;
	meta?: Record<string, any>;
}

const LLM_NODE_TYPES = [
	'@n8n/n8n-nodes-langchain.openAi',
	'@n8n/n8n-nodes-langchain.chatOpenAi',
	'@n8n/n8n-nodes-langchain.azureOpenAi',
	'@n8n/n8n-nodes-langchain.chatAzureOpenAi',
	'@n8n/n8n-nodes-langchain.anthropic',
	'@n8n/n8n-nodes-langchain.chatAnthropic',
	'@n8n/n8n-nodes-langchain.agent',
	'@n8n/n8n-nodes-langchain.toolAgent',
	'@n8n/n8n-nodes-langchain.conversationalAgent',
	'n8n-nodes-base.openAi',
] as const;

const TOOL_NODE_TYPES = [
	'n8n-nodes-base.httpRequest',
	'n8n-nodes-base.webhook',
	'n8n-nodes-base.postgres',
	'n8n-nodes-base.mysql',
	'n8n-nodes-base.mongodb',
	'@n8n/n8n-nodes-langchain.toolWorkflow',
	'@n8n/n8n-nodes-langchain.toolHttpRequest',
	'@n8n/n8n-nodes-langchain.toolCode',
] as const;

const RAG_NODE_TYPES = [
	'@n8n/n8n-nodes-langchain.vectorStore',
	'@n8n/n8n-nodes-langchain.retriever',
	'@n8n/n8n-nodes-langchain.documentLoader',
	'@n8n/n8n-nodes-langchain.embeddings',
	'@n8n/n8n-nodes-langchain.memoryBuffer',
] as const;

/**
 * Auto-describe a workflow by analyzing its JSON structure
 * Extracts LLM nodes, tools, RAG hints, and input shapes
 */
export function autodescribe(
	workflowJson: WorkflowJSON,
	options: AutoDescribeOptions = {},
	visited: Set<string> = new Set(),
): WorkflowSummary {
	const { includeSubs = false } = options;

	// Prevent infinite recursion in circular sub-workflow references
	if (visited.has(workflowJson.id)) {
		return {
			id: workflowJson.id,
			name: workflowJson.name,
			llmNodes: [],
			tools: [],
			ragHints: [],
			inputShapes: [],
			subworkflows: [],
		};
	}

	visited.add(workflowJson.id);

	const summary: WorkflowSummary = {
		id: workflowJson.id,
		name: workflowJson.name,
		llmNodes: [],
		tools: [],
		ragHints: [],
		inputShapes: [],
		subworkflows: [],
	};

	// Analyze each node in the workflow
	for (const node of workflowJson.nodes) {
		// Extract LLM nodes with their configurations
		if (LLM_NODE_TYPES.some(type => node.type.includes(type) || node.type === type)) {
			const llmNode = extractLLMNodeInfo(node);
			if (llmNode) {
				summary.llmNodes.push(llmNode);
			}
		}

		// Extract tool nodes
		if (TOOL_NODE_TYPES.some(type => node.type.includes(type) || node.type === type)) {
			const toolNode = extractToolNodeInfo(node);
			if (toolNode) {
				summary.tools.push(toolNode);
			}
		}

		// Extract RAG-related nodes
		if (RAG_NODE_TYPES.some(type => node.type.includes(type) || node.type === type)) {
			const ragNode = extractRAGNodeInfo(node);
			if (ragNode) {
				summary.ragHints.push(ragNode);
			}
		}

		// Extract sub-workflow references
		if (node.type === 'n8n-nodes-base.executeWorkflow' && includeSubs) {
			const subworkflowId = node.parameters?.workflowId;
			if (subworkflowId && typeof subworkflowId === 'string') {
				summary.subworkflows.push({
					id: subworkflowId,
					name: node.name,
				});
			}
		}

		// Extract input shapes from expressions
		const inputShapes = extractInputShapes(node);
		summary.inputShapes.push(...inputShapes);
	}

	// Deduplicate input shapes
	summary.inputShapes = deduplicateInputShapes(summary.inputShapes);

	return summary;
}

function extractLLMNodeInfo(node: WorkflowNode) {
	const params = node.parameters || {};

	return {
		type: node.type,
		systemPrompt: extractStringValue(params.systemMessage || params.systemPrompt),
		model: extractStringValue(params.model),
		temperature: extractNumericValue(params.temperature),
		maxTokens: extractNumericValue(params.maxTokens || params.max_tokens),
	};
}

function extractToolNodeInfo(node: WorkflowNode) {
	const params = node.parameters || {};
	const config: Record<string, any> = {};

	// Extract relevant configuration based on node type
	switch (true) {
		case node.type.includes('httpRequest'):
			config.method = params.method;
			config.url = extractStringValue(params.url);
			config.authentication = params.authentication;
			break;
		case node.type.includes('postgres') || node.type.includes('mysql'):
			config.operation = params.operation;
			config.table = extractStringValue(params.table);
			break;
		case node.type.includes('mongodb'):
			config.operation = params.operation;
			config.collection = extractStringValue(params.collection);
			break;
		case node.type.includes('toolWorkflow'):
			config.workflowId = params.workflowId;
			break;
		default:
			config.nodeType = node.type;
	}

	return {
		type: node.type,
		config,
	};
}

function extractRAGNodeInfo(node: WorkflowNode) {
	const params = node.parameters || {};
	const ragInfo: { indexName?: string; loaderType?: string } = {};

	if (node.type.includes('vectorStore')) {
		ragInfo.indexName = extractStringValue(params.indexName || params.index);
	}

	if (node.type.includes('documentLoader')) {
		ragInfo.loaderType = params.loaderType || node.type.split('.').pop();
	}

	return ragInfo;
}

function extractInputShapes(node: WorkflowNode): Array<{ field: string; examples?: string[] }> {
	const shapes: Array<{ field: string; examples?: string[] }> = [];
	const nodeJson = JSON.stringify(node.parameters || {});

	// Extract expressions like {{$json.field}} or {{$input.field}}
	const expressionRegex = /\{\{\$(?:json|input)\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
	const matches = [...nodeJson.matchAll(expressionRegex)];

	for (const match of matches) {
		const field = match[1];
		if (field && !shapes.some(s => s.field === field)) {
			shapes.push({ field });
		}
	}

	return shapes;
}

function deduplicateInputShapes(shapes: Array<{ field: string; examples?: string[] }>) {
	const seen = new Set<string>();
	return shapes.filter(shape => {
		if (seen.has(shape.field)) {
			return false;
		}
		seen.add(shape.field);
		return true;
	});
}

function extractStringValue(value: any): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (value && typeof value === 'object' && value.__rl) {
		// Handle n8n resource locator format
		return value.value || value.cachedResultName;
	}
	return undefined;
}

function extractNumericValue(value: any): number | undefined {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = parseFloat(value);
		return isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}
