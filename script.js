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

fetchButton.addEventListener('click', fetchRepoTree);
copyTreeButton.addEventListener('click', () => copyToClipboard(hiddenTree.value));

async function fetchRepoTree() {
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';
    if (!repo) {
        showError("Please enter a repository.");
        return;
    }

    showLoading(true);
    clearTree();
    clearError();
    hiddenTree.value = '';

    try {
        await buildTree(repo, branch);
        copyTreeButton.style.display = 'inline-block';
        treeContainer.style.display = 'block';
        container.classList.add('tree-loaded');

        // Animate the tree output
        animateTreeOutput();

    } catch (error) {
        showError(`Error fetching repository: ${error.message}`);
        copyTreeButton.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

async function buildTree(repo, branch, path = '', level = 0, treeText = '', plainText = '') {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("Repository or path not found.");
        } else if (response.status === 403) {
            handleRateLimit(response)
        } else {
            throw new Error(`GitHub API error: ${response.status}`);
        }
    }

    const data = await response.json();
    const getIndent = (level) => "    ".repeat(level);
    const getPrefix = (isLast) => (level === 0) ? '' : (isLast ? '└── ' : '├── ');

    let lineNumbersHTML = ''; // Accumulate line numbers here
    let treeContentHTML = ''; // Accumulate tree content here
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const isLast = i === data.length - 1;
        const indent = getIndent(level);
        const prefix = getPrefix(isLast);
        const icon = item.type === 'dir' ? '<i class="fas fa-folder"></i> ' : '<i class="fas fa-file"></i> ';
        const copyButton = `<button class="copy-button" title="Copy path" data-path="${item.path}"><i class="fas fa-copy"></i></button>`;

        if (item.type === 'dir') {
            const line = `${indent}${prefix}${icon}<span class="dir-name">${item.name}</span> ${copyButton}`;
            treeContentHTML += `<span>${line}</span>\n`; // Wrap in span for animation
            plainText += `${indent}${prefix}${item.name}\n`;
            let [nestedTreeText, nestedPlainText] = await buildTree(repo, branch, item.path, level + 1, '', ''); //Get nested content.
            treeContentHTML += nestedTreeText; // Append nested content
            plainText += nestedPlainText;

        } else {
            const line = `${indent}${prefix}${icon}<a href="${item.html_url}" target="_blank" style="color: inherit; text-decoration: none;">${item.name}</a> ${copyButton}`;
            treeContentHTML += `<span>${line}</span>\n`;  // Wrap in span for animation
            plainText += `${indent}${prefix}${item.name}\n`;
        }
    }
    // Build line numbers based on the number of lines in treeContentHTML
    const numLines = treeContentHTML.split('\n').length -1; // -1 because of the extra \n
    for(let i = 1; i <= numLines; i++){
        lineNumbersHTML += `<span>${i}</span>`;
    }

    tree.innerHTML = `<div class="line-numbers">${lineNumbersHTML}</div><div class="line-content">${treeContentHTML}</div>`;
    hiddenTree.value = plainText;
    attachCopyButtonListeners();
    return [treeContentHTML, plainText]; // Return accumulated content
}
function animateTreeOutput() {
    const lines = tree.querySelectorAll('.line-content > span');
    lines.forEach((line, index) => {
        // Simple line-by-line reveal
        setTimeout(() => {
            line.style.visibility = 'visible';
        }, index * 50); // Adjust delay as needed
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
        throw new Error(`Rate limit exceeded.  Try again after ${resetTime.toLocaleString()}`);
     }
     throw new Error(`GitHub API error: ${response.status}`);
}