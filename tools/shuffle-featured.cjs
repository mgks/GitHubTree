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
            branch: branch?.trim() || 'main',
            language: language?.trim() || 'Other',
            description: description?.trim() || ''
        };
    }).filter(item => item && item.repo);
}

async function triggerDeploy(token) {
    try {
        const res = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'GitHubTree-Shuffler',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ref: 'main' })
            }
        );
        if (res.status === 204) {
            console.log('✅ Deploy workflow triggered.');
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

    // Trending: pick randomly from the last 10 most recently added repos
    const recentPool = repos.slice(-10);
    const highlightedBase = recentPool[Math.floor(Math.random() * recentPool.length)];

    const highlighted = {
        repo: highlightedBase.repo,
        branch: highlightedBase.branch,
        language: highlightedBase.language,
        description: highlightedBase.description || 'A featured project on GitHubTree.',
        stars: 0,
        forks: 0
    };

    // Optionally enrich with GitHub API data if token is available
    if (token) {
        try {
            const res = await fetch(`https://api.github.com/repos/${highlighted.repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'GitHubTree-Shuffler'
                }
            });
            if (res.ok) {
                const data = await res.json();
                highlighted.stars = data.stargazers_count || 0;
                highlighted.forks = data.forks_count || 0;
                highlighted.description = data.description || highlighted.description;
                highlighted.language = data.language || highlighted.language;
            }
        } catch (e) {
            console.warn('⚠️ Could not enrich trending repo with API data:', e.message);
        }
    }

    console.log(`Trending pick: ${highlighted.repo} (${highlighted.language})`);

    const dataDir = path.resolve('_data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    // Featured grid: shuffle ALL repos except the highlighted one, pick 24
    const rest = repos.filter(r => r.repo !== highlighted.repo);
    const shuffled = [...rest].sort(() => 0.5 - Math.random()).slice(0, 24);

    console.log('Saving 24 shuffled featured repositories.');

    // Configure git and pull BEFORE writing any files
    try {
        execSync('git config --global user.name "github-actions[bot]"');
        execSync('git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"');
        execSync('git pull --rebase origin main');
    } catch (err) {
        console.error('Git setup/pull failed:', err.message);
        process.exit(1);
    }

    fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(highlighted, null, 2));
    fs.writeFileSync(path.join(dataDir, 'featured-shuffled.json'), JSON.stringify(shuffled, null, 2));

    // Commit and push
    try {
        execSync('git add _data/highlighted.json _data/featured-shuffled.json');

        const status = execSync('git status --porcelain').toString();
        if (status.trim()) {
            execSync(`git commit -m "chore: refresh featured — trending: ${highlighted.repo}"`);
            execSync('git push origin main');
            console.log('Committed and pushed.');
        } else {
            // Guarantee a diff so deploy always fires
            const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'highlighted.json'), 'utf8'));
            data._updated = new Date().toISOString();
            fs.writeFileSync(path.join(dataDir, 'highlighted.json'), JSON.stringify(data, null, 2));
            execSync('git add _data/highlighted.json');
            execSync(`git commit -m "chore: refresh featured timestamp — ${new Date().toISOString()}"`);
            execSync('git push origin main');
            console.log('Pushed timestamp refresh.');
        }

        if (token) await triggerDeploy(token);

    } catch (err) {
        console.error('Git operation failed:', err.message);
        process.exit(1);
    }
}

run();