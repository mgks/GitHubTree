import fs from 'fs';
import path from 'path';

const CSV_PATH = './_data/repositories.csv';
const TEMPLATE_PATH = './packages/web/dist/index.html';
const DIST_DIR = './packages/web/dist';
const BASE_URL = 'https://githubtree.mgks.dev';

// --- HELPER: Smart CSV Parser ---
// Handles commas inside quotes and standardizes data
function parseCSV(data) {
    const lines = data.split('\n').filter(l => l.trim().length > 0);
    // Regex to split by comma ONLY if not inside quotes
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    // Skip header row
    return lines.slice(1).map(line => {
        const parts = line.split(regex);
        // Safety check for malformed lines
        if (parts.length < 3) return null; 

        const [repo, branch, language, description] = parts;
        return {
            repo: repo?.trim(),
            branch: branch?.trim(),
            language: language?.trim() || 'Other',
            description: description ? description.replace(/^"|"$/g, '').replace(/""/g, '"') : ""
        };
    }).filter(item => item !== null);
}

// --- HELPER: Ensure Directory Exists ---
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function generate() {
    console.time('🚀 Build Time');

    // 1. Load Data & Template
    if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV file not found at ${CSV_PATH}`);
    if (!fs.existsSync(TEMPLATE_PATH)) throw new Error(`Template not found at ${TEMPLATE_PATH}`);

    const repos = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
    const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    // 2. Empty State Block (to be replaced later)
    const emptyStateBlock = `<div id="emptyState" class="empty-state">
            <div class="home-hero">
                <h1>Explore GitHub Repositories Visually</h1>
                <p>Interactive tree views, size insights, file breakdowns, and shields badges for any public repository.</p>
            </div>

            <div class="homepage-section">
                <div class="section-header">
                    <h3>Featured Repositories</h3>
                    <a href="https://github.com/mgks/GitHubTree/issues/new?template=feature-request.md&title=Feature+Request:+owner/repo" target="_blank" class="section-cta">
                        <i class="fas fa-plus"></i> Feature Your Repo
                    </a>
                </div>
                <div id="recentCloud" class="tag-cloud"></div>
            </div>

            <div class="homepage-section">
                <h3>Browse by Language</h3>
                <div id="langCloud" class="tag-cloud"></div>
            </div>
        </div>`;

    // 3. Prepare Stats
    const languagesMap = {};
    const sitemapUrls = [BASE_URL + '/'];

    repos.forEach(r => {
        if (!languagesMap[r.language]) languagesMap[r.language] = [];
        languagesMap[r.language].push(r);
    });

    const topLanguages = Object.entries(languagesMap)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 20)
        .map(entry => entry[0]);

    // ============================================================
    // 4. GENERATE HOMEPAGE (index.html)
    // ============================================================
    console.log('Generating Homepage...');

    const langCloudHtml = topLanguages.map(l => 
        `<a href="/language/${l.toLowerCase().replace(/\s+/g, '-')}/" class="repo-tag">${l}</a>`
    ).join('');

    // Random 30 repos for homepage
    const randomRepos = [...repos].sort(() => 0.5 - Math.random()).slice(0, 30);
    const repoCloudHtml = randomRepos.map(r => 
        `<button class="repo-tag" data-repo="${r.repo}"><span>${r.repo.split('/')[0]}/</span>${r.repo.split('/')[1]}</button>`
    ).join('');

    const homeHtml = templateHtml
        .replace('<div id="langCloud" class="tag-cloud"></div>', `<div id="langCloud" class="tag-cloud">${langCloudHtml}</div>`)
        .replace('<div id="recentCloud" class="tag-cloud"></div>', `<div id="recentCloud" class="tag-cloud">${repoCloudHtml}</div>`)
        .replace('<!-- BREADCRUMB_INJECT -->', ''); // No breadcrumb on home

    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), homeHtml);

    // ============================================================
    // 5. GENERATE REPO PAGES
    // ============================================================
    console.log(`Generating ${repos.length} Repo Pages...`);
    
    repos.forEach(item => {
        const [user, name] = item.repo.split('/');
        const cleanPath = `repo/${user}/${name}/${item.branch}`;
        const outputDir = path.join(DIST_DIR, cleanPath);
        ensureDir(outputDir);

        const langSlug = item.language.toLowerCase().replace(/\s+/g, '-');
        
        // The Breadcrumb Link
        const breadcrumbHtml = `<div class="seo-link" style="text-align:center; margin: 20px 0;">
            Explore more <a href="/language/${langSlug}/" style="color:var(--accent); text-decoration:underline; font-weight:600;">${item.language}</a> repositories
        </div>`;

        const pageHtml = templateHtml
            .replace(/<title>.*?<\/title>/, `<title>${item.repo} File Structure Explorer | GitHubTree</title>`)
            .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="Explore the folder tree and file structure of ${item.repo} on branch ${item.branch}. ${item.description.substring(0, 150)}...">`)
            
            // Open Graph / Facebook
            .replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${item.repo} File Structure Explorer | GitHubTree">`)
            .replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="Explore the folder tree and file structure of ${item.repo} on branch ${item.branch}. ${item.description.substring(0, 150)}...">`)
            .replace(/<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${BASE_URL}/${cleanPath}/">`)

            // Twitter
            .replace(/<meta property="twitter:title" content=".*?">/, `<meta property="twitter:title" content="${item.repo} File Structure Explorer | GitHubTree">`)
            .replace(/<meta property="twitter:description" content=".*?">/, `<meta property="twitter:description" content="Explore the folder tree and file structure of ${item.repo} on branch ${item.branch}. ${item.description.substring(0, 150)}...">`)
            .replace(/<meta property="twitter:url" content=".*?">/, `<meta property="twitter:url" content="${BASE_URL}/${cleanPath}/">`)

            // Inject Breadcrumb
            .replace('<!-- BREADCRUMB_INJECT -->', breadcrumbHtml)
            
            // Hide the default Empty State (Quick Start) so it doesn't clutter the page
            .replace(emptyStateBlock, '<div id="emptyState" class="empty-state" style="display:none;"></div>')
            
            // Pre-fill inputs
            .replace('id="repoInput" placeholder="username/repo"', `id="repoInput" value="${item.repo}"`)
            .replace('id="branchInput" placeholder="main"', `id="branchInput" value="${item.branch}"`)
            
            // Canonical
            .replace('</head>', `<link rel="canonical" href="${BASE_URL}/${cleanPath}/"></head>`);

        fs.writeFileSync(path.join(outputDir, 'index.html'), pageHtml);
        sitemapUrls.push(`${BASE_URL}/${cleanPath}/`);
    });

    // ============================================================
    // 6. GENERATE LANGUAGE PAGES
    // ============================================================
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
            .replace(/<title>.*?<\/title>/, `<title>Best ${lang} Repositories Directory | GitHubTree</title>`)
            .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="Browse the ultimate collection of best ${lang} repositories. Explore directory structures and files instantly without cloning.">`)
            
            // Open Graph / Facebook
            .replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="Best ${lang} Repositories Directory | GitHubTree">`)
            .replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="Browse the ultimate collection of best ${lang} repositories. Explore directory structures and files instantly without cloning.">`)
            .replace(/<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${BASE_URL}/language/${langSlug}/">`)

            // Twitter
            .replace(/<meta property="twitter:title" content=".*?">/, `<meta property="twitter:title" content="Best ${lang} Repositories Directory | GitHubTree">`)
            .replace(/<meta property="twitter:description" content=".*?">/, `<meta property="twitter:description" content="Browse the ultimate collection of best ${lang} repositories. Explore directory structures and files instantly without cloning.">`)
            .replace(/<meta property="twitter:url" content=".*?">/, `<meta property="twitter:url" content="${BASE_URL}/language/${langSlug}/">`)

            .replace('<!-- BREADCRUMB_INJECT -->', '') 
            .replace(
            /<!-- EMPTY_STATE_START -->[\s\S]*?<!-- EMPTY_STATE_END -->/, 
            `<div class="language-listing">
                <h1>${lang} Repositories</h1>
                <div class="repo-grid">${listHtml}</div>
                <div class="back-link-container">
                    <a href="/" class="repo-tag">← Back to Search</a>
                </div>
             </div>`
            )
            .replace('class="empty-state"', 'class="language-page"');

        fs.writeFileSync(path.join(outputDir, 'index.html'), langPageHtml);
        sitemapUrls.push(`${BASE_URL}/language/${langSlug}/`);
    });

    // ============================================================
    // 7. GENERATE SITEMAP
    // ============================================================
    console.log('Generating Sitemap...');
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `  <url><loc>${url}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;
    
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);

    // ============================================================
    // 8. GENERATE REPO LIST JSON FOR CLIENT-SIDE VERIFICATION
    // ============================================================
    const repoList = repos.map(r => r.repo);
    fs.writeFileSync(path.join(DIST_DIR, 'repos.json'), JSON.stringify(repoList));

    console.timeEnd('🚀 Build Time');
    console.log(`✅ SEO Generation Complete. Total pages: ${sitemapUrls.length}`);
}

generate().catch(err => {
    console.error("❌ Build failed:", err);
    process.exit(1);
});