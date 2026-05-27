const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

async function run() {
    const token = process.env.GITHUB_TOKEN;
    const csvPath = path.resolve('_data/repositories.csv');
    if (!fs.existsSync(csvPath)) {
        console.error("repositories.csv not found");
        process.exit(1);
    }

    const repos = parseCSV(fs.readFileSync(csvPath, 'utf8'));
    if (repos.length === 0) {
        console.error("No repositories found in CSV");
        process.exit(0);
    }

    console.log(`Loaded ${repos.length} repositories from CSV.`);

    // Get the last 30 repositories
    const recentRepos = repos.slice(-30);

    if (!token) {
        console.warn("⚠️ Warning: GITHUB_TOKEN is missing. Shuffling repositories without API calls and picking a random recent one as highlighted.");
        const mockDetailsList = recentRepos.map(r => ({
            repo: r.repo,
            stars: Math.floor(Math.random() * 500) + 10,
            forks: Math.floor(Math.random() * 100) + 2,
            description: r.description || 'A featured project on GitHubTree.',
            language: r.language || 'Other',
            branch: r.branch || 'main'
        }));
        
        const randomIndex = Math.floor(Math.random() * mockDetailsList.length);
        const highlightedRepo = mockDetailsList[randomIndex];
        console.log(`Selected mock highlighted repo: ${highlightedRepo.repo}`);
        
        const dataDir = path.resolve('_data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
        fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(highlightedRepo, null, 2));

        const filteredRepos = repos.filter(r => r.repo !== highlightedRepo.repo);
        const shuffled = [...filteredRepos].sort(() => 0.5 - Math.random());
        const selectedFeatured = shuffled.slice(0, 24);
        fs.writeFileSync(path.join(dataDir, 'featured-shuffled.json'), JSON.stringify(selectedFeatured, null, 2));
        console.log(`Saved 24 shuffled featured repositories (offline mode).`);
        return;
    }
    console.log(`Fetching metadata for ${recentRepos.length} recent repositories...`);

    const repoDetailsList = [];
    for (const r of recentRepos) {
        const details = await fetchRepoData(r.repo, token);
        if (details) {
            repoDetailsList.push(details);
        }
        // Small delay to prevent hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (repoDetailsList.length === 0) {
        console.error("Failed to fetch details for any recent repositories.");
        process.exit(1);
    }

    // Sort by stars descending to identify trending
    const sorted = [...repoDetailsList].sort((a, b) => b.stars - a.stars);
    
    // Pick one from the top 5 trending (or fewer if we have less)
    const poolSize = Math.min(5, sorted.length);
    const randomIndex = Math.floor(Math.random() * poolSize);
    const highlightedRepo = sorted[randomIndex];

    console.log(`Selected highlighted repo: ${highlightedRepo.repo} (${highlightedRepo.stars} stars)`);

    // Write highlighted JSON
    const dataDir = path.resolve('_data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }
    fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(highlightedRepo, null, 2));

    // Shuffle the rest of the database for featured repos list
    const filteredRepos = repos.filter(r => r.repo !== highlightedRepo.repo);
    const shuffled = [...filteredRepos].sort(() => 0.5 - Math.random());
    const selectedFeatured = shuffled.slice(0, 24);

    // Save shuffled featured list
    fs.writeFileSync(path.join(dataDir, 'featured-shuffled.json'), JSON.stringify(selectedFeatured, null, 2));
    console.log(`Saved 24 shuffled featured repositories.`);

    // Commit changes
    try {
        execSync('git config --global user.name "github-actions[bot]"');
        execSync('git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"');
        execSync('git add _data/highlighted.json _data/featured-shuffled.json');
        
        const status = execSync('git status --porcelain').toString();
        if (status.trim()) {
            execSync('git commit -m "chore: shuffle featured repositories and update highlighted project of the day"');
            execSync('git push origin main');
            console.log("Successfully committed and pushed shuffled files.");
        } else {
            console.log("No changes detected in shuffled files.");
        }
    } catch (err) {
        console.error("Git commit/push failed:", err.message);
    }
}

run();
