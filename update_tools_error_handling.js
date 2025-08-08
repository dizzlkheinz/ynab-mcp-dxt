// Script to update all remaining tool files with centralized error handling
const fs = require('fs');
const path = require('path');

const toolFiles = [
  'src/tools/transactionTools.ts',
  'src/tools/categoryTools.ts', 
  'src/tools/payeeTools.ts',
  'src/tools/monthTools.ts',
  'src/tools/utilityTools.ts'
];

function updateToolFile(filePath) {
  console.log(`Updating ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add import if not already present
  if (!content.includes('withToolErrorHandling')) {
    content = content.replace(
      /import { z } from 'zod';/,
      `import { z } from 'zod';\nimport { withToolErrorHandling } from '../types/index.js';`
    );
  }
  
  // Replace try-catch blocks with withToolErrorHandling
  content = content.replace(
    /try \{([\s\S]*?)\} catch \(error\) \{\s*return handle\w+Error\(error, [^)]+\);\s*\}/g,
    (match, tryBlock) => {
      // Extract the tool name from the function context
      const lines = match.split('\n');
      const functionMatch = content.substring(0, content.indexOf(match)).match(/export async function (handle\w+)/g);
      const lastFunction = functionMatch ? functionMatch[functionMatch.length - 1] : '';
      const toolName = lastFunction.replace('export async function handle', '').toLowerCase();
      
      return `return await withToolErrorHandling(async () => {${tryBlock}}, 'ynab:${toolName}', '${toolName} operation') as Promise<CallToolResult>;`;
    }
  );
  
  // Remove old error handler functions
  content = content.replace(
    /\/\*\*\s*\* Handles errors from \w+-related API calls\s*\*\/\s*function handle\w+Error[\s\S]*?\}/g,
    ''
  );
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

// Update all tool files
toolFiles.forEach(updateToolFile);

console.log('All tool files updated with centralized error handling!');