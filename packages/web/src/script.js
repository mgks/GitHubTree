import { GitHubTree } from 'gh-tree';

// --- State ---
let gt = new GitHubTree(); 
let currentData = []; // Stores the Raw API response
let currentSort = 'folder-az';
let currentStyle = 'classic';

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
    els.treeSearch.addEventListener('input', () => render());

    // Preview (Disabled)
    if (els.closePreview) els.closePreview.addEventListener('click', () => els.previewOverlay.classList.remove('visible'));
    if (els.previewOverlay) els.previewOverlay.addEventListener('click', (e) => {
        if (e.target === els.previewOverlay) els.previewOverlay.classList.remove('visible');
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

    // Enter Key Support
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
    const repo = els.repo.value.trim();
    const branch = els.branch.value.trim() || 'main';

    if (!repo.includes('/')) return showMsg("Invalid format. Use 'user/repo'", "error");

    if (els.empty) els.empty.style.display = 'none';

    // Hide language listing ONLY if it exists
    const langList = document.querySelector('.language-listing');
    if (langList) langList.style.display = 'none';
    
    // Hide Breadcrumbs ONLY if they exist
    const breadcrumbs = document.querySelector('.seo-link');
    if (breadcrumbs) breadcrumbs.style.display = 'none';

    els.wrapper.style.display = 'none';
    els.wrapper.style.display = 'none';
    showMsg(`Fetching ${repo}...`, "loading");
    els.fetchBtn.disabled = true;

    try {
        const cacheKey = `ght_${repo}_${branch}`;
        const tokenActive = !!localStorage.getItem('ght_token');
        const cached = !tokenActive ? sessionStorage.getItem(cacheKey) : null;

        if (cached) {
            currentData = JSON.parse(cached);
            updatePageMetadata(repo, branch); // Update metadata for SEO/share
            showMsg("", ""); // Clear status
            
            // Standard URL update for cached items
            const newUrl = `/repo/${repo}/${branch}/`;
            if (window.location.pathname !== newUrl) window.history.pushState(null, '', newUrl);
        } else {
            // Fetch from Core
            const data = await gt.getTree(repo, branch);
            currentData = data.tree;
            
            // --- SMART BRANCH HANDLING ---
            if (data.branch && data.branch !== branch) {
                // Case A: Branch Switched (main -> master)
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
        }

        render();
        els.wrapper.style.display = 'flex';

    } catch (err) {
        console.error(err);
        let msg = err.message;

        if (msg.includes('401') || msg.includes('Bad credentials')) {
            showMsg("Invalid Private Token. Please check your settings.", "error");
            // Optional: Auto-open the private panel?
            // els.tokenPanel.style.display = 'block'; 
        
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

    const term = els.treeSearch.value.toLowerCase();
    let filteredData = currentData;
    
    if (term) {
        const matches = currentData.filter(item => item.path.toLowerCase().includes(term));
        const pathsToInclude = new Set();
        
        matches.forEach(item => {
            const parts = item.path.split('/');
            // Add the item itself and all its parents
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
        // If searching, line numbers are not strictly meaningful in chronological order, 
        // but let's keep them as a count of visible items.
        n.textContent = idx + 1;
        fragNums.appendChild(n);

        // Content Row
        const row = document.createElement('div');
        row.className = 'tree-line';
        row.dataset.depth = item.depth;
        // Fast animation cap (max 500ms)
        row.style.animation = `fadeIn 0.1s forwards ${Math.min(idx * 2, 500)}ms`;
        row.style.opacity = '0';

        const isFolder = item.type === 'tree';
        const iconClass = isFolder ? 'fa-solid fa-folder' : 'fa-regular fa-file';
        const typeClass = isFolder ? 'folder' : 'file';

        if (isFolder) {
            row.classList.add('tree-folder');
            // Auto-expand if searching
            if (term) row.classList.remove('collapsed');
        }

        // Apply Styles
        let prefixDisplay = item.prefix;
        let nameDisplay = item.name;

        if (currentStyle === 'minimal') prefixDisplay = item.indent;
        if (currentStyle === 'plus') prefixDisplay = prefixDisplay.replace(/└──/g, '+--').replace(/├──/g, '+--').replace(/│/g, '|');
        if (currentStyle === 'slashed') {
            if (isFolder) nameDisplay = `/${item.name}`;
            prefixDisplay = item.prefix.replace(/│/g, ' ').replace(/├──/g, ' ').replace(/└──/g, ' ');
        }
        if (currentStyle === 'bulleted') {
            prefixDisplay = item.indent.replace(/    /g, '  ');
            nameDisplay = `• ${item.name}${isFolder ? '/' : ''}`;
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

    // 3. File Preview Trigger (Disabled)
    const fileName = e.target.closest('.t-name.file');
    /*
    if (fileName) {
        const row = fileName.parentElement;
        const depth = Number(row.dataset.depth);
        const name = fileName.innerText;
        // In this UI implementation, we need the path.
        // Let's find the original item from currentData
        const path = row.querySelector('.sub-copy').dataset.path;
        showPreview({ name, path });
        return;
    }
    */

    if (!folderRow) return;
    toggleFolder(folderRow);
}

function toggleFolder(folderRow) {
    const rows = Array.from(els.treeContent.children);
    const nums = Array.from(els.lineNums.children);
    const startIdx = rows.indexOf(folderRow);
    const folderDepth = Number(folderRow.dataset.depth);
    const isClosing = !folderRow.classList.contains('collapsed');

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
        els.shareInput.value = window.location.href;
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
}

function showMsg(text, type) {
    els.status.style.display = text ? 'block' : 'none';
    els.status.innerText = text;
    els.status.className = type;
}

function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
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
