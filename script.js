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
        animateTreeOutput();

    } catch (error) {
        // Error handling is now done in the main try/catch
        showError(error.message); // Display the error message
        copyTreeButton.style.display = 'none';
    } finally {
        showLoading(false);
    }
}
async function buildTree(repo, branch, path = '', level = 0, treeText = '', plainText = '') {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const response = await fetch(url);

    if (!response.ok) {
        // Throw the error to be caught in fetchRepoTree
        if (response.status === 404) {
            throw new Error("Repository or path not found.");
        } else if (response.status === 403) {
            await handleRateLimit(response); // Await here
        } else {
            throw new Error(`GitHub API error: ${response.status}`);
        }
    }


    const data = await response.json();
    const getIndent = (level) => "    ".repeat(level);
    const getPrefix = (isLast) => (level === 0) ? '' : (isLast ? '└── ' : '├── ');

    let lineNumbersHTML = '';
    let treeContentHTML = '';
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const isLast = i === data.length - 1;
        const indent = getIndent(level);
        const prefix = getPrefix(isLast);
        const icon = item.type === 'dir' ? '<i class="fas fa-folder"></i> ' : '<i class="fas fa-file"></i> ';
        const copyButton = `<button class="copy-button" title="Copy path" data-path="${item.path}"><i class="fas fa-copy"></i></button>`;

        if (item.type === 'dir') {
            const line = `${indent}${prefix}${icon}<span class="dir-name">${item.name}</span> ${copyButton}`;
            treeContentHTML += `<span>${line}</span>\n`;
            plainText += `${indent}${prefix}${item.name}\n`;
            let [nestedTreeText, nestedPlainText] = await buildTree(repo, branch, item.path, level + 1, '', '');
            treeContentHTML += nestedTreeText;
            plainText += nestedPlainText;

        } else {
            const line = `${indent}${prefix}${icon}<a href="${item.html_url}" target="_blank" style="color: inherit; text-decoration: none;">${item.name}</a> ${copyButton}`;
            treeContentHTML += `<span>${line}</span>\n`;
            plainText += `${indent}${prefix}${item.name}\n`;
        }
    }
    const numLines = treeContentHTML.split('\n').length -1;
    for(let i = 1; i <= numLines; i++){
        lineNumbersHTML += `<span>${i}</span>`;
    }

    tree.innerHTML = `<div class="line-numbers">${lineNumbersHTML}</div><div class="line-content">${treeContentHTML}</div>`;
    hiddenTree.value = plainText;
    attachCopyButtonListeners();
    return [treeContentHTML, plainText];
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
async function handleRateLimit(response) {
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');

    if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetTime = new Date(parseInt(rateLimitReset) * 1000);
        const currentTime = new Date();
        const timeDiff = resetTime.getTime() - currentTime.getTime(); // Difference in milliseconds
        const minutes = Math.ceil(timeDiff / (1000 * 60)); // Convert to minutes

        // Throw a new error with the formatted message
        throw new Error(`Rate limit exceeded!<br /><br />Try again after ${resetTime.toLocaleString()} (in ~${minutes} minutes).`);
    } else {
        // If not a rate limit error, throw a generic error
        throw new Error(`GitHub API error: ${response.status}`);
    }
}