const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GITHUB_REPO = process.env.GITHUB_REPOSITORY || 'mgks/GitHubTree';
const DEPLOY_WORKFLOW = 'deploy-app.yml';

function parseCSV(content) {
    const lines = content.split('\n');
    return lines.slice(1).map(line => {
        if (!line.trim()) return null;
        const parts = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        parts.push(cur);
        const [repo, branch, language, ...descParts] = parts;
        let description = descParts.join(',');
        if (description.startsWith('"') && description.endsWith('"')) {
            description = description.slice(1, -1);
        }
        return {
            repo: repo?.trim(),
            branch: branch?.trim(),
            language: language?.trim() || 'Other',
            description: description?.trim() || ''
        };
    }).filter(item => item && item.repo);
}

async function fetchRepoData(repo, token) {
    try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'GitHubTree-Shuffler'
            }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            repo,
            stars: data.stargazers_count || 0,
            forks: data.forks_count || 0,
            description: data.description || 'No description available.',
            language: data.language || 'Other',
            branch: data.default_branch || 'main'
        };
    } catch (e) {
        return null;
    }
}

async function triggerDeploy(token) {
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'GitHubTree-Shuffler',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ref: 'main' })
        });
        if (res.status === 204) {
            console.log('✅ Deploy workflow triggered via dispatch.');
        } else {
            console.warn(`⚠️ Deploy dispatch returned status ${res.status}`);
        }
    } catch (e) {
        console.warn('⚠️ Could not trigger deploy workflow:', e.message);
    }
}

async function run() {
    const token = process.env.GITHUB_TOKEN;
    const csvPath = path.resolve('_data/repositories.csv');
    if (!fs.existsSync(csvPath)) {
        console.error('repositories.csv not found');
        process.exit(1);
    }

    const repos = parseCSV(fs.readFileSync(csvPath, 'utf8'));
    if (repos.length === 0) {
        console.error('No repositories found in CSV');
        process.exit(0);
    }

    console.log(`Loaded ${repos.length} repositories from CSV.`);

    // Sample pool for trending: last 60 (recently added) + 40 random from the full list
    const recentSlice = repos.slice(-60);
    const olderPool = repos.slice(0, -60);
    const randomOlder = [...olderPool].sort(() => 0.5 - Math.random()).slice(0, 40);
    const candidatePool = [...new Map([...recentSlice, ...randomOlder].map(r => [r.repo, r])).values()];

    if (!token) {
        console.warn('⚠️ GITHUB_TOKEN missing — offline mode, using mock data.');
        const mockList = candidatePool.map(r => ({
            repo: r.repo,
            stars: Math.floor(Math.random() * 500) + 10,
            forks: Math.floor(Math.random() * 100) + 2,
            description: r.description || 'A featured project on GitHubTree.',
            language: r.language || 'Other',
            branch: r.branch || 'main'
        }));
        const highlighted = mockList[Math.floor(Math.random() * mockList.length)];
        const dataDir = path.resolve('_data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
        fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(highlighted, null, 2));
        const shuffled = [...repos.filter(r => r.repo !== highlighted.repo)].sort(() => 0.5 - Math.random()).slice(0, 24);
        fs.writeFileSync(path.join(dataDir, 'featured-shuffled.json'), JSON.stringify(shuffled, null, 2));
        console.log('Offline mode: saved mock data.');
        return;
    }

    console.log(`Fetching metadata for ${candidatePool.length} candidate repositories...`);

    const repoDetailsList = [];
    for (const r of candidatePool) {
        const details = await fetchRepoData(r.repo, token);
        if (details) repoDetailsList.push(details);
        await new Promise(resolve => setTimeout(resolve, 80));
    }

    if (repoDetailsList.length === 0) {
        console.error('Failed to fetch details for any repositories.');
        process.exit(1);
    }

    // Sort by stars descending — pick randomly from top 10 as trending
    const sorted = [...repoDetailsList].sort((a, b) => b.stars - a.stars);
    const poolSize = Math.min(10, sorted.length);
    // Weight towards higher stars: pick from top 10 with slight bias
    const randomIndex = Math.floor(Math.random() * poolSize);
    const highlightedRepo = sorted[randomIndex];

    console.log(`Trending pick: ${highlightedRepo.repo} (${highlightedRepo.stars} ⭐)`);

    const dataDir = path.resolve('_data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(highlightedRepo, null, 2));

    // Shuffle ALL repos (except highlighted) for the featured grid
    const filteredRepos = repos.filter(r => r.repo !== highlightedRepo.repo);
    const shuffled = [...filteredRepos].sort(() => 0.5 - Math.random());
    const selectedFeatured = shuffled.slice(0, 24);
    fs.writeFileSync(path.join(dataDir, 'featured-shuffled.json'), JSON.stringify(selectedFeatured, null, 2));
    console.log('Saved 24 shuffled featured repositories.');

    // Commit and push
    try {
        execSync('git config --global user.name "github-actions[bot]"');
        execSync('git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"');
        execSync('git pull --rebase origin main');
        execSync('git add _data/highlighted.json _data/featured-shuffled.json');

        const status = execSync('git status --porcelain').toString();
        if (status.trim()) {
            execSync(`git commit -m "chore: shuffle featured repos — trending: ${highlightedRepo.repo}"`);
            execSync('git push origin main');
            console.log('Committed and pushed changes.');
        } else {
            console.log('No changes in data files — forcing re-stamp for deploy trigger.');
            // Write a timestamp into highlighted to guarantee a diff
            const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'highlighted.json'), 'utf8'));
            data._updated = new Date().toISOString();
            fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(data, null, 2));
            execSync('git add _data/highlighted.json');
            execSync(`git commit -m "chore: refresh featured data timestamp — ${new Date().toISOString()}"`);
            execSync('git push origin main');
            console.log('Pushed timestamp refresh commit.');
        }

        // Explicitly trigger deploy-app since bot pushes don't fire push-triggered workflows
        await triggerDeploy(token);

    } catch (err) {
        console.error('Git operation failed:', err.message);
        process.exit(1);
    }
}

run();
