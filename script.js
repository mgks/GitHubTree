// --- DOM Element References ---
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
const shareButton = document.getElementById('shareButton');
const shareOverlay = document.getElementById('shareOverlay');
const shareUrlInput = document.getElementById('shareUrlInput');
const copyShareUrlButton = document.getElementById('copyShareUrlButton');
const treeHeader = document.getElementById('tree-header');

// --- Meta Tag References ---
const metaDescriptionTag = document.querySelector('meta[name="description"]');
const metaOgUrlTag = document.querySelector('meta[property="og:url"]');
const metaOgTitleTag = document.querySelector('meta[property="og:title"]');
const metaOgDescriptionTag = document.querySelector('meta[property="og:description"]');
const metaTwitterUrlTag = document.querySelector('meta[property="twitter:url"]');
const metaTwitterTitleTag = document.querySelector('meta[property="twitter:title"]');
const metaTwitterDescriptionTag = document.querySelector('meta[property="twitter:description"]');
let canonicalLinkTag = document.querySelector('link[rel="canonical"]');

// --- State Variables ---
const BASE_URL = window.location.origin; // e.g., https://githubtree.mgks.dev
let currentSort = 'folders-first-az';
let cachedTreeData = null;
let currentRepo = ''; // Stores the decoded repo name (e.g., "mgks/GitHubTree")
let currentBranch = ''; // Stores the decoded branch name
let currentRepoDescription = '';

// --- Event Listeners ---

fetchButton.addEventListener('click', fetchRepoTree);

copyTreeButton.addEventListener('click', () => {
    handleCopyFeedback(copyTreeButton, hiddenTree.value, 'Copy Complete Tree', 'Copied!', 'text');
});

sortButton.addEventListener('click', (event) => {
    event.stopPropagation();
    shareOverlay.classList.remove('visible');
    sortOptions.parentElement.classList.toggle('open');
});

sortOptions.addEventListener('click', (event) => {
    if (event.target.dataset.sort) {
        currentSort = event.target.dataset.sort;
        sortOptions.parentElement.classList.remove('open');
        sortAndRebuildTree();
    }
});

shareButton.addEventListener('click', (event) => {
    event.stopPropagation();
    sortOptions.parentElement.classList.remove('open');

    const displayRepo = currentRepo;
    const displayBranch = currentBranch;
    const displayPath = `/?repo=${displayRepo}&branch=${displayBranch}`;
    const displayUrl = new URL(displayPath, BASE_URL).href;

    shareUrlInput.value = displayUrl;
    shareOverlay.classList.add('visible');
    shareUrlInput.select();
});

shareUrlInput.addEventListener('click', function() {
    this.select();
});

copyShareUrlButton.addEventListener('click', () => {
    const iconElement = copyShareUrlButton.querySelector('i');
    if (iconElement) {
         handleCopyFeedback(iconElement, shareUrlInput.value, 'fas fa-copy', 'fas fa-check', 'iconClass');
    }
});

document.addEventListener('click', (event) => {
    if (!sortButton.contains(event.target) && !sortOptions.contains(event.target)) {
        sortOptions.parentElement.classList.remove('open');
    }
    if (shareOverlay.classList.contains('visible')) {
       const contentBox = shareOverlay.querySelector('.share-content-box');
       if (contentBox && !contentBox.contains(event.target) && !shareButton.contains(event.target)) {
            shareOverlay.classList.remove('visible');
       }
    }
});

window.addEventListener('DOMContentLoaded', parseURL);
window.addEventListener('popstate', parseURL);


// --- Core Logic ---

function parseURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const repoFromUrl = urlParams.get('repo');
    const branchFromUrl = urlParams.get('branch');

    shareOverlay.classList.remove('visible');
    sortOptions.parentElement.classList.remove('open');

    if (repoFromUrl) {
        const decodedBranch = branchFromUrl || 'main';
        if (currentRepo !== repoFromUrl || currentBranch !== decodedBranch || !cachedTreeData) {
            repoInput.value = repoFromUrl;
            branchInput.value = decodedBranch;
            fetchRepoTree();
        } else {
            const canonicalPath = `/?repo=${encodeURIComponent(currentRepo)}&branch=${encodeURIComponent(currentBranch)}`;
            updateMetaData(
                `GitHubTree: ${currentRepo} (${currentBranch}) | Folder Structure`,
                currentRepoDescription || `Explore the directory and file structure for the GitHub repository '${currentRepo}' (branch '${currentBranch}'). Visualize the folder tree online with GitHubTree.`, // Use fetched desc if available
                canonicalPath
            );
        }
    } else {
        updateMetaData(
            'GitHubTree : View Folder Structures | Repo Directories',
            'Easily visualize, sort and explore folder/directory structure of any public GitHub repository, and generate GitHub tree view. Copy file paths with a single click.',
            '/'
        );
        clearTree();
    }
}

async function fetchRepoTree() {
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    if (!repo || !repo.includes('/')) {
        showError("Invalid repository format. Use 'username/repo'.");
        // Reset metadata to homepage if input is invalid before fetch attempt
        updateMetaData('GitHubTree : Invalid Input', 'Please provide repository in username/repo format.', '/');
        return;
    }

    showLoading(true);
    clearTree(); // Clears tree, cache, state vars, and hides overlay
    clearError();

    try {
        // Pass decoded repo/branch to API functions
        const { repoInfo, commitSha, actualBranch } = await getCombinedRepoInfo(repo, branch);

        // Update state variables (decoded)
        currentRepo = repo;
        currentBranch = actualBranch;
        branchInput.value = actualBranch; // Reflect actual branch
        // Store actual description if available, otherwise create a placeholder
        currentRepoDescription = repoInfo.description || `View the folder structure for the GitHub repository '${repo}' (branch '${actualBranch}') using GitHubTree.`;

        // Construct ENCODED canonical path
        const encodedRepo = encodeURIComponent(currentRepo);
        const encodedBranch = encodeURIComponent(currentBranch);
        const canonicalPath = `/?repo=${encodedRepo}&branch=${encodedBranch}`;

        // Update browser history state (only if different)
        const targetQueryString = `?repo=${encodedRepo}&branch=${encodedBranch}`;
        if (window.location.search !== targetQueryString) {
             history.pushState({ repo: currentRepo, branch: currentBranch }, '', canonicalPath);
        }

        // Update metadata using ENCODED canonical path and fetched/placeholder description
        updateMetaData(
            `GitHubTree: ${repoInfo.full_name} (${currentBranch}) | Folder Structure`,
            currentRepoDescription,
            canonicalPath
        );

        cachedTreeData = await getRepoTree(currentRepo, commitSha);
        const sortedData = sortTreeData(cachedTreeData);
        buildTreeHTML(sortedData, currentRepo, currentBranch);

        // Show buttons on success
        copyTreeButton.style.display = 'inline-block';
        shareButton.style.display = 'inline-flex';
        treeContainer.style.display = 'block';
        container.classList.add('tree-loaded');
        animateTreeOutput();

    } catch (error) {
        // *** MODIFIED ERROR HANDLING ***
        console.error("Fetch Error:", error); // Log the actual error

        // Construct the target canonical path using ENCODED values from the attempted fetch
        const attemptedEncodedRepo = encodeURIComponent(repo);
        const attemptedEncodedBranch = encodeURIComponent(branch); // Use branch attempted, not actualBranch which might not be set
        const canonicalPathOnError = `/?repo=${attemptedEncodedRepo}&branch=${attemptedEncodedBranch}`;

        let pageTitle = `GitHubTree : Error`;
        // Create a placeholder description based on the attempted repo/branch
        let pageDescription = `Could not display the folder structure for the GitHub repository '${repo}' (branch '${branch}').`;
        let canonicalTarget = '/'; // Default canonical to homepage for generic errors

        // Check if it's likely a rate limit or temporary API issue
        // Be more specific if possible, checking status code if available (though error might not be HTTPError)
        const isRateLimit = error.message.includes("rate limit");
        const isApiError = error.message.includes("API error"); // Catch broader API issues
        const isNotFound = error.message.includes("not found");

        if (isRateLimit || isApiError) {
            // For rate limits/API errors (common for crawlers), set optimistic metadata
            pageTitle = `GitHubTree: ${repo} (${branch}) | Folder Structure`;
            pageDescription = `Explore the directory and file structure for the GitHub repository '${repo}' (branch '${branch}'). Visualize the folder tree online with GitHubTree.`;
            // Keep the canonical pointing to the intended (encoded) URL
            canonicalTarget = canonicalPathOnError;
        } else if (isNotFound) {
             // For "Not Found" errors, provide specific metadata
             pageTitle = `GitHubTree: Repository Not Found`;
             pageDescription = `The GitHub repository '${repo}' (branch '${branch}') could not be found or accessed.`;
             // Point canonical to the URL that resulted in "Not Found"
             canonicalTarget = canonicalPathOnError;
        }
        // else: For other unknown errors, use the default generic error title/desc and homepage canonical

        // Update metadata with the determined content for the crawler
        updateMetaData(pageTitle, pageDescription, canonicalTarget);

        // Display the actual error message to the user
        showError(error.message);

        // Ensure buttons remain hidden on error
        copyTreeButton.style.display = 'none';
        shareButton.style.display = 'none';
    } finally {
        showLoading(false);
    }
}


// --- API Functions ---
async function getCombinedRepoInfo(repo, branch) {
    const repoUrl = `https://api.github.com/repos/${repo}`;
    let repoResponse, repoInfo;
    try {
        repoResponse = await fetch(repoUrl);
        if (!repoResponse.ok) throw repoResponse;
        repoInfo = await repoResponse.json();
    } catch (responseOrError) {
        if (responseOrError instanceof Response) {
             if (responseOrError.status === 404) throw new Error(`Repository "${repo}" not found.`);
             if (responseOrError.status === 403) await handleRateLimit(responseOrError); // handleRateLimit throws
             throw new Error(`GitHub API error fetching repo info: ${responseOrError.status}`);
        }
        throw responseOrError;
    }

    let actualBranch = branch;
    const commitUrl = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(actualBranch)}`;
    let commitResponse, commitData, commitSha;
     try {
        commitResponse = await fetch(commitUrl);
        if (!commitResponse.ok) {
             if (commitResponse.status === 404 && branch !== repoInfo.default_branch) {
                 console.warn(`Branch "${branch}" not found, trying default branch "${repoInfo.default_branch}"`);
                 actualBranch = repoInfo.default_branch;
                 const defaultCommitUrl = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(actualBranch)}`;
                 commitResponse = await fetch(defaultCommitUrl);
                 if (!commitResponse.ok) throw commitResponse;
             } else {
                 throw commitResponse;
             }
         }
        commitData = await commitResponse.json();
        commitSha = commitData.sha;
    } catch (responseOrError) {
         if (responseOrError instanceof Response) {
            if (responseOrError.status === 404) throw new Error(`Branch "${actualBranch}" not found for repository "${repo}".`);
            if (responseOrError.status === 403) await handleRateLimit(responseOrError); // handleRateLimit throws
            throw new Error(`GitHub API error fetching commit info: ${responseOrError.status}`);
        }
        throw responseOrError;
    }
    return { repoInfo, commitSha, actualBranch }; // actualBranch is decoded
}

async function getRepoTree(repo, commitSha) {
     const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`;
    let treeResponse, treeData;
    try {
        treeResponse = await fetch(treeUrl);
        if (!treeResponse.ok) throw treeResponse;
        treeData = await treeResponse.json();
    } catch (responseOrError) {
         if (responseOrError instanceof Response) {
            if (responseOrError.status === 404) throw new Error("Tree data not found for this commit.");
            if (responseOrError.status === 403) await handleRateLimit(responseOrError); // handleRateLimit throws
            if (responseOrError.status === 409) {
                 console.log(`Repository "${repo}" appears empty (API status 409).`);
                 return []; // Treat empty repo as empty tree
            }
            throw new Error(`GitHub API error fetching tree: ${responseOrError.status}`);
        }
        throw responseOrError;
    }

    if (treeData.truncated) {
        console.warn("Warning: GitHub API returned truncated tree data. Large repositories might be incomplete.");
    }
    if (!treeData.tree || !Array.isArray(treeData.tree)) {
         throw new Error("Invalid tree data received from GitHub API.");
    }
     if (treeData.tree.length === 0 && !treeData.truncated) {
        console.log(`Tree data for commit "${commitSha}" is empty.`);
    }
    return treeData.tree;
}

// --- buildTreeHTML ---
function buildTreeHTML(treeData, repo, branch) {
     if (treeData.length === 0) {
        tree.innerHTML = `<div class="line-numbers"><span>1</span></div><div class="line-content"><span><i class="fas fa-info-circle"></i> This repository or branch appears to be empty.</span></div>`;
        hiddenTree.value = '(empty)';
        return;
    }
    let treeContentHTML = '';
    let plainText = '';
    const pathMap = {};
    treeData.forEach(item => {
        const pathParts = item.path.split('/');
        const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
        pathMap[item.path] = parentPath;
    });
    const getIndent = (path) => "    ".repeat(path.split('/').length - 1);
    const getPrefix = (item) => {
        const parentPath = pathMap[item.path];
        const siblings = treeData.filter(sibling => pathMap[sibling.path] === parentPath);
        const isLast = siblings.indexOf(item) === siblings.length - 1;
        return parentPath === '' ? '' : isLast ? '└── ' : '├── ';
    };
    treeData.forEach(item => {
        const indent = getIndent(item.path);
        const prefix = getPrefix(item);
        const iconClass = item.type === 'tree' ? 'fas fa-folder' : 'fas fa-file';
        const name = item.path.split('/').pop();
        const copyButtonHTML = `<button class="copy-button" title="Copy path" data-path="${item.path}"><i class="fas fa-copy"></i></button>`;
        let line;
        if (item.type === 'tree') {
            line = `${indent}${prefix}<i class="${iconClass}"></i> <span class="dir-name">${name}</span> ${copyButtonHTML}`;
            plainText += `${indent}${prefix}${name}/\n`;
        } else if (item.type === 'blob') {
            const fileUrl = `https://github.com/${repo}/blob/${branch}/${item.path}`; // Uses decoded repo/branch
            line = `${indent}${prefix}<i class="${iconClass}"></i> <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${name}</a> ${copyButtonHTML}`;
            plainText += `${indent}${prefix}${name}\n`;
        }
        if (line) {
             treeContentHTML += `<span>${line}</span>\n`;
        }
    });
    let lineNumbersHTML = '';
    const numLines = treeContentHTML.trim().split('\n').length;
    for (let i = 1; i <= numLines; i++) {
        lineNumbersHTML += `<span>${i}</span>`;
    }
    tree.innerHTML = `<div class="line-numbers">${lineNumbersHTML}</div><div class="line-content">${treeContentHTML.trim()}</div>`;
    hiddenTree.value = plainText.trim();
    attachCopyButtonListeners();
}

// --- Sorting Functions ---
function sortTreeData(treeData) {
    if (!treeData || treeData.length === 0) return [];
    const root = { path: '', type: 'tree', children: [] };
    const nodeMap = { '': root };
    const originalDataMap = {};
    treeData.forEach(item => {
        originalDataMap[item.path] = item;
        const pathParts = item.path.split('/');
        const name = pathParts.pop();
        const parentPath = pathParts.join('/');
        const parentNode = nodeMap[parentPath] !== undefined ? nodeMap[parentPath] : root;
        const node = { path: item.path, type: item.type, name: name, children: item.type === 'tree' ? [] : undefined };
        if(!parentNode.children) parentNode.children = [];
        parentNode.children.push(node);
        if (item.type === 'tree') { nodeMap[item.path] = node; }
    });
    const recursiveSort = (node) => {
        if (node.children) {
            node.children.sort(getSortFunction(currentSort));
            node.children.forEach(recursiveSort);
        }
    };
    recursiveSort(root);
    const flattened = [];
    const flatten = (node) => {
         if (node.children) {
             node.children.forEach(child => {
                 const originalItem = originalDataMap[child.path];
                 if (originalItem) flattened.push(originalItem);
                 flatten(child);
             });
         }
    };
    flatten(root);
    return flattened;
}

function getSortFunction(sortType) {
    const compareNames = (a, b) => {
        const aName = a.name ? a.name.toLowerCase() : '';
        const bName = b.name ? b.name.toLowerCase() : '';
        return aName.localeCompare(bName);
    };
    switch (sortType) {
        case 'folders-first-az': return (a, b) => { if (a.type === 'tree' && b.type !== 'tree') return -1; if (a.type !== 'tree' && b.type === 'tree') return 1; return compareNames(a, b); };
        case 'folders-first-za': return (a, b) => { if (a.type === 'tree' && b.type !== 'tree') return -1; if (a.type !== 'tree' && b.type === 'tree') return 1; return compareNames(b, a); };
        case 'az': return compareNames;
        case 'za': return (a, b) => compareNames(b, a);
        default: return (a, b) => 0;
    }
}

function sortAndRebuildTree() {
    if (!cachedTreeData) return;
    const sortedData = sortTreeData(cachedTreeData);
    buildTreeHTML(sortedData, currentRepo, currentBranch); // Pass decoded
    animateTreeOutput();
}


// --- Utility Functions ---
function handleCopyFeedback(element, textToCopy, originalContent, successContent, mode = 'text') {
    element.disabled = true;
    const parentButton = (mode === 'iconClass') ? element.closest('button') : element;
    if(parentButton) parentButton.disabled = true;
    let originalValue;
    if (mode === 'text') originalValue = element.textContent; else if (mode === 'html') originalValue = element.innerHTML; else if (mode === 'iconClass') originalValue = element.className;
    copyToClipboard(textToCopy).then(() => {
        if (mode === 'text') element.textContent = successContent; else if (mode === 'html') element.innerHTML = successContent; else if (mode === 'iconClass') element.className = successContent;
        setTimeout(() => {
            if (mode === 'text') element.textContent = originalContent; else if (mode === 'html') element.innerHTML = originalContent; else if (mode === 'iconClass') element.className = originalValue;
            if(parentButton) parentButton.disabled = false; else element.disabled = false;
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
        const errorContent = (mode === 'iconClass') ? 'fas fa-times error-icon' : 'Error';
        if (mode === 'text') element.textContent = errorContent; else if (mode === 'html') element.innerHTML = errorContent; else if (mode === 'iconClass') element.className = errorContent;
        setTimeout(() => {
            if (mode === 'text') element.textContent = originalContent; else if (mode === 'html') element.innerHTML = originalContent; else if (mode === 'iconClass') element.className = originalValue;
             if(parentButton) parentButton.disabled = false; else element.disabled = false;
        }, 2000);
    });
}

function animateTreeOutput() {
    const lines = tree.querySelectorAll('.line-content > span');
    lines.forEach((line, index) => { line.style.visibility = 'hidden'; setTimeout(() => { line.style.visibility = 'visible'; }, index * 8); });
}

function attachCopyButtonListeners() {
    const contentArea = tree.querySelector('.line-content');
    if (!contentArea || contentArea.dataset.copyListenerAttached === 'true') return;
    contentArea.dataset.copyListenerAttached = 'true';
    contentArea.addEventListener('click', (event) => {
        const button = event.target.closest('.copy-button');
        if (button) {
            const path = button.dataset.path; const iconElement = button.querySelector('i');
            if (path && iconElement) { handleCopyFeedback(iconElement, path, 'fas fa-copy', 'fas fa-check', 'iconClass'); }
        }
    });
}

async function copyToClipboard(text) {
    if (!navigator.clipboard) {
      try {
        const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea);
      } catch (err) { console.error('Fallback copy failed:', err); throw err; }
    } else {
      try { await navigator.clipboard.writeText(text); } catch (err) { console.error('Clipboard API write failed:', err); throw err; }
    }
}

function showLoading(show) {
    loadingIndicator.style.display = show ? 'block' : 'none';
}

function showError(message) { // Displays the error message visibly to the user
    errorContainer.innerHTML = message;
    errorContainer.style.display = 'block';
}

function clearError() {
    errorContainer.textContent = '';
    errorContainer.style.display = 'none';
}

function clearTree() {
    tree.innerHTML = ''; hiddenTree.value = ''; copyTreeButton.style.display = 'none'; shareButton.style.display = 'none'; shareOverlay.classList.remove('visible'); treeContainer.style.display = 'none'; container.classList.remove('tree-loaded'); cachedTreeData = null; currentRepo = ''; currentBranch = ''; currentRepoDescription = '';
}

async function handleRateLimit(response) { // Throws an error with specific message
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining'); const rateLimitReset = response.headers.get('X-RateLimit-Reset'); let errorMessage = `GitHub API error: ${response.status} (${response.statusText}).`;
    if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetTime = new Date(parseInt(rateLimitReset) * 1000); const currentTime = new Date(); const timeDiff = Math.max(0, resetTime.getTime() - currentTime.getTime()); const minutes = Math.ceil(timeDiff / (1000 * 60));
        errorMessage = `GitHub API rate limit exceeded!<br>Try again after ${resetTime.toLocaleTimeString()} (approx. ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}).`;
    }
    throw new Error(errorMessage); // Crucially, this throws, stopping execution before success path
}

function updateMetaData(title, description, canonicalPath) { // canonicalPath is ENCODED
    document.title = title; metaDescriptionTag.setAttribute('content', description);
    const fullCanonicalUrl = new URL(canonicalPath, BASE_URL).href; // Uses ENCODED path
    if (!canonicalLinkTag) { canonicalLinkTag = document.createElement('link'); canonicalLinkTag.setAttribute('rel', 'canonical'); document.head.appendChild(canonicalLinkTag); }
    canonicalLinkTag.setAttribute('href', fullCanonicalUrl);
    metaOgUrlTag.setAttribute('content', fullCanonicalUrl); metaOgTitleTag.setAttribute('content', title); metaOgDescriptionTag.setAttribute('content', description);
    metaTwitterUrlTag.setAttribute('content', fullCanonicalUrl); metaTwitterTitleTag.setAttribute('content', title); metaTwitterDescriptionTag.setAttribute('content', description);
}