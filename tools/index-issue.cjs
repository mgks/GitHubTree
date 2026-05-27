const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function run() {
    const title = process.env.ISSUE_TITLE || '';
    const issueNum = process.env.ISSUE_NUMBER;
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        console.error("Missing GITHUB_TOKEN");
        process.exit(1);
    }

    // Extract repo path: e.g. "Feature Request: owner/repo", "Index Request: owner/repo", or "Feature Repo: owner/repo"
    const cleanedTitle = title.replace(/^(Feature Request:|Index Request:|Feature Repo:)/i, '').trim();
    const repoMatch = cleanedTitle.match(/^([a-zA-Z0-9-._]+)\/([a-zA-Z0-9-._]+)$/);

    if (!repoMatch) {
        await commentAndClose(issueNum, token, `❌ **Error:** Invalid repository format. Please ensure the issue title is exactly in the format \`Feature Repo: owner/repo\`.`);
        return;
    }

    const repo = repoMatch[0];

    try {
        // Fetch repository info from GitHub REST API
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'GitHubTree-Indexer'
            }
        });

        if (!res.ok) {
            await commentAndClose(issueNum, token, `❌ **Error:** Could not verify repository \`${repo}\`. Please ensure it is a public repository and the spelling is correct.`);
            return;
        }

        const data = await res.json();
        const branch = data.default_branch || 'main';
        const language = data.language || 'Other';
        const rawDesc = data.description || 'No description available.';
        
        // Clean description for CSV formatting
        const description = rawDesc.replace(/"/g, '""');

        const csvPath = path.resolve('_data/repositories.csv');
        let csvContent = fs.readFileSync(csvPath, 'utf8');

        // Check for duplicates
        const lines = csvContent.split('\n');
        const exists = lines.some(line => {
            const parts = line.split(',');
            return parts[0] && parts[0].trim().toLowerCase() === repo.toLowerCase();
        });

        if (exists) {
            await commentAndClose(
                issueNum, 
                token, 
                `ℹ️ **Note:** \`${repo}\` is already indexed! \n\n🚀 **Explore Live:** [https://githubtree.mgks.dev/repo/${repo}/${branch}/](https://githubtree.mgks.dev/repo/${repo}/${branch}/)`
            );
            return;
        }

        // Append to CSV
        const newRow = `${repo},${branch},${language},"${description}"`;
        if (!csvContent.endsWith('\n')) {
            csvContent += '\n';
        }
        fs.writeFileSync(csvPath, csvContent + newRow + '\n');

        // Commit and Push
        execSync('git config --global user.name "github-actions[bot]"');
        execSync('git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"');
        execSync(`git add _data/repositories.csv`);
        execSync(`git commit -m "feat(database): index and feature ${repo} via request #${issueNum}"`);
        execSync('git push origin main');

        await commentAndClose(
            issueNum, 
            token, 
            `🎉 **Congratulations!** \n\n\`${repo}\` has been successfully indexed and featured on the homepage of **GitHubTree**!\n\n🚀 **Explore Live:** [https://githubtree.mgks.dev/repo/${repo}/${branch}/](https://githubtree.mgks.dev/repo/${repo}/${branch}/) *(Live in ~1-2 minutes)*`
        );

    } catch (err) {
        console.error(err);
        await commentAndClose(issueNum, token, `❌ **Error:** An unexpected error occurred while processing the request: ${err.message}`);
    }
}

async function commentAndClose(issueNum, token, message) {
    const repoOwner = process.env.GITHUB_REPOSITORY; // e.g. "mgks/GitHubTree"
    
    // Add comment
    await fetch(`https://api.github.com/repos/${repoOwner}/issues/${issueNum}/comments`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'GitHubTree-Indexer',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: message })
    });

    // Close issue
    await fetch(`https://api.github.com/repos/${repoOwner}/issues/${issueNum}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'GitHubTree-Indexer',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state: 'closed' })
    });
}

run();