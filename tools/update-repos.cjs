const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../_data/repositories.csv');

async function main() {
  // Read existing CSV
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
  
  const existingRepos = new Set();
  // skip header
  for (let i = 1; i < lines.length; i++) {
    // Assuming CSV columns: repo, branch, language, description
    // The first column is repo
    const firstComma = lines[i].indexOf(',');
    const repo = firstComma !== -1 ? lines[i].substring(0, firstComma) : lines[i];
    existingRepos.add(repo.toLowerCase().trim());
  }

  // Fetch trending repo (Optimized)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  
  const formatDate = (d) => d.toISOString().split('T')[0];
  
  const optimizedUrl = `https://api.github.com/search/repositories?q=created:>${formatDate(sevenDaysAgo)}+stars:>100&sort=stars&order=desc&per_page=100`;
  const standardUrl = `https://api.github.com/search/repositories?q=pushed:>${formatDate(twoDaysAgo)} stars:>300&sort=stars&order=desc&per_page=100`;
  
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHubTree-Update-Script'
  };
  
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  console.log('Fetching optimized viral repos...');
  let res = await fetch(optimizedUrl, { headers });
  let data = await res.json();
  
  let items = data.items || [];
  
  if (items.length === 0) {
    console.log('No viral repos found, fetching standard trending repos...');
    res = await fetch(standardUrl, { headers });
    data = await res.json();
    items = data.items || [];
  }

  let addedCount = 0;
  let newCsvLines = [];
  
  for (const item of items) {
    const fullName = item.full_name;
    if (!fullName || existingRepos.has(fullName.toLowerCase().trim())) continue;
    if (!item.language) continue;
    
    let description = (item.description || "")
      .replace(/"/g, '""')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '');
      
    const branch = item.default_branch || 'main';
    const lang = item.language || 'Other';
    
    newCsvLines.push(`${fullName},${branch},${lang},"${description}"`);
    addedCount++;
    if (addedCount >= 100) break;
  }
  
  if (addedCount > 0) {
    console.log(`Adding ${addedCount} new repositories:`);
    newCsvLines.forEach(line => {
      const repoName = line.split(',')[0];
      console.log(`+ ${repoName}`);
    });
    fs.appendFileSync(CSV_PATH, '\n' + newCsvLines.join('\n'));
    
    // Set output for github actions
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `added_count=${addedCount}\n`);
    }
  } else {
    console.log('No new repositories found.');
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `added_count=0\n`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});