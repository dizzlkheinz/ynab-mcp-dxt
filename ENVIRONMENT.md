# Environment Configuration Guide

This document provides detailed information about environment variables and configuration options for the YNAB MCP Server.

## Environment Variables

### Required Variables

#### YNAB_ACCESS_TOKEN

- **Type**: String
- **Required**: Yes
- **Description**: Your YNAB Personal Access Token for API authentication
- **Security**: Highly sensitive - never commit to version control
- **Format**: Alphanumeric string (typically 64 characters)
- **Example**: `YNAB_ACCESS_TOKEN=1234567890abcdef...`

**How to obtain**:
1. Log in to [YNAB Web App](https://app.youneedabudget.com)
2. Go to Account Settings → Developer Settings
3. Click "New Token"
4. Provide a descriptive name
5. Copy the token immediately (it's only shown once)

**Security considerations**:
- Store in environment variables only
- Never log or expose in error messages
- Rotate regularly (recommended: every 90 days)
- Use different tokens for different environments

### Optional Variables

#### NODE_ENV

- **Type**: String
- **Required**: No
- **Default**: `development`
- **Valid Values**: `development`, `production`, `test`
- **Description**: Specifies the runtime environment
- **Example**: `NODE_ENV=production`

**Effects by environment**:
- `development`: Verbose logging, source maps enabled, development optimizations
- `production`: Minimal logging, optimized builds, production security settings
- `test`: Test-specific configurations, mock data enabled

#### LOG_LEVEL

- **Type**: String
- **Required**: No
- **Default**: `info`
- **Valid Values**: `error`, `warn`, `info`, `debug`
- **Description**: Controls the verbosity of application logging
- **Example**: `LOG_LEVEL=warn`

**Log levels explained**:
- `error`: Only critical errors that may cause the application to fail
- `warn`: Warning messages and non-critical errors
- `info`: General information about application operations
- `debug`: Detailed debugging information (not recommended for production)

## Configuration Files

### .env File

Create a `.env` file in your project root for local development:

```bash
# YNAB Configuration
YNAB_ACCESS_TOKEN=your_personal_access_token_here

# Application Configuration
NODE_ENV=development
LOG_LEVEL=info
```

**Important**: 
- Add `.env` to your `.gitignore` file
- Never commit `.env` files to version control
- Use different `.env` files for different environments

### Environment-Specific Configuration

#### Development (.env.development)

```bash
YNAB_ACCESS_TOKEN=dev_token_here
NODE_ENV=development
LOG_LEVEL=debug
```

#### Production (.env.production)

```bash
YNAB_ACCESS_TOKEN=prod_token_here
NODE_ENV=production
LOG_LEVEL=warn
```

#### Testing (.env.test)

```bash
YNAB_ACCESS_TOKEN=test_token_here
NODE_ENV=test
LOG_LEVEL=error
```

## Environment Validation

The server includes built-in environment validation that runs automatically during startup and can be run manually.

### Automatic Validation

Environment validation occurs:
- During server startup
- Before building for production
- When running `npm run validate-env`

### Manual Validation

```bash
# Validate current environment
npm run validate-env

# Validate specific environment file
NODE_ENV=production npm run validate-env
```

### Validation Rules

The validation script checks:

1. **Required Variables**:
   - Presence of `YNAB_ACCESS_TOKEN`
   - Token format and minimum length
   - Token accessibility (basic format validation)

2. **Optional Variables**:
   - Valid values for `NODE_ENV`
   - Valid values for `LOG_LEVEL`
   - Type checking for all variables

3. **Security Checks**:
   - Warns if using development tokens in production
   - Checks for common token format issues
   - Validates environment consistency

## Platform-Specific Setup

### Linux/macOS

```bash
# Set environment variables in shell
export YNAB_ACCESS_TOKEN="your_token_here"
export NODE_ENV="production"

# Or use a .env file with dotenv
npm install dotenv
```

### Windows (Command Prompt)

```cmd
set YNAB_ACCESS_TOKEN=your_token_here
set NODE_ENV=production
```

### Windows (PowerShell)

```powershell
$env:YNAB_ACCESS_TOKEN="your_token_here"
$env:NODE_ENV="production"
```

### Docker

```dockerfile
# In Dockerfile
ENV NODE_ENV=production

# Or via docker run
docker run -e YNAB_ACCESS_TOKEN=your_token -e NODE_ENV=production ynab-mcp-server
```

### Docker Compose

```yaml
version: '3.8'
services:
  ynab-mcp-server:
    build: .
    environment:
      - YNAB_ACCESS_TOKEN=${YNAB_ACCESS_TOKEN}
      - NODE_ENV=production
      - LOG_LEVEL=info
    env_file:
      - .env.production
```

## CI/CD Configuration

### GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Validate environment
        env:
          YNAB_ACCESS_TOKEN: ${{ secrets.YNAB_ACCESS_TOKEN }}
          NODE_ENV: production
        run: npm run validate-env
      
      - name: Build
        run: npm run build:prod
      
      - name: Test
        env:
          YNAB_ACCESS_TOKEN: ${{ secrets.YNAB_ACCESS_TOKEN }}
        run: npm run test:all
```

### GitLab CI

```yaml
stages:
  - validate
  - build
  - test
  - deploy

validate:
  stage: validate
  script:
    - npm ci
    - npm run validate-env
  variables:
    NODE_ENV: production

build:
  stage: build
  script:
    - npm run build:prod
  artifacts:
    paths:
      - dist/
```

## Security Best Practices

### Token Management

1. **Rotation Strategy**:
   ```bash
   # Script for token rotation
   #!/bin/bash
   echo "Generating new YNAB token..."
   # Manual step: Generate new token in YNAB
   read -p "Enter new token: " NEW_TOKEN
   
   # Update environment
   sed -i "s/YNAB_ACCESS_TOKEN=.*/YNAB_ACCESS_TOKEN=$NEW_TOKEN/" .env.production
   
   # Restart service
   systemctl restart ynab-mcp-server
   
   echo "Token updated successfully"
   ```

2. **Access Control**:
   ```bash
   # Restrict file permissions
   chmod 600 .env*
   chown app:app .env*
   ```

3. **Monitoring**:
   - Log authentication attempts (without exposing tokens)
   - Monitor for unusual API usage patterns
   - Set up alerts for authentication failures

### Environment Isolation

1. **Separate Tokens**: Use different YNAB tokens for each environment
2. **Network Isolation**: Deploy environments in separate networks
3. **Access Controls**: Limit who can access production environment variables

## Troubleshooting

### Common Environment Issues

#### 1. Token Not Found

**Error**: `YNAB_ACCESS_TOKEN is required`

**Solutions**:
- Verify the environment variable is set: `echo $YNAB_ACCESS_TOKEN`
- Check `.env` file exists and contains the token
- Ensure the token is not wrapped in quotes incorrectly

#### 2. Invalid Token Format

**Error**: `YNAB_ACCESS_TOKEN appears to be too short`

**Solutions**:
- Verify you copied the complete token from YNAB
- Check for extra spaces or characters
- Generate a new token if the current one is corrupted

#### 3. Environment Mismatch

**Error**: Environment validation warnings

**Solutions**:
- Ensure `NODE_ENV` matches your intended environment
- Verify all required variables are set for the target environment
- Check for typos in environment variable names

#### 4. Permission Denied

**Error**: Cannot read environment file

**Solutions**:
- Check file permissions: `ls -la .env`
- Ensure the application user has read access
- Verify the file path is correct

### Debug Environment Issues

```bash
# Check all environment variables
printenv | grep YNAB

# Validate specific environment
NODE_ENV=production npm run validate-env

# Test token connectivity
curl -H "Authorization: Bearer $YNAB_ACCESS_TOKEN" https://api.youneedabudget.com/v1/user
```

## Migration Guide

### From v1.0 to v2.0

If upgrading from an older version:

1. **New Required Variables**: None
2. **Changed Variables**: None
3. **Deprecated Variables**: None
4. **New Optional Variables**: `LOG_LEVEL`

### Environment File Migration

```bash
# Backup existing environment
cp .env .env.backup

# Add new optional variables
echo "LOG_LEVEL=info" >> .env

# Validate new configuration
npm run validate-env
```

## Support

For environment configuration issues:

1. **Check this documentation** for common solutions
2. **Run validation script**: `npm run validate-env`
3. **Check logs** for specific error messages
4. **Verify YNAB token** in YNAB Developer Settings
5. **Test connectivity** to YNAB API directly

Remember: Never share your YNAB access token or include it in support requests.