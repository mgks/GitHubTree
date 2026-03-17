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
    --depth, -d <num>     Limit recursion depth
    --ignore, -i <pats>   Ignore patterns (comma-separated)
    --json                Output raw JSON data
    --token, -t <token>   GitHub PAT (overrides saved token)
    --save-token <token>  Save token locally and exit
    --clear-cache         Clear local cache
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
        if (key === 'depth' || key === 'd') flags.depth = parseInt(args[i + 1]);
        if (key === 'ignore' || key === 'i') flags.ignore = args[i + 1].split(',');
        if (key === 'json') flags.json = true;
        if (key === 'clear-cache') { clearCache(); process.exit(0); }
        if (key === 'icons') flags.icons = true;
        if (key === 'help' || key === 'h') { console.log(helpText); process.exit(0); }
        if (['token', 't', 'branch', 'b', 'depth', 'd', 'ignore', 'i'].includes(key)) i++; // skip next arg
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

// Caching Support
const cacheDir = path.join(os.homedir(), '.gh-tree', 'cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

function getCache(repo, branch) {
    const file = path.join(cacheDir, `${repo.replace(/\//g, '_')}_${branch}.json`);
    try {
        const stats = fs.statSync(file);
        const hours24 = 24 * 60 * 60 * 1000;
        if (Date.now() - stats.mtimeMs > hours24) return null; // 24h expiry
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { return null; }
}

function saveCache(repo, branch, data) {
    const file = path.join(cacheDir, `${repo.replace(/\//g, '_')}_${branch}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
}

function clearCache() {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log(`✅ Cache cleared.`);
}

async function run() {
    if (!repo) {
        console.log(helpText);
        process.exit(1);
    }

    const token = flags.token || getLocalToken();
    const gt = new GitHubTree(token);

    const requestedBranch = flags.branch || 'main';
    let data = getCache(repo, requestedBranch);

    if (data) {
        console.log(`\n📦 Using cached data for ${repo}...`);
    } else {
        console.log(`\n🌳 Fetching ${repo}...`);
        try {
            data = await gt.getTree(repo, requestedBranch);
            saveCache(repo, requestedBranch, data);
        } catch (err) {
            console.error(`\n❌ Error: ${err.message}`);
            if (err.message.includes('Limit')) console.log(`   Tip: Use --save-token <your_pat> to increase limits.`);
            process.exit(1);
        }
    }

    try {
        // Apply Depth and Ignore filtering
        const processedTree = gt.sortTree(data.tree, 'folder-az', {
            depth: flags.depth,
            ignore: flags.ignore
        });

        // Notify if branch was switched
        if (data.branch && data.branch !== requestedBranch) {
            console.log(`\nℹ️  Branch '${requestedBranch}' not found.`);
            console.log(`   Switched to default branch: '${data.branch}'`);
        }

        // Generate and Print Tree
        const output = gt.generateAsciiTree(processedTree, { 
            icons: flags.icons,
            json: flags.json 
        });        
        
        if (flags.json) {
            console.log(output);
        } else {
            console.log('\n' + output);
            // Auto-Copy (Only for ASCII)
            try {
                copyToClipboard(output);
                console.log(`\n✨ Tree copied to clipboard!`);
            } catch (e) {
                console.log(`\n(Could not auto-copy: ${e.message})`);
            }
        }
    } catch (err) {
        console.error(`\n❌ Error processing tree: ${err.message}`);
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