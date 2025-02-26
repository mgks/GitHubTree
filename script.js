const treeContainer = document.getElementById('tree-container');
const loadingIndicator = document.getElementById('loading');
const errorContainer = document.getElementById('error');
const repoInput = document.getElementById('repoInput');
const fetchButton = document.getElementById('fetchButton');
const branchInput = document.getElementById('branchInput');
const copyTreeButton = document.getElementById('copyTreeButton');
const hiddenTree = document.getElementById('hiddenTree');
const tree = document.getElementById('tree');
const mainTitle = document.getElementById('main-title');
const container = document.querySelector('.container');
const sortButton = document.getElementById('sortButton');
const sortOptions = document.getElementById('sortOptions');

let currentSort = 'folders-first-az';
let cachedTreeData = null; // Store fetched tree data
let currentRepo = ''; // Store current repo
let currentBranch = ''; // Store current branch

fetchButton.addEventListener('click', fetchRepoTree);
copyTreeButton.addEventListener('click', () => copyToClipboard(hiddenTree.value));

sortButton.addEventListener('click', (event) => {
    event.stopPropagation();
    sortOptions.parentElement.classList.toggle('open');
});

sortOptions.addEventListener('click', (event) => {
    if (event.target.dataset.sort) {
        currentSort = event.target.dataset.sort;
        sortOptions.parentElement.classList.remove('open');
        sortAndRebuildTree(); // Re-sort existing data
    }
});

document.addEventListener('click', () => {
    sortOptions.parentElement.classList.remove('open');
});

async function fetchRepoTree() {
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';
    if (!repo) {
        showError("Please enter a repository.");
        return;
    }

    // Reset sort order for new requests
    currentSort = 'folders-first-az';

    showLoading(true);
    clearTree();
    clearError();
    hiddenTree.value = '';

    try {
        // 1. Get the commit SHA for the branch
        const commitSha = await getCommitSha(repo, branch);

        // 2. Get the entire tree (recursively) using the tree SHA
        cachedTreeData = await getRepoTree(repo, commitSha);
        currentRepo = repo;  // Store for rebuilding
        currentBranch = branch; // Store for rebuilding

        // 3. Sort and build the tree structure
        const sortedData = sortTreeData(cachedTreeData);
        buildTreeHTML(sortedData, repo, branch); // Pass repo and branch

        copyTreeButton.style.display = 'inline-block';
        treeContainer.style.display = 'block';
        container.classList.add('tree-loaded');
        animateTreeOutput();

    } catch (error) {
        showError(error.message);
        copyTreeButton.style.display = 'none';
    } finally {
        showLoading(false);
    }
}
// Function to get the commit SHA
async function getCommitSha(repo, branch) {
    const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("Repository, branch, or commit not found.");
        } else if (response.status === 403) {
            await handleRateLimit(response);
        }
        throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return data.sha; // The SHA of the commit
}

async function getRepoTree(repo, commitSha) {
    const commitUrl = `https://api.github.com/repos/${repo}/git/commits/${commitSha}`;
    const commitResponse = await fetch(commitUrl);

    if (!commitResponse.ok) {
        if (commitResponse.status === 404) {
            throw new Error("Commit not found.");
        } else if (commitResponse.status === 403) {
            await handleRateLimit(commitResponse); // Use the correct response
        }
        throw new Error(`GitHub API error: ${commitResponse.status}`);
    }
    const commitData = await commitResponse.json();
    const treeSha = commitData.tree.sha; // Get the tree SHA from the commit

    // Now, fetch the tree recursively using the tree SHA
    const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeResponse = await fetch(treeUrl);

    if (!treeResponse.ok) {
        if (treeResponse.status === 404) {
            throw new Error("Tree not found.");
        } else if (treeResponse.status === 403) {
            await handleRateLimit(treeResponse); // Use the correct response
        }
        throw new Error(`GitHub API error: ${treeResponse.status}`);
    }

    const treeData = await treeResponse.json();
     if (!treeData.tree || !Array.isArray(treeData.tree)) {
        throw new Error("Invalid tree data received from GitHub API.");
    }
    return treeData.tree;
}

// Build HTML for the repository tree (No changes from the previous *almost*-correct version)
function buildTreeHTML(treeData, repo, branch) {
    let treeContentHTML = '';
    let plainText = '';

    // Create a map to track parent-child relationships
    const pathMap = {};
    treeData.forEach(item => {
        const pathParts = item.path.split('/');
        if (pathParts.length > 1) {
            pathParts.pop();
            const parentPath = pathParts.join('/');
            pathMap[item.path] = parentPath;
        } else {
            pathMap[item.path] = '';
        }
    });

    // Determine indentation level
    const getIndent = (path) => {
        const depth = path.split('/').length - 1;
        return "    ".repeat(depth);
    };

    // Determine prefix based on parent and siblings
    const getPrefix = (item) => {
        const parentPath = pathMap[item.path];
        const siblings = treeData.filter(sibling => pathMap[sibling.path] === parentPath);
        const isLast = siblings.indexOf(item) === siblings.length - 1;
        return parentPath === '' ? '' : isLast ? '└── ' : '├── ';
    };

    treeData.forEach(item => {
        const indent = getIndent(item.path);
        const prefix = getPrefix(item);
        const icon = item.type === 'tree' ? '<i class="fas fa-folder"></i> ' : '<i class="fas fa-file"></i> ';
        const copyButton = `<button class="copy-button" title="Copy path" data-path="${item.path}"><i class="fas fa-copy"></i></button>`;
        let line;

        if (item.type === 'tree') {
            line = `${indent}${prefix}${icon}<span class="dir-name">${item.path.split('/').pop()}</span> ${copyButton}`;
            plainText += `${indent}${prefix}${item.path.split('/').pop()}\n`;
        } else if (item.type === 'blob') {
            const fileName = item.path.split('/').pop();
            line = `${indent}${prefix}${icon}<a href="https://github.com/${repo}/blob/${branch}/${item.path}" target="_blank" style="color: inherit; text-decoration: none;">${fileName}</a> ${copyButton}`;
            plainText += `${indent}${prefix}${fileName}\n`;
        }
        treeContentHTML += `<span>${line}</span>\n`;
    });

    let lineNumbersHTML = '';
    const numLines = treeContentHTML.split('\n').length - 1;
    for (let i = 1; i <= numLines; i++) {
        lineNumbersHTML += `<span>${i}</span>`;
    }

    tree.innerHTML = `<div class="line-numbers">${lineNumbersHTML}</div><div class="line-content">${treeContentHTML}</div>`;
    hiddenTree.value = plainText;
    attachCopyButtonListeners();
}
// CORRECTED: Recursive, hierarchical sort
function sortTreeData(treeData) {
    // 1. Create a hierarchical structure
    const root = { path: '', type: 'tree', children: [] };
    const pathMap = { '': root };

    treeData.forEach(item => {
        const pathParts = item.path.split('/');
        const parentPath = pathParts.slice(0, -1).join('/');
        const parent = pathMap[parentPath] || root;

        const node = { ...item, children: [] }; // Add a children array
        parent.children.push(node);
        pathMap[item.path] = node;
    });

    // 2. Recursive sort function
    const recursiveSort = (node) => {
        if (node.children) {
             node.children.sort(getSortFunction(currentSort));
            node.children.forEach(recursiveSort); // Sort children recursively
        }
    };

    // 3. Sort the root's children
    recursiveSort(root);

    // 4. Flatten back into a list
    const flattened = [];
    const flatten = (node) => {
        if (node !== root) { // Don't include the artificial root
            flattened.push(node);
        }
        if (node.children) {
            node.children.forEach(flatten);
        }
    };
    flatten(root);

    return flattened;
}

function getSortFunction(sortType) {
    const compareNames = (a, b) => {
        const aName = a.path.split('/').pop().toLowerCase();
        const bName = b.path.split('/').pop().toLowerCase();
        return aName.localeCompare(bName);
    };

    switch (sortType) {
        case 'folders-first-az':
            return (a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1;
                if (a.type !== 'tree' && b.type === 'tree') return 1;
                return compareNames(a, b);
            };
        case 'folders-first-za':
            return (a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1;
                if (a.type !== 'tree' && b.type === 'tree') return 1;
                return compareNames(b, a);
            };
        case 'az':
            return compareNames;
        case 'za':
            return (a, b) => compareNames(b, a);
        default:
            return (a, b) => 0;
    }
}

function sortAndRebuildTree() {
    if (!cachedTreeData) {
        return;
    }
    const sortedData = sortTreeData(cachedTreeData);
    buildTreeHTML(sortedData, currentRepo, currentBranch);
    animateTreeOutput();
}

function animateTreeOutput() {
    const lines = tree.querySelectorAll('.line-content > span');
    lines.forEach((line, index) => {
        setTimeout(() => {
            line.style.visibility = 'visible';
        }, index * 50);
    });
}

function attachCopyButtonListeners() {
    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const path = event.currentTarget.dataset.path;
            copyToClipboard(path);
        });
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard:', text);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function showLoading(show) {
    loadingIndicator.style.display = show ? 'block' : 'none';
}

function showError(message) {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
}

function clearError() {
    errorContainer.textContent = '';
    errorContainer.style.display = 'none';
}

function clearTree() {
    tree.innerHTML = '';
    hiddenTree.value = '';
    copyTreeButton.style.display = 'none';
    treeContainer.style.display = 'none';
    container.classList.remove('tree-loaded');
}
async function handleRateLimit(response){
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');

    if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetTime = new Date(parseInt(rateLimitReset) * 1000);
        const currentTime = new Date();
        const timeDiff = resetTime.getTime() - currentTime.getTime();
        const minutes = Math.ceil(timeDiff / (1000 * 60));

        throw new Error(`Rate limit exceeded!\n\nTry again after ${resetTime.toLocaleString()} (in ~${minutes} minutes).`);
    } else {
        throw new Error(`GitHub API error: ${response.status}`);
    }
}