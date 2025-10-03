import type { IExecuteFunctions, ICredentialDataDecryptedObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type {
	IGenerator,
	WorkflowSummary,
	GenParams,
	DatasetRow,
	ProviderType,
	AIGatewayCfg,
} from '../types';
import { AIGatewayProvider } from './providers/aiGateway';
import { LocalFallbackProvider } from './providers/localFallback';

/**
 * Provider router that automatically selects the best available provider
 * based on configured credentials and user preferences
 */
export class PromptGenerator {
	constructor(private executeFunctions: IExecuteFunctions) {}

	/**
	 * Generate prompts using the best available provider
	 */
	async generate(
		summary: WorkflowSummary,
		params: GenParams,
		schema: string[],
		preferredProvider?: ProviderType,
	): Promise<{ rows: DatasetRow[]; meta: any; provider: ProviderType }> {
		const provider = preferredProvider || this.selectProvider();
		const generator = await this.createGenerator(provider);

		const result = await generator.generate(summary, params, schema);

		return {
			...result,
			provider,
			meta: result.meta || {},
		};
	}

	/**
	 * Automatically select the best provider based on available credentials
	 */
	private selectProvider(): ProviderType {
		// Check for AI Gateway credentials
		try {
			this.executeFunctions.getCredentials('aiGatewayApi');
			return 'aiGateway';
		} catch (error) {
			// Credentials not available, fall back
		}

		// TODO: Add external provider check when implemented
		// if (this.hasCredentials('promptGenApi')) {
		//     return 'external';
		// }

		// Fall back to local development provider
		return 'localFallback';
	}

	/**
	 * Create a generator instance for the specified provider
	 */
	private async createGenerator(provider: ProviderType): Promise<IGenerator> {
		switch (provider) {
			case 'aiGateway':
				return await this.createAIGatewayProvider();

			case 'external':
				throw new Error('External PromptGen provider not yet implemented');

			case 'localFallback':
				return new LocalFallbackProvider();

			default:
				throw new Error(`Unknown provider type: ${provider}`);
		}
	}

	/**
	 * Create and configure AI Gateway provider
	 */
	private async createAIGatewayProvider(): Promise<AIGatewayProvider> {
		const credentials = await this.executeFunctions.getCredentials('aiGatewayApi');

		const config: AIGatewayCfg = {
			appEndpoint: credentials.appEndpoint as string,
			apiKey: credentials.apiKey as string,
			timeoutMs: (credentials.timeoutMs as number) || 60000,
			rateLimitRps: (credentials.rateLimitRps as number) || 2,
		};

		return new AIGatewayProvider(config);
	}

	/**
	 * Get and validate credentials
	 */
	private async getCredentials(credentialType: string): Promise<ICredentialDataDecryptedObject> {
		try {
			const credentials = await this.executeFunctions.getCredentials(credentialType);
			if (!credentials) {
				throw new NodeOperationError(
					this.executeFunctions.getNode(),
					`No ${credentialType} credentials found`,
				);
			}
			return credentials;
		} catch (error) {
			throw new NodeOperationError(
				this.executeFunctions.getNode(),
				`Failed to get credentials: ${(error as Error).message}`,
			);
		}
	}
}

/**
 * Utility function to get the default generation parameters
 */
export function getDefaultGenParams(): GenParams {
	return {
		n: 50,
		styles: ['baseline', 'edge-cases', 'paraphrases'],
		constraints: undefined,
	};
}

/**
 * Utility function to validate generation parameters
 */
export function validateGenParams(params: GenParams): void {
	if (params.n < 1 || params.n > 2000) {
		throw new Error('Number of examples must be between 1 and 2000');
	}

	if (!Array.isArray(params.styles) || params.styles.length === 0) {
		throw new Error('At least one prompt style must be selected');
	}

	const validStyles = [
		'baseline',
		'edge-cases',
		'paraphrases',
		'format-strict',
		'adversarial-soft',
	];
	const invalidStyles = params.styles.filter(style => !validStyles.includes(style));
	if (invalidStyles.length > 0) {
		throw new Error(`Invalid prompt styles: ${invalidStyles.join(', ')}`);
	}
}

/**
 * Parse constraints string into structured format
 */
export function parseConstraints(
	constraintsStr?: string,
): Record<string, string | number | boolean> {
	if (!constraintsStr) {
		return {};
	}

	const constraints: Record<string, string | number | boolean> = {};
	const parts = constraintsStr.split(',').map(p => p.trim());

	for (const part of parts) {
		if (part.includes('=')) {
			const [key, value] = part.split('=', 2);
			const trimmedKey = key.trim();
			const trimmedValue = value.trim();

			// Try to parse as number or boolean
			if (trimmedValue.toLowerCase() === 'true') {
				constraints[trimmedKey] = true;
			} else if (trimmedValue.toLowerCase() === 'false') {
				constraints[trimmedKey] = false;
			} else if (!isNaN(Number(trimmedValue))) {
				constraints[trimmedKey] = Number(trimmedValue);
			} else {
				constraints[trimmedKey] = trimmedValue;
			}
		} else {
			// Boolean flag
			constraints[part] = true;
		}
	}

	return constraints;
}
