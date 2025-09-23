# YNAB MCP Server

[![Download latest DXT](https://img.shields.io/badge/Download-latest%20DXT-blue?logo=github)](https://github.com/dizzlkheinz/mcp-for-ynab/releases/latest)

[![Release](https://img.shields.io/github/v/release/dizzlkheinz/mcp-for-ynab?sort=semver)](https://github.com/dizzlkheinz/mcp-for-ynab/releases/latest)
[![Release DXT](https://github.com/dizzlkheinz/mcp-for-ynab/actions/workflows/release.yml/badge.svg)](https://github.com/dizzlkheinz/mcp-for-ynab/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/dizzlkheinz/mcp-for-ynab/total.svg)](https://github.com/dizzlkheinz/mcp-for-ynab/releases)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)
[![lint: eslint](https://img.shields.io/badge/lint-eslint-green.svg)](https://eslint.org)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org)
[![SemVer](https://img.shields.io/badge/SemVer-0.y.z-yellow.svg)](docs/VERSIONING.md)
[![Issues](https://img.shields.io/github/issues/dizzlkheinz/mcp-for-ynab)](https://github.com/dizzlkheinz/mcp-for-ynab/issues)
[![PRs](https://img.shields.io/github/issues-pr/dizzlkheinz/mcp-for-ynab)](https://github.com/dizzlkheinz/mcp-for-ynab/pulls)

A Model Context Protocol (MCP) server that provides AI assistants with secure access to You Need A Budget (YNAB) data and functionality. This server enables AI applications to help users manage their personal finances by interacting with YNAB budgets, accounts, transactions, and categories through a comprehensive set of tools.

## 🎉 What's New in v0.7.0

- **💰 Automatic Amount Conversion**: All monetary amounts now automatically convert from YNAB's internal milliunits to dollars for human-readable display
- **🧠 AI-Friendly Responses**: Eliminates confusion where `-1924370` milliunits was misinterpreted as `-$1,924,370` instead of the correct `-$1,924.37`
- **🔧 Enhanced Developer Experience**: No more manual conversion needed - all tools return amounts in standard dollar format
- **✅ Updated Test Suite**: Comprehensive test coverage for amount conversion ensures reliability

## 🎉 What's New in v0.6.0

- **🔧 Consolidated Debug Tools**: Streamlined 5 debug tools into a single comprehensive `diagnostic_info` tool with flexible parameters
- **🏦 Enhanced Bank Reconciliation**: Smart duplicate amount matching with chronological order preference (fixes multiple identical transactions)
- **📅 Automatic Date Adjustment**: Sync YNAB transaction dates with bank processing dates for perfect alignment
- **🎯 Exact Balance Matching**: Zero tolerance reconciliation ensures perfect balance alignment
- **📊 Improved Date Range Reporting**: Clear visibility into reconciliation time periods and data ranges
- **⚡ Better Tool Organization**: Cleaner MCP interface with 80% reduction in debug tool clutter

## Features

- **Complete YNAB Integration**: Access all major YNAB features including budgets, accounts, transactions, categories, payees, and monthly data
- **Automatic Amount Conversion**: All monetary values automatically converted from YNAB's internal milliunits to human-readable dollars
- **Advanced Bank Reconciliation**: Smart duplicate matching, automatic date adjustment, exact balance matching, and comprehensive reporting

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Active YNAB subscription
- YNAB Personal Access Token

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd ynab-mcp-server

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your YNAB_ACCESS_TOKEN

# Build the project
npm run build

# Run tests
npm test

# Start the server
npm start
```

### Getting Your YNAB Access Token

1. Log in to [YNAB Web App](https://app.youneedabudget.com)
2. Go to Account Settings → Developer Settings
3. Click "New Token"
4. Provide a descriptive name (e.g., "MCP Server")
5. Copy the generated token immediately (it's only shown once)
6. Add it to your `.env` file: `YNAB_ACCESS_TOKEN=your_token_here`

## Use with Claude Desktop (.dxt)

There are two ways to use this server as a Claude Desktop MCP extension: download a release DXT or build it locally.

### Option A: Install from Releases

- Download the latest `.dxt` from the GitHub Releases page: https://github.com/dizzlkheinz/mcp-for-ynab/releases/latest
- Open Claude Desktop and drag-and-drop the `.dxt` file into the app.
- Open the extension’s settings in Claude Desktop and set `YNAB_ACCESS_TOKEN` when prompted.
- Restart Claude Desktop if requested.

### Option B: Build locally and install

```bash
# Build a bundled DXT (includes lint + format checks)
npm run package:dxt

# The .dxt will be created at
dist/ynab-mcp-server-<version>.dxt
```

- Drag-and-drop the generated `.dxt` into Claude Desktop.
- In the extension’s settings, set `YNAB_ACCESS_TOKEN` (your YNAB Personal Access Token).

### Verify the token and connectivity

- Run the diagnostic tool `get_env_status` to confirm the token is present (masked preview shown).
- Try a simple call:
  - Read resource `ynab://user` (should return your user id), or
  - Run the `list_budgets` tool.

### Troubleshooting

- “Invalid or expired token” → Recheck `YNAB_ACCESS_TOKEN` in the extension settings; generate a new token in YNAB if needed.
- Use `get_env_status` to confirm Claude passed the token into the server (shows token_present and token_length).
- This DXT is a single-file Node bundle (no node_modules). If Claude Desktop reports a Node/runtime issue, update Claude Desktop to a recent version and try again.

### Configuration Options

Tool responses are JSON strings. To save context, outputs are minified by default. You can control this behavior and other settings via environment variables:

**Output Formatting:**

- `YNAB_MCP_MINIFY_OUTPUT` (default: `true`) — when `true`, responses are compact (no whitespace).
- `YNAB_MCP_PRETTY_SPACES` (default: `2`) — number of spaces used only if minification is disabled.

**Export Settings:**

- `YNAB_EXPORT_PATH` — Directory for exported transaction files. Defaults to platform-specific locations:
  - Windows/Mac: `~/Downloads`
  - Linux/Unix: `~/Documents` (or `$XDG_DOCUMENTS_DIR`)

Examples:

```bash
# Output formatting
YNAB_MCP_MINIFY_OUTPUT=true
YNAB_MCP_PRETTY_SPACES=2

# Custom export location
YNAB_EXPORT_PATH=~/Desktop
# Or absolute paths
YNAB_EXPORT_PATH=C:\Users\YourName\Documents
YNAB_EXPORT_PATH=/home/user/exports
```

## Available Tools

The server provides 25 core tools for budgets, accounts, transactions, categories, payees, months, and financial analysis, plus 2 streamlined diagnostic tools (27 total):

### Budget Management

- `list_budgets` - List all user budgets
- `get_budget` - Get detailed budget information
- `set_default_budget` - Set a default budget for subsequent calls
- `get_default_budget` - Get the currently set default budget

### Account Management

- `list_accounts` - List accounts for a budget
- `get_account` - Get specific account details
- `create_account` - Create new account

### Transaction Management

- `list_transactions` - List transactions with filtering options (auto-suggests export for large results)
- `export_transactions` - Export all transactions to JSON file with descriptive filename and platform-specific default paths
- `compare_transactions` - Compare bank transactions from CSV with YNAB transactions to find missing entries and reconcile accounts
- `reconcile_account` - Comprehensive account reconciliation with smart duplicate matching, automatic date adjustment, exact balance matching, and detailed reporting
- `get_transaction` - Get specific transaction details
- `create_transaction` - Create new transaction
- `update_transaction` - Update existing transaction
- `delete_transaction` - Delete transaction

### Category Management

- `list_categories` - List budget categories
- `get_category` - Get specific category details
- `update_category` - Update category budget allocation

### Payee Management

- `list_payees` - List payees for a budget
- `get_payee` - Get specific payee details

### Monthly Data

- `get_month` - Get monthly budget data
- `list_months` - List all months summary

### Financial Analysis & Insights (work in progress)

- `financial_overview` - Comprehensive multi-month financial analysis with trends and AI insights
- `spending_analysis` - Detailed spending analysis with category breakdowns and trends
- `budget_health_check` - Budget health assessment with scoring and actionable recommendations

### Utilities

- `get_user` - Get authenticated user information
- `convert_amount` - Convert between dollars and milliunits

### Diagnostics

- `diagnostic_info` - Comprehensive server diagnostic information (memory, environment, server info, security stats, cache stats)
- `clear_cache` - Clear the in-memory cache

## Documentation

- **[API Reference](docs/API.md)** - Complete tool documentation with examples
- **[Developer Guide](docs/DEVELOPER.md)** - Best practices and common patterns
- **[Usage Examples](docs/EXAMPLES.md)** - Practical usage examples
- **[Testing Guide](docs/TESTING.md)** - Comprehensive testing information
- **[Build Guide](docs/BUILD.md)** - Build and development workflow
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment instructions
- **[Environment Guide](docs/ENVIRONMENT.md)** - Environment configuration details

## Project Structure

```
ynab-mcp-server/
├── src/
│   ├── server/           # Core server implementation
│   │   └── __tests__/    # Server component tests
│   ├── tools/            # MCP tool implementations
│   │   └── __tests__/    # Tool-specific tests
│   ├── types/            # Type definitions and utilities
│   │   └── __tests__/    # Type definition tests
│   └── __tests__/        # Global test utilities and E2E tests
├── dist/                 # Built JavaScript output
├── docs/                 # Complete documentation
├── scripts/              # Build and utility scripts
└── README.md            # This file
```

## Development

### Development Workflow

```bash
# Start development server with file watching
npm run dev

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run type-check

# Run tests in watch mode
npm run test:watch
```

### Testing

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e           # End-to-end tests (requires real API key)
npm run test:performance   # Performance tests

# Generate coverage report
npm run test:coverage

# Run comprehensive test suite
npm run test:comprehensive
```

## Security

This server follows security best practices:

- **Token Security**: Access tokens are stored securely and never logged
- **Input Validation**: All tool parameters are validated using Zod schemas
- **Error Handling**: Errors are sanitized to prevent information leakage
- **Rate Limiting**: Respects YNAB API rate limits
- **Secure Defaults**: Production-ready security configurations

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the coding standards
4. Add tests for new functionality
5. Ensure all tests pass (`npm run test:all`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Issues & PRs

- Report a bug: https://github.com/dizzlkheinz/mcp-for-ynab/issues/new?template=bug_report.md
- Request a feature: https://github.com/dizzlkheinz/mcp-for-ynab/issues/new?template=feature_request.md
- Open a PR: https://github.com/dizzlkheinz/mcp-for-ynab/compare

Notes:

- PRs use an auto-applied template and a public API checklist (see docs/VERSIONING.md)
- For release planning, use the “Release Checklist” issue template

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See the
[LICENSE](LICENSE) file for details.

## Support

- **Documentation**: Check the [docs/](docs/) directory for detailed guides
- **Issues**: Report bugs and request features via GitHub Issues
- **YNAB API**: [Official YNAB API Documentation](https://api.youneedabudget.com/)
- **MCP Protocol**: [Model Context Protocol Documentation](https://modelcontextprotocol.io/)

## Acknowledgments

- Built with the [YNAB JavaScript SDK](https://github.com/ynab/ynab-sdk-js)
- Uses the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Developed and automated with the OpenAI Codex CLI and Anthropic Claude Code
- Packaged as a DXT extension for Anthropic Claude Desktop (thanks to DXT)
