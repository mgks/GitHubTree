import { GitHubTree } from 'gh-tree';

// --- State ---
let gt = new GitHubTree(); 
let currentData = []; // Stores the Raw API response
let currentSort = 'folder-az';
let currentStyle = 'classic';
let activeDetailItem = null;

// --- Elements ---
const els = {
    // Search
    repo: document.getElementById('repoInput'),
    branch: document.getElementById('branchInput'),
    fetchBtn: document.getElementById('fetchBtn'),
    
    // UI Containers
    wrapper: document.getElementById('treeWrapper'),
    empty: document.getElementById('emptyState'),
    status: document.getElementById('statusMsg'),
    
    // Terminal
    lineNums: document.getElementById('lineNumbers'),
    treeContent: document.getElementById('treeContent'),
    
    // Private Access
    privateBtn: document.getElementById('privateRepoBtn'),
    tokenPanel: document.getElementById('tokenSection'),
    ghToken: document.getElementById('ghToken'),
    saveToken: document.getElementById('saveTokenBtn'),
    clearToken: document.getElementById('clearTokenBtn'),
    
    // Actions
    copyAll: document.getElementById('copyAllBtn'),
    shareBtn: document.getElementById('shareBtn'),
    treeToggle: document.getElementById('treeToggleBtn'),

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

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkSavedToken();
    setupUrlHandler();
    setupDropdowns();
    setupShareOverlay();
    initHistoryCloud();
    
    // Main Listeners
    els.copyAll.addEventListener('click', copyFullTree);
    els.treeToggle.addEventListener('click', () => {
        const isCollapsed = els.treeToggle.innerHTML.includes('Expand');
        toggleAll(!isCollapsed);
        
        // Update button state
        const nextState = !isCollapsed ? 'Expand' : 'Compact';
        const nextIcon = !isCollapsed ? 'fa-expand-alt' : 'fa-compress-alt';
        els.treeToggle.innerHTML = `<i class="fas ${nextIcon}"></i> <span class="btn-text">${nextState}</span>`;
        
        trackEvent('UI', 'Tree Toggle', nextState);
    });

    // Search
    let searchDebounce = null;
    els.treeSearch.addEventListener('input', () => {
        render();
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            const term = els.treeSearch.value.trim();
            if (term) trackEvent('Search', 'Query', term);
        }, 1000);
    });

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

    // Quick Start Tags
    document.querySelectorAll('.repo-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const [u, r] = btn.dataset.repo.split('/');
            els.repo.value = `${u}/${r}`;
            els.branch.value = 'main';
            loadTree();
            trackEvent('Fetch', 'Quick Start', `${u}/${r}`);
        });
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
    showMsg(`Fetching ${repo}...`, "loading");
    els.fetchBtn.disabled = true;

    const cacheKey = `ght_${repo}_${branch}`;
    const tokenActive = !!localStorage.getItem('ght_token');

    try {
        const cached = !tokenActive ? sessionStorage.getItem(cacheKey) : null;

        if (cached) {
            currentData = JSON.parse(cached);
            updatePageMetadata(repo, branch); // Update metadata for SEO/share
            showMsg("", ""); // Clear status
            
            // Standard URL update for cached items
            const newUrl = `/repo/${repo}/${branch}/`;
            if (window.location.pathname !== newUrl) window.history.pushState(null, '', newUrl);

            // Fetch repo details card dynamically
            fetchAndRenderRepoDetails(repo);
            trackEvent('Fetch', 'Cache Hit', repo);
        } else {
            // Fetch from Core
            const data = await gt.getTree(repo, branch);
            currentData = data.tree;
            
            // --- SMART BRANCH HANDLING ---
            if (data.branch && data.branch !== branch) {
                const newBranch = data.branch;
                
                // 1. Notify User
                showMsg(`Branch '${branch}' not found. Switched to '${newBranch}'.`, "loading");
                
                // 2. Update Input UI
                els.branch.value = newBranch;
                updatePageMetadata(repo, newBranch); // Update metadata for SEO/share
                
                // 3. Cache under the CORRECT key
                const correctCacheKey = `ght_${repo}_${newBranch}`;
                if (!tokenActive) try { sessionStorage.setItem(correctCacheKey, JSON.stringify(currentData)); } catch(e){}
                
                // 4. Update URL (Replace history so back button works logically)
                const correctUrl = `/repo/${repo}/${newBranch}/`;
                window.history.replaceState(null, '', correctUrl);
                
            } else {
                // Case B: Normal Success
                if (!tokenActive) try { sessionStorage.setItem(cacheKey, JSON.stringify(currentData)); } catch(e){}
                updatePageMetadata(repo, branch); // Update metadata for SEO/share
                showMsg("", ""); // Clear status
                
                // Update URL
                const newUrl = `/repo/${repo}/${branch}/`;
                if (window.location.pathname !== newUrl) window.history.pushState(null, '', newUrl);
            }

            // Fetch repo details card dynamically
            fetchAndRenderRepoDetails(repo);
            trackEvent('Fetch', 'Success', repo);
        }

        render();
        els.wrapper.style.display = 'flex';
        saveToSearchHistory(repo);

    } catch (err) {
        console.error(err);
        let msg = err.message;
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

// --- Render Logic (Visual) ---
function render() {
    els.lineNums.innerHTML = '';
    els.treeContent.innerHTML = '';

    const term = els.treeSearch.value.trim();
    let filteredData = currentData;
    let regex = null;
    
    if (term) {
        let isRegex = false;
        // Check if query is enclosed in slashes for regex, e.g. /\.js$/i or /src/
        const regexMatch = term.match(/^\/(.+)\/([gimy]*)$/);
        if (regexMatch) {
            try {
                regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
                isRegex = true;
            } catch (e) {
                // Invalid regex, fallback to regular matching
            }
        }
        
        if (!isRegex) {
            // Safe escape special characters for regex search
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, 'i');
        }

        const matches = currentData.filter(item => regex.test(item.path));
        const pathsToInclude = new Set();
        
        matches.forEach(item => {
            const parts = item.path.split('/');
            for (let i = 1; i <= parts.length; i++) {
                pathsToInclude.add(parts.slice(0, i).join('/'));
            }
        });

        filteredData = currentData.filter(item => pathsToInclude.has(item.path));
    }

    // 1. Sort Data (using Core Logic)
    const sortedFlat = gt.sortTree(filteredData, currentSort);

    // 2. Build Visual Props (Prefixes like │   ├──)
    const hierarchy = buildVisualHierarchy(sortedFlat);

    // 3. Create DOM
    const fragNums = document.createDocumentFragment();
    const fragLines = document.createDocumentFragment();

    hierarchy.forEach((item, idx) => {
        // Line Number
        const n = document.createElement('div');
        n.textContent = idx + 1;
        fragNums.appendChild(n);

        // Content Row
        const row = document.createElement('div');
        row.className = 'tree-line';
        row.dataset.depth = item.depth;
        row.style.animation = `fadeIn 0.1s forwards ${Math.min(idx * 2, 500)}ms`;
        row.style.opacity = '0';

        const isFolder = item.type === 'tree';
        const iconClass = isFolder ? 'fa-solid fa-folder' : 'fa-regular fa-file';
        const typeClass = isFolder ? 'folder' : 'file';

        if (isFolder) {
            row.classList.add('tree-folder');
            if (term) row.classList.remove('collapsed');
        }

        // Apply Styles
        let prefixDisplay = item.prefix;
        
        // Highlight matched search queries
        let nameDisplay = item.name;
        if (regex && regex.test(item.name)) {
            nameDisplay = item.name.replace(regex, (match) => `<mark class="search-highlight">${match}</mark>`);
        }

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

        const caretHTML = isFolder ? '<span class="t-caret"><i class="fas fa-angle-down"></i></span>' : '';

        row.innerHTML = `
            <span class="t-prefix">${prefixDisplay}</span>
            ${caretHTML}
            <span class="t-icon"><i class="${iconClass}"></i></span>
            <span class="t-name ${typeClass}">${nameDisplay}</span>
            <button class="sub-copy" data-path="${item.path}" title="Copy Path">
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
    // Feature disabled by default due to CSP/Fetch limitations
    console.log("Preview disabled:", item.path);
    return;
    
    const repo = els.repo.value.trim();
    const branch = els.branch.value.trim() || 'main';
    const cleanPath = item.path.replace(/^\//, '');
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${cleanPath}`;

    els.previewTitle.innerText = item.name;
    els.previewBody.innerText = "Loading...";
    els.previewOverlay.classList.add('visible');

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load file (Code ${res.status})`);
        const text = await res.text();
        els.previewBody.innerText = text;
        trackEvent('Preview', 'Open', item.path);
    } catch (err) {
        els.previewBody.innerText = `⚠️ Error: ${err.message}\n\nNote: Browsers may block large files or non-text content.`;
    }
}

// --- Helper: Build Visual Hierarchy (Prefix Generator) ---
function buildVisualHierarchy(sortedFlatList) {
    const root = { children: [] };
    const map = { '': root };
    
    // 1. Init Nodes
    sortedFlatList.forEach(item => {
        map[item.path] = { ...item, name: item.path.split('/').pop(), children: [] };
    });
    
    // 2. Connect Parents
    sortedFlatList.forEach(item => {
        const parts = item.path.split('/');
        parts.pop();
        const parent = map[parts.join('/')] || root;
        parent.children.push(map[item.path]);
    });

    // 3. Traverse to generate prefixes
    const result = [];
    const traverse = (node, prefix, isLast, depth) => {
        const connector = isLast ? "└── " : "├── ";
        result.push({
            name: node.name,
            path: node.path,
            type: node.type,
            depth: depth,
            prefix: prefix + connector,
            indent: prefix.replace(/│   /g, '    ').replace(/├── /g, '    ').replace(/└── /g, '    ')
        });
        
        if (node.children) {
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

    // 2. Folder toggle
    const folderRow = e.target.closest('.tree-folder');
    if (folderRow && !e.target.closest('.t-name')) {
        toggleFolder(folderRow);
        return;
    }

    // 3. File Details Trigger
    const fileName = e.target.closest('.t-name.file');
    if (fileName) {
        const row = fileName.parentElement;
        const path = row.querySelector('.sub-copy').dataset.path;
        const item = currentData.find(d => d.path === path);
        if (item) {
            showFileDetailsModal(item);
        }
        return;
    }

    if (!folderRow) return;
    toggleFolder(folderRow);
}

function toggleFolder(folderRow) {
    const rows = Array.from(els.treeContent.children);
    const nums = Array.from(els.lineNums.children);
    const startIdx = rows.indexOf(folderRow);
    const folderDepth = Number(folderRow.dataset.depth);
    const isClosing = !folderRow.classList.contains('collapsed');

    // Track folder interaction
    const pathBtn = folderRow.querySelector('.sub-copy');
    if (pathBtn) {
        trackEvent('Tree', isClosing ? 'Collapse Folder' : 'Expand Folder', pathBtn.dataset.path);
    }

    folderRow.classList.toggle('collapsed');

    for (let i = startIdx + 1; i < rows.length; i++) {
        if (Number(rows[i].dataset.depth) <= folderDepth) break;

        if (isClosing) {
            rows[i].classList.add('child-hidden');
            nums[i].classList.add('child-hidden');
        } else {
            // When expanding, skip rows inside a nested collapsed folder
            if (isInsideCollapsedAncestor(rows, i, startIdx, folderDepth)) continue;
            rows[i].classList.remove('child-hidden');
            nums[i].classList.remove('child-hidden');
        }
    }

    renumber();
}

// --- Helper: Check if row is inside a collapsed ancestor between afterIdx and targetIdx ---
function isInsideCollapsedAncestor(rows, targetIdx, afterIdx, stopDepth) {
    const targetDepth = Number(rows[targetIdx].dataset.depth);
    for (let j = targetIdx - 1; j > afterIdx; j--) {
        const d = Number(rows[j].dataset.depth);
        if (d < targetDepth && rows[j].classList.contains('collapsed')) return true;
        if (d <= stopDepth) break;
    }
    return false;
}

// --- Helper: Renumber visible lines ---
function renumber() {
    let num = 0;
    Array.from(els.lineNums.children).forEach(el => {
        el.textContent = el.classList.contains('child-hidden') ? '' : ++num;
    });
}

// --- Toggle All Folders ---
function toggleAll(collapse) {
    const rows = Array.from(els.treeContent.children);
    const nums = Array.from(els.lineNums.children);

    rows.forEach((row, i) => {
        if (collapse) {
            if (row.classList.contains('tree-folder')) row.classList.add('collapsed');
            if (Number(row.dataset.depth) > 0) {
                row.classList.add('child-hidden');
                nums[i].classList.add('child-hidden');
            }
        } else {
            row.classList.remove('collapsed', 'child-hidden');
            nums[i].classList.remove('child-hidden');
        }
    });

    renumber();
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

// --- UI Helpers ---
function setupDropdowns() {
    // Select the actual buttons, not just the labels
    const dropdownBtns = [
        document.getElementById('sortBtn'),
        document.getElementById('styleBtn')
    ];

    dropdownBtns.forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = btn.closest('.dropdown');
            closeDropdowns(parent);
            parent.classList.toggle('active');
        });
    });

    document.querySelectorAll('[data-sort]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            currentSort = e.target.dataset.sort;
            els.sortBtnLabel.textContent = e.target.innerText;
            closeDropdowns();
            render();
            trackEvent('UI', 'Sort Change', currentSort);
        });
    });

    document.querySelectorAll('[data-style]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            currentStyle = e.target.dataset.style;
            els.styleBtnLabel.textContent = e.target.innerText;
            closeDropdowns();
            render();
            trackEvent('UI', 'Style Change', currentStyle);
        });
    });

    document.addEventListener('click', () => closeDropdowns());
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
    els.shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const repo = els.repo.value.trim();
        const branch = els.branch.value.trim() || 'main';
        const shareUrl = `${window.location.origin}/repo/${repo}/${branch}/`;
        
        els.shareInput.value = shareUrl;

        // Generate dynamic shields.io badge link
        const badgeImgUrl = `https://img.shields.io/badge/Structure-GitHubTree-blue?style=flat-square`;
        const markdownBadge = `[![GitHubTree](${badgeImgUrl})](${shareUrl})`;
        const htmlBadge = `<a href="${shareUrl}"><img src="${badgeImgUrl}" alt="GitHubTree Structure"></a>`;

        document.getElementById('badgeMarkdownPreview').src = badgeImgUrl;
        document.getElementById('badgeHtmlPreview').src = badgeImgUrl;

        document.getElementById('badgeMarkdownInput').value = markdownBadge;
        document.getElementById('badgeHtmlInput').value = htmlBadge;

        els.overlay.classList.add('visible');
        trackEvent('Share', 'Open Modal');
    });
    
    els.closeOverlay.addEventListener('click', () => els.overlay.classList.remove('visible'));
    
    els.overlay.addEventListener('click', (e) => {
        if (e.target === els.overlay) els.overlay.classList.remove('visible');
    });
    
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
    historyCloud.className = 'tag-cloud';
    historyCloud.id = 'historyCloud';

    history.forEach(repo => {
        const btn = document.createElement('button');
        btn.className = 'repo-tag';
        btn.dataset.repo = repo;
        
        const userPart = repo.split('/')[0];
        const namePart = repo.split('/')[1] || '';
        
        btn.innerHTML = `<span>${userPart}/</span>${namePart}`;
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
                el.innerHTML = `${commitInfo.date} by <strong>${commitInfo.author}</strong> &mdash; <em>"${commitInfo.message}"</em>`;
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

            el.innerHTML = `${formattedDate} by <strong>${author}</strong> &mdash; <em>"${message}"</em>`;
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
    document.getElementById('repoStars').innerHTML = `<i class="far fa-star"></i> ${formatNumber(details.stargazers_count)} stars`;
    document.getElementById('repoForks').innerHTML = `<i class="fas fa-code-branch"></i> ${formatNumber(details.forks_count)} forks`;
    
    const sizeBadge = document.getElementById('repoSize');
    if (sizeBadge) {
        sizeBadge.innerHTML = `<i class="fas fa-database"></i> ${formatBytes(details.size * 1024)}`;
    }

    const langBadge = document.getElementById('repoLanguage');
    if (details.language) {
        langBadge.style.display = 'inline-flex';
        langBadge.innerHTML = `<i class="fas fa-circle"></i> ${details.language}`;
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
    const badgeUrl = `https://img.shields.io/badge/GitHubTree-${encodeURIComponent(repoNameOnly)}-blue?style=flat-square`;
    const structureUrl = `https://githubtree.mgks.dev/repo/${repo}/${details.default_branch || 'main'}/?ref=badge`;
    const badgeMarkdown = `[![GitHubTree](${badgeUrl})](${structureUrl})`;

    const badgePreview = document.getElementById('repoMetaBadgePreview');
    const badgeInput = document.getElementById('repoMetaBadgeInput');
    if (badgePreview) badgePreview.src = badgeUrl;
    if (badgeInput) badgeInput.value = badgeMarkdown;
    
    const branchesEl = document.getElementById('repoBranches');
    const contributorsEl = document.getElementById('repoContributors');
    
    if (details.branchesCount !== undefined) {
        if (branchesEl) branchesEl.innerHTML = `<i class="fas fa-code-fork"></i> ${formatNumber(details.branchesCount)} ${details.branchesCount === 1 ? 'branch' : 'branches'}`;
    } else {
        if (branchesEl) branchesEl.innerHTML = `<i class="fas fa-code-fork"></i> Loading...`;
    }

    if (details.contributorsCount !== undefined) {
        if (contributorsEl) contributorsEl.innerHTML = `<i class="fas fa-users"></i> ${formatNumber(details.contributorsCount)} ${details.contributorsCount === 1 ? 'contributor' : 'contributors'}`;
    } else {
        if (contributorsEl) contributorsEl.innerHTML = `<i class="fas fa-users"></i> Loading...`;
    }

    card.style.display = 'block';
}

async function fetchAndRenderRepoDetails(repo) {
    const card = document.getElementById('repoDetailsCard');
    if (!card) return;

    const cacheKey = `ght_details_${repo}`;
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
