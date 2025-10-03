import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class N8nDataTables implements ICredentialType {
	name = 'n8nDataTables';

	displayName = 'n8n API';

	documentationUrl = 'https://docs.n8n.io/api/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://your-n8n-instance.com',
			placeholder: 'https://your-n8n-instance.com',
			description: 'The base URL of your n8n instance (for Data Tables creation)',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'n8n API key for creating and managing Data Tables',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-N8N-API-KEY': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/workflows',
			method: 'GET',
		},
	};
}
