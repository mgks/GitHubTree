<div align="center">

  <!-- PROJECT TITLE -->
  <h1>GitHubTree</h1>
  
  <!-- ONE LINE SUMMARY -->
  <p>
    <b>GitHubTree is a high-performance repository visualiser.</b>
  </p>
  
  <!-- BADGES -->
  <p>
    <a href="https://www.npmjs.com/package/gh-tree"><img src="https://img.shields.io/github/v/release/mgks/githubtree?style=flat-square&color=38bd24" alt="release version"></a>
    <a href="https://github.com/mgks/GitHubTree"><img src="https://img.shields.io/github/stars/mgks/githubtree?style=flat-square&logo=github&color=blue" alt="stars"></a>
    <a href="https://github.com/mgks/GitHubTree"><img src="https://img.shields.io/github/license/mgks/githubtree.svg?style=flat-square&color=blue" alt="license"></a>
  </p>

  <!-- PREVIEW -->
  <p>
    <a href="https://githubtree.mgks.dev">
      <img width="1000" alt="image" src="https://raw.githubusercontent.com/mgks/GitHubTree/refs/heads/main/packages/web/public/images/gh-tree-preview.webp" />
    </a>
  </p>

  <!-- MENU -->
  <p>
     <a href="https://githubtree.mgks.dev"><img alt="Static Badge" src="https://img.shields.io/badge/Web_App-Open?style=for-the-badge&logo=rocket&logoColor=white&label=Open&color=4A8B67"></a>
  </p>

</div>

GitHubTree allows you to explore, navigate, and generate formatted directory trees for any GitHub repository without cloning. Perfect for documentation, code reviews, and project overviews.

## ✨ Features
*   **Instant Explorer:** Visualize any public repository (e.g., `facebook/react`).
*   **Media-Aware File Previewer:** Live preview code, images (with transparency checkerboard support), and audio elements natively in the web dashboard.
*   **Repository Meta Intelligence:** Get instant rich statistics (repository size, stargazers, forks, branch totals, and active contributors) inside a color-matched dashboard.
*   **Interactive Embeddable Badges**: Share and showcase your repository structure in README files using a custom shields.io Markdown badge generator.
*   **High Performance & Limit-Free:** Zero-API rate-limit usage for public file previews utilizing direct raw CDN fetches with highly efficient session-wide caching.
*   **Intelligent Navigation:** Search and filter files in real-time with parent-folder context preservation.
*   **Interactive Controls:** Unified tree toggles (Compact/Expand) and collapsible folder support.
*   **Visual Styles:** Choose between Classic (└──), Slashed (/src), Minimal, ASCII (+--), and **Bulleted (•)**.
*   **Private Repository Access:** Securely access personal repos using a GitHub PAT (stored only in your browser).
*   **Deep Linking:** Share links that persist your branch, filter, sort, and style settings.

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

Found a bug or have an idea? [Open an issue](https://github.com/mgks/GitHubTree/issues) or [submit a pull request](https://github.com/mgks/GitHubTree/pulls).

## License

Distributed under the MIT License.
