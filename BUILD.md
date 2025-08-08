# Build and Development Guide

This document provides comprehensive information about building, developing, and maintaining the YNAB MCP Server.

## Quick Start

```bash
# Install dependencies
npm install

# Validate environment
npm run validate-env

# Build the project
npm run build

# Run tests
npm test

# Start the server
npm start
```

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone the repository
git clone <repository-url>
cd ynab-mcp-server

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your YNAB_ACCESS_TOKEN
```

### 2. Development Commands

```bash
# Start development server with file watching
npm run dev

# Run linting
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Type checking without building
npm run type-check

# Run tests in watch mode
npm run test:watch
```

### 3. Code Quality

The project includes several code quality tools:

- **ESLint**: Code linting and style enforcement
- **TypeScript**: Static type checking
- **Prettier**: Code formatting (via ESLint integration)
- **Vitest**: Testing framework

## Build Process

### Development Build

```bash
npm run build
```

This creates a development build with:
- Source maps for debugging
- TypeScript declarations
- Unminified code
- Development optimizations

### Production Build

```bash
npm run build:prod
```

This creates an optimized production build with:
- No source maps
- Minified code
- Production optimizations
- Build verification
- Environment validation

### Build Steps Explained

1. **Pre-build**: Cleans previous builds and validates environment
2. **TypeScript Compilation**: Compiles TypeScript to JavaScript
3. **Declaration Generation**: Creates TypeScript declaration files
4. **Build Verification**: Ensures all required files are present
5. **Post-build**: Runs any additional build steps

### Build Output Structure

```
dist/
├── index.js                    # Main entry point
├── index.d.ts                  # Main type declarations
├── server/
│   ├── YNABMCPServer.js       # Core server implementation
│   ├── YNABMCPServer.d.ts     # Server type declarations
│   ├── errorHandler.js        # Error handling
│   ├── rateLimiter.js         # Rate limiting
│   └── ...                    # Other server modules
├── tools/
│   ├── budgetTools.js         # Budget management tools
│   ├── accountTools.js        # Account management tools
│   ├── transactionTools.js    # Transaction tools
│   └── ...                    # Other tool modules
└── types/
    ├── index.js               # Type definitions
    └── index.d.ts             # Type declarations
```

## Testing

### Test Types

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test component interactions
3. **End-to-End Tests**: Test complete workflows
4. **Performance Tests**: Test performance characteristics

### Running Tests

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance

# Run tests with coverage
npm run test:coverage

# Run comprehensive test suite
npm run test:comprehensive
```

### Test Configuration

Tests are configured using Vitest with the following setup:
- Test files: `**/*.test.ts`, `**/*.spec.ts`
- Test environment: Node.js
- Coverage: V8 coverage provider
- Mocking: Built-in Vitest mocking

## Scripts Reference

### Build Scripts

| Script | Description |
|--------|-------------|
| `build` | Development build with source maps |
| `build:prod` | Production build (optimized) |
| `clean` | Remove build artifacts |
| `prebuild` | Pre-build validation and cleanup |
| `verify-build` | Verify build output completeness |

### Development Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start development server with watching |
| `start` | Start production server |
| `start:prod` | Start with production environment |
| `validate-env` | Validate environment variables |

### Quality Scripts

| Script | Description |
|--------|-------------|
| `lint` | Run ESLint on source code |
| `lint:fix` | Fix ESLint issues automatically |
| `type-check` | Run TypeScript type checking |

### Test Scripts

| Script | Description |
|--------|-------------|
| `test` | Run all tests once |
| `test:watch` | Run tests in watch mode |
| `test:unit` | Run unit tests only |
| `test:integration` | Run integration tests only |
| `test:e2e` | Run end-to-end tests only |
| `test:coverage` | Run tests with coverage report |
| `test:performance` | Run performance tests |
| `test:comprehensive` | Run comprehensive test suite |
| `test:all` | Run all test types sequentially |

### Lifecycle Scripts

| Script | Description |
|--------|-------------|
| `prepare` | Run after npm install (builds project) |
| `prepublishOnly` | Run before npm publish (tests + build) |

## Configuration Files

### TypeScript Configuration

- `tsconfig.json`: Development TypeScript configuration
- `tsconfig.prod.json`: Production TypeScript configuration

Key differences:
- Production: No source maps, comments removed
- Development: Source maps, declarations, strict checking

### ESLint Configuration

- `.eslintrc.json`: ESLint rules and parser configuration
- Extends recommended TypeScript ESLint rules
- Custom rules for Node.js environment

### Vitest Configuration

- `vitest.config.ts`: Test framework configuration
- Coverage settings
- Test environment setup

## Environment Management

### Environment Files

- `.env`: Local development environment
- `.env.example`: Template for environment variables
- `.env.test`: Test environment variables
- `.env.production`: Production environment variables

### Environment Validation

The build process includes automatic environment validation:

```bash
# Manual validation
npm run validate-env

# Validation checks:
# - Required variables present
# - Variable format validation
# - Security checks
# - Environment consistency
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Validate environment
      env:
        YNAB_ACCESS_TOKEN: ${{ secrets.YNAB_ACCESS_TOKEN }}
      run: npm run validate-env
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking
      run: npm run type-check
    
    - name: Run tests
      env:
        YNAB_ACCESS_TOKEN: ${{ secrets.YNAB_ACCESS_TOKEN }}
      run: npm run test:all
    
    - name: Build production
      run: npm run build:prod
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

## Performance Optimization

### Build Performance

- Use TypeScript incremental compilation
- Enable build caching where possible
- Optimize dependency resolution
- Use production builds for deployment

### Runtime Performance

- Implement proper error handling
- Use efficient data structures
- Cache frequently accessed data
- Monitor memory usage

## Troubleshooting

### Common Build Issues

#### 1. TypeScript Compilation Errors

```bash
# Check for type errors
npm run type-check

# Common fixes:
# - Update type definitions
# - Fix import/export statements
# - Resolve dependency conflicts
```

#### 2. Missing Dependencies

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Check for peer dependency issues
npm ls
```

#### 3. Environment Issues

```bash
# Validate environment
npm run validate-env

# Check environment file
cat .env

# Verify token format
echo $YNAB_ACCESS_TOKEN | wc -c
```

#### 4. Build Verification Failures

```bash
# Check build output
npm run verify-build

# Manual verification
ls -la dist/
```

### Debug Mode

Enable debug output for troubleshooting:

```bash
# Debug build process
DEBUG=* npm run build

# Debug tests
DEBUG=* npm test

# Debug server startup
DEBUG=* npm start
```

## Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Set up development environment
4. Make changes following code style
5. Add tests for new functionality
6. Run full test suite
7. Submit pull request

### Code Style

- Follow TypeScript best practices
- Use ESLint configuration
- Write comprehensive tests
- Document public APIs
- Follow semantic versioning

### Pull Request Process

1. Ensure all tests pass
2. Update documentation
3. Add changelog entry
4. Request code review
5. Address review feedback
6. Merge after approval

## Maintenance

### Regular Tasks

- Update dependencies monthly
- Review and rotate access tokens
- Monitor performance metrics
- Update documentation
- Review security practices

### Dependency Management

```bash
# Check for outdated packages
npm outdated

# Update dependencies
npm update

# Audit for security issues
npm audit
npm audit fix
```

### Performance Monitoring

Monitor key metrics:
- Build times
- Test execution time
- Bundle size
- Memory usage
- API response times