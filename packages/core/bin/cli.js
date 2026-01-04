#!/usr/bin/env node

import { GitHubTree } from '../index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
    console.log(pkg.version);
    process.exit(0);
}

const helpText = `
  Usage: gh-tree <user/repo> [flags]

  Flags:
    --branch, -b <name>   Specify branch (default: main)
    --token, -t <token>   GitHub PAT (overrides saved token)
    --save-token <token>  Save token locally and exit
    --icons               Show icons in output
    --help, -h            Show this help

  Examples:
    gh-tree facebook/react
    gh-tree mgks/dhwani -b dev --icons
`;

// Simple Arg Parser
const flags = {};
let repo = null;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
        const key = arg.replace(/^-+/, '');
        if (key === 'save-token') {
            saveLocalToken(args[i + 1]);
            process.exit(0);
        }
        if (key === 'token' || key === 't') flags.token = args[i + 1];
        if (key === 'branch' || key === 'b') flags.branch = args[i + 1];
        if (key === 'icons') flags.icons = true;
        if (key === 'help' || key === 'h') { console.log(helpText); process.exit(0); }
        if (['token', 't', 'branch', 'b'].includes(key)) i++; // skip next arg
    } else {
        if (!repo) repo = arg;
    }
}

// Token Handling
const configPath = path.join(os.homedir(), '.githubtree');
function getLocalToken() {
    try { return fs.readFileSync(configPath, 'utf8').trim(); } catch { return null; }
}
function saveLocalToken(token) {
    fs.writeFileSync(configPath, token);
    console.log(`✅ Token saved to ${configPath}`);
}

async function run() {
    if (!repo) {
        console.log(helpText);
        process.exit(1);
    }

    const token = flags.token || getLocalToken();
    const gt = new GitHubTree(token);

    console.log(`\n🌳 Fetching ${repo}...`);
    
    try {
        // Pass the requested branch (or default 'main')
        const requestedBranch = flags.branch || 'main';
        const data = await gt.getTree(repo, requestedBranch);
        
        // Notify if branch was switched
        if (data.branch && data.branch !== requestedBranch) {
            console.log(`\nℹ️  Branch '${requestedBranch}' not found.`);
            console.log(`   Switched to default branch: '${data.branch}'`);
        }

        // Generate and Print Tree
        const output = gt.generateAsciiTree(data.tree, { icons: flags.icons });        
        console.log('\n' + output);
        
        // Auto-Copy
        try {
            copyToClipboard(output);
            console.log(`\n✨ Tree copied to clipboard!`);
        } catch (e) {
            console.log(`\n(Could not auto-copy: ${e.message})`);
        }

    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        if (err.message.includes('Limit')) console.log(`   Tip: Use --save-token <your_pat> to increase limits.`);
    }
}

function copyToClipboard(text) {
    // Zero-dependency clipboard logic
    if (process.platform === 'darwin') {
        execSync('pbcopy', { input: text });
    } else if (process.platform === 'win32') {
        execSync('clip', { input: text });
    } else {
        execSync('xclip -selection clipboard', { input: text });
    }
}

run();