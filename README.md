# n8n Prompt Dataset Generator

A community node for n8n that automatically generates prompt datasets from existing workflows using AI Gateway integration. Perfect for creating evaluation datasets for AI workflows with minimal manual effort.

## Features

- 🤖 **Auto-describe workflows** - Automatically analyzes workflow JSON to understand LLM nodes, tools, and data flow
- 📊 **Multiple prompt styles** - Generate baseline, edge-cases, paraphrases, format-strict, and adversarial prompts
- 🔌 **AI Gateway integration** - Uses an OpenAI-compatible AI Gateway for intelligent prompt generation
- 📋 **Data Table integration** - Directly inserts datasets into n8n Data Tables for immediate use
- ⚡ **Batch processing** - Handles large datasets with automatic chunking and rate limiting
- 🔒 **Secure credentials** - All API keys and tokens stored securely in n8n credentials
- 🛠️ **Provider-agnostic** - Designed for easy provider switching (AI Gateway → External API)

## Installation

### Via npm (when published)

```bash
npm install n8n-nodes-prompt-dataset-generator
```

### Manual Installation for Development

1. Clone this repository:

   ```bash
   git clone https://github.com/rigzindorje/PromptDatasetGenerator-n8n.git
   cd n8n-nodes-prompt-dataset-generator
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the package:

   ```bash
   npm run build
   ```

4. Link to your n8n installation:

   ```bash
   cd ~/.n8n/nodes
   ln -s /path/to/n8n-nodes-prompt-dataset-generator/dist n8n-nodes-prompt-dataset-generator
   ```

5. Restart n8n to load the new node.

## Setup

### 1. AI Gateway Credentials

Create an **AI Gateway API** credential with:

- **App Endpoint**: `https://your-gateway-host/api/v1/llm-bridge/your-connection-id`
  - ⚠️ Do NOT include `/chat/completions` suffix - the node will append it automatically
- **API Key**: Your JWT token from the AI Gateway
- **Timeout (ms)**: Request timeout (default: 60000)
- **Rate Limit (RPS)**: Optional client-side rate limiting (default: 2)

### 2. n8n API Credentials

Create an **n8n API** credential with:

- **Base URL**: Your n8n instance URL (e.g., `https://your-n8n-instance.com`)
- **API Key**: Your n8n API key (generate from Settings → API Keys)

## Usage

### Basic Usage

1. **Add the node** to your workflow
2. **Set number of examples** (1-2000, default: 50)
3. **Choose prompt styles**:
   - **Baseline**: Standard, straightforward prompts
   - **Edge Cases**: Empty inputs, special characters, unusual formats
   - **Paraphrases**: Different ways to express the same request
   - **Format Strict**: Prompts specifying exact output formats
   - **Adversarial Soft**: Mildly challenging or skeptical prompts
4. **Enter constraints** (optional): `json-only,maxLen:500,persona=SupportAgent`
5. **Set target data table name**
6. **Execute** to generate and store the dataset

### Advanced Options

- **Workflow Source**:
  - `Current Workflow` (default): Analyzes the workflow this node runs in
  - `Select Workflow`: Choose any workflow from your n8n instance
- **Include Sub-workflows**: Recursively analyze sub-workflows for additional context
- **Generation Provider**: Override automatic provider selection

### Data Table Schema

The generated data table includes these columns:

| Column         | Type     | Description                                        |
| -------------- | -------- | -------------------------------------------------- |
| `input_prompt` | string   | The generated prompt text                          |
| `expected`     | string   | Expected output (null for Light evaluations)       |
| `tags`         | string   | Comma-separated tags (e.g., `baseline,edge-cases`) |
| `notes`        | string   | Additional context about the prompt                |
| `workflow_id`  | string   | Source workflow identifier                         |
| `version`      | string   | Generation timestamp and connection ID             |
| `created_at`   | datetime | ISO timestamp of generation                        |

## Evaluation Workflow Template

Use this companion template to run evaluations on your generated dataset:

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  Evaluation Trigger │ -> │    Agent Workflow   │ -> │   Evaluation Node   │
│   (Data Table)      │    │                     │    │  (Set Metrics)      │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### Light Evaluation Example

1. **Evaluation Trigger**: Select your generated data table
2. **Agent Node**: Your AI workflow to evaluate
3. **Evaluation Node**: Configure metrics:
   - **Exact Match**: Compare outputs for exact matches
   - **Semantic Similarity**: Use embedding-based similarity
   - **Custom Metrics**: Length, format validation, etc.

## Constraints Format

Constraints are specified as comma-separated `key=value` pairs:

```
json-only,maxLen:500,persona=SupportAgent,policy=NoPII
```

Common constraints:

- `json-only`: Generate prompts expecting JSON responses
- `maxLen:N`: Limit prompt length to N characters
- `persona=Role`: Generate prompts from a specific persona
- `policy=Policy`: Apply content policies (e.g., NoPII, Safe)

## Provider Architecture

The node uses a provider-agnostic architecture:

1. **AI Gateway** (default): Any OpenAI-compatible AI Gateway
2. **External API** (future): Direct PromptGen API integration
3. **Local Fallback** (dev): Synthetic data for testing

Provider selection is automatic based on available credentials.

## API Integration Details

### AI Gateway Integration

- **Endpoint**: `{appEndpoint}/chat/completions`
- **Method**: POST with Chat Completions format
- **Headers**: `Authorization: Bearer {jwt}`, `Content-Type: application/json`
- **Body**: Does NOT include `model`, `api_version`, `organization`, `azure_deployment` - these are configured in the LLM connection
- **Response**: JSONL format in `message.content`

### n8n API Integration

- **Workflows**: `GET /rest/workflows/{id}` to fetch workflow JSON
- **Data Tables**: `POST /rest/data-tables` to create, `POST /rest/data-tables/{id}/rows` to insert

## Development

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:cov         # With coverage
```

### Building

```bash
npm run build            # Build TypeScript
npm run dev              # Watch mode for development
```

### Linting

```bash
npm run lint             # Check linting
npm run lintfix          # Fix linting issues
npm run format           # Format code
```

## Configuration Defaults

| Setting               | Default                           | Description              |
| --------------------- | --------------------------------- | ------------------------ |
| Number of examples    | 50                                | Prompt count             |
| Prompt styles         | `baseline,edge-cases,paraphrases` | Default styles           |
| Constraints           | (empty)                           | No constraints           |
| Include sub-workflows | false                             | Performance optimization |
| Chunk size            | 200                               | AI Gateway batch size    |
| Timeout               | 60000ms                           | Request timeout          |
| Rate limit            | 2 RPS                             | Client-side throttling   |

## Troubleshooting

### Common Issues

1. **"AI Gateway request failed: 401"**

   - Check your JWT token in AI Gateway credentials
   - Verify the app endpoint URL is correct
   - Ensure the LLM connection is active in AI Gateway

2. **"Data table schema mismatch"**

   - Delete the existing data table and let the node recreate it
   - Or manually add missing columns to match the schema

3. **"Generated fewer rows than expected"**

   - Check the AI Gateway response format
   - Review `firstErrors` in node output for parsing issues
   - Try reducing batch size or constraints complexity

4. **"Workflow not found"**
   - Verify n8n API credentials and permissions
   - Check workflow ID is correct
   - Ensure workflow is accessible to the API key user

### Rate Limiting

If you encounter rate limiting:

- Reduce `rateLimitRps` in AI Gateway credentials
- Lower `numberOfExamples` to reduce API calls
- Check AI Gateway connection limits

### Development Mode

Use the Local Fallback provider for testing:

- Set `Generation Provider` to `Local Fallback (Dev Only)`
- Generates deterministic synthetic data
- No external API calls required

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/rigzindorje/PromptDatasetGenerator-n8n/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/rigzindorje/PromptDatasetGenerator-n8n/discussions)
- 📚 **Documentation**: [Wiki](https://github.com/rigzindorje/PromptDatasetGenerator-n8n/wiki)

---

**Made with ❤️ for the n8n community**
