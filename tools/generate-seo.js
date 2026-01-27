import fs from 'fs';
import path from 'path';

const CSV_PATH = './_data/repositories.csv';
const TEMPLATE_PATH = './packages/web/dist/index.html';
const DIST_DIR = './packages/web/dist';
const BASE_URL = 'https://githubtree.mgks.dev';

// --- HELPER: Smart CSV Parser ---
function parseCSV(data) {
    const lines = data.split('\n').filter(l => l.trim().includes(','));
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/; // Splits by comma, ignoring those inside quotes

    return lines.slice(1).map(line => {
        const [repo, branch, language, description] = line.split(regex);
        return {
            repo: repo?.trim(),
            branch: branch?.trim(),
            language: language?.trim() || 'Other',
            description: description ? description.replace(/^"|"$/g, '').replace(/""/g, '"') : ""
        };
    });
}

// --- HELPER: Ensure Directory Exists ---
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function generate() {
    console.time('🚀 Build Time');

    // 1. Load Data & Template
    if (!fs.existsSync(CSV_PATH)) throw new Error("CSV file not found!");
    const repos = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
    const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    const languagesMap = {};
    const sitemapUrls = [BASE_URL + '/'];

    // 2. Pre-calculate Language Stats & Grouping
    repos.forEach(r => {
        if (!languagesMap[r.language]) languagesMap[r.language] = [];
        languagesMap[r.language].push(r);
    });

    const topLanguages = Object.entries(languagesMap)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 20)
        .map(entry => entry[0]);

    // 3. GENERATE HOMEPAGE (index.html)
    console.log('Generating Homepage...');
    
    // Top Languages HTML
    const langCloudHtml = topLanguages.map(l => 
        `<a href="/language/${l.toLowerCase().replace(/\s+/g, '-')}/" class="repo-tag">${l}</a>`
    ).join('');

    // Recent Repos HTML
    const randomRepos = [...repos].sort(() => 0.5 - Math.random()).slice(0, 30);
    const repoCloudHtml = randomRepos.map(r => 
        `<button class="repo-tag" data-repo="${r.repo}"><span>${r.repo.split('/')[0]}/</span>${r.repo.split('/')[1]}</button>`
    ).join('');

    // Surgery on the HTML: Target the IDs directly
    let homeHtml = templateHtml
        .replace('<div id="langCloud" class="tag-cloud"></div>', `<div id="langCloud" class="tag-cloud">${langCloudHtml}</div>`)
        .replace('<div id="recentCloud" class="tag-cloud"></div>', `<div id="recentCloud" class="tag-cloud">${repoCloudHtml}</div>`);
    
    // Also update the Title for the homepage specifically
    homeHtml = homeHtml.replace(/<title>.*?<\/title>/, `<title>GitHubTree : Visualize GitHub Repository Structures</title>`);

    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), homeHtml);

    // 4. GENERATE REPO PAGES
    console.log(`Generating ${repos.length} Repo Pages...`);
    repos.forEach(item => {
        const [user, name] = item.repo.split('/');
        const cleanPath = `repo/${user}/${name}/${item.branch}`;
        const outputDir = path.join(DIST_DIR, cleanPath);
        ensureDir(outputDir);

        const langSlug = item.language.toLowerCase().replace(/\s+/g, '-');
        const breadcrumb = `<div class="seo-link">Explore more <a href="/language/${langSlug}/">${item.language}</a> repositories</div>`;
        
        const pageHtml = templateHtml
            .replace(/<title>.*?<\/title>/, `<title>${item.repo} Directory Structure | GitHubTree</title>`)
            .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="Explore ${item.repo} file structure. ${item.description}">`)
            .replace('id="repoInput" placeholder="username/repo"', `id="repoInput" value="${item.repo}"`)
            .replace('id="branchInput" placeholder="main"', `id="branchInput" value="${item.branch}"`)
            .replace('<!-- BREADCRUMB_INJECT -->', breadcrumb)
            .replace('</head>', `<link rel="canonical" href="${BASE_URL}/${cleanPath}/"></head>`);

        fs.writeFileSync(path.join(outputDir, 'index.html'), pageHtml);
        sitemapUrls.push(`${BASE_URL}/${cleanPath}/`);
    });

    // 5. GENERATE LANGUAGE PAGES
    console.log(`Generating ${Object.keys(languagesMap).length} Language Pages...`);
    Object.entries(languagesMap).forEach(([lang, list]) => {
        const langSlug = lang.toLowerCase().replace(/\s+/g, '-');
        const outputDir = path.join(DIST_DIR, 'language', langSlug);
        ensureDir(outputDir);

        const listHtml = list.map(r => `
            <div class="repo-card">
                <a href="/repo/${r.repo}/${r.branch}/">
                    <strong>${r.repo}</strong>
                    <p>${r.description || 'No description available.'}</p>
                </a>
            </div>`).join('');

        const langPageHtml = templateHtml
            .replace(/<title>.*?<\/title>/, `<title>Best ${lang} Repositories | GitHubTree</title>`)
            .replace(/<div id="emptyState"[\s\S]*?<\/div>/,
                `<div id="emptyState" class="language-page">
                    <div class="language-listing">
                        <h1>${lang} Repositories</h1>
                        <div class="repo-grid">${listHtml}</div>
                        <div class="back-link-container">
                            <a href="/" class="repo-tag">← Back to Search</a>
                        </div>
                    </div>
                </div>`
            )
            .replace('<!-- BREADCRUMB_INJECT -->', '');

        fs.writeFileSync(path.join(outputDir, 'index.html'), langPageHtml);
        sitemapUrls.push(`${BASE_URL}/language/${langSlug}/`);
    });

    // 6. GENERATE SITEMAP
    console.log('Generating Sitemap...');
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `  <url><loc>${url}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);

    console.timeEnd('🚀 Build Time');
    console.log(`✅ SEO Generation Complete. Total pages: ${sitemapUrls.length}`);
}

generate().catch(err => {
    console.error("❌ Build failed:", err);
    process.exit(1);
});