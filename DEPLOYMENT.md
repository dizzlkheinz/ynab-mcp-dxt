# YNAB MCP Server Deployment Guide

This guide provides comprehensive instructions for deploying the YNAB MCP Server with security best practices.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Build Process](#build-process)
- [Deployment Options](#deployment-options)
- [Security Best Practices](#security-best-practices)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (or yarn/pnpm equivalent)
- **Operating System**: Linux, macOS, or Windows
- **Memory**: Minimum 512MB RAM
- **Storage**: Minimum 100MB free space

### YNAB Requirements

- Active YNAB subscription
- YNAB Personal Access Token (see [Environment Setup](#environment-setup))

## Environment Setup

### 1. YNAB Personal Access Token

1. Log in to your YNAB account at [app.youneedabudget.com](https://app.youneedabudget.com)
2. Go to Account Settings → Developer Settings
3. Click "New Token"
4. Enter a descriptive name (e.g., "MCP Server")
5. Copy the generated token immediately (it won't be shown again)

### 2. Environment Variables

Create a `.env` file in your project root (never commit this file):

```bash
# Required
YNAB_ACCESS_TOKEN=your_personal_access_token_here

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

#### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YNAB_ACCESS_TOKEN` | ✅ Yes | - | Your YNAB Personal Access Token |
| `NODE_ENV` | ❌ No | `development` | Runtime environment (`development`, `production`, `test`) |
| `LOG_LEVEL` | ❌ No | `info` | Logging level (`error`, `warn`, `info`, `debug`) |

### 3. Environment Validation

Validate your environment setup:

```bash
npm run validate-env
```

This script will:
- Check for required environment variables
- Validate token format
- Verify optional configurations
- Display warnings for missing optional variables

## Build Process

### Development Build

```bash
# Install dependencies
npm install

# Build for development (includes source maps and declarations)
npm run build

# Start development server with file watching
npm run dev
```

### Production Build

```bash
# Clean previous builds
npm run clean

# Validate environment
npm run validate-env

# Run linting and type checking
npm run lint
npm run type-check

# Run all tests
npm run test:all

# Build for production (optimized, no source maps)
npm run build:prod
```

### Build Output Structure

```
dist/
├── index.js                 # Main server entry point
├── index.d.ts              # Type declarations
├── server/
│   ├── YNABMCPServer.js    # Core server implementation
│   ├── errorHandler.js     # Error handling middleware
│   ├── rateLimiter.js      # Rate limiting
│   └── ...
├── tools/                  # MCP tool implementations
└── types/                  # Type definitions
```

## Deployment Options

### Option 1: Local Development

```bash
# Start the server
npm start

# Or with environment variables inline
YNAB_ACCESS_TOKEN=your_token npm start
```

### Option 2: Process Manager (PM2)

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Create PM2 ecosystem file (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'ynab-mcp-server',
    script: 'dist/index.js',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

3. Deploy with PM2:
```bash
# Build the application
npm run build:prod

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

### Option 3: Docker Deployment

1. Create `Dockerfile`:
```dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Expose port (if needed for health checks)
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
```

2. Create `.dockerignore`:
```
node_modules
src
.git
.env
*.md
.eslintrc.json
tsconfig*.json
vitest.config.ts
```

3. Build and run:
```bash
# Build Docker image
docker build -t ynab-mcp-server .

# Run container
docker run -d \
  --name ynab-mcp-server \
  -e YNAB_ACCESS_TOKEN=your_token \
  -e NODE_ENV=production \
  --restart unless-stopped \
  ynab-mcp-server
```

### Option 4: Systemd Service (Linux)

1. Create service file (`/etc/systemd/system/ynab-mcp-server.service`):
```ini
[Unit]
Description=YNAB MCP Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/ynab-mcp-server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info
EnvironmentFile=/opt/ynab-mcp-server/.env

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ynab-mcp-server

[Install]
WantedBy=multi-user.target
```

2. Enable and start service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ynab-mcp-server
sudo systemctl start ynab-mcp-server
```

## Security Best Practices

### 1. Token Security

- **Never commit tokens to version control**
- Store tokens in environment variables only
- Use different tokens for different environments
- Rotate tokens regularly (every 90 days recommended)
- Monitor token usage in YNAB Developer Settings

### 2. File Permissions

```bash
# Set restrictive permissions on sensitive files
chmod 600 .env
chmod 700 scripts/
```

### 3. Network Security

- Run the server in a private network when possible
- Use firewall rules to restrict access
- Consider using a reverse proxy (nginx, Apache) for additional security layers

### 4. Process Security

- Run the server as a non-root user
- Use process managers with automatic restart capabilities
- Implement proper logging without exposing sensitive data
- Set up log rotation to prevent disk space issues

### 5. Monitoring

- Monitor server health and performance
- Set up alerts for authentication failures
- Track API rate limiting and usage patterns
- Monitor for unusual access patterns

## Monitoring and Maintenance

### Health Checks

Create a simple health check endpoint or script:

```javascript
// health-check.js
const { spawn } = require('child_process');

const healthCheck = spawn('node', ['dist/index.js', '--health-check']);

healthCheck.on('close', (code) => {
  process.exit(code);
});
```

### Log Management

- Use structured logging in production
- Implement log rotation (logrotate on Linux)
- Monitor logs for errors and performance issues
- Set up centralized logging if running multiple instances

### Updates and Maintenance

1. **Regular Updates**:
   ```bash
   # Update dependencies
   npm audit
   npm update
   
   # Rebuild and test
   npm run build:prod
   npm run test:all
   ```

2. **Token Rotation**:
   - Generate new token in YNAB
   - Update environment variables
   - Restart the server
   - Revoke old token

3. **Backup Strategy**:
   - Backup configuration files
   - Document environment setup
   - Keep deployment scripts in version control

## Troubleshooting

### Common Issues

#### 1. Authentication Errors

**Symptoms**: 401 Unauthorized errors
**Solutions**:
- Verify `YNAB_ACCESS_TOKEN` is set correctly
- Check token hasn't expired in YNAB settings
- Ensure token has necessary permissions

#### 2. Rate Limiting

**Symptoms**: 429 Too Many Requests errors
**Solutions**:
- Implement request throttling
- Add retry logic with exponential backoff
- Monitor API usage patterns

#### 3. Memory Issues

**Symptoms**: Server crashes, high memory usage
**Solutions**:
- Monitor memory usage with `process.memoryUsage()`
- Implement proper cleanup in tool handlers
- Consider using streaming for large datasets

#### 4. Network Connectivity

**Symptoms**: Connection timeouts, DNS errors
**Solutions**:
- Verify internet connectivity
- Check firewall rules
- Test YNAB API accessibility: `curl https://api.youneedabudget.com/v1/user`

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

### Performance Monitoring

Monitor key metrics:
- Response times
- Memory usage
- API call frequency
- Error rates

## Support and Resources

- **YNAB API Documentation**: [api.youneedabudget.com](https://api.youneedabudget.com)
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Node.js Best Practices**: [nodejs.org/en/docs/guides](https://nodejs.org/en/docs/guides)

## Security Incident Response

If you suspect a security breach:

1. **Immediate Actions**:
   - Revoke YNAB access token immediately
   - Stop the server
   - Check logs for suspicious activity

2. **Investigation**:
   - Review access logs
   - Check for unauthorized API calls
   - Verify system integrity

3. **Recovery**:
   - Generate new access token
   - Update security measures
   - Restart with enhanced monitoring

Remember: Security is an ongoing process, not a one-time setup. Regularly review and update your security practices.