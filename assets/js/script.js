// --- Constants ---
const GITHUB_PAT = ""; // IMPORTANT: Replace with your Personal Access Token ONLY in your PRIVATE fork. Keep this fork private. NEVER commit a PAT to a public repo.

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
let currentRepoDescription = ''; // Stores fetched repo description for meta tags

// --- Theme handling ---
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('span');

// --- Check for saved theme preference ---
const savedTheme = localStorage.getItem('theme');

// --- Event Listeners ---
fetchButton.addEventListener('click', function() {
    // Track repository fetch event
    if (typeof trackEvent === 'function') {
        const repo = repoInput.value.trim();
        const branch = branchInput.value.trim() || 'main';
        trackEvent('Repository', 'Fetch', `${repo}:${branch}`);
    }
    fetchRepoTree();
});

copyTreeButton.addEventListener('click', () => {
    handleCopyFeedback(copyTreeButton, hiddenTree.value, 'Copy Complete Tree', 'Copied!', 'text');
    if (typeof trackEvent === 'function') {
        trackEvent('Tree', 'Copy', currentRepo);
    }
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

    const displayRepo = currentRepo; // Use decoded for display/logic
    const displayBranch = currentBranch;
    const [username, repoName] = displayRepo.split('/', 2);
    const branchSlug = displayBranch.toLowerCase();
    
    // Use SEO-friendly clean URL format with /repo/user/repo/branch/
    const displayUrl = new URL(`/repo/${username}/${repoName}/${branchSlug}/`, BASE_URL).href;

    shareUrlInput.value = displayUrl;
    shareOverlay.classList.add('visible');
    shareUrlInput.select();
    
    if (typeof trackEvent === 'function') {
        trackEvent('Repository', 'Share', displayRepo);
    }
});

shareUrlInput.addEventListener('click', function() {
    this.select();
});

copyShareUrlButton.addEventListener('click', () => {
    const iconElement = copyShareUrlButton.querySelector('i');
    if (iconElement) {
         handleCopyFeedback(iconElement, shareUrlInput.value, 'fas fa-copy', 'fas fa-check', 'iconClass');
    }
    if (typeof trackEvent === 'function') {
        trackEvent('Share', 'CopyURL', shareUrlInput.value);
    }
});

document.addEventListener('click', (event) => {
    // Close sort dropdown if click is outside
    if (!sortButton.contains(event.target) && !sortOptions.contains(event.target)) {
        sortOptions.parentElement.classList.remove('open');
    }
    // Close share overlay if click is outside the content box
    if (shareOverlay.classList.contains('visible')) {
       const contentBox = shareOverlay.querySelector('.share-content-box');
       if (contentBox && !contentBox.contains(event.target) && !shareButton.contains(event.target)) {
            shareOverlay.classList.remove('visible');
       }
    }
});

// Handle initial load and back/forward navigation
window.addEventListener('DOMContentLoaded', () => {
    // Execute normal page load functionality
    parseURL();
});

window.addEventListener('popstate', parseURL);

// --- Core Logic ---

function parseURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const repoFromUrl = urlParams.get('repo'); // Already decoded by URLSearchParams
    const branchFromUrl = urlParams.get('branch'); // Already decoded

    shareOverlay.classList.remove('visible');
    sortOptions.parentElement.classList.remove('open');

    // Check if using legacy parameter URLs
    if (repoFromUrl) {
        // If we're using legacy URL parameters, redirect to the clean URL format
        const cleanBranch = (branchFromUrl || 'main').toLowerCase();
        const newUrl = `${window.location.origin}/repo/${repoFromUrl}/${cleanBranch}/`;
        
        // Redirect to the clean URL (will trigger a page load)
        window.location.href = newUrl;
        return;
    }
    
    // If we're using a clean URL, get the repo/branch from the path
    // Format: /repo/user/repo/branch/
    const pathMatch = window.location.pathname.match(/\/repo\/([^\/]+)\/([^\/]+)\/([^\/]+)\/?$/);
    
    if (pathMatch) {
        const [, user, repo, branch] = pathMatch;
        const fullRepo = `${user}/${repo}`; // Reconstruct repo format
        
        // Only fetch if data isn't already cached or relevant
        if (currentRepo !== fullRepo || currentBranch !== branch || !cachedTreeData) {
            repoInput.value = fullRepo;
            branchInput.value = branch;
            fetchRepoTree(); // This will handle metadata update after fetch
        }
    } else {
        // Reset to homepage defaults
        updateMetaData(
            'GitHub repo explorer: visualize and navigate github project structures', // Default Title
            'Effortlessly explore and visualize the file structure of any public GitHub repository online. Navigate project folders, view directory trees, and copy paths without cloning.', // Default Description
            '/'
        );
        clearTree();
    }
}

// Function to update meta tags dynamically
async function fetchRepoTree() {
    const repoInputVal = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    // --- Improved Input Validation and Parsing ---
    if (!repoInputVal || !repoInputVal.includes('/')) {
        showError("Invalid repository format. Use 'username/repo'.");
        // Set generic error metadata but avoid negative terms
        updateMetaData(
            'GitHub repo explorer: visualize and navigate github project structures', // Title
            'Effortlessly explore and visualize the file structure of any public GitHub repository online. Navigate project folders, view directory trees, and copy paths without cloning.', // Description
            '/' // Canonical back to homepage
        );
        return;
    }

    // Parse username and repo name
    const [username, repoName] = repoInputVal.split('/', 2);
    const repo = `${username}/${repoName}`; // Reconstruct for consistency, potentially cleaning input
    
    // Use SEO-friendly clean URL format immediately
    const branchSlug = branch.toLowerCase();
    const cleanPath = `/repo/${username}/${repoName}/${branchSlug}/`;
    const newUrl = `${window.location.origin}${cleanPath}`;
    
    // Update browser history without reload
    history.pushState({ repo, branch }, '', newUrl);
    
    // Update meta tags immediately with optimistic values
    const optimisticTitle = `${repo}: visualize and navigate github project structures`;
    const optimisticDescription = `Effortlessly explore ${repo} and visualize the file structure of any public GitHub repository online. Navigate project folders, view directory trees, and copy paths without cloning.`;
    updateMetaData(optimisticTitle, optimisticDescription, cleanPath);

    // --- Dynamic Loading Text (using parsed parts) ---
    showLoading(true, `Fetching tree for GitHub repository <i>${repoName}</i> from branch <i>${branch}</i>, published by <i>${username}</i>...`);
    clearTree();
    clearError();

    try {
        // Pass decoded repo/branch to API functions
        const { repoInfo, commitSha, actualBranch } = await getCombinedRepoInfo(repo, branch);

        // Update state variables with actual fetched data
        currentRepo = repo; // Store the validated/reconstructed repo name
        currentBranch = actualBranch;
        branchInput.value = actualBranch; // Reflect actual branch used
        currentRepoDescription = repoInfo.description || ''; // Store fetched description

        // Construct clean canonical path for URL and meta tags using actual data
        const [username, repoName] = currentRepo.split('/', 2);
        const actualBranchSlug = currentBranch.toLowerCase();
        const canonicalPath = `/repo/${username}/${repoName}/${actualBranchSlug}/`;

        // Update browser history state with canonical data if different from initial request
        if (window.location.pathname !== canonicalPath) {
            history.pushState({ repo: currentRepo, branch: currentBranch }, '', canonicalPath);
        }

        // --- Update Metadata on Success (SEO Optimized & User Format) ---
        const metaTitle = currentRepoDescription 
            ? `${repo}: ${currentRepoDescription}` 
            : `${repo}: visualize and navigate github project structures`;
        const metaDescription = `Effortlessly explore ${repo} and visualize the file structure of any public GitHub repository online. Navigate project folders, view directory trees, and copy paths without cloning.`;
        updateMetaData(metaTitle, metaDescription, canonicalPath);

        // Fetch the actual tree data
        cachedTreeData = await getRepoTree(currentRepo, commitSha);
        const sortedData = sortTreeData(cachedTreeData);
        buildTreeHTML(sortedData, currentRepo, currentBranch); // Pass state repo/branch

        // Show tree container and action buttons on success
        copyTreeButton.style.display = 'inline-block';
        shareButton.style.display = 'inline-flex';
        treeContainer.style.display = 'block';
        container.classList.add('tree-loaded');
        animateTreeOutput();

    } catch (error) {
        console.error("Fetch Error:", error); // Log the actual error for debugging

        // --- Set Optimistic Metadata on Error ---
        // Use the title/description/canonical defined *before* the try block,
        // reflecting the user's *intended* repo, regardless of the error.
        updateMetaData(optimisticTitle, optimisticDescription, cleanPath);

        // Display the actual error message clearly to the user
        showError(error.message); // Show the specific technical error

        // Ensure UI reflects error state
        copyTreeButton.style.display = 'none';
        shareButton.style.display = 'none';
        treeContainer.style.display = 'none';
    } finally {
        showLoading(false); // Hide loading indicator
    }
}


// --- API Functions ---

// Function to create headers, including PAT if available
function getApiHeaders() {
    const headers = {
        'Accept': 'application/vnd.github.v3+json' // Good practice to specify API version
    };
    // --- PAT Integration ---
    // Add Authorization header ONLY if GITHUB_PAT is set (in a private fork)
    if (GITHUB_PAT && GITHUB_PAT.trim() !== "") {
        headers['Authorization'] = `token ${GITHUB_PAT}`;
    }
    return headers;
}

async function getCombinedRepoInfo(repo, branch) {
    const repoUrl = `https://api.github.com/repos/${repo}`;
    let repoResponse, repoInfo;
    try {
        repoResponse = await fetch(repoUrl, { headers: getApiHeaders() }); // Use helper for headers
        if (!repoResponse.ok) throw repoResponse; // Throw the response object on error
        repoInfo = await repoResponse.json();
    } catch (responseOrError) {
        // Handle fetch errors (network, CORS) and bad HTTP responses
        if (responseOrError instanceof Response) {
             if (responseOrError.status === 404) throw new Error(`Repository "${repo}" not found. Check username and repository name.`);
             if (responseOrError.status === 403) await handleRateLimit(responseOrError); // handleRateLimit throws specific error
             if (responseOrError.status === 401) throw new Error(`Authentication failed. If using a PAT, ensure it's valid and has 'repo' scope for private repositories.`);
             throw new Error(`GitHub API error fetching repo info: ${responseOrError.status} ${responseOrError.statusText}`);
        }
        throw responseOrError; // Re-throw other errors (e.g., network)
    }

    // Now try to get the commit SHA for the specified branch (or default)
    let actualBranch = branch;
    const commitUrl = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(actualBranch)}`;
    let commitResponse, commitData, commitSha;
     try {
        commitResponse = await fetch(commitUrl, { headers: getApiHeaders() }); // Use helper for headers
        if (!commitResponse.ok) {
             // If initial branch fails, try the repo's default branch
             if (commitResponse.status === 404 && branch !== repoInfo.default_branch) {
                 console.warn(`Branch "${branch}" not found, trying default branch "${repoInfo.default_branch}"`);
                 actualBranch = repoInfo.default_branch; // Switch to default branch
                 const defaultCommitUrl = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(actualBranch)}`;
                 commitResponse = await fetch(defaultCommitUrl, { headers: getApiHeaders() }); // Fetch again with default branch
                 if (!commitResponse.ok) throw commitResponse; // Throw if default branch also fails
             } else {
                 throw commitResponse; // Throw original error if it wasn't 404 or was the default branch
             }
         }
        commitData = await commitResponse.json();
        commitSha = commitData.sha;
    } catch (responseOrError) {
         if (responseOrError instanceof Response) {
            if (responseOrError.status === 404) throw new Error(`Branch "${actualBranch}" not found for repository "${repo}".`);
            if (responseOrError.status === 422) throw new Error(`Branch "${actualBranch}" could not be validated for repository "${repo}". It might be empty or invalid.`);
            if (responseOrError.status === 403) await handleRateLimit(responseOrError); // handleRateLimit throws
            if (responseOrError.status === 401) throw new Error(`Authentication failed fetching commit. If using a PAT, ensure it's valid and has 'repo' scope for private repositories.`);
            throw new Error(`GitHub API error fetching commit info: ${responseOrError.status} ${responseOrError.statusText}`);
        }
        throw responseOrError; // Re-throw other errors
    }
    return { repoInfo, commitSha, actualBranch }; // Return actual branch used (decoded)
}

async function getRepoTree(repo, commitSha) {
     const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`;
    let treeResponse, treeData;
    try {
        treeResponse = await fetch(treeUrl, { headers: getApiHeaders() }); // Use helper for headers
        if (!treeResponse.ok) throw treeResponse; // Throw response on error
        treeData = await treeResponse.json();
    } catch (responseOrError) {
         if (responseOrError instanceof Response) {
            if (responseOrError.status === 404) throw new Error(`Tree data not found for commit SHA "${commitSha}". The repository might be empty or the commit invalid.`);
            if (responseOrError.status === 403) await handleRateLimit(responseOrError); // handleRateLimit throws
            if (responseOrError.status === 401) throw new Error(`Authentication failed fetching tree. If using a PAT, ensure it's valid and has 'repo' scope for private repositories.`);
            // Handle 409 Conflict for empty repositories specifically
            if (responseOrError.status === 409) {
                 console.warn(`Repository "${repo}" (commit: ${commitSha}) appears to be empty or in a state preventing tree access (API status 409).`);
                 return []; // Treat as empty tree, don't throw error
            }
            throw new Error(`GitHub API error fetching tree: ${responseOrError.status} ${responseOrError.statusText}`);
        }
        throw responseOrError; // Re-throw other errors
    }

    if (treeData.truncated) {
        console.warn("Warning: GitHub API returned truncated tree data. The repository is very large, and the displayed structure might be incomplete.");
        showError("Warning: Repository is very large, the displayed tree might be incomplete.", true); // Show non-blocking warning
    }
    if (!treeData.tree || !Array.isArray(treeData.tree)) {
         // If tree is missing but status was OK (and not 409 handled above), it's unexpected
         console.warn(`Received OK status but invalid tree data for commit "${commitSha}". Assuming empty tree.`);
         return [];
    }
     if (treeData.tree.length === 0 && !treeData.truncated) {
        console.log(`Tree data for commit "${commitSha}" is empty (repository or branch might be empty).`);
        // No need to show error, buildTreeHTML will handle empty array
    }
    return treeData.tree;
}

// --- buildTreeHTML ---
function buildTreeHTML(treeData, repo, branch) { // Expects decoded repo/branch
     if (!treeData || treeData.length === 0) {
        // Handle case where repo/branch is genuinely empty
        tree.innerHTML = `<div class="line-numbers"><span>1</span></div><div class="line-content"><span><i class="fas fa-info-circle"></i> This repository or branch appears to be empty.</span></div>`;
        hiddenTree.value = '(empty)';
        treeContainer.style.display = 'block'; // Ensure container is visible to show the message
        container.classList.add('tree-loaded'); // Adjust layout
        copyTreeButton.style.display = 'none'; // No tree to copy
        return; // Exit early
    }

    let treeContentHTML = '';
    let plainText = '';
    const pathMap = {}; // Memoize parent paths for efficiency

    // Pre-process to build the path map
    treeData.forEach(item => {
        const pathParts = item.path.split('/');
        const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
        pathMap[item.path] = parentPath;
    });

    // Helper to determine indent level
    const getIndent = (path) => "    ".repeat(path.split('/').length - 1);

    // Helper to determine prefix (├── or └──)
    const getPrefix = (item) => {
        const parentPath = pathMap[item.path];
        // Find siblings efficiently using the pre-calculated parent path
        const siblings = treeData.filter(sibling => pathMap[sibling.path] === parentPath);
        const isLast = siblings.indexOf(item) === siblings.length - 1;
        // No prefix for root items
        return parentPath === '' ? '' : isLast ? '└── ' : '├── ';
    };

    // Build HTML and plain text representations
    treeData.forEach(item => {
        const indent = getIndent(item.path);
        const prefix = getPrefix(item);
        const iconClass = item.type === 'tree' ? 'fas fa-folder' : 'fas fa-file';
        const name = item.path.split('/').pop();
        // Use encoded repo/branch/path for the URL
        const encodedRepo = encodeURIComponent(repo); // Encode parts, keep slashes
        const encodedBranch = encodeURIComponent(branch);
        const encodedPath = encodeURIComponent(item.path).replace(/%2F/g, '/');

        const copyButtonHTML = `<button class="copy-button" title="Copy path" data-path="${item.path}"><i class="fas fa-copy"></i></button>`;
        let line;

        if (item.type === 'tree') { // Directory
            line = `${indent}${prefix}<i class="${iconClass}"></i> <span class="dir-name">${name}</span> ${copyButtonHTML}`;
            plainText += `${indent}${prefix}${name}/\n`;
        } else if (item.type === 'blob') { // File
            const fileUrl = `https://github.com/${repo}/blob/${encodedBranch}/${encodedPath}`;
            line = `${indent}${prefix}<i class="${iconClass}"></i> <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${name}</a> ${copyButtonHTML}`;
            plainText += `${indent}${prefix}${name}\n`;
        }
        // Add other types like 'commit' (submodules) if needed
        // else if (item.type === 'commit') { ... }

        if (line) {
             // Wrap each line in a span for animation/styling
             treeContentHTML += `<span>${line}</span>\n`;
        }
    });

    // Generate line numbers
    let lineNumbersHTML = '';
    const numLines = treeContentHTML.trim().split('\n').length;
    for (let i = 1; i <= numLines; i++) {
        lineNumbersHTML += `<span>${i}</span>`;
    }

    // Update the DOM
    tree.innerHTML = `<div class="line-numbers">${lineNumbersHTML}</div><div class="line-content">${treeContentHTML.trim()}</div>`;
    hiddenTree.value = plainText.trim(); // Store plain text for copy-all button

    // Attach listeners to the newly added copy buttons
    attachCopyButtonListeners();
}

// --- Sorting Functions ---
function sortTreeData(treeData) {
    if (!treeData || treeData.length === 0) return [];

    // Build a hierarchical structure for sorting
    const root = { path: '', type: 'tree', children: [], name: '' }; // Root node
    const nodeMap = { '': root }; // Map paths to nodes
    const originalDataMap = {}; // Keep original items to return later

    treeData.forEach(item => {
        originalDataMap[item.path] = item; // Store original item
        const pathParts = item.path.split('/');
        const name = pathParts.pop();
        const parentPath = pathParts.join('/');

        // Find or create parent node
        let parentNode = nodeMap[parentPath];
        if (!parentNode) {
            // This case handles potential inconsistencies if parent tree entry is missing in recursive fetch (unlikely but possible)
            console.warn(`Parent node not found for path: ${item.path}. Placing under root.`);
            parentNode = root;
        }

        // Create the current node
        const node = {
            path: item.path,
            type: item.type,
            name: name, // Store name for sorting
            children: item.type === 'tree' ? [] : undefined // Only trees have children array
        };

        if (!parentNode.children) parentNode.children = []; // Ensure parent has children array
        parentNode.children.push(node);

        // Add tree nodes to the map for future lookups
        if (item.type === 'tree') {
            nodeMap[item.path] = node;
        }
    });

    // Recursive sort function
    const recursiveSort = (node) => {
        if (node.children && node.children.length > 0) {
            node.children.sort(getSortFunction(currentSort)); // Sort children
            node.children.forEach(recursiveSort); // Sort grandchildren
        }
    };

    recursiveSort(root); // Start sorting from the root

    // Flatten the sorted hierarchy back into a list of original items
    const flattened = [];
    const flatten = (node) => {
         if (node.children) {
             node.children.forEach(child => {
                 const originalItem = originalDataMap[child.path];
                 if (originalItem) {
                     flattened.push(originalItem); // Add the original item in sorted order
                     if (child.type === 'tree') {
                         flatten(child); // Recurse into sorted subdirectories
                     }
                 } else {
                     console.warn(`Original data not found for sorted path: ${child.path}`);
                 }
             });
         }
    };

    flatten(root); // Start flattening from the root
    return flattened;
}

function getSortFunction(sortType) {
    // Comparison function for names (case-insensitive)
    const compareNames = (a, b) => {
        const aName = a.name ? a.name.toLowerCase() : '';
        const bName = b.name ? b.name.toLowerCase() : '';
        return aName.localeCompare(bName);
    };

    switch (sortType) {
        case 'folders-first-az':
            return (a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1; // Folders first
                if (a.type !== 'tree' && b.type === 'tree') return 1;  // Files after folders
                return compareNames(a, b); // Sort by name A-Z
            };
        case 'folders-first-za':
            return (a, b) => {
                if (a.type === 'tree' && b.type !== 'tree') return -1; // Folders first
                if (a.type !== 'tree' && b.type === 'tree') return 1;  // Files after folders
                return compareNames(b, a); // Sort by name Z-A
            };
        case 'az':
            return compareNames; // Sort by name A-Z (folders/files mixed)
        case 'za':
            return (a, b) => compareNames(b, a); // Sort by name Z-A (folders/files mixed)
        default: // Should not happen, but return stable sort if type is unknown
            return (a, b) => 0;
    }
}

function sortAndRebuildTree() {
    if (!cachedTreeData) return;
    const sortedData = sortTreeData(cachedTreeData);
    // Pass decoded repo/branch as they are stored in state variables
    buildTreeHTML(sortedData, currentRepo, currentBranch);
    animateTreeOutput(); // Re-apply animation
}


// --- Utility Functions ---

function handleCopyFeedback(element, textToCopy, originalContent, successContent, mode = 'text') {
    // Disable the button/icon's parent button during copy operation
    const parentButton = (mode === 'iconClass') ? element.closest('button') : element;
    if (parentButton) parentButton.disabled = true;
    else element.disabled = true; // Fallback for elements not in buttons

    let originalValue;
    // Store the original state based on mode
    if (mode === 'text') originalValue = element.textContent;
    else if (mode === 'html') originalValue = element.innerHTML;
    else if (mode === 'iconClass') originalValue = element.className;

    copyToClipboard(textToCopy)
        .then(() => {
            // Update element to show success state
            if (mode === 'text') element.textContent = successContent;
            else if (mode === 'html') element.innerHTML = successContent;
            else if (mode === 'iconClass') element.className = successContent;

            // Revert back to original state after a delay
            setTimeout(() => {
                if (mode === 'text') element.textContent = originalContent;
                else if (mode === 'html') element.innerHTML = originalContent;
                else if (mode === 'iconClass') element.className = originalValue;
                // Re-enable the button
                if (parentButton) parentButton.disabled = false;
                else element.disabled = false;
            }, 1500); // 1.5 seconds success feedback
        })
        .catch(err => {
            console.error('Failed to copy:', err);
            // Update element to show error state
            const errorContent = (mode === 'iconClass') ? 'fas fa-times error-icon' : 'Error'; // Use 'times' icon for error
            if (mode === 'text') element.textContent = errorContent;
            else if (mode === 'html') element.innerHTML = errorContent;
            else if (mode === 'iconClass') element.className = errorContent;

            // Revert back to original state after a longer delay for error
            setTimeout(() => {
                if (mode === 'text') element.textContent = originalContent;
                else if (mode === 'html') element.innerHTML = originalContent;
                else if (mode === 'iconClass') element.className = originalValue;
                 // Re-enable the button
                 if (parentButton) parentButton.disabled = false;
                 else element.disabled = false;
            }, 2500); // 2.5 seconds error feedback
        });
}

// Simple animation effect for tree lines appearing
function animateTreeOutput() {
    const contentDiv = tree.querySelector('.line-content');
    if(contentDiv){
        const lines = contentDiv.querySelectorAll('span');
        lines.forEach((line, index) => {
            line.style.visibility = 'hidden'; // Hide initially
            // Reveal lines sequentially with a small delay
            setTimeout(() => {
                line.style.visibility = 'visible';
            }, index * 5); // Adjust delay (e.g., 5ms) for speed
        });
    }
}

// Attach delegated event listener for copy buttons inside the tree
function attachCopyButtonListeners() {
    const copyButtons = document.querySelectorAll('.copy-path');
    copyButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const pathToCopy = button.getAttribute('data-path');
            
            handleCopyFeedback(button, pathToCopy, '<i class="fas fa-copy"></i>', '<i class="fas fa-check"></i>', 'html');
            
            if (typeof trackEvent === 'function') {
                trackEvent('Path', 'Copy', pathToCopy);
            }
        });
    });
}

// Clipboard copy function with fallback for older browsers
async function copyToClipboard(text) {
    // Try modern Clipboard API first
    if (navigator.clipboard && window.isSecureContext) { // Check for secure context
      try {
          await navigator.clipboard.writeText(text);
          return; // Success
      } catch (err) {
          console.error('Clipboard API write failed:', err);
          // Fallthrough to execCommand if Clipboard API fails
      }
    }

    // Fallback using execCommand (less reliable, requires element selection)
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // Make textarea non-editable and visually hidden
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        textArea.setAttribute("readonly", "");
        document.body.appendChild(textArea);
        textArea.select(); // Select the text
        document.execCommand('copy'); // Attempt copy command
        document.body.removeChild(textArea); // Clean up
        return; // Success (potentially)
    } catch (err) {
        console.error('Fallback copy using execCommand failed:', err);
        throw new Error('Could not copy text to clipboard.'); // Throw final error
    }
}

// Show/hide loading indicator and update its text
function showLoading(show, message = '<i>Fetching...</i>') {
    if (show) {
        // Use innerHTML to allow basic formatting in the message
        loadingIndicator.innerHTML = message;
        loadingIndicator.style.display = 'block';
    } else {
        loadingIndicator.style.display = 'none';
        // Reset to default when hiding, though it's usually hidden immediately
        loadingIndicator.innerHTML = '<i>Fetching...</i>';
    }
}

// Show error message (can optionally append instead of replacing)
function showError(message, append = false) {
    if (append) {
        // Append warning/info without clearing previous errors
        const appendMsg = document.createElement('p');
        appendMsg.innerHTML = `<i>Note: ${message}</i>`;
        appendMsg.style.marginTop = '0.5em';
        errorContainer.appendChild(appendMsg);
    } else {
        // Replace existing error content
        errorContainer.innerHTML = message; // Use innerHTML to allow basic formatting like <i>
    }
    errorContainer.style.display = 'block';
}

// Clear error messages
function clearError() {
    errorContainer.textContent = ''; // Clear content
    errorContainer.style.display = 'none'; // Hide container
}

// Clear tree display, state, and related UI elements
function clearTree() {
    tree.innerHTML = ''; // Clear tree content
    hiddenTree.value = ''; // Clear hidden text
    copyTreeButton.style.display = 'none'; // Hide copy all button
    shareButton.style.display = 'none'; // Hide share button
    shareOverlay.classList.remove('visible'); // Hide share overlay
    treeContainer.style.display = 'none'; // Hide the main tree container
    container.classList.remove('tree-loaded'); // Reset layout class
    cachedTreeData = null; // Clear cached data
    currentRepo = ''; // Reset state
    currentBranch = ''; // Reset state
    currentRepoDescription = ''; // Reset state
    // No need to reset loading text here, showLoading handles it
}

// Handle rate limit errors specifically
async function handleRateLimit(response) { // Throws an error with specific message
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset'); // Unix timestamp (seconds)
    let errorMessage = `GitHub API error: ${response.status} (${response.statusText}).`; // Default message

    // Check if it's specifically a rate limit exceeded error (remaining is 0)
    if (rateLimitRemaining === '0' && rateLimitReset) {
        try {
            const resetTimestamp = parseInt(rateLimitReset) * 1000; // Convert to milliseconds
            const resetTime = new Date(resetTimestamp);
            const currentTime = new Date();
            // Calculate difference in minutes, rounding up
            const timeDiff = Math.max(0, resetTime.getTime() - currentTime.getTime());
            const minutes = Math.ceil(timeDiff / (1000 * 60));

            // Format reset time for user locale
            const formattedResetTime = resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            errorMessage = `GitHub API rate limit exceeded! Please wait.<br>Limit resets around ${formattedResetTime} (approx. ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}).`;
            // Add note about PAT if not already using one
            if (!GITHUB_PAT) {
                 errorMessage += `<br><small>Using a <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noopener noreferrer">Personal Access Token</a> (in a private fork) can increase rate limits.</small>`;
            }
        } catch (e) {
            // Fallback if date parsing fails
            errorMessage = `GitHub API rate limit exceeded! Please wait and try again later.`;
             if (!GITHUB_PAT) {
                 errorMessage += `<br><small>Using a Personal Access Token may help.</small>`;
             }
        }
    } else if (response.status === 403) {
        // Handle other potential 403 errors (e.g., permissions, IP block)
        errorMessage = `GitHub API access forbidden (Error 403). This could be due to permissions, rate limiting, or other access restrictions.`;
         if (!GITHUB_PAT) {
             errorMessage += `<br><small>Ensure you have access to the repository. Using a PAT might be required for private repos or higher rate limits.</small>`;
         }
    }

    throw new Error(errorMessage); // Throw the constructed error message
}

// Update page metadata (title, description, canonical, OG/Twitter tags)
function updateMetaData(title, description, canonicalPath) { // canonicalPath should be ENCODED
    document.title = title; // Update page title

    // Ensure description exists and set attribute
    if (metaDescriptionTag) {
        metaDescriptionTag.setAttribute('content', description);
    } else {
        console.warn("Meta description tag not found.");
    }

    // Construct full canonical URL using BASE_URL and the (already encoded) path
    const fullCanonicalUrl = new URL(canonicalPath, BASE_URL).href;

    // Update or create canonical link tag
    if (!canonicalLinkTag) {
        canonicalLinkTag = document.createElement('link');
        canonicalLinkTag.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLinkTag);
    }
    canonicalLinkTag.setAttribute('href', fullCanonicalUrl);

    // Update Open Graph tags
    if (metaOgUrlTag) metaOgUrlTag.setAttribute('content', fullCanonicalUrl);
    if (metaOgTitleTag) metaOgTitleTag.setAttribute('content', title);
    if (metaOgDescriptionTag) metaOgDescriptionTag.setAttribute('content', description);

    // Update Twitter Card tags
    if (metaTwitterUrlTag) metaTwitterUrlTag.setAttribute('content', fullCanonicalUrl);
    if (metaTwitterTitleTag) metaTwitterTitleTag.setAttribute('content', title);
    if (metaTwitterDescriptionTag) metaTwitterDescriptionTag.setAttribute('content', description);
}

if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeIcon.classList.replace('fa-moon', 'fa-sun');
}

// Theme toggle functionality
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    if (isDarkMode) {
        themeIcon.classList.replace('fa-moon', 'fa-sun');
        localStorage.setItem('theme', 'dark');
    } else {
        themeIcon.classList.replace('fa-sun', 'fa-moon');
        localStorage.setItem('theme', 'light');
    }
    
    if (typeof trackEvent === 'function') {
        trackEvent('UI', 'ThemeToggle', isDarkMode ? 'dark' : 'light');
    }
});
