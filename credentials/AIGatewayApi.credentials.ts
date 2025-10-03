import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AIGatewayApi implements ICredentialType {
	name = 'aiGatewayApi';

	displayName = 'AI Gateway API';

	documentationUrl = 'https://docs.outshift.ai/ai-gateway';

	properties: INodeProperties[] = [
		{
			displayName: 'App Endpoint',
			name: 'appEndpoint',
			type: 'string',
			default: '',
			placeholder: 'https://ai-gateway.outshift.ai/api/v1/llm-bridge/your-connection-id',
			description:
				'The AI Gateway LLM Bridge endpoint URL. Do not include /chat/completions suffix.',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'JWT token for AI Gateway authentication',
			required: true,
		},
		{
			displayName: 'Timeout (ms)',
			name: 'timeoutMs',
			type: 'number',
			default: 60000,
			description: 'Request timeout in milliseconds',
			required: false,
		},
		{
			displayName: 'Rate Limit (RPS)',
			name: 'rateLimitRps',
			type: 'number',
			default: 2,
			description: 'Optional client-side rate limiting (requests per second)',
			required: false,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.appEndpoint}}/chat/completions',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: {
				messages: [
					{
						role: 'user',
						content: 'test connection',
					},
				],
			},
		},
	};
}
