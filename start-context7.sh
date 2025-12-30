#!/bin/bash
# Start Context7 MCP Server with encryption key from .env.local

# Load environment variables from .env.local
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

# Start Context7 MCP server
npx -y @upstash/context7-mcp@latest
