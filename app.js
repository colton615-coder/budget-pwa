/* Budget Buddy – iOS-friendly PWA
 * Data lives in localStorage under key 'bb.state'
 * Month keys in format YYYY-MM
 */
'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: guessCurrency() });

  function guessCurrency(){
    try {
      const region = (Intl.DateTimeFormat().resolvedOptions().locale || 'en-US').split('-').pop() || 'US';
      return ({
        US:'USD', CA:'CAD', GB:'GBP', AU:'AUD', NZ:'NZD', EU:'EUR', IE:'EUR', DE:'EUR', FR:'EUR', ES:'EUR', IT:'EUR',
        IN:'INR', JP:'JPY', SG:'SGD', HK:'HKD', MX:'MXN', BR:'BRL', ZA:'ZAR'
      }[region] || 'USD');
    } catch { return 'USD'; }
  }

  // ---------- Categories (Fixed + Variable) ----------
  const GROUPS = [
    { key:'housing', label:'Housing', color:'var(--c-housing)', cats:[
      'Rent/Mortgage', 'Insurance/Property Taxes'
    ]},
    { key:'transport', label:'Transportation', color:'var(--c-transport)', cats:[
      'Car Payment','Car Insurance'
    ]},
    { key:'utilities', label:'Utilities', color:'var(--c-utilities)', cats:[
      'Electricity','Water','Internet/Cable','Phone Bill'
    ]},
    { key:'debt', label:'Debt Repayment', color:'var(--c-debt)', cats:[
      'Student Loans','Credit Cards'
    ]},
    { key:'fixedother', label:'Other Fixed', color:'var(--c-fixedother)', cats:[
      'Subscriptions','Other Fixed Loans'
    ]},
    { key:'food', label:'Food', color:'var(--c-food)', cats:[
      'Groceries','Dining Out'
    ]},
    { key:'household', label:'Household', color:'var(--c-household)', cats:[
      'Personal Care','Household Supplies'
    ]},
    { key:'personal', label:'Personal', color:'var(--c-personal)', cats:[
      'Shopping','Entertainment'
    ]},
    { key:'medical', label:'Medical', color:'var(--c-medical)', cats:[
      'Co-pays & Prescriptions','Health Care'
    ]},
    { key:'othervar', label:'Other Variable', color:'var(--c-othervar)', cats:[
      'Fuel/Gas','Travel','Gifts'
    ]},
  ];

  const ALL_CATEGORIES = GROUPS.flatMap(g => g.cats.map(c => ({key:`${g.key}:${slug(c)}`, group:g.key, groupLabel:g.label, label:c, color:g.color})));

  function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

  // ---------- State ----------
  const EMPTY_MONTH = () => ({ incomes:[], budgets:{}, transactions:[], savings:[], debtExtra:[] });
  const STATE = loadState();
  ensureMonth(getMonthKey(new Date())); // ensure current month exists

  // ---------- DOM refs ----------
  const monthPicker = $('#monthPicker');
  const tlIncome = $('#tl-income');
  const tlExpenses = $('#tl-expenses');
  const tlResult = $('#tl-result');

  const incomeForm = $('#income-form');
  const incomeSource = $('#income-source');
  const incomeAmount = $('#income-amount');
  const incomeBody = $('#income-tbody');
  const incomeTotal = $('#income-total');

  const budgetGroups = $('#budget-groups');
  const budgetedTotal = $('#budgeted-total');

  const txForm = $('#tx-form');
  const txDate = $('#tx-date');
  const txDesc = $('#tx-desc');
  const txCategory = $('#tx-category');
  const txNeedWant = $('#tx-needwant');
  const txAmount = $('#tx-amount');
  const txNotes = $('#tx-notes');
  const txBody = $('#tx-tbody');
  const txTotal = $('#tx-total');

  const goalForm = $('#goal-form');
  const goalName = $('#goal-name');
  const goalTarget = $('#goal-target');
  const goalList = $('#goal-list');

  const saveForm = $('#save-form');
  const saveGoal = $('#save-goal');
  const saveDate = $('#save-date');
  const saveAmount = $('#save-amount');
  const saveBody = $('#save-tbody');
  const saveTotal = $('#save-total');

  const debtForm = $('#debt-form');
  const debtName = $('#debt-name');
  const debtDate = $('#debt-date');
  const debtAmount = $('#debt-amount');
  const debtBody = $('#debt-tbody');
  const debtTotal = $('#debt-total');

  const btnOpenMenu = $('#btn-open-menu');
  const btnCloseMenu = $('#btn-close-menu');
  const sheet = $('#sheet-menu');
  const btnExport = $('#btn-export');
  const fileImport = $('#file-import');
  const btnClearMonth = $('#btn-clear-month');
  const btnLoadSample = $('#btn-load-sample');
  const statusBox = $('#status');

  // charts
  let chartByCat, chartBudget, chartNeedWant, chartCashflow;

  // ---------- Init ----------
  initUI();
  renderAll();

  // ---------- UI Init ----------
  function initUI(){
    // month picker default
    monthPicker.value = getMonthKey(new Date());
    monthPicker.addEventListener('change', () => {
      ensureMonth(monthPicker.value);
      renderAll();
      toast('Switched to ' + monthPicker.value);
    });

    // income
    incomeForm.addEventListener('submit', e => {
      e.preventDefault();
      const amt = toNum(incomeAmount.value);
      if (!incomeSource.value.trim() || !(amt > 0)) return;
      const m = currentMonth();
      m.incomes.push({ id: uid(), source: incomeSource.value.trim(), amount: amt });
      save();
      incomeForm.reset(); incomeSource.focus();
      renderIncome(); renderTopline(); renderCharts();
      toast('Income added ✔️');
    });

    // budgets UI build
    buildBudgetPlanner();

    // category select for transactions
    txCategory.innerHTML = ALL_CATEGORIES.map(c => `<option value="${c.key}">${c.groupLabel} — ${c.label}</option>`).join('');
    // default today
    txDate.valueAsDate = new Date();
    saveDate.valueAsDate = new Date();
    debtDate.valueAsDate = new Date();

    txForm.addEventListener('submit', e => {
      e.preventDefault();
      const amt = toNum(txAmount.value);
      if (!txDesc.value.trim() || !(amt > 0)) return;
      const m = currentMonth();
      m.transactions.push({
        id: uid(),
        date: txDate.value,
        desc: txDesc.value.trim(),
        category: txCategory.value,
        need: txNeedWant.value === 'need',
        amount: amt,
        notes: txNotes.value.trim()
      });
      save();
      txForm.reset();
      txDate.valueAsDate = new Date();
      renderTransactions(); renderTopline(); renderCharts();
      toast('Expense recorded 💸');
    });

    // goals
    goalForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = goalName.value.trim();
      const target = toNum(goalTarget.value);
      if (!name || !(target > 0)) return;
      STATE.goals = STATE.goals || [];
      STATE.goals.push({ id: uid(), name, target, archived:false });
      save();
      goalForm.reset();
      renderGoals();
      toast('Goal added 🎯');
    });

    saveForm.addEventListener('submit', e => {
      e.preventDefault();
      const amt = toNum(saveAmount.value);
      if (!saveGoal.value || !(amt > 0)) return;
      const m = currentMonth();
      m.savings.push({ id: uid(), date: saveDate.value, goalId: saveGoal.value, amount: amt });
      save();
      saveForm.reset(); saveDate.valueAsDate = new Date();
      renderSavings(); renderCharts(); renderTopline();
      toast('Savings added 🧠');
    });

    // debt extra
    debtForm.addEventListener('submit', e => {
      e.preventDefault();
      const amt = toNum(debtAmount.value);
      if (!debtName.value.trim() || !(amt > 0)) return;
      const m = currentMonth();
      m.debtExtra.push({ id: uid(), date: debtDate.value, name: debtName.value.trim(), amount: amt });
      // also reflect in expenses under "Debt Repayment > Credit Cards" bucket for realism
      m.transactions.push({
        id: uid(),
        date: debtDate.value,
        desc: `${debtName.value.trim()} (extra)`,
        category: 'debt:' + slug('Credit Cards'),
        need: true,
        amount: amt,
        notes: 'Extra payment'
      });
      save();
      debtForm.reset(); debtDate.valueAsDate = new Date();
      renderDebt(); renderTransactions(); renderTopline(); renderCharts();
      toast('Extra debt payment added ✅');
    });

    // sheet menu
    btnOpenMenu.addEventListener('click', () => { sheet.setAttribute('aria-hidden','false'); });
    btnCloseMenu.addEventListener('click', () => { sheet.setAttribute('aria-hidden','true'); });
    sheet.addEventListener('click', e => {
      if (e.target === sheet) sheet.setAttribute('aria-hidden','true');
    });

    btnExport.addEventListener('click', doExport);
    fileImport.addEventListener('change', handleImport);
    btnClearMonth.addEventListener('click', () => {
      if (!confirm('Reset all data for ' + monthPicker.value + '?')) return;
      STATE.months[monthPicker.value] = EMPTY_MONTH();
      save(); renderAll();
      toast('Month reset.');
    });
    btnLoadSample.addEventListener('click', () => {
      if (!confirm('Load vivid sample data into the current month?')) return;
      loadSampleData(monthPicker.value);
      save(); renderAll();
      toast('Sample data loaded ✨');
    });
  }

  // ---------- Build Budget Planner ----------
  function buildBudgetPlanner(){
    const m = currentMonth();
    // ensure budgets exist for all categories (default 0)
    for (const c of ALL_CATEGORIES){
      if (m.budgets[c.key] == null) m.budgets[c.key] = 0;
    }
    // Build UI
    budgetGroups.innerHTML = GROUPS.map(g => {
      const rows = g.cats.map(cat => {
        const key = `${g.key}:${slug(cat)}`;
        const val = m.budgets[key] || 0;
        const colorDot = `<span class="color-dot" style="background:${g.color}"></span>`;
        return `
          <div class="row">
            <label>${colorDot}<span>${cat}</span></label>
            <input type="number" step="0.01" min="0" data-bkey="${key}" class="budget-input" value="${val}" />
            <div class="muted">${g.label}</div>
          </div>
        `;
      }).join('');
      return `
        <div class="group">
          <h4 class="color-${g.key}">${g.label}</h4>
          ${rows}
        </div>
      `;
    }).join('');

    $$('.budget-input', budgetGroups).forEach(inp => {
      inp.addEventListener('change', e => {
        const key = e.target.dataset.bkey;
        currentMonth().budgets[key] = toNum(e.target.value);
        save();
        renderBudgetTotals(); renderCharts();
      });
    });
    renderBudgetTotals();
  }

  // ---------- Rendering ----------
  function renderAll(){
    renderTopline();
    renderIncome();
    buildBudgetPlanner();
    renderTransactions();
    renderGoals();
    renderSavings();
    renderDebt();
    renderCharts();
  }

  function renderTopline(){
    const m = currentMonth();
    const income = sum(m.incomes.map(x => x.amount));
    const expenses = sum(m.transactions.map(x => x.amount));
    const result = income - expenses;
    tlIncome.textContent = money.format(income);
    tlExpenses.textContent = money.format(expenses);
    tlResult.textContent = money.format(result);
  }

  function renderIncome(){
    const m = currentMonth();
    incomeBody.innerHTML = m.incomes.map(row => `
      <tr>
        <td>${esc(row.source)}</td>
        <td class="r">${money.format(row.amount)}</td>
        <td class="c"><button class="icon-btn" data-del-income="${row.id}" aria-label="Delete">🗑️</button></td>
      </tr>
    `).join('');
    incomeBody.querySelectorAll('[data-del-income]').forEach(btn => {
      btn.addEventListener('click', () => {
        m.incomes = m.incomes.filter(x => x.id !== btn.dataset.delIncome);
        save(); renderIncome(); renderTopline(); renderCharts();
      });
    });
    incomeTotal.textContent = money.format(sum(m.incomes.map(x => x.amount)));
  }

  function renderBudgetTotals(){
    const m = currentMonth();
    const total = sum(Object.values(m.budgets || {}));
    budgetedTotal.textContent = money.format(total);
  }

  function renderTransactions(){
    const m = currentMonth();
    txBody.innerHTML = m.transactions.map(row => {
      const cat = ALL_CATEGORIES.find(c => c.key === row.category);
      return `
        <tr>
          <td>${row.date}</td>
          <td>${esc(row.desc)}</td>
          <td>${cat ? `${cat.groupLabel} / ${cat.label}` : esc(row.category)}</td>
          <td>${row.need ? '<span class="badge need">Need</span>' : '<span class="badge want">Want</span>'}</td>
          <td class="r">${money.format(row.amount)}</td>
          <td>${esc(row.notes || '')}</td>
          <td class="c"><button class="icon-btn" data-del-tx="${row.id}" aria-label="Delete">🗑️</button></td>
        </tr>
      `;
    }).join('');
    txBody.querySelectorAll('[data-del-tx]').forEach(btn => {
      btn.addEventListener('click', () => {
        m.transactions = m.transactions.filter(x => x.id !== btn.dataset.delTx);
        save(); renderTransactions(); renderTopline(); renderCharts();
      });
    });
    txTotal.textContent = money.format(sum(m.transactions.map(x => x.amount)));
  }

  function renderGoals(){
    const goals = STATE.goals || [];
    // List with progress bars
    goalList.innerHTML = goals.map(g => {
      const current = totalSavedForGoal(g.id);
      const pct = Math.min(100, Math.round(current / Math.max(1, g.target) * 100));
      return `
        <div class="group">
          <div style="display:flex; align-items:center; gap:.5rem">
            <h4>${esc(g.name)}</h4>
            <span class="badge">${money.format(current)} / ${money.format(g.target)}</span>
            <span class="badge">${pct}%</span>
            <span style="margin-left:auto"></span>
            <button class="icon-btn" data-archive-goal="${g.id}" aria-label="Archive">📦</button>
            <button class="icon-btn" data-del-goal="${g.id}" aria-label="Delete">🗑️</button>
          </div>
          <div style="background:#0c1a26; border:1px solid #103049; border-radius:999px; overflow:hidden; height:12px">
            <div style="width:${pct}%; background:linear-gradient(90deg,#22c55e,#0ea5e9); height:100%"></div>
          </div>
        </div>
      `;
    }).join('');
    goalList.querySelectorAll('[data-del-goal]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this goal?')) return;
        STATE.goals = (STATE.goals || []).filter(x => x.id !== btn.dataset.delGoal);
        // also remove savings rows for this goal
        for (const k of Object.keys(STATE.months)){
          STATE.months[k].savings = STATE.months[k].savings.filter(s => s.goalId !== btn.dataset.delGoal);
        }
        save(); renderGoals(); renderSavings(); renderCharts();
      });
    });
    goalList.querySelectorAll('[data-archive-goal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = (STATE.goals||[]).find(x => x.id === btn.dataset.archiveGoal);
        if (g){ g.archived = !g.archived; save(); renderGoals(); }
      });
    });

    // fill select for savings form with non-archived
    const opts = (STATE.goals||[]).filter(g => !g.archived).map(g => `<option value="${g.id}">${esc(g.name)}</option>`);
    saveGoal.innerHTML = opts.join('');
  }

  function renderSavings(){
    const m = currentMonth();
    saveBody.innerHTML = m.savings.map(s => {
      const goal = (STATE.goals||[]).find(g => g.id === s.goalId);
      return `
        <tr>
          <td>${s.date}</td>
          <td>${goal ? esc(goal.name) : '—'}</td>
          <td class="r">${money.format(s.amount)}</td>
          <td class="c"><button class="icon-btn" data-del-save="${s.id}" aria-label="Delete">🗑️</button></td>
        </tr>
      `;
    }).join('');
    saveBody.querySelectorAll('[data-del-save]').forEach(btn => {
      btn.addEventListener('click', () => {
        m.savings = m.savings.filter(x => x.id !== btn.dataset.delSave);
        save(); renderSavings(); renderCharts(); renderTopline();
      });
    });
    saveTotal.textContent = money.format(sum(m.savings.map(x => x.amount)));
  }

  function renderDebt(){
    const m = currentMonth();
    debtBody.innerHTML = m.debtExtra.map(d => `
      <tr>
        <td>${d.date}</td>
        <td>${esc(d.name)}</td>
        <td class="r">${money.format(d.amount)}</td>
        <td class="c"><button class="icon-btn" data-del-debt="${d.id}" aria-label="Delete">🗑️</button></td>
      </tr>
    `).join('');
    debtBody.querySelectorAll('[data-del-debt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = m.debtExtra.find(x => x.id === btn.dataset.delDebt);
        // also delete the mirrored expense if exists
        m.transactions = m.transactions.filter(tx => !(tx.notes === 'Extra payment' && tx.desc.startsWith(rec.name)));
        m.debtExtra = m.debtExtra.filter(x => x.id !== btn.dataset.delDebt);
        save(); renderDebt(); renderTransactions(); renderTopline(); renderCharts();
      });
    });
    debtTotal.textContent = money.format(sum(m.debtExtra.map(x => x.amount)));
  }

  // ---------- Charts ----------
  function renderCharts(){
    const m = currentMonth();
    const byCat = aggregateByCategory(m.transactions);
    const byGroup = aggregateByGroup(byCat);
    const budgetMap = m.budgets || {};
    const labels = Object.keys(byGroup);
    const values = labels.map(k => byGroup[k].total);
    const colors = labels.map(k => byGroup[k].color);

    // category donut
    chartByCat = upsertChart(chartByCat, $('#chart-category').getContext('2d'), {
      type:'doughnut',
      data:{ labels, datasets:[{ data: values, backgroundColor: colors, borderWidth:0 }]},
      options:{
        plugins:{ legend:{ position:'bottom', labels:{ color:'#cfe7ff' } } },
        cutout:'55%'
      }
    });

    // budget vs actual (group totals)
    const budgetGroupTotals = labels.map(k => {
      const catKeys = ALL_CATEGORIES.filter(c => c.group === k).map(c => c.key);
      return sum(catKeys.map(key => budgetMap[key] || 0));
    });
    chartBudget = upsertChart(chartBudget, $('#chart-budget').getContext('2d'), {
      type:'bar',
      data:{
        labels: labels.map(k => groupLabel(k)),
        datasets:[
          { label:'Budget', data: budgetGroupTotals, backgroundColor:'rgba(14,165,233,.45)' },
          { label:'Actual', data: values, backgroundColor:'rgba(34,197,94,.55)' }
        ]
      },
      options:{
        responsive:true,
        scales:{
          x:{ ticks:{ color:'#cfe7ff' } },
          y:{ ticks:{ color:'#cfe7ff' }, grid:{ color:'#173040' } }
        },
        plugins:{ legend:{ labels:{ color:'#cfe7ff' } } }
      }
    });

    // needs vs wants
    const need = sum(m.transactions.filter(t => t.need).map(t => t.amount));
    const want = sum(m.transactions.filter(t => !t.need).map(t => t.amount));
    chartNeedWant = upsertChart(chartNeedWant, $('#chart-needwant').getContext('2d'), {
      type:'pie',
      data:{ labels:['Need','Want'], datasets:[{ data:[need,want], backgroundColor:['#22c55e','#ef4444'], borderWidth:0 }]},
      options:{ plugins:{ legend:{ position:'bottom', labels:{ color:'#cfe7ff' }}} }
    });

    // cumulative cashflow line (income - expenses over time)
    const days = daysInMonth(monthPicker.value);
    let running = 0;
    const incomeTotal = sum(m.incomes.map(i => i.amount));
    // naive allocation: add all income on day 1 for visualization; then subtract expenses by date
    const expenseByDay = Array.from({length:days}, (_,i)=>0);
    m.transactions.forEach(t => {
      const day = +t.date.split('-')[2];
      if (day>=1 && day<=days) expenseByDay[day-1] += t.amount;
    });
    const cash = [];
    for (let d=1; d<=days; d++){
      if (d===1) running += incomeTotal;
      running -= expenseByDay[d-1];
      cash.push(running);
    }
    chartCashflow = upsertChart(chartCashflow, $('#chart-cashflow').getContext('2d'), {
      type:'line',
      data:{ labels: Array.from({length:days}, (_,i)=> String(i+1)), datasets:[{
        label:'Balance (viz)',
        data: cash,
        borderColor:'#0ea5e9', backgroundColor:'rgba(14,165,233,.15)', fill:true, tension:.25
      }]},
      options:{
        plugins:{ legend:{ labels:{ color:'#cfe7ff' } } },
        scales:{ x:{ ticks:{ color:'#cfe7ff' } }, y:{ ticks:{ color:'#cfe7ff' }, grid:{ color:'#173040' } } }
      }
    });
  }

  function upsertChart(chart, ctx, config){
    if (chart){ chart.data = config.data; chart.options = config.options || {}; chart.update(); return chart; }
    return new Chart(ctx, config);
  }

  // ---------- Aggregations ----------
  function aggregateByCategory(transactions){
    const map = {};
    for (const t of transactions){
      map[t.category] = (map[t.category] || 0) + t.amount;
    }
    return map; // {catKey: total}
  }
  function groupLabel(key){ return GROUPS.find(g => g.key === key)?.label || key; }
  function aggregateByGroup(byCat){
    const map = {};
    for (const [key, val] of Object.entries(byCat)){
      const cat = ALL_CATEGORIES.find(c => c.key === key);
      const g = cat?.group || 'other';
      if (!map[g]) map[g] = { total:0, color: cat?.color || '#999' };
      map[g].total += val;
    }
    // ensure all groups exist (even if 0) for consistent legend
    for (const g of GROUPS){
      if (!map[g.key]) map[g.key] = { total:0, color:g.color };
    }
    return map; // {groupKey: {total,color}}
  }

  function totalSavedForGoal(goalId){
    let sumAmt = 0;
    for (const m of Object.values(STATE.months)){
      for (const s of m.savings){
        if (s.goalId === goalId) sumAmt += s.amount;
      }
    }
    return sumAmt;
  }

  // ---------- Export / Import ----------
  function doExport(){
    const blob = new Blob([JSON.stringify(STATE, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget-buddy-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleImport(e){
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      if (!obj || !obj.months) throw new Error('Not a valid export');
      localStorage.setItem('bb.state', JSON.stringify(obj));
      Object.assign(STATE, obj); // mutate ref
      renderAll();
      toast('Import complete 💾');
    }catch(err){
      alert('Import failed: ' + err.message);
    }finally{
      e.target.value = '';
    }
  }

  // ---------- Helpers ----------
  function daysInMonth(ym){
    const [y,m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function esc(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function uid(){ return Math.random().toString(36).slice(2,11); }
  function toNum(v){ return Math.max(0, Number.parseFloat(v||'0')) || 0; }
  function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
  function getMonthKey(d){ return d.toISOString().slice(0,7); }
  function currentMonth(){ return STATE.months[monthPicker.value]; }
  function ensureMonth(key){
    STATE.months[key] = STATE.months[key] || EMPTY_MONTH();
  }

  function loadState(){
    const raw = localStorage.getItem('bb.state');
    let base = { version:1, months:{}, goals:[] };
    if (raw){
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') base = parsed;
      } catch { /*ignore*/ }
    }
    if (!base.months) base.months = {};
    if (!base.goals) base.goals = [];
    return base;
  }
  function save(){
    localStorage.setItem('bb.state', JSON.stringify(STATE));
  }

  function toast(msg){
    statusBox.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => statusBox.textContent = '', 3500);
  }

  // ---------- Sample Data ----------
  function loadSampleData(monthKey){
    ensureMonth(monthKey);
    const m = STATE.months[monthKey] = EMPTY_MONTH();

    // incomes
    m.incomes = [
      {id:uid(), source:'Paycheck (post-tax)', amount: 3400},
      {id:uid(), source:'Freelance', amount: 850},
      {id:uid(), source:'Rental income', amount: 600},
      {id:uid(), source:'Interest', amount: 25}
    ];

    // budgets (selected)
    const setB = (k,v)=> m.budgets[k]=v;
    setB('housing:'+slug('Rent/Mortgage'), 1600);
    setB('housing:'+slug('Insurance/Property Taxes'), 180);
    setB('transport:'+slug('Car Payment'), 320);
    setB('transport:'+slug('Car Insurance'), 110);
    setB('utilities:'+slug('Electricity'), 90);
    setB('utilities:'+slug('Water'), 40);
    setB('utilities:'+slug('Internet/Cable'), 70);
    setB('utilities:'+slug('Phone Bill'), 60);
    setB('debt:'+slug('Student Loans'), 150);
    setB('debt:'+slug('Credit Cards'), 100);
    setB('fixedother:'+slug('Subscriptions'), 45);
    setB('fixedother:'+slug('Other Fixed Loans'), 0);
    setB('food:'+slug('Groceries'), 420);
    setB('food:'+slug('Dining Out'), 160);
    setB('household:'+slug('Personal Care'), 35);
    setB('household:'+slug('Household Supplies'), 45);
    setB('personal:'+slug('Shopping'), 120);
    setB('personal:'+slug('Entertainment'), 80);
    setB('medical:'+slug('Co-pays & Prescriptions'), 30);
    setB('medical:'+slug('Health Care'), 30);
    setB('othervar:'+slug('Fuel/Gas'), 130);
    setB('othervar:'+slug('Travel'), 0);
    setB('othervar:'+slug('Gifts'), 0);

    // transactions
    const mm = monthKey; // YYYY-MM
    m.transactions = [
      t(mm,'01','Rent','housing:'+slug('Rent/Mortgage'),true,1600,''),
      t(mm,'02','Groceries – Trader Joe\'s','food:'+slug('Groceries'),true,98.25,''),
      t(mm,'03','Car Payment','transport:'+slug('Car Payment'),true,320,''),
      t(mm,'04','Electric Utility','utilities:'+slug('Electricity'),true,88.40,''),
      t(mm,'06','Netflix & Gym','fixedother:'+slug('Subscriptions'),false,32.99,''),
      t(mm,'07','Dining – Thai','food:'+slug('Dining Out'),false,28.75,''),
      t(mm,'09','Gas','othervar:'+slug('Fuel/Gas'),true,42.10,''),
      t(mm,'12','Phone Bill','utilities:'+slug('Phone Bill'),true,59.00,''),
      t(mm,'15','Entertainment – Movies','personal:'+slug('Entertainment'),false,21.50,''),
      t(mm,'17','Household Supplies','household:'+slug('Household Supplies'),true,14.90,''),
      t(mm,'20','Credit Card Minimum','debt:'+slug('Credit Cards'),true,60,''),
      t(mm,'23','Co-pay','medical:'+slug('Co-pays & Prescriptions'),true,25,''),
      t(mm,'25','Internet','utilities:'+slug('Internet/Cable'),true,70,''),
      t(mm,'27','Shopping – T-shirt','personal:'+slug('Shopping'),false,24.99,'')
    ];

    // goals & savings
    STATE.goals = [
      {id:uid(), name:'Emergency Fund', target:5000, archived:false},
      {id:uid(), name:'Vacation', target:1500, archived:false}
    ];
    m.savings = [
      {id:uid(), date:`${mm}-05`, goalId:STATE.goals[0].id, amount:150},
      {id:uid(), date:`${mm}-18`, goalId:STATE.goals[1].id, amount:100}
    ];

    // debt extra
    m.debtExtra = [
      {id:uid(), date:`${mm}-20`, name:'Credit Card', amount:40}
    ];
    // mirror extra already added into transactions by debtForm logic? Do that here manually:
    m.transactions.push(t(mm,'20','Credit Card (extra)','debt:'+slug('Credit Cards'),true,40,'Extra payment'));

    function t(ym,dd,desc,cat,need,amt,notes){ return {id:uid(), date:`${ym}-${dd}`, desc, category:cat, need, amount:amt, notes}; }
  }

})();
