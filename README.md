<div align="center">

  <!-- PROJECT TITLE -->
  <h1>GitHubTree</h1>
  
  <!-- ONE LINE SUMMARY -->
  <p>
    <b>GitHubTree is a high-performance repository visualiser.</b>
  </p>
  
  <!-- BADGES -->
  <p>
    <img src="https://img.shields.io/github/v/release/mgks/githubtree?style=flat-square&color=38bd24" alt="release version">
    <!--<img src="https://img.shields.io/npm/v/gh-tree.svg?style=flat-square&color=fc3b53" alt="npm version">-->
    <img src="https://img.shields.io/npm/dt/gh-tree.svg?style=flat-square&color=38bd24" alt="npm downloads">
    <img src="https://img.shields.io/github/stars/mgks/githubtree?style=flat-square&logo=github&color=blue" alt="stars">
    <img src="https://img.shields.io/github/license/mgks/githubtree.svg?style=flat-square&color=blue" alt="license">
  </p>

  <!-- MENU -->
  <p>
    <h4>
      <a href="https://githubtree.mgks.dev">🚀 Open Web App</a>
    </h4>
  </p>

  <!-- PREVIEW -->
  <p>
    <img width="1000" alt="image" src="https://github.com/user-attachments/assets/c1de6006-02e5-4ff1-bda1-3f079e350021" />
  </p>

</div>

GitHubTree allows you to explore, navigate, and generate ASCII directory trees for any GitHub repository without cloning. Available as **Web App**, **CLI Tool**, and **Node.js Library**.

## Features
*   **Instant Search:** Visualize any public repository (e.g., `facebook/react`).
*   **Smart Branch Detection:** Automatically detects if a branch exists (e.g., `main` vs `master`) and switches to the default branch if needed.
*   **Private Repo Access:** Securely access your private repositories using a Personal Access Token (saved locally to your browser).
*   **Smart Copy:** Copy the entire directory tree as text, or copy specific file paths.
*   **Visual Styles:** Toggle between Classic (└──), Slashed (/src), Minimal, and ASCII (+--).
*   **Deep Linking:** Share links to specific repositories and branches (e.g., `/repo/mgks/dhwani/main`).

## For Developers: The CLI

Generate directory trees directly in your terminal. Perfect for documentation and quick checks.

### Usage (No Install)
Run via `npx` to fetch a tree instantly:

```bash
npx gh-tree user/repo
```

### Installation (Global)
```bash
npm install -g gh-tree
```

### Commands & Flags
```bash
gh-tree <user/repo> [flags]

Flags:
  --branch, -b <name>   Specify branch (default: main)
  --icons               Show file/folder icons in output
  --token, -t <key>     Use a specific GitHub Token
  --save-token <key>    Save a token globally for future use
  --help                Show help
```

**Example:**
```bash
gh-tree facebook/react --icons --branch main
```

## For Builders: The NPM Package

Use the core engine to fetch trees and generate ASCII structures in your own applications.

### Installation
```bash
npm install gh-tree
```

### Usage

```javascript
import { GitHubTree } from 'gh-tree';

// 1. Initialize (Token optional, but recommended for higher rate limits)
const gt = new GitHubTree(process.env.GITHUB_TOKEN);

// 2. Fetch Tree
try {
    const { tree } = await gt.getTree('mgks/githubtree', 'main');
    
    // 3. Sort & Generate ASCII
    const sorted = gt.sortTree(tree, 'folder-az');
    const output = gt.generateAsciiTree(sorted, { icons: true });
    
    console.log(output);
} catch (err) {
    console.error(err);
}
```

### API Reference

#### `new GitHubTree(token?)`
Creates a new instance.
*   `token` (string, optional): GitHub Personal Access Token.

#### `getTree(repo, branch?)`
Fetches the raw recursive tree from GitHub API.
*   Returns: `{ tree: Array, truncated: Boolean }`

#### `sortTree(tree, method?)`
Sorts the tree array.
*   `method`: `'folder-az'` (default), `'folder-za'`, `'alpha-az'`, `'alpha-za'`.

#### `generateAsciiTree(tree, options?)`
Converts the tree array into a formatted string.
*   `options.icons`: Boolean. If true, adds emojis (📁/📄).

## Development (Monorepo)

This repository is organized as a Monorepo.

*   `packages/core`: The logic, API fetcher, and CLI tool.
*   `packages/web`: The Vite-based Web Application.
*   `tools/`: Scripts for generating SEO static pages.

### Local Setup

1.  **Clone:**
    ```bash
    git clone https://github.com/mgks/GitHubTree.git
    cd GitHubTree
    ```

2.  **Install:**
    ```bash
    npm install
    ```

3.  **Run Web App:**
    ```bash
    npm run dev
    ```

4.  **Build & Generate SEO Pages:**
    ```bash
    npm run deploy
    ```

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)
