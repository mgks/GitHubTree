export class GitHubTree {
    constructor(token = null) {
        this.token = token;
        this.apiBase = "https://api.github.com";
    }


    async getTree(repo, branch = 'main') {
        const headers = { 
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (this.token) headers['Authorization'] = `token ${this.token}`;

        // Sanitize inputs
        const cleanRepo = repo.trim().replace(/\/$/, "");
        let targetBranch = (branch || 'main').trim().replace(/\/$/, "");
        let sha = null;

        // 1. Try fetching SHA for the requested branch
        let resSha = await fetch(`${this.apiBase}/repos/${cleanRepo}/commits/${targetBranch}`, { headers });

        // 2. Fail-Safe: If 404 (Repo/Branch not found) or 422 (Git ref invalid), check for Default Branch
        if (!resSha.ok && (resSha.status === 404 || resSha.status === 422)) {
            // Fetch Repo Metadata to find the true default branch
            const resRepo = await fetch(`${this.apiBase}/repos/${cleanRepo}`, { headers });
            
            if (resRepo.ok) {
                const repoData = await resRepo.json();
                const defaultBranch = repoData.default_branch;

                // If we were asking for 'main' but default is 'master' (or vice versa), try again
                if (defaultBranch && defaultBranch !== targetBranch) {
                    targetBranch = defaultBranch;
                    resSha = await fetch(`${this.apiBase}/repos/${cleanRepo}/commits/${targetBranch}`, { headers });
                }
            } else if (resRepo.status === 404) {
                throw new Error(`Repository "${cleanRepo}" not found or is private.`);
            }
        }

        // 3. Handle Errors (After retry attempt)
        if (!resSha.ok) {
            if (resSha.status === 403) throw new Error(`API Rate Limit Exceeded.`);
            if (resSha.status === 404 || resSha.status === 422) throw new Error(`Branch "${branch}" not found in ${cleanRepo}.`);
            throw new Error(`GitHub API Error (${resSha.status}): ${resSha.statusText}`);
        }

        const commitData = await resSha.json();
        sha = commitData.sha;

        if (!sha) throw new Error(`Could not resolve commit SHA.`);

        // 4. Get Recursive Tree
        const resTree = await fetch(`${this.apiBase}/repos/${cleanRepo}/git/trees/${sha}?recursive=1`, { headers });
        if (!resTree.ok) throw new Error(`Failed to fetch tree data (${resTree.status}).`);
        const data = await resTree.json();
        
        return { tree: data.tree, truncated: data.truncated, branch: targetBranch };
    }

    /**
     * Sorts and filters the tree based on the selected method, ignore patterns, and depth
     * methods: 'folder-az', 'folder-za', 'alpha-az', 'alpha-za'
     */
    sortTree(flatTree, method = 'folder-az', options = {}) {
        if (!flatTree) return [];

        let result = [...flatTree];

        // 1. Filter by Depth
        if (options.depth) {
            result = result.filter(item => item.path.split('/').length <= options.depth);
        }

        // 2. Filter by Ignore Patterns (Simple glob-like matching)
        if (options.ignore && Array.isArray(options.ignore)) {
            result = result.filter(item => {
                return !options.ignore.some(pattern => {
                    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\//g, '\\/') + '($|\\/)');
                    return regex.test(item.path);
                });
            });
        }

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

        const nodes = buildHierarchy(result);

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
    generateAsciiTree(flatTree, options = { icons: false, json: false }) {
        if (!flatTree || flatTree.length === 0) return "";
        if (options.json) return JSON.stringify(flatTree, null, 2);

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
            const isBulleted = options.style === 'bulleted';
            const connector = isBulleted ? "• " : (isLast ? "└── " : "├── ");
            const childPrefix = isBulleted ? "  " : (isLast ? "    " : "│   ");
            
            let icon = "";
            if (options.icons) icon = node.type === 'tree' ? "📁 " : "📄 ";

            output += `${prefix}${connector}${icon}${node.name}${node.type === 'tree' && !options.icons && !isBulleted ? '/' : ''}\n`;

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