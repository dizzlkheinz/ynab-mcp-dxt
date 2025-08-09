# YNAB MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with secure access to You Need A Budget (YNAB) data and functionality. This server enables AI applications to help users manage their personal finances by interacting with YNAB budgets, accounts, transactions, and categories through a comprehensive set of tools.

## Features

- **Complete YNAB Integration**: Access all major YNAB features including budgets, accounts, transactions, categories, payees, and monthly data
- **Smart Financial Analysis**: Statistical spending trends using linear regression, accurate overspending detection, comprehensive budget optimization insights, and AI-generated recommendations
- **Secure Authentication**: Uses YNAB Personal Access Tokens with proper security practices
- **Comprehensive Error Handling**: Robust error handling with detailed feedback and security-conscious error messages
- **Type Safety**: Built with TypeScript for enhanced reliability and developer experience
- **Extensive Testing**: Unit, integration, end-to-end, and performance tests with high coverage
- **Production Ready**: Includes deployment guides, monitoring, and security best practices

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

## Available Tools

The server provides 21 MCP tools organized into categories:

### Budget Management
- `list_budgets` - List all user budgets
- `get_budget` - Get detailed budget information

### Account Management
- `list_accounts` - List accounts for a budget
- `get_account` - Get specific account details
- `create_account` - Create new account

### Transaction Management
- `list_transactions` - List transactions with filtering options
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

### Financial Analysis & Insights
- `financial_overview` - Comprehensive multi-month financial analysis with trends and AI insights
- `spending_analysis` - Detailed spending analysis with category breakdowns and trends
- `cash_flow_forecast` - Predictive cash flow modeling based on historical data and scheduled transactions
- `budget_health_check` - Budget health assessment with scoring and actionable recommendations

### Natural Language & AI Tools
- `natural-language-query` - Process natural language queries about budget data
- `get-smart-suggestions` - Get contextual AI suggestions for YNAB operations

### Utilities
- `get_user` - Get authenticated user information
- `convert_amount` - Convert between dollars and milliunits

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: Check the [docs/](docs/) directory for detailed guides
- **Issues**: Report bugs and request features via GitHub Issues
- **YNAB API**: [Official YNAB API Documentation](https://api.youneedabudget.com/)
- **MCP Protocol**: [Model Context Protocol Documentation](https://modelcontextprotocol.io/)

## Acknowledgments

- Built with the [YNAB JavaScript SDK](https://github.com/ynab/ynab-sdk-js)
- Uses the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Inspired by the YNAB community and their commitment to financial wellness