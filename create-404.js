// create-404.js
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(process.env.GITHUB_PAGES_URL);
  const content = await page.content();
  fs.writeFileSync('404.html', content);
  await browser.close();
})();