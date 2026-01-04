export class GitHubTree {
    constructor(token = null) {
        this.token = token;
        this.apiBase = "https://api.github.com";
    }

    async _getRepoInfo(repo) {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.token) headers['Authorization'] = `token ${this.token}`;
        const res = await fetch(`${this.apiBase}/repos/${repo}`, { headers });
        if (!res.ok) return null;
        return res.json();
    }

    /**
     * Fetch the tree data from GitHub API
     */
    async getTree(repo, branch = 'main') {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (this.token) headers['Authorization'] = `token ${this.token}`;

        // 1. Get SHA of the branch
        const resSha = await fetch(`${this.apiBase}/repos/${repo}/commits/${branch}`, { headers });
        if (!resSha.ok) {
            if (resSha.status === 404) throw new Error(`Repository not found or Private (Token required).`);
            if (resSha.status === 403) throw new Error(`API Limit Exceeded.`);
            if (resSha.status === 422) {
                const repoInfo = await this._getRepoInfo(repo);
                if (repoInfo?.default_branch && repoInfo.default_branch !== branch) {
                    throw new Error(`Branch '${branch}' not found. Try '${repoInfo.default_branch}' instead.`);
                }
                throw new Error(`Branch '${branch}' not found.`);
            }
            throw new Error(`GitHub API Error: ${resSha.statusText}`);
        }
        const { sha } = await resSha.json();

        // 2. Get Recursive Tree
        const resTree = await fetch(`${this.apiBase}/repos/${repo}/git/trees/${sha}?recursive=1`, { headers });
        if (!resTree.ok) throw new Error(`Failed to fetch tree data.`);
        const data = await resTree.json();
        
        return { tree: data.tree, truncated: data.truncated };
    }

    /**
     * Sorts the tree based on the selected method
     * methods: 'folder-az', 'folder-za', 'alpha-az', 'alpha-za'
     */
    sortTree(flatTree, method = 'folder-az') {
        if (!flatTree) return [];

        // Helper to reconstruct hierarchy for correct sorting
        const buildHierarchy = (items) => {
            const root = { children: [] };
            const map = { '': root };
            items.forEach(item => { 
                map[item.path] = { ...item, name: item.path.split('/').pop(), children: [] };
            });
            items.forEach(item => {
                const parts = item.path.split('/');
                parts.pop();
                const parent = map[parts.join('/')] || root;
                parent.children.push(map[item.path]);
            });
            return root.children;
        };

        const nodes = buildHierarchy(flatTree);

        const compare = (a, b) => a.name.localeCompare(b.name);
        
        const sorters = {
            'folder-az': (a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1;
                if (a.type !== 'tree' && b.type === 'tree') return 1;
                return compare(a, b);
            },
            'folder-za': (a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1;
                if (a.type !== 'tree' && b.type === 'tree') return 1;
                return compare(b, a);
            },
            'alpha-az': (a, b) => compare(a, b),
            'alpha-za': (a, b) => compare(b, a)
        };

        // Recursive Sort
        const sortRecursive = (list) => {
            list.sort(sorters[method] || sorters['folder-az']);
            list.forEach(node => {
                if (node.children.length > 0) sortRecursive(node.children);
            });
        };

        sortRecursive(nodes);

        // Flatten back to array for rendering
        const flatten = (list) => {
            let res = [];
            list.forEach(node => {
                const { children, ...rest } = node;
                res.push(rest); // Push self
                if (children.length > 0) res = res.concat(flatten(children));
            });
            return res;
        };

        return flatten(nodes);
    }

    /**
     * Generates the ASCII "Pipe" style string for Copy/CLI
     * Uses the exact structure:
     * ├── src
     * │   ├── index.js
     * │   └── utils.js
     * └── package.json
     */
    generateAsciiTree(flatTree, options = { icons: false }) {
        if (!flatTree || flatTree.length === 0) return "";

        // Re-build Hierarchy locally for generation
        const root = { name: '.', children: [] };
        const map = { '': root };
        flatTree.forEach(item => {
            map[item.path] = { ...item, name: item.path.split('/').pop(), children: [] };
        });
        flatTree.forEach(item => {
            const parts = item.path.split('/');
            parts.pop();
            const parent = map[parts.join('/')] || root;
            parent.children.push(map[item.path]);
        });

        // Ensure sorted (Folders first usually looks best in text)
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1;
                if (a.type !== 'tree' && b.type === 'tree') return 1;
                return a.name.localeCompare(b.name);
            });
            nodes.forEach(n => sortNodes(n.children));
        };
        sortNodes(root.children);

        let output = "";

        const renderNode = (node, prefix, isLast) => {
            const connector = isLast ? "└── " : "├── ";
            const childPrefix = isLast ? "    " : "│   ";
            
            let icon = "";
            if (options.icons) icon = node.type === 'tree' ? "📁 " : "📄 ";

            output += `${prefix}${connector}${icon}${node.name}${node.type === 'tree' && !options.icons ? '/' : ''}\n`;

            if (node.children) {
                node.children.forEach((child, index) => {
                    renderNode(child, prefix + childPrefix, index === node.children.length - 1);
                });
            }
        };

        root.children.forEach((child, index) => {
            renderNode(child, "", index === root.children.length - 1);
        });

        return output;
    }
}