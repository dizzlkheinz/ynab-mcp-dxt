#!/usr/bin/env node
/**
 * Generates a PR description from template with smart defaults
 * Usage: node scripts/create-pr-description.js [options]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the PR template
const templatePath = path.join(__dirname, '..', '.github', 'pull_request_template.md');
const template = fs.readFileSync(templatePath, 'utf-8');

// Read package.json for version info
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);

// Read CHANGELOG.md if it exists
let changelogEntries = '';
try {
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf-8');
  // Extract the latest version entries
  const latestSection = changelog.split('##')[1];
  changelogEntries = latestSection ? `## Latest Changes\n\n${latestSection}` : '';
} catch (err) {
  // No changelog
}

// Get git info
let commitMessages = '';
try {
  const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  const baseBranch = 'master'; // or 'main'

  // Get commit messages since branching
  const commits = execSync(`git log ${baseBranch}..${branch} --pretty=format:"- %s"`, {
    encoding: 'utf-8'
  }).trim();

  if (commits) {
    commitMessages = `## Commits\n\n${commits}\n\n`;
  }
} catch (err) {
  console.warn('Could not get git commit info');
}

// Get file change stats
let changeStats = '';
try {
  const stats = execSync('git diff --shortstat master...HEAD', {
    encoding: 'utf-8'
  }).trim();

  if (stats) {
    changeStats = `**Changes**: ${stats}\n\n`;
  }
} catch (err) {
  console.warn('Could not get change stats');
}

// Smart defaults based on branch name and commits
function detectChangeType(branchName, commits) {
  const name = branchName.toLowerCase();
  const commitText = commits.toLowerCase();

  if (name.includes('major') || commitText.includes('breaking') || commitText.includes('major:')) {
    return 'Major';
  } else if (name.includes('minor') || name.includes('feature') || name.includes('feat')) {
    return 'Minor';
  } else if (name.includes('patch') || name.includes('fix') || name.includes('hotfix')) {
    return 'Patch';
  }

  return 'Unknown';
}

const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
const changeType = detectChangeType(branch, commitMessages);

// Build the description
let description = template;

// Add summary if we have commits
if (commitMessages) {
  const summarySection = commitMessages.split('\n').slice(0, 5).join('\n');
  description = description.replace(
    'Describe the change and its motivation.',
    `Describe the change and its motivation.\n\n${summarySection}`
  );
}

// Pre-check the type of change if we detected it
if (changeType === 'Major') {
  description = description.replace('- [ ] Major', '- [x] Major');
} else if (changeType === 'Minor') {
  description = description.replace('- [ ] Minor', '- [x] Minor');
} else if (changeType === 'Patch') {
  description = description.replace('- [ ] Patch', '- [x] Patch');
}

// Add version info
const currentVersion = packageJson.version;
description = description.replace(
  '`X.Y.Z` → `X.Y.Z`',
  `\`${currentVersion}\` → \`${currentVersion}\``
);

// Add changelog entries if available
if (changelogEntries) {
  description += `\n\n---\n\n${changelogEntries}`;
}

// Add change stats if available
if (changeStats) {
  description += `\n\n${changeStats}`;
}

// Add commit history
if (commitMessages) {
  description += `\n${commitMessages}`;
}

// Output the description
console.log(description);

// Optionally write to file
const outputPath = path.join(__dirname, '..', '.pr-description.md');
fs.writeFileSync(outputPath, description);
console.error(`\n✅ PR description written to: ${outputPath}`);
console.error('\nTo create PR with this description:');
console.error(`  gh pr create --body-file .pr-description.md --title "Your PR title"`);
