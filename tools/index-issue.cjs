const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_OWNER = process.env.GITHUB_REPOSITORY; // e.g. "mgks/GitHubTree"
const token = process.env.GITHUB_TOKEN;
const VALID_PREFIXES = ['Feature Repo:', 'Feature Request:', 'Index Request:'];

async function ghFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'GitHubTree-Indexer',
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    return res;
}

async function getOpenFeatureIssues() {
    let issues = [];
    let page = 1;
    while (true) {
        const res = await ghFetch(
            `https://api.github.com/repos/${REPO_OWNER}/issues?state=open&per_page=100&page=${page}`
        );
        if (!res.ok) break;
        const batch = await res.json();
        if (!batch.length) break;
        // Filter only issues (not PRs) with matching prefix
        const matching = batch.filter(i =>
            !i.pull_request &&
            VALID_PREFIXES.some(prefix => i.title.startsWith(prefix))
        );
        issues = issues.concat(matching);
        if (batch.length < 100) break;
        page++;
    }
    return issues;
}

async function addComment(issueNum, message) {
    await ghFetch(`https://api.github.com/repos/${REPO_OWNER}/issues/${issueNum}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: message })
    });
}

async function closeIssue(issueNum) {
    await ghFetch(`https://api.github.com/repos/${REPO_OWNER}/issues/${issueNum}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' })
    });
}

async function processIssue(issue) {
    const issueNum = issue.number;
    const title = issue.title;

    console.log(`\n→ Processing issue #${issueNum}: ${title}`);

    const cleanedTitle = title.replace(/^(Feature Repo:|Feature Request:|Index Request:)/i, '').trim();
    const repoMatch = cleanedTitle.match(/^([a-zA-Z0-9-._]+)\/([a-zA-Z0-9-._]+)$/);

    if (!repoMatch) {
        console.log(`  ✗ Invalid format — leaving open with comment`);
        await addComment(issueNum,
            `❌ **Invalid format.** Please ensure the issue title is exactly:\n\`\`\`\nFeature Repo: owner/repo\n\`\`\`\nThe repository was not indexed. Please edit the issue title and we'll pick it up on the next run.`
        );
        return; // Do NOT close — leave open for user to fix
    }

    const repo = repoMatch[0];

    try {
        const res = await ghFetch(`https://api.github.com/repos/${repo}`);

        if (!res.ok) {
            console.log(`  ✗ Repo not found or private — leaving open with comment`);
            await addComment(issueNum,
                `❌ **Repository not found.** Could not verify \`${repo}\`. Please make sure:\n- The spelling is correct\n- The repository is **public**\n\nWe'll retry on the next run once you've corrected the issue title.`
            );
            return; // Do NOT close — leave open for user to fix
        }

        const data = await res.json();
        const branch = data.default_branch || 'main';
        const language = data.language || 'Other';
        const rawDesc = data.description || 'No description available.';
        const description = rawDesc.replace(/"/g, '""');

        const csvPath = path.resolve('_data/repositories.csv');
        let csvContent = fs.readFileSync(csvPath, 'utf8');

        const lines = csvContent.split('\n');
        const exists = lines.some(line => {
            const parts = line.split(',');
            return parts[0] && parts[0].trim().toLowerCase() === repo.toLowerCase();
        });

        if (exists) {
            console.log(`  ℹ Already indexed — closing`);
            await addComment(issueNum,
                `ℹ️ **Already indexed!** \`${repo}\` is already in the GitHubTree directory.\n\n🚀 **Explore:** [https://githubtree.mgks.dev/repo/${repo}/${branch}/](https://githubtree.mgks.dev/repo/${repo}/${branch}/)`
            );
            await closeIssue(issueNum);
            return;
        }

        // Append to CSV
        const newRow = `${repo},${branch},${language},"${description}"`;
        if (!csvContent.endsWith('\n')) csvContent += '\n';
        fs.writeFileSync(csvPath, csvContent + newRow + '\n');

        execSync('git add _data/repositories.csv');
        execSync(`git commit -m "feat(database): index ${repo} via issue #${issueNum}"`);
        execSync('git push origin main');

        console.log(`  ✓ Indexed and pushed — closing`);
        await addComment(issueNum,
            `🎉 **Congratulations!** \`${repo}\` has been successfully indexed and featured on **GitHubTree**!\n\n🚀 **Explore Live:** [https://githubtree.mgks.dev/repo/${repo}/${branch}/](https://githubtree.mgks.dev/repo/${repo}/${branch}/) *(Live in ~1-2 minutes after next deploy)*`
        );
        await closeIssue(issueNum);

    } catch (err) {
        console.error(`  ✗ Unexpected error:`, err.message);
        await addComment(issueNum,
            `⚠️ **Temporary error** while processing \`${repo}\`. The issue has been left open and will be retried automatically on the next run.\n\n*Error: ${err.message}*`
        );
        // Do NOT close — leave open so it retries next cycle
    }
}

async function run() {
    if (!token) {
        console.error('Missing GITHUB_TOKEN');
        process.exit(1);
    }

    console.log('Fetching open Feature Repo issues...');
    const issues = await getOpenFeatureIssues();
    console.log(`Found ${issues.length} issue(s) to process.`);

    if (!issues.length) {
        console.log('Nothing to do.');
        return;
    }

    // Configure git and pull once before any file changes
    execSync('git config --global user.name "github-actions[bot]"');
    execSync('git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    execSync('git pull --rebase origin main');

    for (const issue of issues) {
        await processIssue(issue);
    }

    console.log('\nDone.');
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});