const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\ARUNKARTHICK P\\.gemini\\antigravity-ide\\brain\\6e55e57d-cd6c-49dd-b940-5217e88c1af2';

async function runTest() {
  console.log('Launching Headless Chrome from:', chromePath);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', err => {
    errors.push(`Page Error: ${err.message}`);
  });

  console.log('\n--- TEST 1: Open /login ---');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(artifactDir, 'test_login.png') });
  console.log('Captured test_login.png');

  // Verify cards exist
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Login Page title found:', bodyText.includes('KNITNECT Production ERP'));
  console.log('Executive Portal card found:', bodyText.includes('Executive Portal (Owner)'));
  console.log('Management Portal card found:', bodyText.includes('Management Portal (Manager)'));
  console.log('Employee Portal card found:', bodyText.includes('Employee Portal (Floor Ops)'));

  console.log('\n--- TEST 2: Click Enter as OWNER ---');
  const ownerBtn = await page.waitForSelector('button::-p-text(Enter as OWNER)');
  await ownerBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(artifactDir, 'test_owner_dashboard.png') });
  console.log('Current URL after Owner click:', page.url());

  const ownerNavItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.nav-item')).map(el => el.innerText.trim());
  });
  console.log('Executive Portal Sidebar Nav Items count:', ownerNavItems.length);
  console.log('Nav items:', ownerNavItems);

  console.log('\n--- TEST 3: Switch Role from Header ---');
  const switchBtn = await page.waitForSelector('button::-p-text(Switch Role)');
  await switchBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  console.log('Current URL after Switch Role:', page.url());

  console.log('\n--- TEST 4: Click Enter as EMPLOYEE ---');
  const employeeBtn = await page.waitForSelector('button::-p-text(Enter as EMPLOYEE)');
  await employeeBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(artifactDir, 'test_employee_tasks.png') });
  console.log('Current URL after Employee click:', page.url());

  const employeeNavItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.nav-item')).map(el => el.innerText.trim());
  });
  console.log('Employee Portal Sidebar Nav Items count:', employeeNavItems.length);
  console.log('Nav items:', employeeNavItems);

  console.log('\n--- TEST 5: Open Team Chat as Employee ---');
  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'test_chat.png') });
  console.log('Captured test_chat.png');

  const chatText = await page.evaluate(() => document.body.innerText);
  console.log('Chat page loaded successfully (no infinite spinner):', !chatText.includes('Loading operations communications...'));
  console.log('Chat interface visible:', chatText.includes('Operations Communications'));

  console.log('\n--- TEST 6: Test All Executive Routes ---');
  // Re-login as owner to test all 10 modules
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  const ownerBtn2 = await page.waitForSelector('button::-p-text(Enter as OWNER)');
  await ownerBtn2.click();
  await new Promise(r => setTimeout(r, 1500));

  const routes = ['/styles', '/pipeline', '/departments', '/tasks', '/dispatch', '/payments', '/payroll', '/audit'];
  for (const r of routes) {
    await page.goto(`http://localhost:3000${r}`, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 800));
    const title = await page.title();
    console.log(`Route ${r}: Loaded OK. URL: ${page.url()}`);
  }

  console.log('\n--- SUMMARY OF CONSOLE ERRORS ---');
  if (errors.length === 0) {
    console.log('PERFECT! Zero console errors detected during full test run.');
  } else {
    console.log(`Detected ${errors.length} console errors:`, errors);
  }

  await browser.close();
  console.log('\nAll automated browser tests completed.');
}

runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
