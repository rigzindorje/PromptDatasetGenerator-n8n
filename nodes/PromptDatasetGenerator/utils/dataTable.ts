import type { IExecuteFunctions, IRequestOptions } from 'n8n-workflow';
import type { DatasetRow, DataTableOptions, N8nApiCfg } from '../types';

interface DataTableColumn {
	id: string;
	name: string;
	type: 'string' | 'number' | 'boolean' | 'datetime' | 'json';
}

interface DataTable {
	id: string;
	name: string;
	columns: DataTableColumn[];
}

interface DataTableCreateRequest {
	name: string;
	columns: DataTableColumn[];
}

interface DataTableRowsRequest {
	rows: Array<Record<string, any>>;
}

/**
 * Utilities for managing n8n Data Tables
 * Handles creation, schema management, and bulk insertion of dataset rows
 */
export class DataTableManager {
	constructor(private executeFunctions: IExecuteFunctions, private n8nApiConfig: N8nApiCfg) {}

	/**
	 * Ensure a data table exists with the correct schema
	 * Creates the table if it doesn't exist, or validates schema if it does
	 */
	async ensureTable(tableName: string): Promise<{ tableId: string }> {
		try {
			// First, try to find existing table by name
			const existingTable = await this.findTableByName(tableName);

			if (existingTable) {
				// Validate schema matches our requirements
				await this.validateTableSchema(existingTable);
				return { tableId: existingTable.id };
			}

			// Table doesn't exist, create it
			const newTable = await this.createTable(tableName);
			return { tableId: newTable.id };
		} catch (error) {
			throw new Error(`Failed to ensure data table '${tableName}': ${(error as Error).message}`);
		}
	}

	/**
	 * Insert rows into the data table with chunking and optimization
	 */
	async insertRows(
		tableId: string,
		rows: DatasetRow[],
		options: DataTableOptions = {},
	): Promise<number> {
		const { optimizeBulk = true, chunkSize = 500 } = options;

		if (rows.length === 0) {
			return 0;
		}

		// Validate and coerce all rows before insertion
		const validRows = rows.map(row => this.coerceRowToSchema(row));

		let insertedCount = 0;

		if (optimizeBulk && validRows.length > chunkSize) {
			// Process in chunks for large datasets
			const chunks = this.chunkArray(validRows, chunkSize);

			for (const chunk of chunks) {
				const chunkCount = await this.insertRowsChunk(tableId, chunk);
				insertedCount += chunkCount;
			}
		} else {
			// Single bulk insert for smaller datasets
			insertedCount = await this.insertRowsChunk(tableId, validRows);
		}

		return insertedCount;
	}

	/**
	 * Find a data table by name
	 */
	private async findTableByName(name: string): Promise<DataTable | null> {
		const requestOptions: IRequestOptions = {
			method: 'GET',
			url: `${this.n8nApiConfig.baseUrl}/rest/data-tables`,
			headers: {
				'X-N8N-API-KEY': this.n8nApiConfig.apiKey,
			},
		};

		try {
			const response = await this.executeFunctions.helpers.request(requestOptions);
			const tables: DataTable[] = response.data || [];

			return tables.find(table => table.name === name) || null;
		} catch (error) {
			// If data tables API doesn't exist or returns 404, assume no tables exist
			if ((error as any)?.response?.status === 404) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Create a new data table with the dataset schema
	 */
	private async createTable(name: string): Promise<DataTable> {
		const createRequest: DataTableCreateRequest = {
			name,
			columns: this.getDatasetSchema(),
		};

		const requestOptions: IRequestOptions = {
			method: 'POST',
			url: `${this.n8nApiConfig.baseUrl}/rest/data-tables`,
			headers: {
				'X-N8N-API-KEY': this.n8nApiConfig.apiKey,
				'Content-Type': 'application/json',
			},
			body: createRequest,
		};

		const response = await this.executeFunctions.helpers.request(requestOptions);
		return response.data;
	}

	/**
	 * Validate that an existing table has the correct schema
	 */
	private async validateTableSchema(table: DataTable): Promise<void> {
		const expectedColumns = this.getDatasetSchema();
		const missingColumns: string[] = [];

		for (const expectedCol of expectedColumns) {
			const existingCol = table.columns.find(col => col.name === expectedCol.name);

			if (!existingCol) {
				missingColumns.push(expectedCol.name);
			} else if (existingCol.type !== expectedCol.type) {
				// Type mismatch - could be handled with column updates in future
				// eslint-disable-next-line no-console
				console.warn(
					`Column '${expectedCol.name}' type mismatch: expected ${expectedCol.type}, got ${existingCol.type}`,
				);
			}
		}

		if (missingColumns.length > 0) {
			throw new Error(
				`Data table '${table.name}' is missing required columns: ${missingColumns.join(', ')}. ` +
					'Please create a new table or update the existing schema.',
			);
		}
	}

	/**
	 * Insert a chunk of rows into the data table
	 */
	private async insertRowsChunk(
		tableId: string,
		rows: Array<Record<string, any>>,
	): Promise<number> {
		const requestOptions: IRequestOptions = {
			method: 'POST',
			url: `${this.n8nApiConfig.baseUrl}/rest/data-tables/${tableId}/rows`,
			headers: {
				'X-N8N-API-KEY': this.n8nApiConfig.apiKey,
				'Content-Type': 'application/json',
			},
			body: { rows } as DataTableRowsRequest,
		};

		const response = await this.executeFunctions.helpers.request(requestOptions);
		return response.data?.insertedCount || rows.length;
	}

	/**
	 * Get the standard dataset schema for data tables
	 */
	private getDatasetSchema(): DataTableColumn[] {
		return [
			{ id: 'input_prompt', name: 'input_prompt', type: 'string' },
			{ id: 'expected', name: 'expected', type: 'string' },
			{ id: 'tags', name: 'tags', type: 'string' },
			{ id: 'notes', name: 'notes', type: 'string' },
			{ id: 'workflow_id', name: 'workflow_id', type: 'string' },
			{ id: 'version', name: 'version', type: 'string' },
			{ id: 'created_at', name: 'created_at', type: 'datetime' },
		];
	}

	/**
	 * Coerce a dataset row to match the data table schema
	 */
	private coerceRowToSchema(row: DatasetRow): Record<string, any> {
		return {
			input_prompt: row.input_prompt || '',
			expected: row.expected || null,
			tags: row.tags || '',
			notes: row.notes || '',
			workflow_id: row.workflow_id || '',
			version: row.version || '',
			created_at: row.created_at || new Date().toISOString(),
		};
	}

	/**
	 * Split an array into chunks of specified size
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];

		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}

		return chunks;
	}
}

/**
 * Helper function to create a DataTableManager instance
 */
export async function createDataTableManager(
	executeFunctions: IExecuteFunctions,
): Promise<DataTableManager> {
	const n8nApiCreds = await executeFunctions.getCredentials('n8nDataTables');

	const config: N8nApiCfg = {
		baseUrl: n8nApiCreds.baseUrl as string,
		apiKey: n8nApiCreds.apiKey as string,
	};

	return new DataTableManager(executeFunctions, config);
}

/**
 * Validate dataset rows against schema requirements
 */
export function validateDatasetRows(rows: DatasetRow[]): {
	validRows: DatasetRow[];
	rejectedCount: number;
	firstErrors: string[];
} {
	const validRows: DatasetRow[] = [];
	const firstErrors: string[] = [];
	let rejectedCount = 0;

	for (const row of rows) {
		try {
			// Validate required fields
			if (!row.input_prompt || typeof row.input_prompt !== 'string') {
				throw new Error('Missing or invalid input_prompt');
			}

			if (!row.workflow_id || typeof row.workflow_id !== 'string') {
				throw new Error('Missing or invalid workflow_id');
			}

			if (!row.created_at || typeof row.created_at !== 'string') {
				throw new Error('Missing or invalid created_at');
			}

			// Validate expected field (can be null or string)
			if (row.expected !== null && row.expected !== undefined && typeof row.expected !== 'string') {
				throw new Error('Invalid expected field - must be string or null');
			}

			validRows.push(row);
		} catch (error) {
			rejectedCount++;
			if (firstErrors.length < 3) {
				firstErrors.push((error as Error).message);
			}
		}
	}

	return { validRows, rejectedCount, firstErrors };
}
