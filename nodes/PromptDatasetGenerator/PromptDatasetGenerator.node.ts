import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { autodescribe } from './utils/autodescribe';
import { PromptGenerator, validateGenParams } from './utils/generatePrompts';
import { createDataTableManager, validateDatasetRows } from './utils/dataTable';
import type { GenParams, GenerationResult } from './types';

export class PromptDatasetGenerator implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Prompt Dataset Generator',
		name: 'promptDatasetGenerator',
		icon: 'fa:database',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["numberOfExamples"]}} examples → {{$parameter["targetDataTable"]}}',
		description: 'Generate prompt datasets from workflows using AI Gateway',
		defaults: {
			name: 'Prompt Dataset Generator',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'n8nDataTables',
				required: true,
			},
			{
				name: 'aiGatewayApi',
				required: false,
			},
		],
		properties: [
			// Main properties (visible by default)
			{
				displayName: 'Number of Examples',
				name: 'numberOfExamples',
				type: 'number',
				default: 50,
				placeholder: '50',
				description: 'How many prompt examples to generate',
				required: true,
				typeOptions: {
					minValue: 1,
					maxValue: 2000,
				},
			},
			{
				displayName: 'Prompt Styles',
				name: 'promptStyles',
				type: 'multiOptions',
				default: ['baseline', 'edge-cases', 'paraphrases'],
				description: 'Types of prompt variations to generate',
				required: true,
				options: [
					{
						name: 'Baseline',
						value: 'baseline',
						description: 'Standard, straightforward prompts',
					},
					{
						name: 'Edge Cases',
						value: 'edge-cases',
						description: 'Unusual inputs, empty values, special characters',
					},
					{
						name: 'Paraphrases',
						value: 'paraphrases',
						description: 'Different ways to express the same request',
					},
					{
						name: 'Format Strict',
						value: 'format-strict',
						description: 'Prompts that specify exact output formats',
					},
					{
						name: 'Adversarial Soft',
						value: 'adversarial-soft',
						description: 'Mildly challenging or skeptical prompts',
					},
				],
			},
			{
				displayName: 'Constraints',
				name: 'constraints',
				type: 'string',
				default: '',
				placeholder: 'json-only,maxLen:500,persona=SupportAgent,policy=NoPII',
				description: 'Generation constraints (comma-separated key=value pairs)',
			},
			{
				displayName: 'Target Data Table',
				name: 'targetDataTable',
				type: 'string',
				default: '',
				placeholder: 'my-prompt-dataset',
				description: 'Name of the data table to create or update',
				required: true,
			},

			// Advanced properties (collapsed by default)
			{
				displayName: 'Advanced Options',
				name: 'advancedOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Sub-workflows',
						name: 'includeSubWorkflows',
						type: 'boolean',
						default: false,
						description: 'Whether to analyze sub-workflows for additional context',
					},
					{
						displayName: 'Generation Provider',
						name: 'generationProvider',
						type: 'options',
						default: 'auto',
						description: 'Which provider to use for dataset generation',
						options: [
							{
								name: 'Auto (Based on Credentials)',
								value: 'auto',
								description: 'Automatically select the best available provider',
							},
							{
								name: 'AI Gateway',
								value: 'aiGateway',
								description: 'Use Ostinato/Outshift AI Gateway',
							},
							{
								name: 'Local Fallback (Dev Only)',
								value: 'localFallback',
								description: 'Generate synthetic data for testing',
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];

		// Get parameters
		const numberOfExamples = this.getNodeParameter('numberOfExamples', 0) as number;
		const promptStyles = this.getNodeParameter('promptStyles', 0) as string[];
		const constraints = this.getNodeParameter('constraints', 0) as string;
		const targetDataTable = this.getNodeParameter('targetDataTable', 0) as string;

		const advancedOptions = this.getNodeParameter('advancedOptions', 0, {}) as any;
		const includeSubWorkflows = advancedOptions.includeSubWorkflows || false;
		const generationProvider = advancedOptions.generationProvider || 'auto';

		// Helper function to get current workflow data
		const getCurrentWorkflowData = (): any => {
			try {
				const workflow = this.getWorkflow();
				const workflowData = this.getWorkflowDataProxy(0);

				return {
					id: workflow.id || workflowData.workflow?.id,
					name: workflow.name || workflowData.workflow?.name || 'Current Workflow',
					nodes: workflowData.workflow?.nodes || [],
				};
			} catch (error) {
				throw new Error(`Failed to get current workflow: ${(error as Error).message}`);
			}
		};

		try {
			// Validate parameters
			const genParams: GenParams = {
				n: numberOfExamples,
				styles: promptStyles,
				constraints: constraints || undefined,
			};
			validateGenParams(genParams);

			// Get current workflow data directly
			const workflowJson = getCurrentWorkflowData();

			// Auto-describe the workflow
			const workflowSummary = autodescribe(workflowJson, { includeSubs: includeSubWorkflows });

			// Generate prompts using the selected provider
			const generator = new PromptGenerator(this);
			const providerType = generationProvider === 'auto' ? undefined : generationProvider;
			const generationResult = await generator.generate(
				workflowSummary,
				genParams,
				['input_prompt', 'expected', 'tags', 'notes', 'version', 'workflow_id', 'created_at'],
				providerType,
			);

			// Validate generated rows
			const { validRows, rejectedCount, firstErrors } = validateDatasetRows(generationResult.rows);

			if (validRows.length < numberOfExamples * 0.9) {
				throw new Error(
					`Generated ${validRows.length} valid rows but expected at least ${Math.floor(
						numberOfExamples * 0.9,
					)}. ` + `Rejected: ${rejectedCount}. First errors: ${firstErrors.slice(0, 3).join('; ')}`,
				);
			}

			// Create/ensure data table and insert rows
			const dataTableManager = await createDataTableManager(this);
			const { tableId } = await dataTableManager.ensureTable(targetDataTable);
			const insertedCount = await dataTableManager.insertRows(
				tableId,
				validRows.slice(0, numberOfExamples),
				{
					optimizeBulk: true,
					chunkSize: 500,
				},
			);

			// Create run label for evaluation correlation
			const runLabel =
				generationResult.rows[0]?.version ||
				new Date().toISOString().slice(0, 16).replace('T', '-');

			// Prepare result
			const result: GenerationResult = {
				ok: true,
				provider: generationResult.provider,
				workflowId: workflowJson.id,
				tableId,
				count: insertedCount,
				runLabel,
				rejectedCount: rejectedCount > 0 ? rejectedCount : undefined,
				firstErrors: firstErrors.length > 0 ? firstErrors.slice(0, 3) : undefined,
			};

			returnData.push({
				json: result as unknown as IDataObject,
				pairedItem: { item: 0 },
			});
		} catch (error) {
			const errorResult = {
				ok: false,
				provider: 'unknown',
				workflowId: '',
				tableId: '',
				count: 0,
				runLabel: '',
				error: {
					message: (error as Error).message,
					type: (error as Error).constructor.name,
				},
			} as IDataObject;

			returnData.push({
				json: errorResult,
				pairedItem: { item: 0 },
			});

			// Also throw the error to mark the execution as failed
			throw new NodeOperationError(this.getNode(), (error as Error).message);
		}

		return [returnData];
	}
}
