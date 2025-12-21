import fs from 'fs';
import path from 'path';

const REPO_DATA = './_data/repositories.json';
const TEMPLATE = './packages/web/dist/index.html';
const DIST_DIR = './packages/web/dist';
const SITEMAP_PATH = path.join(DIST_DIR, 'sitemap.xml');
const BASE_URL = 'https://githubtree.mgks.dev';

console.log('🚀 Starting SEO Generation...');

// 1. Read Data
const repos = JSON.parse(fs.readFileSync(REPO_DATA, 'utf8'));
const templateHtml = fs.readFileSync(TEMPLATE, 'utf8');

const sitemapUrls = [];

// 2. Loop & Generate Pages
repos.forEach(item => {
    const [user, repoName] = item.repo.split('/');
    const branch = item.branch || 'main';
    const cleanPath = `repo/${user}/${repoName}/${branch}`;
    const outputDir = path.join(DIST_DIR, cleanPath);
    
    // Ensure directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // --- SEO DATA PREPARATION ---
    const title = `${item.repo} File Structure | GitHubTree`;
    const desc = item.description 
        ? `Explore the ${item.repo} repository structure. ${item.description}` 
        : `Visualize the file structure of ${item.repo} on GitHub without cloning.`;
    const url = `${BASE_URL}/${cleanPath}/`;
    const image = `${BASE_URL}/images/preview.png`; // Or dynamic social image if you have one

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareSourceCode",
        "name": item.repo,
        "codeRepository": `https://github.com/${item.repo}`,
        "description": desc,
        "author": { "@type": "Person", "name": user },
        "programmingLanguage": "Open Source"
    };

    // --- INJECTION MAGIC ---
    // We use Regex to globally replace the default tags with specific ones
    let pageHtml = templateHtml
        // 1. Title & Description
        .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
        .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${desc}">`)
        
        // 2. Open Graph
        .replace(/<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${url}">`)
        .replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${title}">`)
        .replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${desc}">`)
        
        // 3. Twitter
        .replace(/<meta property="twitter:url" content=".*?">/, `<meta property="twitter:url" content="${url}">`)
        .replace(/<meta property="twitter:title" content=".*?">/, `<meta property="twitter:title" content="${title}">`)
        .replace(/<meta property="twitter:description" content=".*?">/, `<meta property="twitter:description" content="${desc}">`)

        // 4. Canonical & JSON-LD
        .replace('</head>', `<link rel="canonical" href="${url}">\n<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n</head>`)
        
        // 5. Pre-fill Inputs (For JS)
        .replace('id="repoInput" placeholder="username/repo"', `id="repoInput" value="${item.repo}"`)
        .replace('id="branchInput" placeholder="main"', `id="branchInput" value="${branch}"`);

    fs.writeFileSync(path.join(outputDir, 'index.html'), pageHtml);
    
    // Add to sitemap
    sitemapUrls.push({
        loc: url,
        changefreq: 'weekly',
        priority: 0.8
    });
});

// 3. Generate Sitemap XML
const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${BASE_URL}/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    ${sitemapUrls.map(u => `
    <url>
        <loc>${u.loc}</loc>
        <changefreq>${u.changefreq}</changefreq>
        <priority>${u.priority}</priority>
    </url>`).join('')}
</urlset>`;

fs.writeFileSync(SITEMAP_PATH, sitemapContent);

console.log(`✅ Generated ${repos.length} SEO pages and sitemap.xml`);