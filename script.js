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
const shareOverlay = document.getElementById('shareOverlay'); // Overlay container
const shareUrlInput = document.getElementById('shareUrlInput'); // Input inside overlay
const copyShareUrlButton = document.getElementById('copyShareUrlButton'); // Button inside overlay
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

    // **Construct the user-friendly, DECODED URL for display**
    const displayRepo = currentRepo; // Use the state variable (already decoded)
    const displayBranch = currentBranch; // Use the state variable (already decoded)
    const displayPath = `/?repo=${displayRepo}&branch=${displayBranch}`; // No encoding here for display string
    const displayUrl = new URL(displayPath, BASE_URL).href; // Construct full URL

    shareUrlInput.value = displayUrl; // Set the decoded URL in the input
    shareOverlay.classList.add('visible');
    shareUrlInput.select();
});

shareUrlInput.addEventListener('click', function() {
    this.select();
});

copyShareUrlButton.addEventListener('click', () => {
    const iconElement = copyShareUrlButton.querySelector('i');
    // **Copy the DECODED URL from the input**
    if (iconElement) {
         handleCopyFeedback(iconElement, shareUrlInput.value, 'fas fa-copy', 'fas fa-check', 'iconClass');
    }
});

// Global listener to close dropdowns/popups
document.addEventListener('click', (event) => {
    if (!sortButton.contains(event.target) && !sortOptions.contains(event.target)) {
        sortOptions.parentElement.classList.remove('open');
    }
    if (shareOverlay.classList.contains('visible')) {
       const contentBox = shareOverlay.querySelector('.share-content-box');
       // Close only if click is outside the content box itself
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
    // URLSearchParams automatically decodes the parameter values
    const repoFromUrl = urlParams.get('repo'); // Will be "mgks/GitHubTree" (decoded)
    const branchFromUrl = urlParams.get('branch'); // Will be "main" (decoded)

    // Close popups on navigation/load
    shareOverlay.classList.remove('visible');
    sortOptions.parentElement.classList.remove('open');

    if (repoFromUrl) {
        const decodedBranch = branchFromUrl || 'main';
        // Fetch only if the repo/branch from URL differs from current state,
        // or if data is missing (e.g., refresh)
        if (currentRepo !== repoFromUrl || currentBranch !== decodedBranch || !cachedTreeData) {
            repoInput.value = repoFromUrl; // Update input with decoded value
            branchInput.value = decodedBranch; // Update input with decoded value
            fetchRepoTree();
        } else {
            // State matches URL and data exists, just ensure metadata is up-to-date
            // Construct the canonical path using ENCODED values for correctness
            const canonicalPath = `/?repo=${encodeURIComponent(currentRepo)}&branch=${encodeURIComponent(currentBranch)}`;
            updateMetaData(
                `GitHubTree: ${currentRepo} (${currentBranch}) | Folder Structure`,
                currentRepoDescription,
                canonicalPath
            );
        }
    } else {
        // Homepage state
        updateMetaData(
            'GitHubTree : View Folder Structures | Repo Directories',
            'Easily visualize, sort and explore folder/directory structure of any public GitHub repository, and generate GitHub tree view. Copy file paths with a single click.',
            '/'
        );
        // Optionally clear inputs
        // repoInput.value = '';
        // branchInput.value = '';
        clearTree();
    }
}


async function fetchRepoTree() {
    // Read decoded values directly from input
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    if (!repo || !repo.includes('/')) {
        showError("Invalid repository format. Use 'username/repo'.");
        return;
    }

    showLoading(true);
    clearTree();
    clearError();
    // No need to hide shareOverlay here, clearTree does it

    try {
        // Pass decoded repo/branch to API functions (they handle internal encoding)
        const { repoInfo, commitSha, actualBranch } = await getCombinedRepoInfo(repo, branch);

        // Update state variables with potentially corrected (but still decoded) branch
        currentRepo = repo; // Store decoded repo
        currentBranch = actualBranch; // Store potentially corrected decoded branch
        branchInput.value = actualBranch; // Reflect actual branch in input
        currentRepoDescription = repoInfo.description || `Folder structure for ${repoInfo.full_name}.`;

        // **Construct the canonical path for history and metadata using ENCODED values**
        const encodedRepo = encodeURIComponent(currentRepo);
        const encodedBranch = encodeURIComponent(currentBranch);
        const canonicalPath = `/?repo=${encodedRepo}&branch=${encodedBranch}`;

        // Update browser history state ONLY IF the target URL is different
        // Construct target query string for comparison
        const targetQueryString = `?repo=${encodedRepo}&branch=${encodedBranch}`;
        if (window.location.search !== targetQueryString) {
             // Use the ENCODED path for pushState
             history.pushState({ repo: currentRepo, branch: currentBranch }, '', canonicalPath);
             console.log("Pushing state with encoded path:", canonicalPath); // Debug log
        } else {
             console.log("URL already matches target, not pushing state."); // Debug log
        }


        // Update metadata using the ENCODED canonical path
        updateMetaData(
            `GitHubTree: ${repoInfo.full_name} (${currentBranch}) | Folder Structure`,
            currentRepoDescription,
            canonicalPath
        );

        // Pass decoded repo name to getRepoTree (it handles API path construction)
        cachedTreeData = await getRepoTree(currentRepo, commitSha);

        // Pass decoded repo/branch to buildTreeHTML (it constructs GitHub links)
        const sortedData = sortTreeData(cachedTreeData);
        buildTreeHTML(sortedData, currentRepo, currentBranch);

        // Show buttons
        copyTreeButton.style.display = 'inline-block';
        shareButton.style.display = 'inline-flex';
        treeContainer.style.display = 'block';
        container.classList.add('tree-loaded');
        animateTreeOutput();

    } catch (error) {
        showError(error.message);
        copyTreeButton.style.display = 'none';
        shareButton.style.display = 'none';
        updateMetaData('GitHubTree : Error', 'Could not fetch repository structure.', '/');
    } finally {
        showLoading(false);
    }
}

// --- API Functions (Unchanged - Use DECODED repo, ENCODED branch/sha for API path parts) ---

async function getCombinedRepoInfo(repo, branch) {
    // API path requires literal slash, NO encoding for repo, YES encoding for branch
    const repoUrl = `https://api.github.com/repos/${repo}`; // repo is decoded here
    let repoResponse, repoInfo;
    // ... (rest of the function is identical to the previous corrected version) ...
    try {
        repoResponse = await fetch(repoUrl);
        if (!repoResponse.ok) throw repoResponse;
        repoInfo = await repoResponse.json();
    } catch (responseOrError) {
        if (responseOrError instanceof Response) {
             if (responseOrError.status === 404) throw new Error(`Repository "${repo}" not found.`);
             if (responseOrError.status === 403) await handleRateLimit(responseOrError);
             throw new Error(`GitHub API error fetching repo info: ${responseOrError.status}`);
        }
        throw responseOrError; // Re-throw other errors
    }

    let actualBranch = branch; // Keep track of the branch we actually use (decoded)
    // Encode branch name for the API URL segment
    const commitUrl = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(actualBranch)}`;
    let commitResponse, commitData, commitSha;

     try {
        commitResponse = await fetch(commitUrl);
        if (!commitResponse.ok) {
             if (commitResponse.status === 404 && branch !== repoInfo.default_branch) {
                 console.warn(`Branch "${branch}" not found, trying default branch "${repoInfo.default_branch}"`);
                 actualBranch = repoInfo.default_branch; // Update with decoded default branch
                 // Encode the default branch name for the retry URL
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
            if (responseOrError.status === 403) await handleRateLimit(responseOrError);
            throw new Error(`GitHub API error fetching commit info: ${responseOrError.status}`);
        }
        throw responseOrError;
    }

    // Return the decoded actual branch name used
    return { repoInfo, commitSha, actualBranch };
}


async function getRepoTree(repo, commitSha) {
    // API path requires literal slash for repo, encode sha
    // repo is passed decoded here
    const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`;
    // ... (rest of the function is identical to the previous corrected version) ...
    let treeResponse, treeData;

    try {
        treeResponse = await fetch(treeUrl);
        if (!treeResponse.ok) throw treeResponse;
        treeData = await treeResponse.json();
    } catch (responseOrError) {
         if (responseOrError instanceof Response) {
            if (responseOrError.status === 404) throw new Error("Tree data not found for this commit.");
            if (responseOrError.status === 403) await handleRateLimit(responseOrError);
            // Handle 409 Conflict for empty repos by returning empty array
            if (responseOrError.status === 409) {
                 console.log(`Repository "${repo}" appears empty (API status 409).`);
                 return [];
            }
            throw new Error(`GitHub API error fetching tree: ${responseOrError.status}`);
        }
        throw responseOrError;
    }

    if (treeData.truncated) {
        console.warn("Warning: GitHub API returned truncated tree data. Large repositories might be incomplete.");
    }

    // Check for empty tree array specifically
    if (!treeData.tree || !Array.isArray(treeData.tree)) {
         throw new Error("Invalid tree data received from GitHub API.");
    }
     if (treeData.tree.length === 0 && !treeData.truncated) {
        console.log(`Tree data for commit "${commitSha}" is empty.`);
    }
    return treeData.tree;
}

// --- buildTreeHTML (Unchanged - Uses decoded repo/branch for GitHub links) ---
function buildTreeHTML(treeData, repo, branch) {
    // repo and branch are passed decoded here
    if (treeData.length === 0) {
        tree.innerHTML = `<div class="line-numbers"><span>1</span></div><div class="line-content"><span><i class="fas fa-info-circle"></i> This repository or branch appears to be empty.</span></div>`;
        hiddenTree.value = '(empty)';
        return;
    }
    // ... (rest of buildTreeHTML is identical, constructs GitHub links with decoded values) ...
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
            // Construct GitHub link using decoded repo/branch
            const fileUrl = `https://github.com/${repo}/blob/${branch}/${item.path}`;
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


// --- Sorting Functions (Unchanged) ---
function sortTreeData(treeData) {
    // ... (Identical to previous version) ...
    if (!treeData || treeData.length === 0) return [];

    const root = { path: '', type: 'tree', children: [] };
    const nodeMap = { '': root };
    const originalDataMap = {};

    treeData.forEach(item => {
        originalDataMap[item.path] = item;
        const pathParts = item.path.split('/');
        const name = pathParts.pop();
        const parentPath = pathParts.join('/');
        // Find parent node using the map; default to root if parentPath is empty or not found yet
        const parentNode = nodeMap[parentPath] !== undefined ? nodeMap[parentPath] : root;

        const node = {
            path: item.path,
            type: item.type,
            name: name,
            children: item.type === 'tree' ? [] : undefined
        };

        // Ensure parentNode.children exists before pushing
        if(!parentNode.children) parentNode.children = [];
        parentNode.children.push(node);

        if (item.type === 'tree') {
            nodeMap[item.path] = node;
        }
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
    // ... (Identical to previous version) ...
     const compareNames = (a, b) => {
        // Ensure names exist before comparing
        const aName = a.name ? a.name.toLowerCase() : '';
        const bName = b.name ? b.name.toLowerCase() : '';
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
                return compareNames(b, a); // Z-A for names
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
    if (!cachedTreeData) return;
    const sortedData = sortTreeData(cachedTreeData);
    // Pass decoded state variables
    buildTreeHTML(sortedData, currentRepo, currentBranch);
    animateTreeOutput();
}


// --- Utility Functions (handleCopyFeedback, attachCopyButtonListeners, etc. are unchanged) ---

function handleCopyFeedback(element, textToCopy, originalContent, successContent, mode = 'text') {
    // ... (Identical to previous version) ...
    element.disabled = true;
    const parentButton = (mode === 'iconClass') ? element.closest('button') : element;
    if(parentButton) parentButton.disabled = true;

    let originalValue;
    if (mode === 'text') originalValue = element.textContent;
    else if (mode === 'html') originalValue = element.innerHTML;
    else if (mode === 'iconClass') originalValue = element.className;

    copyToClipboard(textToCopy).then(() => {
        console.log('Copied:', textToCopy.substring(0, 50) + '...');
        if (mode === 'text') element.textContent = successContent;
        else if (mode === 'html') element.innerHTML = successContent;
        else if (mode === 'iconClass') element.className = successContent;

        setTimeout(() => {
            if (mode === 'text') element.textContent = originalContent;
            else if (mode === 'html') element.innerHTML = originalContent;
            else if (mode === 'iconClass') element.className = originalValue;

            if(parentButton) parentButton.disabled = false;
            else element.disabled = false;
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
        const errorContent = (mode === 'iconClass') ? 'fas fa-times error-icon' : 'Error'; // Add error class maybe
        const errorOriginal = (mode === 'iconClass') ? 'fas fa-copy' : originalContent;

        if (mode === 'text') element.textContent = errorContent;
        else if (mode === 'html') element.innerHTML = errorContent;
        else if (mode === 'iconClass') element.className = errorContent;

        setTimeout(() => {
            if (mode === 'text') element.textContent = originalContent;
            else if (mode === 'html') element.innerHTML = originalContent;
            else if (mode === 'iconClass') element.className = originalValue;

             if(parentButton) parentButton.disabled = false;
             else element.disabled = false;
        }, 2000);
    });
}

function animateTreeOutput() {
    // ... (Identical to previous version) ...
    const lines = tree.querySelectorAll('.line-content > span');
    lines.forEach((line, index) => {
        line.style.visibility = 'hidden';
        setTimeout(() => {
            line.style.visibility = 'visible';
        }, index * 8);
    });
}

function attachCopyButtonListeners() {
    // ... (Identical to previous version, using event delegation and iconClass mode) ...
    const contentArea = tree.querySelector('.line-content');
    if (!contentArea) return;

    if (contentArea.dataset.copyListenerAttached === 'true') {
        return;
    }
    contentArea.dataset.copyListenerAttached = 'true';

    contentArea.addEventListener('click', (event) => {
        const button = event.target.closest('.copy-button');
        if (button) {
            const path = button.dataset.path;
            const iconElement = button.querySelector('i');
            if (path && iconElement) {
                 handleCopyFeedback(iconElement, path, 'fas fa-copy', 'fas fa-check', 'iconClass');
            }
        }
    });
}

async function copyToClipboard(text) {
    // ... (Identical to previous version with fallback) ...
    if (!navigator.clipboard) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        console.log('Copied using fallback method.');
      } catch (err) {
        console.error('Fallback copy failed:', err);
        throw err;
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.error('Clipboard API write failed:', err);
        throw err;
      }
    }
}

function showLoading(show) {
    loadingIndicator.style.display = show ? 'block' : 'none';
}

function showError(message) {
    errorContainer.innerHTML = message;
    errorContainer.style.display = 'block';
}

function clearError() {
    errorContainer.textContent = '';
    errorContainer.style.display = 'none';
}

function clearTree() {
    // ... (Identical to previous version) ...
    tree.innerHTML = '';
    hiddenTree.value = '';
    copyTreeButton.style.display = 'none';
    shareButton.style.display = 'none';
    shareOverlay.classList.remove('visible');
    treeContainer.style.display = 'none';
    container.classList.remove('tree-loaded');
    cachedTreeData = null;
    currentRepo = '';
    currentBranch = '';
    currentRepoDescription = '';
}

async function handleRateLimit(response) {
    // ... (Identical to previous version) ...
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');
    let errorMessage = `GitHub API error: ${response.status} (${response.statusText}).`;

    if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetTime = new Date(parseInt(rateLimitReset) * 1000);
        const currentTime = new Date();
        const timeDiff = Math.max(0, resetTime.getTime() - currentTime.getTime());
        const minutes = Math.ceil(timeDiff / (1000 * 60));
        errorMessage = `GitHub API rate limit exceeded!<br>Try again after ${resetTime.toLocaleTimeString()} (approx. ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}).`;
    }
    throw new Error(errorMessage);
}

function updateMetaData(title, description, canonicalPath) {
    // canonicalPath is expected to be ENCODED here (e.g., /?repo=...%2F...)
    document.title = title;
    metaDescriptionTag.setAttribute('content', description);

    const fullCanonicalUrl = new URL(canonicalPath, BASE_URL).href;

    if (!canonicalLinkTag) {
        canonicalLinkTag = document.createElement('link');
        canonicalLinkTag.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLinkTag);
    }
    canonicalLinkTag.setAttribute('href', fullCanonicalUrl);

    // OG/Twitter URLs should also use the canonical (encoded) URL
    metaOgUrlTag.setAttribute('content', fullCanonicalUrl);
    metaOgTitleTag.setAttribute('content', title);
    metaOgDescriptionTag.setAttribute('content', description);

    metaTwitterUrlTag.setAttribute('content', fullCanonicalUrl);
    metaTwitterTitleTag.setAttribute('content', title);
    metaTwitterDescriptionTag.setAttribute('content', description);
}