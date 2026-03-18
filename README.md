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

GitHubTree allows you to explore, navigate, and generate formatted directory trees for any GitHub repository without cloning. Perfect for documentation, code reviews, and project overviews.

## ✨ Features
*   **Instant Explorer:** Visualize any public repository (e.g., `facebook/react`).
*   **Intelligent Navigation:** Search and filter files in real-time with parent-folder context preservation.
*   **Interactive Controls:** Unified tree toggles (Compact/Expand) and collapsible folder support.
*   **Visual Styles:** Choose between Classic (└──), Slashed (/src), Minimal, ASCII (+--), and **Bulleted (•)**.
*   **Private Repository Access:** Securely access personal repos using a GitHub PAT (stored only in your browser).
*   **Deep Linking:** Share links that persist your branch, filter, sort, and style settings.
*   **High Performance:** Core engine optimized for large repositories with automated branch detection.

## CLI Tool
Generate directory trees directly in your terminal. 

### Usage (No Install)
```bash
npx gh-tree user/repo
```

### Global Installation
```bash
npm install -g gh-tree
```

### Commands & Flags
```bash
gh-tree <user/repo> [flags]
```

**Flags:**
*   `--branch`, `-b <name>`: Specify branch (default: `main`)
*   `--depth`, `-d <num>`: Limit recursion depth
*   `--ignore`, `-i <patterns>`: Ignore patterns (comma-separated, e.g. `node_modules,*.log`)
*   `--style <type>`: Visual style (`classic`, `bulleted`, `minimal`, etc.)
*   `--json`: Output raw JSON data instead of ASCII
*   `--icons`: Show file/folder icons in output
*   `--token`, `-t <key>`: Use a specific GitHub Token
*   `--save-token <key>`: Save a token globally for future use
*   `--clear-cache`: Clear local tree cache

### CLI Examples
```bash
# Basic usage
gh-tree mgks/githubtree

# Limit depth and ignore specific patterns
gh-tree facebook/react -d 2 -i "node_modules,*.log"

# Show icons and use a specific branch
gh-tree user/repo --branch develop --icons

# Output as JSON for processing
gh-tree user/repo --json > tree.json
```

## For Builders: NPM Package
Use the core engine to integrate tree generation into your own Node.js applications.

### Installation
```bash
npm install gh-tree
```

### Quick Start
```javascript
import { GitHubTree } from 'gh-tree';

const gt = new GitHubTree(process.env.GITHUB_TOKEN);

try {
    const { tree } = await gt.getTree('mgks/githubtree', 'main');
    const output = gt.generateAsciiTree(tree, { style: 'classic', icons: true });
    console.log(output);
} catch (err) {
    console.error(err);
}
```

## Local Development (Monorepo)
*   `packages/core`: Core logic, API fetcher, and CLI tool.
*   `packages/web`: Vite-based Web Application.
*   `tools/`: SEO and static page generation scripts.

1.  **Clone & Install:**
    ```bash
    git clone https://github.com/mgks/GitHubTree.git
    cd GitHubTree
    npm install
    ```
2.  **Run Development Server:** `npm run dev`
3.  **Deploy Production Build**: `npm run deploy`

## Contributing
Contributions are welcome! If you have a feature request, bug report, or a pull request, please feel free to open an issue or submit a PR on [GitHub](https://github.com/mgks/GitHubTree).

1.  **Fork the Repo**
2.  **Create a Feature Branch** (`git checkout -b feature/amazing-feature`)
3.  **Commit Changes** (`git commit -m 'Add amazing feature'`)
4.  **Push to Branch** (`git push origin feature/amazing-feature`)
5.  **Open a Pull Request**

## License
MIT

![Website Badge](https://img.shields.io/badge/.*%20mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)