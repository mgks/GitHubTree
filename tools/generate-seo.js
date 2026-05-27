import fs from 'fs';
import path from 'path';

const CSV_PATH = './_data/repositories.csv';
const TEMPLATE_PATH = './packages/web/dist/index.html';
const DIST_DIR = './packages/web/dist';
const BASE_URL = 'https://githubtree.mgks.dev';

const langColors = {
    'javascript': '#f1e05a',
    'typescript': '#3178c6',
    'python': '#3572a5',
    'html': '#e34c26',
    'css': '#563d7c',
    'go': '#00add8',
    'rust': '#dea584',
    'c++': '#f34b7d',
    'java': '#b07219',
    'ruby': '#701516',
    'php': '#4f5d95',
    'shell': '#89e051',
    'swift': '#f05138',
    'c#': '#178600',
    'dart': '#00b4ab',
    'kotlin': '#a97bff',
    'vue': '#41b883',
    'c': '#555555',
    'objective-c': '#438eff',
    'scala': '#c22d40'
};
const getLangColor = (lang) => langColors[lang?.toLowerCase()] || '#8b949e';
const getLangClass = (lang) => 'lang-' + (lang?.toLowerCase()?.replace(/c#/, 'cs')?.replace(/c\+\+/, 'cpp')?.replace(/\s+/g, '-') || 'other');

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
        `<a href="/language/${l.toLowerCase().replace(/\s+/g, '-')}/" class="lang-card" style="--lang-color: ${getLangColor(l)}">
            <span class="lc-name">${l}</span>
            <span class="lc-count">${languagesMap[l].length} repos</span>
         </a>`
    ).join('');

    // Shuffled repos or fallback to random
    let displayRepos = [];
    const shuffledPath = path.resolve('_data/featured-shuffled.json');
    if (fs.existsSync(shuffledPath)) {
        try {
            displayRepos = JSON.parse(fs.readFileSync(shuffledPath, 'utf8'));
        } catch (e) {
            displayRepos = [...repos].sort(() => 0.5 - Math.random()).slice(0, 24);
        }
    } else {
        displayRepos = [...repos].sort(() => 0.5 - Math.random()).slice(0, 24);
    }

    const repoCloudHtml = displayRepos.map(r => 
        `<div class="mini-repo-card" data-repo="${r.repo}">
            <div class="mrc-header">
                <span class="mrc-title">${r.repo}</span>
                <span class="mrc-lang">${r.language} <i class="fas fa-circle mrc-lang-dot ${getLangClass(r.language)}"></i></span>
            </div>
            <p class="mrc-desc">${r.description || 'No description available.'}</p>
         </div>`
    ).join('');

    // Load Trending Project
    let highlightedHtml = '';
    const highlightedPath = path.resolve('_data/highlighted.json');
    let highlighted = null;
    if (fs.existsSync(highlightedPath)) {
        try {
            highlighted = JSON.parse(fs.readFileSync(highlightedPath, 'utf8'));
        } catch(e) {}
    }
    if (!highlighted) {
        highlighted = {
            repo: 'mgks/GitHubTree',
            stars: 120,
            forks: 45,
            description: 'Visualise any GitHub repository folder structure. Available as a web app, CLI tool, and node.js library.',
            language: 'JavaScript',
            branch: 'main'
        };
    }
    highlightedHtml = `
        <div class="trending-repo-card" style="--lang-color: ${getLangColor(highlighted.language)}">
            <div class="tp-badge"><i class="fas fa-fire"></i> Trending Repo</div>
            <div class="tp-content">
                <h4 class="tp-title">${highlighted.repo}</h4>
                <p class="tp-desc">${highlighted.description}</p>
                <div class="tp-meta">
                    <span class="tp-meta-item"><i class="fas fa-circle tp-lang-dot ${getLangClass(highlighted.language)}"></i> ${highlighted.language}</span>
                    <span class="tp-meta-item"><i class="far fa-star"></i> ${highlighted.stars} stars</span>
                    <span class="tp-meta-item"><i class="fas fa-code-branch"></i> ${highlighted.forks} forks</span>
                </div>
            </div>
            <button class="tp-explore-btn" data-repo="${highlighted.repo}"><i class="fas fa-eye"></i> Explore Structure</button>
        </div>`;

    const homeHtml = templateHtml
        .replace('<div id="langCloud" class="language-grid"></div>', `<div id="langCloud" class="language-grid">${langCloudHtml}</div>`)
        .replace('<div id="recentCloud" class="featured-grid"></div>', `<div id="recentCloud" class="featured-grid">${repoCloudHtml}</div>`)
        .replace('<!-- HIGHLIGHTED_PROJECT_INJECT -->', highlightedHtml)
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
    // 6. GENERATE LANGUAGE PAGES WITH PAGINATION (60 ITEMS/PAGE)
    // ============================================================
    console.log(`Generating ${Object.keys(languagesMap).length} Language Pages...`);
    const ITEMS_PER_PAGE = 60;
    
    Object.entries(languagesMap).forEach(([lang, list]) => {
        const langSlug = lang.toLowerCase().replace(/\s+/g, '-');
        const totalPages = Math.ceil(list.length / ITEMS_PER_PAGE);

        for (let page = 1; page <= totalPages; page++) {
            const chunk = list.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
            
            const pagePath = page === 1 ? langSlug : path.join(langSlug, String(page));
            const outputDir = path.join(DIST_DIR, 'language', pagePath);
            ensureDir(outputDir);

            const listHtml = chunk.map(r => `
                <a href="/repo/${r.repo}/${r.branch}/" class="mini-repo-card" style="text-decoration: none;">
                    <div class="mrc-header">
                        <span class="mrc-title">${r.repo}</span>
                        <span class="mrc-lang">${r.language} <i class="fas fa-circle mrc-lang-dot ${getLangClass(r.language)}"></i></span>
                    </div>
                    <p class="mrc-desc">${r.description || 'No description available.'}</p>
                </a>`).join('');

            let paginationHtml = '';
            if (totalPages > 1) {
                const prevUrl = page === 2 ? `/language/${langSlug}/` : `/language/${langSlug}/${page - 1}/`;
                const nextUrl = `/language/${langSlug}/${page + 1}/`;

                paginationHtml = `
                    <div class="pagination-container">
                        <a href="${prevUrl}" class="pagination-btn ${page === 1 ? 'disabled' : ''}">← Previous</a>
                        <span class="pagination-info">Page ${page} of ${totalPages}</span>
                        <a href="${nextUrl}" class="pagination-btn ${page === totalPages ? 'disabled' : ''}">Next →</a>
                    </div>`;
            }

            const pageTitle = page === 1 
                ? `Best ${lang} Repositories Directory | GitHubTree` 
                : `Best ${lang} Repositories Directory - Page ${page} | GitHubTree`;

            const pageDesc = page === 1
                ? `Browse the ultimate collection of best ${lang} repositories. Explore directory structures and files instantly without cloning.`
                : `Browse the ultimate collection of best ${lang} repositories - Page ${page}. Explore directory structures and files instantly without cloning.`;

            const pageUrl = page === 1 ? `/language/${langSlug}/` : `/language/${langSlug}/${page}/`;
            const canonicalUrl = `${BASE_URL}${pageUrl}`;

            let seoHeadTags = `<link rel="canonical" href="${canonicalUrl}">`;
            if (page > 1) {
                const prevAbsoluteUrl = page === 2 ? `${BASE_URL}/language/${langSlug}/` : `${BASE_URL}/language/${langSlug}/${page - 1}/`;
                seoHeadTags += `\n    <link rel="prev" href="${prevAbsoluteUrl}">`;
            }
            if (page < totalPages) {
                seoHeadTags += `\n    <link rel="next" href="${BASE_URL}/language/${langSlug}/${page + 1}/">`;
            }
            seoHeadTags += '\n</head>';

            const langPageHtml = templateHtml
                .replace(/<title>.*?<\/title>/, `<title>${pageTitle}</title>`)
                .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${pageDesc}">`)
                
                // Open Graph / Facebook
                .replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${pageTitle}">`)
                .replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${pageDesc}">`)
                .replace(/<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${BASE_URL}${pageUrl}">`)

                // Twitter
                .replace(/<meta property="twitter:title" content=".*?">/, `<meta property="twitter:title" content="${pageTitle}">`)
                .replace(/<meta property="twitter:description" content=".*?">/, `<meta property="twitter:description" content="${pageDesc}">`)
                .replace(/<meta property="twitter:url" content=".*?">/, `<meta property="twitter:url" content="${BASE_URL}${pageUrl}">`)

                .replace('<!-- BREADCRUMB_INJECT -->', '') 
                .replace(
                /<!-- EMPTY_STATE_START -->[\s\S]*?<!-- EMPTY_STATE_END -->/, 
                `<div class="language-listing">
                    <h1>${lang} Repositories</h1>
                    <div class="featured-grid">${listHtml}</div>
                    ${paginationHtml}
                    <div class="back-link-container">
                        <a href="/" class="repo-tag">← Back to Search</a>
                    </div>
                 </div>`
                )
                .replace('class="empty-state"', 'class="language-page"')
                .replace('</head>', seoHeadTags);

            fs.writeFileSync(path.join(outputDir, 'index.html'), langPageHtml);
            sitemapUrls.push(`${BASE_URL}${pageUrl}`);
        }
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