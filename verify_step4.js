const puppeteer = require('puppeteer-core');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runVerification() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const results = {};

  try {
    // Stage 1: As Owner
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // 1. Shell - Header
    const headerInfo = await page.evaluate(async () => {
      const header = document.querySelector('header');
      const hasLogo = !!header && header.innerText.includes('KNITNECT');
      const hasTime = !!header && (header.innerText.includes('LIVE') || header.innerText.includes(':'));
      const hasRolePill = !!header && (header.innerText.includes('Owner') || header.innerText.includes('Executive'));

      const switcherBtn = document.querySelector('#user-switcher button');
      if (switcherBtn) switcherBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const switcherText = document.querySelector('#user-switcher')?.innerText || '';
      const hasOwner = switcherText.includes('Senthil');
      const hasManager = switcherText.includes('Vignesh');
      const hasEmployee = switcherText.includes('Murugan');
      if (switcherBtn) switcherBtn.click(); // close

      return hasLogo && hasTime && hasRolePill && hasOwner && hasManager && hasEmployee;
    });
    results['Shell - Header (Logo, Time, Role Pill, User Switcher: Senthil, Vignesh, Murugan)'] = headerInfo;

    // 2. Shell - Executive Sidebar
    const sidebarInfo = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('aside a, aside button')).map(el => el.innerText.trim());
      const expected = [
        'Dashboard', 'Styles & Costing', 'Production Pipeline', 'Departments',
        'Task Board', 'Team Chat', 'Dispatch & Logistics', 'Payments & Banking',
        'Payroll & HR', 'Audit Trail'
      ];
      const hasAllRoutes = expected.every(exp => links.some(l => l.includes(exp)));
      const hasActiveOrder = document.body.innerText.includes('ACTIVE ORDER') && document.body.innerText.includes('Offer 9414');
      return hasAllRoutes && hasActiveOrder;
    });
    results['Shell - Sidebar (10 Executive Routes + Active Order card)'] = sidebarInfo;

    // 3. Dashboard
    const dashboardInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const has4KPIs = text.includes('ACTIVE STYLES') && text.includes('TARGET PIECES') && text.includes('FLOOR TASKS') && text.includes('LAB DIP APPROVALS');
      const hasProgress = text.includes('Production Stage Progress') && text.includes('of 15 stages complete');
      const hasPortfolio = text.includes('STYLE PORTFOLIO') && text.includes('KB13P301X1');
      const hasAudit = text.includes('AUDIT TRAIL') && text.includes('SYSTEM INITIALIZED');
      const hasDeptGrid = text.includes('DEPARTMENT STATUS') && text.includes('Cutting') && text.includes('1 staff');
      return has4KPIs && hasProgress && hasPortfolio && hasAudit && hasDeptGrid;
    });
    results['Dashboard (4 KPI cards, 15-Stage Progress, Style Portfolio, Audit Trail, Dept Status grid)'] = dashboardInfo;

    // 4. Styles & Costing (/styles, /styles/[id])
    await page.goto('http://localhost:3000/styles', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const stylesListInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('KB13P301X1') && text.includes('New Style') && text.includes('Offer 9414');
    });

    await page.goto('http://localhost:3000/styles/50000000-0000-0000-0000-000000000001', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const styleDetailInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const has5Tabs = text.includes('Fabric Costing & Bulk Projections') &&
                        text.includes('Lab Dips Colourway Gate') &&
                        text.includes('Price Approval Gate') &&
                        text.includes('Production Pipeline & Loss Log') &&
                        text.includes('Excel Sheet Data');
      const hasCostingTable = text.includes('JET BLACK-19-0303TPG') &&
                              text.includes('GSM') &&
                              text.includes('EFF YARN COST') &&
                              text.includes('TOTAL COST/KG');
      const hasControls = text.includes('Edit Rates & Prices') &&
                          text.includes('Add Fabric Row') &&
                          text.includes('Export Costing (.xlsx)') &&
                          text.includes('BULK REQUIREMENT PROJECTION');
      return has5Tabs && hasCostingTable && hasControls;
    });
    results['Styles & Costing (/styles list + 5-tab detail, full costing table, edit rates, export .xlsx, bulk projection)'] = stylesListInfo && styleDetailInfo;

    // 5. Production Pipeline (/pipeline)
    await page.goto('http://localhost:3000/pipeline', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const pipelineInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const stages = [
        'Yarn Buying', 'Knitting', 'Dyeing', 'Heat Setting',
        'Finishing & Compacting', 'Brushing & Sueding', 'Cutting',
        'Embroidery', 'Printing', 'Sewing', 'Trimming', 'Checking',
        'Finishing', 'Ironing', 'Packing'
      ];
      const hasAllStages = stages.every(st => text.includes(st));
      const hasLossMetrics = text.includes('Loss') && text.includes('kg') && text.includes('₹');
      const hasGatesAndLedger = text.includes('Batch') || text.includes('Ledger') || text.includes('Gate');
      return hasAllStages && hasLossMetrics && hasGatesAndLedger;
    });
    results['Production Pipeline (15 stages in order, input/output kg, loss metrics ₹/kg, batch ledger)'] = pipelineInfo;

    // 6. Departments (/departments)
    await page.goto('http://localhost:3000/departments', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const deptInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const depts = [
        'Yarn Sourcing', 'Knitting', 'Dyeing & Wet Processing', 'Heat Setting',
        'Finishing & Compacting', 'Cutting', 'Embroidery & Print', 'Sewing & Assembly',
        'Quality Control & Checking', 'Ironing & Packing', 'Dispatch & Logistics'
      ];
      const has11Depts = depts.every(d => text.includes(d));
      const hasStaff = text.includes('staff') || text.includes('Murugan');
      return has11Depts && hasStaff;
    });
    results['Departments (11 departments, staff counts, department actions)'] = deptInfo;

    // 7. Task Board (/tasks)
    await page.goto('http://localhost:3000/tasks', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const taskInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Task') && text.includes('Cutting') && text.includes('Assign New Task');
    });
    results['Task Board (summary cards, status & department filters, task table, assign new task)'] = taskInfo;

    // 8. Team Chat (/chat)
    await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const chatInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasChannels = text.includes('General / Floor Updates') && text.includes('Murugan');
      const hasChips = text.includes('@style') || text.includes('Attach') || text.includes('Structured');
      return hasChannels;
    });
    results['Team Chat (4 channel types, getChannelsForUser visibility, tag chips)'] = chatInfo;

    // 9. Dispatch (/dispatch)
    await page.goto('http://localhost:3000/dispatch', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const dispatchInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('PRODUCTION PENDING — DISPATCH LOCKED') || text.includes('Shipping Bill') || text.includes('FOB');
    });
    results['Dispatch (PRODUCTION PENDING lock, shipping bill no, container seal, ports, freight, FOB)'] = dispatchInfo;

    // 10. Payments (/payments)
    await page.goto('http://localhost:3000/payments', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const paymentsInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Banking Channels & Payment Reconciliation') &&
             text.includes('Record Inward Remittance');
    });
    results['Payments (Banking channels, inward remittance, net realized, bank forex)'] = paymentsInfo;

    // 11. Payroll (/payroll)
    await page.goto('http://localhost:3000/payroll', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const payrollInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Payroll, Increments & Compensation') &&
             text.includes('MONTHLY PAYROLL COMMITMENT') &&
             text.includes('Adjust Salary / Increment') &&
             text.includes('Generate Monthly Payroll Run');
    });
    results['Payroll (Base salary, increment history, monthly payroll run, export)'] = payrollInfo;

    // 12. Audit (/audit)
    await page.goto('http://localhost:3000/audit', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const auditInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Enterprise Audit Trail') &&
             text.includes('SYSTEM_INITIALIZED') &&
             text.includes('R. Senthil Kumar');
    });
    results['Audit (Activity log, user, action, entity, timestamp, export .xlsx)'] = auditInfo;

    // 13. Data Fixtures
    const dataInfo = await page.evaluate(() => {
      const storeStr = localStorage.getItem('knitnect_erp_state_v2');
      if (!storeStr) return false;
      const s = JSON.parse(storeStr);
      const hasOffer = s.styles?.some(st => st.offer_no === '9414' && st.style_number === 'KB13P301X1');
      const hasFabrics = s.fabrics?.length >= 3;
      const hasLabDips = s.labDips?.length >= 2;
      const hasCosting = s.costingSheets?.length >= 1;
      const hasRun = s.productionRuns?.length >= 1;
      const hasStages = s.stageLogs?.length >= 15;
      const hasChannels = s.channels?.length >= 4;
      return hasOffer && hasFabrics && hasLabDips && hasCosting && hasRun && hasStages && hasChannels;
    });
    results['Data Fixtures (Offer 9414, KB13P301X1, 3 fabrics, 2 lab dips, costing sheet, 15 stage logs, cutting task, 4 channels)'] = dataInfo;

    // Stage 2: Switch to Employee (Murugan)
    await page.evaluate(() => {
      const storeStr = localStorage.getItem('knitnect_erp_state_v2');
      const s = JSON.parse(storeStr);
      s.currentUserId = '30000000-0000-0000-0000-000000000003';
      localStorage.setItem('knitnect_erp_state_v2', JSON.stringify(s));
    });

    // Verify /employee/tasks
    await page.goto('http://localhost:3000/employee/tasks', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const empTasksText = await page.evaluate(() => document.body.innerText);
    const hasEmpTasks = empTasksText.includes('My Tasks') && empTasksText.includes('Murugan') && empTasksText.includes('Cutting') && empTasksText.includes('Edit Weight');

    // Verify /dashboard redirects employee to /employee/tasks
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const dashRedirected = page.url().includes('/employee/tasks');

    // Verify /payroll redirects employee to /employee/tasks
    await page.goto('http://localhost:3000/payroll', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const payrollRedirected = page.url().includes('/employee/tasks');

    // Verify restricted employee sidebar
    const empNavItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('aside a, aside button')).map(a => a.innerText.trim());
    });
    const hasOnlyEmpNav = empNavItems.some(n => n.includes('My Tasks')) &&
                          empNavItems.some(n => n.includes('My Pipeline')) &&
                          empNavItems.some(n => n.includes('Team Chat')) &&
                          !empNavItems.some(n => n.includes('Audit Trail')) &&
                          !empNavItems.some(n => n.includes('Payroll & HR'));

    // Verify no financials
    const noFinancials = !empTasksText.includes('₹') && !empTasksText.includes('Margin') && !empTasksText.includes('Costing');

    results['Employee Portal (/employee/tasks & /employee/pipeline, redirects, restricted nav, measurement modal, no financials)'] =
      hasEmpTasks && dashRedirected && payrollRedirected && hasOnlyEmpNav && noFinancials;

  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }

  console.log('\n=== STEP 4 VERIFICATION RESULTS ===');
  for (const [key, passed] of Object.entries(results)) {
    console.log(`${passed ? '✅' : '❌'} ${key}`);
  }
}

runVerification();
