// Shared types for Prompt Dataset Generator node

export interface WorkflowSummary {
	id: string;
	name: string;
	llmNodes: Array<{
		type: string;
		systemPrompt?: string;
		model?: string;
		temperature?: number;
		maxTokens?: number;
	}>;
	tools: Array<{
		type: string;
		config: any;
	}>;
	ragHints: Array<{
		indexName?: string;
		loaderType?: string;
	}>;
	inputShapes: Array<{
		field: string;
		examples?: string[];
	}>;
	subworkflows: Array<{
		id: string;
		name?: string;
	}>;
}

export interface GenParams {
	n: number;
	styles: string[];
	constraints?: string;
}

export interface DatasetRow {
	input_prompt: string;
	expected?: string | null;
	tags?: string;
	notes?: string;
	version: string;
	workflow_id: string;
	created_at: string;
}

export interface IGenerator {
	generate(
		summary: WorkflowSummary,
		params: GenParams,
		schema: string[],
	): Promise<{ rows: DatasetRow[]; meta?: any }>;
}

export interface AIGatewayCfg {
	appEndpoint: string;
	apiKey: string;
	timeoutMs?: number;
	rateLimitRps?: number;
}

export interface N8nApiCfg {
	baseUrl: string;
	apiKey: string;
}

export interface GenerationResult {
	ok: boolean;
	provider: 'aiGateway' | 'external' | 'localFallback';
	workflowId: string;
	tableId: string;
	count: number;
	runLabel: string;
	rejectedCount?: number;
	firstErrors?: string[];
}

export interface AutoDescribeOptions {
	includeSubs?: boolean;
}

export interface DataTableOptions {
	optimizeBulk?: boolean;
	chunkSize?: number;
}

export const DATASET_SCHEMA = [
	'input_prompt',
	'expected',
	'tags',
	'notes',
	'version',
	'workflow_id',
	'created_at',
] as const;

export type DatasetColumn = (typeof DATASET_SCHEMA)[number];

export const PROMPT_STYLES = [
	'baseline',
	'edge-cases',
	'paraphrases',
	'format-strict',
	'adversarial-soft',
] as const;

export type PromptStyle = (typeof PROMPT_STYLES)[number];

export const PROVIDER_TYPES = ['aiGateway', 'external', 'localFallback'] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];
