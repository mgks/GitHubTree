import { GitHubTree } from 'gh-tree';

// --- State ---
let gt = new GitHubTree(); 
let currentData = []; // Stores the Raw API response
let currentDataTruncated = false;
let currentSort = 'folder-az';
let currentStyle = 'classic';
let activeDetailItem = null;
let indexedRepos = new Set();
let indexedReposReady = Promise.resolve();

// High-Performance Virtual Hierarchy State
let treeMetadata = {
    totalFiles: 0,
    totalDirs: 0,
    totalBytes: 0,
    statsByFolder: new Map(), // path -> { fileCount, totalBytes, directCount }
    defaultExpanded: new Set()
};
let expandedFolders = new Set();
let treeHierarchyCache = [];
let visibleItemsList = [];
let activeSelectedRowIndex = -1;
const branchCache = new Map(); // repo -> Array<{ name, default }>

// --- Elements ---
const els = {
    // Search & Inputs
    repo: document.getElementById('repoInput'),
    branch: document.getElementById('branchInput'),
    fetchBtn: document.getElementById('fetchBtn'),
    branchDropdownBtn: document.getElementById('branchDropdownBtn'),
    branchDropdown: document.getElementById('branchDropdown'),
    branchFilterInput: document.getElementById('branchFilterInput'),
    branchListContainer: document.getElementById('branchListContainer'),
    
    // UI Containers & Alerts
    wrapper: document.getElementById('treeWrapper'),
    empty: document.getElementById('emptyState'),
    status: document.getElementById('statusMsg'),
    truncationWarning: document.getElementById('truncationWarning'),
    closeTruncationWarning: document.getElementById('closeTruncationWarning'),
    treeStatsSummary: document.getElementById('treeStatsSummary'),
    terminalWindow: document.getElementById('terminalWindow'),
    
    // Terminal
    lineNums: document.getElementById('lineNumbers'),
    treeContent: document.getElementById('treeContent'),
    
    // Private Access
    privateBtn: document.getElementById('privateRepoBtn'),
    tokenPanel: document.getElementById('tokenSection'),
    ghToken: document.getElementById('ghToken'),
    saveToken: document.getElementById('saveTokenBtn'),
    clearToken: document.getElementById('clearTokenBtn'),
    
    // Actions & Toolbar
    copyAll: document.getElementById('copyAllBtn'),
    shareBtn: document.getElementById('shareBtn'),
    treeToggle: document.getElementById('treeToggleBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportDropdown: document.getElementById('exportDropdown'),
    exportAsciiBtn: document.getElementById('exportAsciiBtn'),
    exportMarkdownBtn: document.getElementById('exportMarkdownBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    exportDownloadTxtBtn: document.getElementById('exportDownloadTxtBtn'),
    exportDownloadJsonBtn: document.getElementById('exportDownloadJsonBtn'),

    // Overlays & Dropdowns
    overlay: document.getElementById('shareOverlay'),
    shareInput: document.getElementById('shareInput'),
    copyShareBtn: document.getElementById('copyShareBtn'),
    closeOverlay: document.getElementById('closeOverlay'),
    
    // Search & Preview
    treeSearch: document.getElementById('treeSearch'),
    previewOverlay: document.getElementById('previewOverlay'),
    previewTitle: document.getElementById('previewTitle'),
    previewBody: document.getElementById('previewBody'),
    closePreview: document.getElementById('closePreview'),

    // Dropdown Labels
    sortBtnLabel: document.getElementById('sortBtnLabel'),
    styleBtnLabel: document.getElementById('styleBtnLabel'),
    dropdowns: document.querySelectorAll('.dropdown')
};

// --- Storage Manager (Dual IndexedDB + SessionStorage Fallback) ---
const TreeStorage = {
    dbPromise: null,
    getDB() {
        if (this.dbPromise) return this.dbPromise;
        if (!('indexedDB' in window)) return Promise.resolve(null);
        this.dbPromise = new Promise((resolve) => {
            try {
                const req = indexedDB.open('GitHubTreeDB', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('trees')) {
                        db.createObjectStore('trees');
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
        return this.dbPromise;
    },
    async get(key) {
        // Tier 1: sessionStorage
        try {
            const raw = sessionStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch (e) {}

        // Tier 2: IndexedDB (for large trees that exceeded 5MB sessionStorage)
        try {
            const db = await this.getDB();
            if (!db) return null;
            return new Promise((resolve) => {
                const tx = db.transaction('trees', 'readonly');
                const store = tx.objectStore('trees');
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    },
    async set(key, value) {
        // Tier 1: try saving to sessionStorage
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // QuotaExceededError is expected for large trees (>5MB)
        }

        // Tier 2: persist reliably in IndexedDB
        try {
            const db = await this.getDB();
            if (!db) return;
            return new Promise((resolve) => {
                const tx = db.transaction('trees', 'readwrite');
                const store = tx.objectStore('trees');
                const req = store.put(value, key);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        } catch (e) {}
    }
};

// --- Sanitization & File Icon Helpers ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
}

function getFileIcon(filename, isFolder, isExpanded) {
    if (isFolder) {
        return {
            iconClass: isExpanded ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder',
            color: '#d4a359' // Soothing faded amber (identical for both open and closed)
        };
    }
    const lower = filename.toLowerCase();
    if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return { iconClass: 'fa-brands fa-docker', color: '#5b93b8' };
    if (lower === 'package.json' || lower === 'package-lock.json') return { iconClass: 'fa-brands fa-npm', color: '#b85b56' };
    if (lower.startsWith('license') || lower.startsWith('copying')) return { iconClass: 'fa-solid fa-scale-balanced', color: '#c2944b' };
    if (lower === '.gitignore' || lower === '.gitattributes' || lower.startsWith('.env')) return { iconClass: 'fa-solid fa-wrench', color: '#7c8794' };
    if (lower === 'readme.md') return { iconClass: 'fa-brands fa-markdown', color: '#628ec2' };

    const parts = lower.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';

    switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
            return { iconClass: 'fa-brands fa-js', color: '#cbb159' };
        case 'ts':
        case 'mts':
        case 'cts':
            return { iconClass: 'fa-solid fa-code', color: '#5f8bc0' };
        case 'jsx':
        case 'tsx':
            return { iconClass: 'fa-brands fa-react', color: '#65a5be' };
        case 'vue':
            return { iconClass: 'fa-brands fa-vuejs', color: '#549d79' };
        case 'html':
        case 'htm':
            return { iconClass: 'fa-brands fa-html5', color: '#be6955' };
        case 'css':
        case 'scss':
        case 'sass':
        case 'less':
            return { iconClass: 'fa-brands fa-css3-alt', color: '#5d7ba6' };
        case 'py':
        case 'pyw':
        case 'ipynb':
            return { iconClass: 'fa-brands fa-python', color: '#5787ad' };
        case 'rs':
            return { iconClass: 'fa-solid fa-gear', color: '#ab7658' };
        case 'go':
            return { iconClass: 'fa-brands fa-golang', color: '#4f9fa8' };
        case 'java':
        case 'kt':
        case 'kts':
            return { iconClass: 'fa-brands fa-java', color: '#a87843' };
        case 'php':
            return { iconClass: 'fa-brands fa-php', color: '#767ba8' };
        case 'rb':
            return { iconClass: 'fa-solid fa-gem', color: '#b85450' };
        case 'c':
        case 'cpp':
        case 'cc':
        case 'h':
        case 'hpp':
        case 'cs':
            return { iconClass: 'fa-solid fa-microchip', color: '#7a8898' };
        case 'swift':
            return { iconClass: 'fa-brands fa-swift', color: '#bf6c54' };
        case 'json':
            return { iconClass: 'fa-solid fa-code', color: '#b59e51' };
        case 'yml':
        case 'yaml':
        case 'toml':
            return { iconClass: 'fa-solid fa-sliders', color: '#a86968' };
        case 'md':
        case 'markdown':
            return { iconClass: 'fa-brands fa-markdown', color: '#628ec2' };
        case 'txt':
        case 'log':
            return { iconClass: 'fa-regular fa-file-lines', color: '#7c8794' };
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
        case 'webp':
        case 'ico':
            return { iconClass: 'fa-regular fa-image', color: '#589c6c' };
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'flac':
            return { iconClass: 'fa-regular fa-file-audio', color: '#8e75a8' };
        case 'mp4':
        case 'webm':
        case 'mov':
            return { iconClass: 'fa-regular fa-file-video', color: '#bf6560' };
        case 'zip':
        case 'tar':
        case 'gz':
        case '7z':
        case 'rar':
            return { iconClass: 'fa-regular fa-file-zipper', color: '#a88f57' };
        case 'sh':
        case 'bash':
        case 'zsh':
            return { iconClass: 'fa-solid fa-terminal', color: '#579e6c' };
        case 'sql':
            return { iconClass: 'fa-solid fa-database', color: '#4b8eb5' };
        case 'pdf':
            return { iconClass: 'fa-regular fa-file-pdf', color: '#b85757' };
        default:
            return { iconClass: 'fa-regular fa-file', color: '#7c8794' };
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkSavedToken();
    initAppStarButton();
    indexedReposReady = loadIndexedRepos();
    setupUrlHandler();
    setupDropdowns();
    updateActiveStyleCheckmarks();
    setupShareOverlay();
    setupBranchPicker();
    setupExportActions();
    setupKeyboardNav();
    initHistoryCloud();
    
    // Main Listeners
    els.copyAll.addEventListener('click', copyFullTree);
    els.treeToggle.addEventListener('click', () => {
        const isCollapsed = els.treeToggle.innerHTML.includes('Expand');
        toggleAll(!isCollapsed);
        
        // Update button state
        const nextState = !isCollapsed ? 'Expand All' : 'Compact';
        const nextIcon = !isCollapsed ? 'fa-expand-alt' : 'fa-compress-alt';
        els.treeToggle.innerHTML = `<i class="fas ${nextIcon}"></i> <span class="btn-text">${nextState}</span>`;
        
        trackEvent('UI', 'Tree Toggle', nextState);
    });

    // Debounced Search (250ms prevents typing lockup on large trees)
    const clearSearchBtn = document.getElementById('clearTreeSearch');
    let searchDebounce = null;
    els.treeSearch.addEventListener('input', () => {
        if (clearSearchBtn) {
            clearSearchBtn.style.display = els.treeSearch.value ? 'inline-flex' : 'none';
        }
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            render();
            const term = els.treeSearch.value.trim();
            if (term) trackEvent('Search', 'Query', term);
        }, 250);
    });

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            els.treeSearch.value = '';
            clearSearchBtn.style.display = 'none';
            render();
            els.treeSearch.focus();
        });
    }

    // Truncation Notice Dismissal
    if (els.closeTruncationWarning) {
        els.closeTruncationWarning.addEventListener('click', () => {
            els.truncationWarning.style.display = 'none';
        });
    }

    // Preview & Details Dialog
    if (els.closePreview) els.closePreview.addEventListener('click', () => els.previewOverlay.classList.remove('visible'));
    if (els.previewOverlay) els.previewOverlay.addEventListener('click', (e) => {
        if (e.target === els.previewOverlay) els.previewOverlay.classList.remove('visible');
    });
    
    // Bind Details Overlay Actions
    document.getElementById('btnCopyPath').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const path = document.getElementById('detailPath').innerText;
        handleCopy(btn, path, true);
        trackEvent('Modal', 'Copy Path', path);
    });

    document.getElementById('btnTogglePreview').addEventListener('click', (e) => {
        const container = document.getElementById('filePreviewContainer');
        const isHidden = container.style.display === 'none';
        
        if (isHidden) {
            loadFilePreviewContent();
            trackEvent('Modal', 'Show Preview', activeDetailItem ? activeDetailItem.path : '');
        } else {
            container.style.display = 'none';
            e.currentTarget.innerHTML = `<i class="far fa-eye"></i> Show Content`;
            trackEvent('Modal', 'Hide Preview', activeDetailItem ? activeDetailItem.path : '');
        }
    });

    document.getElementById('btnCopyPreviewContent').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const content = document.getElementById('previewBody').querySelector('code').innerText;
        handleCopy(btn, content, true);
        trackEvent('Modal', 'Copy Preview Content', activeDetailItem ? activeDetailItem.path : '');
    });

    document.getElementById('btnOpenGitHub').addEventListener('click', () => {
        if (activeDetailItem) {
            trackEvent('Modal', 'Open GitHub Link', activeDetailItem.path);
        }
    });

    // Private Token Toggles
    els.privateBtn.addEventListener('click', () => {
        const isHidden = els.tokenPanel.style.display === 'none';
        els.tokenPanel.style.display = isHidden ? 'block' : 'none';
        trackEvent('UI', 'Toggle Private Panel');
    });
    els.saveToken.addEventListener('click', saveToken);
    els.clearToken.addEventListener('click', clearToken);

    // Quick Start Cards & Buttons
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.mini-repo-card');
        const tpBtn = e.target.closest('.tp-explore-btn');
        const chip = e.target.closest('.quick-tag-chip');
        
        if (chip) {
            const repo = chip.dataset.repo;
            if (repo) {
                const [u, r] = repo.split('/');
                els.repo.value = `${u}/${r}`;
                els.branch.value = 'main';
                loadTree();
                trackEvent('Fetch', 'Quick Tag Chip', repo);
            }
        } else if (card && !card.classList.contains('history-card')) {
            const repo = card.dataset.repo;
            if (repo) {
                const [u, r] = repo.split('/');
                els.repo.value = `${u}/${r}`;
                els.branch.value = 'main';
                loadTree();
                trackEvent('Fetch', 'Quick Start Card', repo);
            }
        } else if (tpBtn) {
            const repo = tpBtn.dataset.repo;
            if (repo) {
                const [u, r] = repo.split('/');
                els.repo.value = `${u}/${r}`;
                els.branch.value = 'main';
                loadTree();
                trackEvent('Fetch', 'Featured Project Click', repo);
            }
        }
    });

    // Enter Key & Fetch Support
    els.fetchBtn.addEventListener('click', loadTree);
    [els.repo, els.branch, els.ghToken].forEach(el => 
        el.addEventListener('keypress', e => e.key === 'Enter' && (el === els.ghToken ? saveToken() : loadTree()))
    );
});

// --- URL & Analytics ---
function setupUrlHandler() {
    const path = window.location.pathname;
    if (path.startsWith('/repo/')) {
        const parts = path.split('/').filter(p => p);
        if (parts.length >= 3) {
            els.repo.value = `${parts[1]}/${parts[2]}`;
            els.branch.value = parts[3] || 'main';
            
            // Sync Style/Sort from URL
            const params = new URLSearchParams(window.location.search);
            if (params.has('sort')) currentSort = params.get('sort');
            if (params.has('style')) currentStyle = params.get('style');
            
            loadTree();
        }
    }
}

function trackEvent(category, action, label = null) {
    if (typeof gtag === 'function') {
        gtag('event', action, {
            'event_category': category,
            'event_label': label
        });
    }
}

// --- Tree Analysis & Smart Expansion Logic ---
function analyzeTreeAndStats(flatTree) {
    const statsMap = new Map();
    const defaultExpanded = new Set(['']); // root is always expanded
    let totalFiles = 0;
    let totalDirs = 0;
    let totalBytes = 0;

    // Regex for folders that should start collapsed by default
    const isCacheOrTmpDir = (dirName) => {
        return /(^|\/)(node_modules|\.git|\.github|dist|build|out|target|vendor|coverage|\.next|\.nuxt|\.cache|cache|tmp|temp|\.turbo|__pycache__|\.pytest_cache|\.venv|venv|bin|obj)($|\/)/i.test(dirName);
    };
    const isAssetDir = (dirName) => {
        return /(^|\/)(assets|images|img|static|fixtures|mocks|test-results|snapshots|audio|video|fonts)($|\/)/i.test(dirName);
    };

    // 1. First pass: Collect folders and files
    flatTree.forEach(item => {
        if (item.type === 'tree') {
            totalDirs++;
            if (!statsMap.has(item.path)) {
                statsMap.set(item.path, { fileCount: 0, totalBytes: 0, directCount: 0 });
            }
        } else {
            totalFiles++;
            const size = item.size || 0;
            totalBytes += size;

            // Increment parent folders recursively
            const parts = item.path.split('/');
            parts.pop(); // remove file name
            for (let i = parts.length; i >= 1; i--) {
                const folderPath = parts.slice(0, i).join('/');
                if (!statsMap.has(folderPath)) {
                    statsMap.set(folderPath, { fileCount: 0, totalBytes: 0, directCount: 0 });
                }
                const st = statsMap.get(folderPath);
                st.fileCount += 1;
                st.totalBytes += size;
                if (i === parts.length) {
                    st.directCount += 1;
                }
            }
        }
    });

    const totalCount = flatTree.length;

    // 2. Second pass: Factual smart decisions on which folders to auto-expand
    statsMap.forEach((st, folderPath) => {
        const parts = folderPath.split('/');
        const depth = parts.length - 1;
        const folderName = parts[parts.length - 1];

        // Heavy caches, temporary, build, vendor, or test assets always start collapsed
        if (isCacheOrTmpDir(folderName) || isAssetDir(folderName)) {
            return;
        }

        // Folders containing a huge list inside them start collapsed
        if (st.directCount > 30 || st.fileCount > 80) {
            return;
        }

        // Scaling rule based on overall repository size
        if (totalCount > 3000) {
            // Massive repo (e.g. Linux, Chromium, PostHog): keep depth >= 1 collapsed, only expand top-level primary code folder if small
            if (depth === 0 && st.fileCount < 25) {
                defaultExpanded.add(folderPath);
            }
        } else if (totalCount > 800) {
            // Large repo: expand top level (depth 0), keep depth >= 2 collapsed
            if (depth === 0) {
                defaultExpanded.add(folderPath);
            }
        } else {
            // Moderate repo: expand depth 0 and depth 1 if reasonable
            if (depth <= 1) {
                defaultExpanded.add(folderPath);
            }
        }
    });

    return {
        totalFiles,
        totalDirs,
        totalBytes,
        statsByFolder: statsMap,
        defaultExpanded
    };
}

// --- Fetch Logic ---
async function loadTree() {
    let repo = els.repo.value.trim();
    const branch = els.branch.value.trim() || 'main';

    // Hide repo details card at start of fetch
    const detailsCard = document.getElementById('repoDetailsCard');
    if (detailsCard) detailsCard.style.display = 'none';

    // 1. Sanitize: If full URL is pasted, extract user/repo
    if (repo.includes('github.com/')) {
        repo = repo.split('github.com/').pop().split('?')[0].split('#')[0].replace(/\/$/, "");
        els.repo.value = repo; // Update UI to clean version
    }

    if (!repo.includes('/')) return showMsg("Invalid format. Use 'user/repo'", "error");

    if (els.empty) els.empty.style.display = 'none';

    // Hide language listing ONLY if it exists
    const langList = document.querySelector('.language-listing');
    if (langList) langList.style.display = 'none';
    
    // Hide Breadcrumbs ONLY if they exist
    const breadcrumbs = document.querySelector('.seo-link');
    if (breadcrumbs) breadcrumbs.style.display = 'none';

    els.wrapper.style.display = 'none';
    if (els.truncationWarning) els.truncationWarning.style.display = 'none';
    showMsg(`Fetching ${repo}...`, "loading");
    els.fetchBtn.disabled = true;

    const cacheKey = `ght_${repo}_${branch}`;
    const tokenActive = !!localStorage.getItem('ght_token');

    try {
        const cached = !tokenActive ? await TreeStorage.get(cacheKey) : null;

        if (cached && cached.tree) {
            currentData = cached.tree;
            currentDataTruncated = !!cached.truncated;
            updatePageMetadata(repo, branch);
            showMsg("", "");
            
            const newUrl = `/repo/${repo}/${branch}/`;
            if (window.location.pathname !== newUrl) window.history.pushState(null, '', newUrl);

            fetchAndRenderRepoDetails(repo);
            trackEvent('Fetch', 'Cache Hit', repo);
        } else {
            // Fetch from Core
            const data = await gt.getTree(repo, branch);
            currentData = data.tree;
            currentDataTruncated = !!data.truncated;
            
            // --- SMART BRANCH HANDLING ---
            if (data.branch && data.branch !== branch) {
                const newBranch = data.branch;
                showMsg(`Branch '${branch}' not found. Switched to '${newBranch}'.`, "loading");
                els.branch.value = newBranch;
                updatePageMetadata(repo, newBranch);
                
                const correctCacheKey = `ght_${repo}_${newBranch}`;
                if (!tokenActive) {
                    await TreeStorage.set(correctCacheKey, { tree: currentData, truncated: currentDataTruncated });
                }
                
                const correctUrl = `/repo/${repo}/${newBranch}/`;
                window.history.replaceState(null, '', correctUrl);
            } else {
                if (!tokenActive) {
                    await TreeStorage.set(cacheKey, { tree: currentData, truncated: currentDataTruncated });
                }
                updatePageMetadata(repo, branch);
                showMsg("", "");
                
                const newUrl = `/repo/${repo}/${branch}/`;
                if (window.location.pathname !== newUrl) window.history.pushState(null, '', newUrl);
            }

            fetchAndRenderRepoDetails(repo);
            trackEvent('Fetch', 'Success', repo);
        }

        // Analyze tree, compute metadata & smart defaults
        treeMetadata = analyzeTreeAndStats(currentData);
        expandedFolders = new Set(treeMetadata.defaultExpanded);

        // Show/hide truncation warning
        if (els.truncationWarning) {
            els.truncationWarning.style.display = currentDataTruncated ? 'flex' : 'none';
        }

        render();
        els.wrapper.style.display = 'flex';
        saveToSearchHistory(repo);

    } catch (err) {
        console.error(err);
        let msg = err.message || '';
        trackEvent('Fetch', 'Failure', `${repo} : ${msg}`);

        if (msg.includes('401') || msg.includes('Bad credentials')) {
            showMsg("Invalid Private Token. Please check your settings.", "error");
        } else if (msg.includes('403') || msg.includes('Rate Limit')) {
            showMsg("API Limit Exceeded. Add a Token.", "error");
        } else if (msg.includes('404')) {
            showMsg("Repository not found (or is Private).", "error");
        } else {
            showMsg(msg, "error");
        }
        
        els.empty.style.display = 'block';

    } finally {
        els.fetchBtn.disabled = false;
    }
}

// --- Render Logic (High-Performance On-Demand Virtualized) ---
function render() {
    const term = els.treeSearch.value.trim();
    let filteredData = currentData;
    let regex = null;
    
    if (term) {
        let isRegex = false;
        const regexMatch = term.match(/^\/(.+)\/([gimy]*)$/);
        if (regexMatch) {
            try {
                regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
                isRegex = true;
            } catch (e) {}
        }
        
        if (!isRegex) {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, 'i');
        }

        const matches = currentData.filter(item => regex.test(item.path));
        const pathsToInclude = new Set();
        
        matches.forEach(item => {
            const parts = item.path.split('/');
            for (let i = 1; i <= parts.length; i++) {
                const subPath = parts.slice(0, i).join('/');
                pathsToInclude.add(subPath);
                // Auto-expand all ancestor directories so search results are immediately visible!
                if (i < parts.length) {
                    expandedFolders.add(subPath);
                }
            }
        });

        filteredData = currentData.filter(item => pathsToInclude.has(item.path));
    }

    // 1. Sort Data
    const sortedFlat = gt.sortTree(filteredData, currentSort);

    // 2. Build Hierarchy with Prefixes & Metadata
    treeHierarchyCache = buildVisualHierarchy(sortedFlat);

    // 3. Render Visible Nodes On-Demand
    renderVisible(regex);
}

function renderVisible(regex = null) {
    els.lineNums.innerHTML = '';
    els.treeContent.innerHTML = '';

    // Filter to only items whose parent directories are expanded
    visibleItemsList = treeHierarchyCache.filter(item => {
        if (!item.parentPath) return true; // root level is always visible
        const parts = item.parentPath.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const ancestor = parts.slice(0, i).join('/');
            if (!expandedFolders.has(ancestor)) return false;
        }
        return true;
    });

    // Update Stats Badge in Toolbar
    if (els.treeStatsSummary) {
        const totalF = treeMetadata.totalFiles.toLocaleString();
        const totalD = treeMetadata.totalDirs.toLocaleString();
        const sizeStr = formatBytes(treeMetadata.totalBytes);
        els.treeStatsSummary.textContent = `${totalF} files • ${totalD} dirs (${sizeStr})`;
        els.treeStatsSummary.style.display = 'inline-flex';
    }

    const fragNums = document.createDocumentFragment();
    const fragLines = document.createDocumentFragment();

    visibleItemsList.forEach((item, idx) => {
        // Line Number
        const n = document.createElement('div');
        n.textContent = idx + 1;
        fragNums.appendChild(n);

        // Content Row
        const row = document.createElement('div');
        row.className = 'tree-line';
        row.dataset.index = idx;
        row.dataset.path = item.path;
        row.dataset.depth = item.depth;
        row.dataset.type = item.type;
        row.setAttribute('tabindex', '0');

        if (idx === activeSelectedRowIndex) {
            row.classList.add('active-row');
        }

        const isFolder = item.type === 'tree';
        const isExpanded = isFolder && expandedFolders.has(item.path);

        if (isFolder) {
            row.classList.add('tree-folder');
            if (!isExpanded) row.classList.add('collapsed');
        }

        // File-Based Icon
        const iconInfo = getFileIcon(item.name, isFolder, isExpanded);

        // Name Display & Highlighting
        let nameDisplay = escapeHtml(item.name);
        if (regex && regex.test(item.name)) {
            nameDisplay = nameDisplay.replace(regex, (match) => `<mark class="search-highlight">${match}</mark>`);
        }

        // Prefix Styles
        let prefixDisplay = item.prefix;
        if (currentStyle === 'minimal') prefixDisplay = item.indent;
        if (currentStyle === 'plus') prefixDisplay = prefixDisplay.replace(/└──/g, '+--').replace(/├──/g, '+--').replace(/│/g, '|');
        if (currentStyle === 'slashed') {
            nameDisplay = isFolder ? `/${nameDisplay}` : nameDisplay;
            prefixDisplay = item.prefix.replace(/│/g, ' ').replace(/├──/g, ' ').replace(/└──/g, ' ');
        }
        if (currentStyle === 'bulleted') {
            prefixDisplay = item.indent.replace(/    /g, '  ');
            nameDisplay = `• ${nameDisplay}${isFolder ? '/' : ''}`;
        }

        // Caret & Badges
        const caretHTML = isFolder 
            ? `<span class="t-caret"><i class="fas ${isExpanded ? 'fa-angle-down' : 'fa-angle-right'}"></i></span>` 
            : `<span class="t-caret t-caret-spacer"></span>`;

        const stats = isFolder ? treeMetadata.statsByFolder.get(item.path) : null;
        let badgeHTML = '';
        if (isFolder && stats && stats.fileCount > 0) {
            badgeHTML = `<span class="t-badge t-badge-folder" title="${stats.fileCount} files, total size ${formatBytes(stats.totalBytes)}">${stats.fileCount} ${stats.fileCount === 1 ? 'file' : 'files'} &bull; ${formatBytes(stats.totalBytes)}</span>`;
        } else if (!isFolder && typeof item.size === 'number' && item.size >= 0) {
            badgeHTML = `<span class="t-badge t-badge-file" title="${formatBytes(item.size)}">${formatBytes(item.size)}</span>`;
        }

        const typeClass = isFolder ? 'folder' : 'file';

        row.innerHTML = `
            <span class="t-prefix">${prefixDisplay}</span>
            ${caretHTML}
            <span class="t-icon" style="color: ${iconInfo.color}"><i class="${iconInfo.iconClass}"></i></span>
            <span class="t-name ${typeClass}">${nameDisplay}</span>
            ${badgeHTML}
            <button class="sub-copy" data-path="${escapeHtml(item.path)}" title="Copy Path">
                <i class="far fa-copy"></i>
            </button>
        `;
        fragLines.appendChild(row);
    });

    els.lineNums.appendChild(fragNums);
    els.treeContent.appendChild(fragLines);

    // Event Delegation
    els.treeContent.onclick = handleTreeClick;
}

// --- Preview Logic ---
async function showPreview(item) {
    console.log("Preview disabled:", item.path);
    return;
}

// --- Helper: Build Visual Hierarchy (Prefix Generator) ---
function buildVisualHierarchy(sortedFlatList) {
    const root = { children: [] };
    const map = { '': root };
    
    // 1. Init Nodes
    sortedFlatList.forEach(item => {
        const parts = item.path.split('/');
        const name = parts[parts.length - 1];
        parts.pop();
        const parentPath = parts.join('/');
        map[item.path] = { ...item, name, parentPath, children: [] };
    });
    
    // 2. Connect Parents
    sortedFlatList.forEach(item => {
        const parent = map[map[item.path].parentPath] || root;
        parent.children.push(map[item.path]);
    });

    // 3. Traverse to generate prefixes
    const result = [];
    const traverse = (node, prefix, isLast, depth) => {
        const connector = isLast ? "└── " : "├── ";
        result.push({
            name: node.name,
            path: node.path,
            parentPath: node.parentPath,
            type: node.type,
            size: node.size,
            depth: depth,
            prefix: prefix + connector,
            indent: prefix.replace(/│   /g, '    ').replace(/├── /g, '    ').replace(/└── /g, '    ')
        });
        
        if (node.children && node.children.length > 0) {
            const childPrefix = prefix + (isLast ? "    " : "│   ");
            node.children.forEach((child, i) => {
                traverse(child, childPrefix, i === node.children.length - 1, depth + 1);
            });
        }
    };

    root.children.forEach((child, i) => {
        traverse(child, "", i === root.children.length - 1, 0);
    });
    return result;
}

// --- Tree Click Handler ---
function handleTreeClick(e) {
    // 1. Copy button takes priority
    const btn = e.target.closest('.sub-copy');
    if (btn) {
        e.stopPropagation();
        handleCopy(btn, btn.dataset.path, true);
        return;
    }

    // 2. Row selection
    const row = e.target.closest('.tree-line');
    if (row && row.dataset.index !== undefined) {
        activeSelectedRowIndex = parseInt(row.dataset.index, 10);
        document.querySelectorAll('.tree-line.active-row').forEach(r => r.classList.remove('active-row'));
        row.classList.add('active-row');
    }

    // 3. File Details Trigger (when clicking file name)
    const fileName = e.target.closest('.t-name.file');
    if (fileName && row) {
        const path = row.dataset.path;
        const item = currentData.find(d => d.path === path);
        if (item) {
            showFileDetailsModal(item);
        }
        return;
    }

    // 4. Folder toggle (clicking anywhere on a folder row)
    const folderRow = e.target.closest('.tree-folder');
    if (folderRow) {
        const path = folderRow.dataset.path;
        toggleFolder(path);
    }
}

// Fast $O(1)$ Folder Toggle with instant re-render
function toggleFolder(path) {
    if (expandedFolders.has(path)) {
        expandedFolders.delete(path);
        trackEvent('Tree', 'Collapse Folder', path);
    } else {
        expandedFolders.add(path);
        trackEvent('Tree', 'Expand Folder', path);
    }
    renderVisible();
}

// --- Toggle All Folders ---
function toggleAll(collapse) {
    if (collapse) {
        expandedFolders.clear();
    } else {
        treeHierarchyCache.forEach(item => {
            if (item.type === 'tree') {
                expandedFolders.add(item.path);
            }
        });
    }
    renderVisible();
}

// --- Copy Logic ---
function handleCopy(btn, text, isSub) {
    navigator.clipboard.writeText(text).then(() => {
        if (!isSub) {
            // Main Button: Full Swap
            // Save original HTML (e.g. <i class="far fa-copy"></i> Copy Tree)
            const originalHTML = btn.innerHTML;
            
            // Swap to success state
            btn.innerHTML = `<i class="fas fa-check"></i> Copied`;
            
            // Revert after 1.5s
            setTimeout(() => {
                btn.innerHTML = originalHTML;
            }, 1500);
            
            trackEvent('Copy', 'Full Tree');
        } else {
            // Sub Button: Icon Swap only
            const icon = btn.querySelector('i');
            const originalClass = icon.className;
            icon.className = "fas fa-check";
            
            setTimeout(() => {
                icon.className = originalClass;
            }, 1500);
            
            trackEvent('Copy', 'Single Path');
        }
    }).catch(err => console.error("Copy failed", err));
}

function copyFullTree() {
    const text = gt.generateAsciiTree(currentData, { style: currentStyle }); // Pass current style
    handleCopy(els.copyAll, text, false);
}

// --- Token Logic ---
function saveToken() {
    const token = els.ghToken.value.trim();
    if (!token) return;
    localStorage.setItem('ght_token', token);
    gt = new GitHubTree(token);
    checkSavedToken();
    showMsg("Token saved.", "loading"); // Re-using loading style for info
    setTimeout(() => showMsg("", ""), 1500);
    trackEvent('Settings', 'Token Saved');

    // Verify star status when token changes
    if (!localStorage.getItem('ght_starred_self')) {
        verifyAppStarStatus(token);
    }
}

function clearToken() {
    localStorage.removeItem('ght_token');
    els.ghToken.value = '';
    gt = new GitHubTree(null);
    checkSavedToken();
    showMsg("Token cleared.", "error");
    setTimeout(() => showMsg("", ""), 1500);
    trackEvent('Settings', 'Token Cleared');
}

function checkSavedToken() {
    const token = localStorage.getItem('ght_token');
    if (token) {
        els.ghToken.value = token; 
        els.privateBtn.innerHTML = `<i class="fas fa-lock-open"></i> Private Active`;
        els.privateBtn.style.color = 'var(--folder-color)';
        els.saveToken.style.display = 'none';
        els.clearToken.style.display = 'inline-block';
        gt = new GitHubTree(token);
    } else {
        els.privateBtn.innerHTML = `<i class="fas fa-lock"></i> Private Access`;
        els.privateBtn.style.color = '';
        els.saveToken.style.display = 'inline-block';
        els.clearToken.style.display = 'none';
    }
}

async function loadIndexedRepos() {
    const CACHE_KEY = 'ght_indexed_repos';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL) {
                indexedRepos = new Set(data);
                return;
            }
        }
        const res = await fetch('/repos.json');
        if (res.ok) {
            const list = await res.json();
            const lower = list.map(r => r.toLowerCase());
            indexedRepos = new Set(lower);
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: lower }));
        }
    } catch (e) {}
}

function initAppStarButton() {
    const starBtn = document.getElementById('appStarBtn');
    if (!starBtn) return;

    const hasStarred = localStorage.getItem('ght_starred_self');
    if (hasStarred) {
        starBtn.classList.add('starred');
        const starText = document.getElementById('appStarText');
        if (starText) starText.innerText = 'Starred';
        const starIcon = starBtn.querySelector('i');
        if (starIcon) starIcon.className = 'fas fa-star';
    }

    const token = localStorage.getItem('ght_token');
    if (token && !hasStarred) {
        verifyAppStarStatus(token);
    }

    starBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('ght_token');
        if (!token) {
            window.open('https://github.com/mgks/GitHubTree', '_blank');
            trackEvent('Header', 'Star Click', 'Redirect to GitHub');
            return;
        }

        try {
            starBtn.style.pointerEvents = 'none';
            const res = await fetch('https://api.github.com/user/starred/mgks/GitHubTree', {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Length': '0'
                }
            });

            if (res.status === 204 || res.ok) {
                localStorage.setItem('ght_starred_self', 'true');
                starBtn.classList.add('starred');
                const starText = document.getElementById('appStarText');
                if (starText) starText.innerText = 'Starred';
                const starIcon = starBtn.querySelector('i');
                if (starIcon) starIcon.className = 'fas fa-star';
                trackEvent('Header', 'Star Success', 'API Starred');
                
                starBtn.style.transform = 'scale(1.1)';
                setTimeout(() => starBtn.style.transform = '', 300);
            } else {
                window.open('https://github.com/mgks/GitHubTree', '_blank');
            }
        } catch (e) {
            window.open('https://github.com/mgks/GitHubTree', '_blank');
        } finally {
            starBtn.style.pointerEvents = 'auto';
        }
    });
}

async function verifyAppStarStatus(token) {
    try {
        const res = await fetch('https://api.github.com/user/starred/mgks/GitHubTree', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });
        if (res.status === 204) {
            localStorage.setItem('ght_starred_self', 'true');
            const starBtn = document.getElementById('appStarBtn');
            if (starBtn) {
                starBtn.classList.add('starred');
                const starText = document.getElementById('appStarText');
                if (starText) starText.innerText = 'Starred';
                const starIcon = starBtn.querySelector('i');
                if (starIcon) starIcon.className = 'fas fa-star';
            }
        }
    } catch (e) {}
}

// --- UI Helpers ---
function setupDropdowns() {
    const dropdownBtns = [
        document.getElementById('sortBtn'),
        document.getElementById('moreBtn')
    ];

    dropdownBtns.forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = btn.closest('.dropdown');
            closeDropdowns(parent);
            if (parent) parent.classList.toggle('active');
        });
    });

    document.querySelectorAll('[data-sort]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            currentSort = e.currentTarget.dataset.sort;
            if (els.sortBtnLabel) els.sortBtnLabel.textContent = e.currentTarget.innerText.trim();
            closeDropdowns();
            render();
            trackEvent('UI', 'Sort Change', currentSort);
        });
    });

    document.querySelectorAll('[data-style]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            currentStyle = e.currentTarget.dataset.style;
            updateActiveStyleCheckmarks();
            closeDropdowns();
            render();
            trackEvent('UI', 'Style Change', currentStyle);
        });
    });

    document.addEventListener('click', () => closeDropdowns());
}

function updateActiveStyleCheckmarks() {
    ['classic', 'slashed', 'plus', 'minimal', 'bulleted'].forEach(style => {
        const check = document.getElementById(`check-${style}`);
        if (check) check.style.opacity = (style === currentStyle) ? '1' : '0';
    });
}

function setupBranchPicker() {
    const group = document.getElementById('branchInputGroup');
    if (!els.branch || !els.branchDropdown) return;

    let loadedBranches = [];

    const renderBranchList = (term = '') => {
        if (!els.branchListContainer) return;
        const currentSelected = els.branch.value.trim().toLowerCase();
        const search = term.trim().toLowerCase();
        const filtered = search
            ? loadedBranches.filter(b => b.name.toLowerCase().includes(search))
            : loadedBranches;

        if (filtered.length === 0) {
            els.branchListContainer.innerHTML = `<div class="branch-empty-hint">${search ? `No branches matching "${escapeHtml(term)}"` : 'No branches found'}</div>`;
            return;
        }

        const frag = document.createDocumentFragment();
        filtered.forEach(b => {
            const item = document.createElement('div');
            item.className = 'branch-item' + (b.name.toLowerCase() === currentSelected ? ' selected' : '');
            item.innerHTML = `<i class="fa-solid fa-code-branch"></i> <span>${escapeHtml(b.name)}</span>`;
            item.addEventListener('mousedown', (e) => {
                // Use mousedown so it fires before input blur
                e.stopPropagation();
                els.branch.value = b.name;
                els.branchDropdown.style.display = 'none';
                loadTree();
            });
            frag.appendChild(item);
        });
        els.branchListContainer.innerHTML = '';
        els.branchListContainer.appendChild(frag);
    };

    const fetchBranchesForRepo = async () => {
        let repo = els.repo.value.trim();
        if (repo.includes('github.com/')) {
            repo = repo.split('github.com/').pop().split('?')[0].split('#')[0].replace(/\/$/, "");
        }
        if (!repo || !repo.includes('/')) {
            els.branchListContainer.innerHTML = `<div class="branch-empty-hint">Enter a repository name first</div>`;
            return;
        }

        // Check cache first
        if (branchCache.has(repo)) {
            loadedBranches = branchCache.get(repo);
            renderBranchList(els.branch.value);
            return;
        }

        els.branchListContainer.innerHTML = `<div class="branch-empty-hint"><i class="fa-solid fa-spinner fa-spin"></i> Loading branches...</div>`;

        try {
            const token = localStorage.getItem('ght_token');
            const headers = { 'Accept': 'application/vnd.github+json' };
            if (token) headers['Authorization'] = `token ${token}`;

            const res = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, { headers });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            loadedBranches = data.map(b => ({ name: b.name }));
            branchCache.set(repo, loadedBranches);
            renderBranchList(els.branch.value);
        } catch (err) {
            els.branchListContainer.innerHTML = `<div class="branch-empty-hint">Failed to load branches.<br><small>${escapeHtml(err.message)}</small></div>`;
        }
    };

    const openPicker = () => {
        closeDropdowns();
        els.branchDropdown.style.display = 'block';
        if (loadedBranches.length === 0) {
            fetchBranchesForRepo();
        } else {
            renderBranchList(els.branch.value);
        }
    };

    const togglePicker = (e) => {
        if (e) e.stopPropagation();
        const isOpen = els.branchDropdown.style.display !== 'none';
        if (isOpen) {
            els.branchDropdown.style.display = 'none';
        } else {
            openPicker();
            els.branch.focus();
        }
    };

    // Clicking or focusing directly on the branch input opens the dropdown
    els.branch.addEventListener('focus', () => {
        openPicker();
    });

    els.branch.addEventListener('click', (e) => {
        e.stopPropagation();
        openPicker();
    });

    // Real-time filtering as user types directly in the branch input
    els.branch.addEventListener('input', (e) => {
        if (els.branchDropdown.style.display === 'none') {
            els.branchDropdown.style.display = 'block';
        }
        renderBranchList(e.target.value);
    });

    // Keyboard support: Escape closes, Enter submits
    els.branch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            els.branchDropdown.style.display = 'none';
        } else if (e.key === 'Enter') {
            els.branchDropdown.style.display = 'none';
            loadTree();
        }
    });

    if (els.branchDropdownBtn) {
        els.branchDropdownBtn.addEventListener('click', togglePicker);
    }
    const branchCaret = group ? group.querySelector('.branch-caret') : null;
    if (branchCaret) {
        branchCaret.addEventListener('click', togglePicker);
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#branchInputGroup')) {
            els.branchDropdown.style.display = 'none';
        }
    });
}

function setupExportActions() {
    const downloadBlob = (content, filename, type) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const targetBtn = document.getElementById('moreBtn') || els.exportBtn;

    if (els.exportAsciiBtn) {
        els.exportAsciiBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeDropdowns();
            const text = gt.generateAsciiTree(currentData, { style: currentStyle });
            handleCopy(targetBtn, text, false);
            trackEvent('Export', 'ASCII Tree');
        });
    }

    if (els.exportMarkdownBtn) {
        els.exportMarkdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeDropdowns();
            const text = gt.generateAsciiTree(currentData, { style: currentStyle });
            const markdown = '```\n' + text + '\n```';
            handleCopy(targetBtn, markdown, false);
            trackEvent('Export', 'Markdown Block');
        });
    }

    if (els.exportJsonBtn) {
        els.exportJsonBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeDropdowns();
            const jsonStr = JSON.stringify(currentData, null, 2);
            handleCopy(targetBtn, jsonStr, false);
            trackEvent('Export', 'JSON');
        });
    }

    if (els.exportDownloadTxtBtn) {
        els.exportDownloadTxtBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeDropdowns();
            const repo = els.repo.value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'tree';
            const text = gt.generateAsciiTree(currentData, { style: currentStyle });
            downloadBlob(text, `${repo}-tree.txt`, 'text/plain;charset=utf-8');
            trackEvent('Export', 'Download TXT');
        });
    }

    if (els.exportDownloadJsonBtn) {
        els.exportDownloadJsonBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeDropdowns();
            const repo = els.repo.value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'tree';
            const jsonStr = JSON.stringify(currentData, null, 2);
            downloadBlob(jsonStr, `${repo}-tree.json`, 'application/json;charset=utf-8');
            trackEvent('Export', 'Download JSON');
        });
    }
}

function setupKeyboardNav() {
    window.addEventListener('keydown', (e) => {
        // Do not intercept if actively typing inside an input/textarea
        const tag = (e.target.tagName || '').toLowerCase();
        const isEditing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

        if (e.key === 'Escape') {
            if (isEditing) {
                e.target.blur();
                return;
            }
            if (els.previewOverlay.classList.contains('visible')) {
                els.previewOverlay.classList.remove('visible');
                return;
            }
            if (els.overlay.classList.contains('visible')) {
                els.overlay.classList.remove('visible');
                return;
            }
            closeDropdowns();
            if (els.branchDropdown) els.branchDropdown.style.display = 'none';
            return;
        }

        if (isEditing) return;

        // Pressing '/' focuses search
        if (e.key === '/') {
            e.preventDefault();
            els.treeSearch.focus();
            return;
        }

        if (!visibleItemsList || visibleItemsList.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSelectedRowIndex = Math.min(activeSelectedRowIndex + 1, visibleItemsList.length - 1);
            highlightSelectedRow();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSelectedRowIndex = Math.max(activeSelectedRowIndex - 1, 0);
            highlightSelectedRow();
        } else if (e.key === 'ArrowRight') {
            if (activeSelectedRowIndex >= 0 && activeSelectedRowIndex < visibleItemsList.length) {
                const item = visibleItemsList[activeSelectedRowIndex];
                if (item.type === 'tree') {
                    if (!expandedFolders.has(item.path)) {
                        e.preventDefault();
                        toggleFolder(item.path);
                    }
                }
            }
        } else if (e.key === 'ArrowLeft') {
            if (activeSelectedRowIndex >= 0 && activeSelectedRowIndex < visibleItemsList.length) {
                const item = visibleItemsList[activeSelectedRowIndex];
                if (item.type === 'tree' && expandedFolders.has(item.path)) {
                    e.preventDefault();
                    toggleFolder(item.path);
                } else if (item.parentPath) {
                    // Navigate to parent folder
                    e.preventDefault();
                    const parentIdx = visibleItemsList.findIndex(v => v.path === item.parentPath);
                    if (parentIdx !== -1) {
                        activeSelectedRowIndex = parentIdx;
                        highlightSelectedRow();
                    }
                }
            }
        } else if (e.key === 'Enter') {
            if (activeSelectedRowIndex >= 0 && activeSelectedRowIndex < visibleItemsList.length) {
                e.preventDefault();
                const item = visibleItemsList[activeSelectedRowIndex];
                if (item.type === 'tree') {
                    toggleFolder(item.path);
                } else {
                    const fullItem = currentData.find(d => d.path === item.path) || item;
                    showFileDetailsModal(fullItem);
                }
            }
        } else if (e.key === 'c' || e.key === 'C') {
            if (activeSelectedRowIndex >= 0 && activeSelectedRowIndex < visibleItemsList.length) {
                const item = visibleItemsList[activeSelectedRowIndex];
                navigator.clipboard.writeText(item.path);
                showMsg(`Copied "${item.path}" to clipboard`, "loading");
                setTimeout(() => showMsg("", ""), 1200);
            }
        }
    });

    function highlightSelectedRow() {
        const rows = els.treeContent.querySelectorAll('.tree-line');
        rows.forEach((r, idx) => {
            if (idx === activeSelectedRowIndex) {
                r.classList.add('active-row');
                r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                r.classList.remove('active-row');
            }
        });
    }
}

// --- Metadata Helper ---
function updatePageMetadata(repo, branch) {
    // 1. Update Browser Tab Title
    document.title = `${repo} File Structure : GitHubTree`;

    // 2. Update Meta Description
    let descTag = document.querySelector('meta[name="description"]');
    if (!descTag) {
        descTag = document.createElement('meta');
        descTag.name = "description";
        document.head.appendChild(descTag);
    }
    descTag.content = `Explore ${repo} on branch ${branch}. Visualize files without cloning.`;

    // 3. Update Canonical URL
    let linkTag = document.querySelector('link[rel="canonical"]');
    if (!linkTag) {
        linkTag = document.createElement('link');
        linkTag.rel = "canonical";
        document.head.appendChild(linkTag);
    }
    linkTag.href = `https://githubtree.mgks.dev/repo/${repo}/${branch}/`;

    // 4. Update History Entry with Sort/Style Params
    const url = new URL(window.location.href);
    url.searchParams.set('sort', currentSort);
    url.searchParams.set('style', currentStyle);
    window.history.replaceState(null, '', url.toString());
}

function closeDropdowns(except = null) {
    els.dropdowns.forEach(d => {
        if (d !== except) d.classList.remove('active');
    });
}

function setupShareOverlay() {
    const openShare = (e) => {
        if (e) e.stopPropagation();
        closeDropdowns();
        
        const repo = els.repo.value.trim();
        const branch = els.branch.value.trim() || 'main';
        const shareUrl = `${window.location.origin}/repo/${repo}/${branch}/`;
        
        els.shareInput.value = shareUrl;

        // Generate dynamic shields.io badge link
        const badgeImgUrl = `https://img.shields.io/badge/Structure-GitHubTree-blue?style=flat-square`;
        const markdownBadge = `[![GitHubTree](${badgeImgUrl})](${shareUrl})`;
        const htmlBadge = `<a href="${shareUrl}"><img src="${badgeImgUrl}" alt="GitHubTree Structure"></a>`;

        const badgeMarkdownPreview = document.getElementById('badgeMarkdownPreview');
        const badgeHtmlPreview = document.getElementById('badgeHtmlPreview');
        if (badgeMarkdownPreview) badgeMarkdownPreview.src = badgeImgUrl;
        if (badgeHtmlPreview) badgeHtmlPreview.src = badgeImgUrl;

        const badgeMarkdownInput = document.getElementById('badgeMarkdownInput');
        const badgeHtmlInput = document.getElementById('badgeHtmlInput');
        if (badgeMarkdownInput) badgeMarkdownInput.value = markdownBadge;
        if (badgeHtmlInput) badgeHtmlInput.value = htmlBadge;

        els.overlay.classList.add('visible');
        trackEvent('Share', 'Open Modal');
    };

    if (els.shareBtn) els.shareBtn.addEventListener('click', openShare);
    const moreShareBtn = document.getElementById('moreShareBtn');
    if (moreShareBtn) moreShareBtn.addEventListener('click', openShare);
    
    if (els.closeOverlay) els.closeOverlay.addEventListener('click', () => els.overlay.classList.remove('visible'));
    
    if (els.overlay) {
        els.overlay.addEventListener('click', (e) => {
            if (e.target === els.overlay) els.overlay.classList.remove('visible');
        });
    }
    
    els.shareInput.addEventListener('click', () => els.shareInput.select());
    els.copyShareBtn.addEventListener('click', () => {
        handleCopy(els.copyShareBtn, els.shareInput.value, true);
        trackEvent('Share', 'Copy Link');
    });

    document.getElementById('btnCopyBadgeMarkdown').addEventListener('click', (e) => {
        const input = document.getElementById('badgeMarkdownInput');
        handleCopy(e.currentTarget, input.value, true);
    });

    document.getElementById('btnCopyBadgeHtml').addEventListener('click', (e) => {
        const input = document.getElementById('badgeHtmlInput');
        handleCopy(e.currentTarget, input.value, true);
    });

    // Inline card badge copy & select
    const badgeInput = document.getElementById('repoMetaBadgeInput');
    const badgeCopyBtn = document.getElementById('btnCopyRepoMetaBadge');
    
    if (badgeInput) {
        badgeInput.addEventListener('click', () => {
            badgeInput.select();
            handleCopy(badgeCopyBtn, badgeInput.value, true);
            trackEvent('Share', 'Copy Card Badge Input', els.repo.value);
        });
    }

    if (badgeCopyBtn) {
        badgeCopyBtn.addEventListener('click', () => {
            handleCopy(badgeCopyBtn, badgeInput.value, true);
            trackEvent('Share', 'Copy Card Badge Button', els.repo.value);
        });
    }
}

function showMsg(text, type) {
    els.status.style.display = text ? 'block' : 'none';
    els.status.innerText = text;
    els.status.className = type;
}

function initTheme() {
    let saved = localStorage.getItem('theme');
    if (!saved) {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        saved = prefersDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);
    
    document.getElementById('themeToggle').addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        trackEvent('UI', 'Theme Toggle', next);
    });
}

// Inject Keyframes for Animation
const style = document.createElement('style');
style.innerHTML = `@keyframes fadeIn { to { opacity: 1; } }`;
document.head.appendChild(style);

// --- Search History Helpers ---
function getSearchHistory() {
    try {
        const data = localStorage.getItem('ght_history');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveToSearchHistory(repo) {
    if (!repo || !repo.includes('/')) return;
    try {
        let history = getSearchHistory();
        history = history.filter(item => item.toLowerCase() !== repo.toLowerCase());
        history.unshift(repo);
        history = history.slice(0, 6);
        localStorage.setItem('ght_history', JSON.stringify(history));
    } catch (e) {}
}

function initHistoryCloud() {
    const history = getSearchHistory();
    if (history.length === 0) return;

    const emptyState = document.getElementById('emptyState');
    if (!emptyState) return;

    const historySection = document.createElement('div');
    historySection.className = 'homepage-section';
    historySection.id = 'historySection';

    const h3 = document.createElement('h3');
    h3.textContent = 'Recently Visited';
    historySection.appendChild(h3);

    const historyCloud = document.createElement('div');
    historyCloud.className = 'history-grid';
    historyCloud.id = 'historyCloud';

    history.forEach(repo => {
        const btn = document.createElement('div');
        btn.className = 'mini-repo-card history-card';
        btn.dataset.repo = repo;
        
        btn.innerHTML = `
            <div class="mrc-header">
                <span class="mrc-title">${repo}</span>
                <span class="mrc-lang">Visited <i class="fas fa-history"></i></span>
            </div>
        `;
        btn.addEventListener('click', () => {
            els.repo.value = repo;
            els.branch.value = 'main';
            loadTree();
            trackEvent('Fetch', 'History Click', repo);
        });
        historyCloud.appendChild(btn);
    });

    historySection.appendChild(historyCloud);
    emptyState.appendChild(historySection);
}

// --- File Details & Content Preview Logic ---

function showFileDetailsModal(item) {
    activeDetailItem = item;
    
    const repo = els.repo.value.trim();
    const branch = els.branch.value.trim() || 'main';

    document.getElementById('detailPath').innerText = item.path;
    document.getElementById('detailSize').innerText = formatBytes(item.size);
    document.getElementById('detailMode').innerText = decodeGitMode(item.mode);
    document.getElementById('detailSha').innerText = item.sha;

    // Reset and show Loading state for commit update
    const lastUpdatedEl = document.getElementById('detailLastUpdated');
    if (lastUpdatedEl) {
        lastUpdatedEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading last commit update history...`;
    }

    // Set GitHub Link
    const githubLink = `https://github.com/${repo}/blob/${branch}/${item.path}`;
    document.getElementById('btnOpenGitHub').href = githubLink;

    // Reset Preview View state
    document.getElementById('filePreviewContainer').style.display = 'none';
    document.getElementById('btnTogglePreview').innerHTML = `<i class="far fa-eye"></i> Show Content`;
    
    // Disable preview if it's not a regular file or is too large (> 150KB)
    if (item.type !== 'blob') {
        document.getElementById('btnTogglePreview').style.display = 'none';
    } else {
        document.getElementById('btnTogglePreview').style.display = 'inline-flex';
    }

    els.previewOverlay.classList.add('visible');
    trackEvent('Preview', 'Open Details', item.path);

    // Asynchronously fetch last updated time from github
    fetchLastUpdated(repo, item.path, branch);
}

async function fetchLastUpdated(repo, path, branch) {
    const el = document.getElementById('detailLastUpdated');
    if (!el) return;

    const cacheKey = `ght_commit_${repo}_${branch}_${path}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        try {
            const commitInfo = JSON.parse(cached);
            if (commitInfo.empty) {
                el.innerText = "No commit history found.";
            } else {
                el.innerHTML = `${escapeHtml(commitInfo.date)} by <strong>${escapeHtml(commitInfo.author)}</strong> &mdash; <em>"${escapeHtml(commitInfo.message)}"</em>`;
            }
            return;
        } catch(e) {}
    }

    try {
        const token = localStorage.getItem('ght_token');
        const headers = { 'Accept': 'application/vnd.github+json' };
        if (token) headers['Authorization'] = `token ${token}`;

        const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&sha=${branch}&page=1&per_page=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error();

        const commits = await res.json();
        if (commits && commits.length > 0) {
            const commitObj = commits[0];
            const dateStr = commitObj.commit.committer.date;
            const formattedDate = formatDate(dateStr);
            const author = commitObj.commit.committer.name || commitObj.commit.author.name;
            const message = commitObj.commit.message.split('\n')[0]; // only first line

            const commitInfo = {
                date: formattedDate,
                author: author,
                message: message
            };

            el.innerHTML = `${escapeHtml(formattedDate)} by <strong>${escapeHtml(author)}</strong> &mdash; <em>"${escapeHtml(message)}"</em>`;
            sessionStorage.setItem(cacheKey, JSON.stringify(commitInfo));
        } else {
            el.innerText = "No commit history found.";
            sessionStorage.setItem(cacheKey, JSON.stringify({ empty: true }));
        }
    } catch (e) {
        el.innerText = "Failed to load update history.";
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }) + ' at ' + date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    });
}

function renderRepoDetailsCard(repo, details) {
    const card = document.getElementById('repoDetailsCard');
    if (!card) return;

    document.getElementById('repoMetaDesc').innerText = details.description || "No description provided.";
    document.getElementById('repoStars').innerHTML = `<i class="fa-regular fa-star"></i> ${formatNumber(details.stargazers_count)} stars`;
    document.getElementById('repoForks').innerHTML = `<i class="fa-solid fa-code-branch"></i> ${formatNumber(details.forks_count)} forks`;
    
    const sizeBadge = document.getElementById('repoSize');
    if (sizeBadge) {
        sizeBadge.innerHTML = `<i class="fa-solid fa-database"></i> ${formatBytes(details.size * 1024)}`;
    }

    const langBadge = document.getElementById('repoLanguage');
    if (details.language) {
        langBadge.style.display = 'inline-flex';
        langBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${details.language}`;
        const langSlug = details.language.toLowerCase().replace(/\s+/g, '-');
        langBadge.href = `/language/${langSlug}/`;
        langBadge.style.cursor = 'pointer';
        const colors = {
            'JavaScript': '#f1e05a',
            'TypeScript': '#3178c6',
            'Python': '#3572A5',
            'HTML': '#e34c26',
            'CSS': '#563d7c',
            'Go': '#00ADD8',
            'Rust': '#dea584',
            'C++': '#f34b7d',
            'C': '#555555',
            'C#': '#178600',
            'Java': '#b07219',
            'PHP': '#4f5d95',
            'Ruby': '#701516',
            'Swift': '#f05138',
            'Kotlin': '#a97bff',
            'Shell': '#89e051',
            'Dart': '#00b4ab',
            'Objective-C': '#438eff',
            'Scala': '#c22d40',
            'Vue': '#41b883',
            'Svelte': '#ff3e00',
            'Markdown': '#083fa1',
            'Elixir': '#6e4a7e',
            'Haskell': '#5e5086'
        };
        
        const hex = colors[details.language] || '#8b949e';
        langBadge.querySelector('i').style.color = hex;

        const cleanHex = hex.replace('#', '');
        const r = parseInt(cleanHex.slice(0, 2), 16);
        const g = parseInt(cleanHex.slice(2, 4), 16);
        const b = parseInt(cleanHex.slice(4, 6), 16);
        
        langBadge.style.background = `rgba(${r}, ${g}, ${b}, 0.04)`;
        langBadge.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
        langBadge.style.color = 'var(--text)';
    } else {
        langBadge.style.display = 'none';
    }

    const repoNameOnly = repo.split('/')[1] || repo;
    const escapedRepoName = repoNameOnly.replace(/_/g, '__').replace(/-/g, '--');
    const badgeUrl = `https://img.shields.io/badge/GitHubTree-${encodeURIComponent(escapedRepoName)}-blue?style=flat-square`;
    const structureUrl = `https://githubtree.mgks.dev/repo/${repo}/${details.default_branch || 'main'}/?ref=badge`;
    const badgeMarkdown = `[![GitHubTree](${badgeUrl})](${structureUrl})`;

    const badgePreview = document.getElementById('repoMetaBadgePreview');
    const badgeInput = document.getElementById('repoMetaBadgeInput');
    if (badgePreview) badgePreview.src = badgeUrl;
    if (badgeInput) badgeInput.value = badgeMarkdown;
    
    const branchesEl = document.getElementById('repoBranches');
    const contributorsEl = document.getElementById('repoContributors');
    
    if (details.branchesCount !== undefined) {
        if (branchesEl) branchesEl.innerHTML = `<i class="fa-solid fa-code-branch"></i> ${formatNumber(details.branchesCount)} ${details.branchesCount === 1 ? 'branch' : 'branches'}`;
    } else {
        if (branchesEl) branchesEl.innerHTML = `<i class="fa-solid fa-code-branch"></i> Loading...`;
    }

    if (details.contributorsCount !== undefined) {
        if (contributorsEl) contributorsEl.innerHTML = `<i class="fa-solid fa-users"></i> ${formatNumber(details.contributorsCount)} ${details.contributorsCount === 1 ? 'contributor' : 'contributors'}`;
    } else {
        if (contributorsEl) contributorsEl.innerHTML = `<i class="fa-solid fa-users"></i> Loading...`;
    }

    const githubLinkEl = document.getElementById('repoGithubLink');
    if (githubLinkEl) {
        githubLinkEl.href = `https://github.com/${details.fullName || repo}`;
    }

    // Check if indexed in our database
    const indexCol = document.getElementById('repoIndexCol');
    if (indexCol) {
        const lowerRepo = repo.toLowerCase();
        if (typeof indexedRepos !== 'undefined' && indexedRepos.has(lowerRepo)) {
            indexCol.style.display = 'none';
        } else {
            indexCol.style.display = 'inline-flex';
            const btn = document.getElementById('repoIndexBtn');
            if (btn) {
                btn.href = `https://github.com/mgks/GitHubTree/issues/new?template=feature-repo.md&title=Feature+Repo:+${encodeURIComponent(repo)}`;
            }
        }
    }

    card.style.display = 'block';
}

async function fetchAndRenderRepoDetails(repo) {
    const card = document.getElementById('repoDetailsCard');
    if (!card) return;

    const cacheKey = `ght_details_${repo}`;
    // Ensure indexedRepos is populated before rendering (guards against refresh race)
    await indexedReposReady;

    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        try {
            const details = JSON.parse(cached);
            renderRepoDetailsCard(repo, details);
            return;
        } catch(e) {}
    }

    try {
        const token = localStorage.getItem('ght_token');
        const headers = { 'Accept': 'application/vnd.github+json' };
        if (token) headers['Authorization'] = `token ${token}`;

        const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        if (!res.ok) throw new Error();

        const data = await res.json();
        const details = {
            description: data.description || "No description provided.",
            stargazers_count: data.stargazers_count,
            forks_count: data.forks_count,
            size: data.size,
            language: data.language,
            default_branch: data.default_branch || 'main'
        };

        // Render primary card data immediately
        renderRepoDetailsCard(repo, details);

        // Fetch secondary analytics asynchronously
        const stats = await fetchRepoExtraStats(repo);
        details.branchesCount = stats.branchesCount;
        details.contributorsCount = stats.contributorsCount;

        // Render full analytics
        renderRepoDetailsCard(repo, details);

        // Store complete object in cache
        sessionStorage.setItem(cacheKey, JSON.stringify(details));

    } catch (e) {
        card.style.display = 'none';
    }
}

async function fetchRepoExtraStats(repo) {
    const token = localStorage.getItem('ght_token');
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    let branchesCount = 1;
    let contributorsCount = 1;

    // Fetch branches count (efficient page=1&per_page=1 Link rel="last" header parser)
    try {
        const res = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=1`, { headers });
        if (res.ok) {
            const link = res.headers.get('Link');
            if (link) {
                const match = link.match(/page=(\d+)&per_page=1>; rel="last"/);
                if (match) branchesCount = parseInt(match[1]);
            } else {
                const data = await res.json();
                branchesCount = data.length || 1;
            }
        }
    } catch (e) {}

    // Fetch contributors count (efficient Rel last header parser)
    try {
        const res = await fetch(`https://api.github.com/repos/${repo}/contributors?per_page=1`, { headers });
        if (res.ok) {
            const link = res.headers.get('Link');
            if (link) {
                const match = link.match(/page=(\d+)&per_page=1>; rel="last"/);
                if (match) contributorsCount = parseInt(match[1]);
            } else {
                const data = await res.json();
                contributorsCount = data.length || 1;
            }
        }
    } catch (e) {}

    return { branchesCount, contributorsCount };
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num;
}

async function loadFilePreviewContent() {
    if (!activeDetailItem) return;
    
    const container = document.getElementById('filePreviewContainer');
    const label = document.getElementById('previewFileLabel');
    const codeContainer = document.getElementById('previewBody');
    const toggleBtn = document.getElementById('btnTogglePreview');

    container.style.display = 'block';
    label.innerText = activeDetailItem.path.split('/').pop();
    
    // Clear code display and show fetching
    codeContainer.innerHTML = '<code>Fetching content...</code>';
    toggleBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching...`;

    const ext = activeDetailItem.path.split('.').pop().toLowerCase();
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
    const isImage = imageExtensions.includes(ext);

    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
    const isAudio = audioExtensions.includes(ext);

    const binaryExtensions = ['zip', 'tar', 'gz', 'rar', 'pdf', 'exe', 'dll', 'so', 'dylib', 'bin', 'woff', 'woff2', 'ttf', 'eot'];
    const isBinary = binaryExtensions.includes(ext) && !isAudio;

    try {
        if (isBinary) {
            throw new Error("Preview not supported for binary file types. Click 'Open on GitHub' to view this file.");
        }

        if (activeDetailItem.size > 150 * 1024 && !isImage && !isAudio) {
            throw new Error("File too large to preview directly in browser (Max: 150 KB). Click 'Open on GitHub' to view it.");
        }
        
        const result = await fetchFileContent(activeDetailItem.path, isImage, isAudio, ext);
        
        if (result.type === 'image') {
            codeContainer.innerHTML = `<div class="image-preview-wrapper"><img src="${result.content}" alt="Image Preview" class="preview-img"></div>`;
            document.getElementById('btnCopyPreviewContent').style.display = 'none';
        } else if (result.type === 'audio') {
            codeContainer.innerHTML = `
                <div class="audio-preview-wrapper">
                    <div class="audio-player-card">
                        <i class="fas fa-music audio-icon"></i>
                        <span class="audio-filename">${activeDetailItem.path.split('/').pop()}</span>
                        <audio controls class="preview-audio" src="${result.content}"></audio>
                    </div>
                </div>`;
            document.getElementById('btnCopyPreviewContent').style.display = 'none';
        } else {
            codeContainer.innerHTML = `<code></code>`;
            codeContainer.querySelector('code').innerText = result.content;
            document.getElementById('btnCopyPreviewContent').style.display = 'inline-flex';
        }
        
        toggleBtn.innerHTML = `<i class="far fa-eye-slash"></i> Hide Content`;
        trackEvent('Preview', 'Fetch Content Success', activeDetailItem.path);
    } catch (err) {
        codeContainer.innerHTML = `<code>⚠️ Preview Error: ${err.message}</code>`;
        toggleBtn.innerHTML = `<i class="far fa-eye"></i> Show Content`;
        trackEvent('Preview', 'Fetch Content Failed', err.message);
    }
}

async function fetchFileContent(path, isImage = false, isAudio = false, ext = '') {
    const repo = els.repo.value.trim();
    const branch = els.branch.value.trim() || 'main';
    const token = localStorage.getItem('ght_token');
    
    // Formulate raw CDN URL first (Bypasses GitHub API Rate Limits!)
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    
    // If no token is provided, or we want to try raw CDN first
    if (!token) {
        try {
            const res = await fetch(rawUrl);
            if (res.ok) {
                if (isImage) {
                    const blob = await res.blob();
                    const dataUrl = await readBlobAsDataURL(blob);
                    return { type: 'image', content: dataUrl };
                }
                if (isAudio) {
                    const blob = await res.blob();
                    const dataUrl = await readBlobAsDataURL(blob);
                    return { type: 'audio', content: dataUrl };
                }
                // Text file
                const text = await res.text();
                return { type: 'text', content: text };
            }
        } catch (e) {
            console.warn("Raw CDN fetch failed, falling back to API:", e);
        }
    }

    // Fallback: API-based fetching (Used for private repos or token-based requests)
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
        if (res.status === 403) throw new Error("API Limit Exceeded or Access Forbidden.");
        if (res.status === 404) throw new Error("File not found or is in a private repo without credentials.");
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    if (data.encoding === 'base64') {
        const cleanBase64 = data.content.replace(/\s/g, '');
        if (isImage) {
            const mimes = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'svg': 'image/svg+xml',
                'ico': 'image/x-icon',
                'bmp': 'image/bmp'
            };
            const mime = mimes[ext] || 'image/png';
            return { type: 'image', content: `data:${mime};base64,${cleanBase64}` };
        }
        if (isAudio) {
            const mimes = {
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'ogg': 'audio/ogg',
                'm4a': 'audio/mp4',
                'flac': 'audio/flac'
            };
            const mime = mimes[ext] || 'audio/mpeg';
            return { type: 'audio', content: `data:${mime};base64,${cleanBase64}` };
        }

        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const text = new TextDecoder('utf-8').decode(bytes);
        return { type: 'text', content: text };
    }
    throw new Error("Unsupported file encoding");
}

function readBlobAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function formatBytes(bytes) {
    if (bytes === undefined || bytes === null) return "N/A";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function decodeGitMode(mode) {
    if (!mode) return "N/A";
    const modes = {
        '100644': 'Regular File (rw-r--r--)',
        '100755': 'Executable File (rwxr-xr-x)',
        '120000': 'Symbolic Link',
        '160000': 'Submodule Gitlink',
        '040000': 'Directory'
    };
    return modes[mode] || mode;
}