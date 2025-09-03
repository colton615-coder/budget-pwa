// Budget Buddy v2.6 — consolidated app.js
// Features: Expenses + Income, Budgets w/ bars, Inline Edit, CSV Import (backup+merge/replace),
// Upcoming (14d), Net color, Quick-amount buttons, Export JSON, Wipe, PWA SW register.
// Data stays on-device (localStorage).

// ---------- DOM helpers ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ---------- Keys / storage ----------
const keys = {
  expenses: 'bb_expenses',
  income:   'bb_income',
  budgets:  'bb_budgets',
  backupLatest: 'bb_backup_latest'
};

function load(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ---------- Utils ----------
function fmt(n){
  return `$${Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
}
function titleCase(s){ return String(s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()); }
function uid(){ return Math.random().toString(36).slice(2,9); }

// Cadence -> monthlyized value (for dashboard math)
function monthlyize(amount, cadence){
  const a = Number(amount||0);
  switch((cadence||'').toLowerCase()){
    case 'weekly':   return a * 52 / 12;
    case 'biweekly': return a * 26 / 12;
    case 'yearly':   return a / 12;
    case 'monthly':  return a;
    case 'oneoff':   return 0; // not recurring
    default:         return 0;
  }
}
function inThisMonth(dateStr){
  if(!dateStr) return false;
  const d = new Date(dateStr), n = new Date();
  return d.getUTCFullYear()===n.getUTCFullYear() && d.getUTCMonth()===n.getUTCMonth();
}
function nextNDays(dateStr, n=14){
  if(!dateStr) return false;
  const now = new Date(), d = new Date(dateStr);
  const diff = (d - now) / (1000*60*60*24);
  return diff >= 0 && diff <= n;
}

// ---------- State ----------
let expenses = load(keys.expenses);
let income   = load(keys.income);
let budgets  = load(keys.budgets, {}); // { Category: monthlyCap }

// ---------- Navigation ----------
function initNav(){
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      // tabs UI
      $$('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      // views
      const id = btn.dataset.target;
      $$('.view').forEach(v=>v.classList.remove('active'));
      $('#'+id)?.classList.add('active');
      // render target
      if(id==='view-dashboard') renderDashboard();
      if(id==='view-expense')   renderExpenses();
      if(id==='view-income')    renderIncome();
      if(id==='view-history')   renderHistory();
      // UX: reset scroll
      window.scrollTo({top:0, behavior:'instant'});
    });
  });
}

// ---------- Forms: Expense / Income ----------
function initForms(){
  // Quick-amount helpers (added once)
  addQuickAmounts('expenseForm','expAmount');
  addQuickAmounts('incomeForm','incAmount');

  // Expense submit
  $('#expenseForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = $('#expName').value.trim();
    const amount = Number($('#expAmount').value||0);
    const category = titleCase($('#expCategory').value || 'Uncategorized');
    const cadence = $('#expCadence').value;
    const date = $('#expDate').value || null;
    if(!name || !amount){ return; }
    expenses.unshift({ id:uid(), name, amount, category, cadence, date, createdAt: Date.now() });
    save(keys.expenses, expenses);
    e.target.reset();
    renderExpenses(); renderDashboard(); renderHistory();
  });

  // Income submit
  $('#incomeForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = $('#incName').value.trim();
    const amount = Number($('#incAmount').value||0);
    const cadence = $('#incCadence').value;
    const date = $('#incDate').value || null;
    if(!name || !amount){ return; }
    income.unshift({ id:uid(), name, amount, cadence, date, createdAt: Date.now() });
    save(keys.income, income);
    e.target.reset();
    renderIncome(); renderDashboard(); renderHistory();
  });
}

function addQuickAmounts(formId, inputId){
  const form = $('#'+formId), input = $('#'+inputId);
  if(!form || !input) return;
  if(form.dataset.quickAdded) return; // avoid duplicates
  const row = document.createElement('div');
  row.className = 'row';
  ['25','50','100','250','500'].forEach(v=>{
    const b = document.createElement('button');
    b.type='button'; b.className='btn small'; b.textContent='$'+v;
    b.addEventListener('click', ()=>{ input.value = v; input.dispatchEvent(new Event('input',{bubbles:true})); });
    row.appendChild(b);
  });
  // insert above Save/Clear row
  const actions = form.querySelector('.row:last-of-type');
  form.insertBefore(row, actions);
  form.dataset.quickAdded = '1';
}

// ---------- Lists + Inline Edit ----------
function deleteExpense(id){
  expenses = expenses.filter(x=>x.id!==id);
  save(keys.expenses, expenses);
  renderExpenses(); renderDashboard(); renderHistory();
}
function deleteIncome(id){
  income = income.filter(x=>x.id!==id);
  save(keys.income, income);
  renderIncome(); renderDashboard(); renderHistory();
}

function renderExpenses(){
  const list = $('#expenseList'); list.innerHTML='';
  if(!expenses.length){ list.innerHTML = '<li class="item"><span class="meta">No expenses yet</span></li>'; return; }
  expenses.forEach(x=>{
    const li = document.createElement('li');
    li.className='item'; li.dataset.id = x.id;
    const sub = `${x.category||'Uncategorized'} • ${x.cadence}${x.date?` • ${x.date}`:''}`;
    li.innerHTML = `
      <div class="meta"><strong>${x.name}</strong><span class="sub">${sub}</span></div>
      <div class="row">
        <span class="amt">${fmt(x.amount)}</span>
        <button class="btn small" data-del="${x.id}" aria-label="Delete ${x.name}">✕</button>
      </div>`;
    list.appendChild(li);
  });

  // delegation: delete / edit
  list.onclick = (e)=>{
    const delId = e.target?.dataset?.del;
    if(delId){ deleteExpense(delId); return; }
    const li = e.target.closest('.item'); if(!li) return;
    if(e.target.tagName==='BUTTON') return; // ignore button
    const id = li.dataset.id;
    const item = expenses.find(x=>x.id===id); if(!item) return;
    inlineEditExpense(item);
  };
}

function renderIncome(){
  const list = $('#incomeList'); list.innerHTML='';
  if(!income.length){ list.innerHTML = '<li class="item"><span class="meta">No income yet</span></li>'; return; }
  income.forEach(x=>{
    const li = document.createElement('li');
    li.className='item'; li.dataset.id = x.id;
    const sub = `${x.cadence}${x.date?` • ${x.date}`:''}`;
    li.innerHTML = `
      <div class="meta"><strong>${x.name}</strong><span class="sub">${sub}</span></div>
      <div class="row">
        <span class="amt">${fmt(x.amount)}</span>
        <button class="btn small" data-del="${x.id}" aria-label="Delete ${x.name}">✕</button>
      </div>`;
    list.appendChild(li);
  });

  // delegation: delete / edit
  list.onclick = (e)=>{
    const delId = e.target?.dataset?.del;
    if(delId){ deleteIncome(delId); return; }
    const li = e.target.closest('.item'); if(!li) return;
    if(e.target.tagName==='BUTTON') return; // ignore button
    const id = li.dataset.id;
    const item = income.find(x=>x.id===id); if(!item) return;
    inlineEditIncome(item);
  };
}

function inlineEditExpense(item){
  const n = prompt('Name:', item.name); if(n===null) return;
  const a = prompt('Amount (USD):', item.amount); if(a===null) return;
  const c = prompt('Category:', item.category||'Uncategorized'); if(c===null) return;
  const cad = prompt('Cadence (oneoff/weekly/biweekly/monthly/yearly):', item.cadence); if(cad===null) return;
  const d = prompt('Date (YYYY-MM-DD) or blank:', item.date||''); if(d===null) return;
  Object.assign(item,{
    name: (n||item.name).trim(),
    amount: Number(a)||0,
    category: titleCase(c||'Uncategorized'),
    cadence: (cad||item.cadence).trim(),
    date: d||null
  });
  save(keys.expenses, expenses);
  renderExpenses(); renderDashboard(); renderHistory();
}
function inlineEditIncome(item){
  const n = prompt('Name:', item.name); if(n===null) return;
  const a = prompt('Amount (USD):', item.amount); if(a===null) return;
  const cad = prompt('Cadence (oneoff/weekly/biweekly/monthly/yearly):', item.cadence); if(cad===null) return;
  const d = prompt('Date (YYYY-MM-DD) or blank:', item.date||''); if(d===null) return;
  Object.assign(item,{
    name: (n||item.name).trim(),
    amount: Number(a)||0,
    cadence: (cad||item.cadence).trim(),
    date: d||null
  });
  save(keys.income, income);
  renderIncome(); renderDashboard(); renderHistory();
}

// ---------- Dashboard ----------
let chart;
function renderDashboard(){
  // Monthly recurring totals + one-offs in current month
  const monthlyIncome   = income.reduce((s,x)=>s+monthlyize(x.amount,x.cadence),0)
                        + income.filter(x=>x.cadence==='oneoff' && inThisMonth(x.date))
                                .reduce((s,x)=>s+x.amount,0);
  const monthlyExpenses = expenses.reduce((s,x)=>s+monthlyize(x.amount,x.cadence),0)
                        + expenses.filter(x=>x.cadence==='oneoff' && inThisMonth(x.date))
                                  .reduce((s,x)=>s+x.amount,0);
  const net = monthlyIncome - monthlyExpenses;

  $('#monthlyIncome').textContent  = fmt(monthlyIncome);
  $('#monthlyExpenses').textContent= fmt(monthlyExpenses);
  const netEl = $('#monthlyNet');
  netEl.textContent = fmt(net);
  netEl.classList.toggle('pos', net >= 0);
  netEl.classList.toggle('neg', net < 0);

  // Upcoming 14 days
  const up = [
    ...income.filter(x=>x.date && nextNDays(x.date)).map(x=>({type:'income', ...x})),
    ...expenses.filter(x=>x.date && nextNDays(x.date)).map(x=>({type:'expense', ...x}))
  ].sort((a,b)=> new Date(a.date) - new Date(b.date));
  const ul = $('#upcomingList'); ul.innerHTML='';
  if(!up.length){ ul.innerHTML='<li class="item"><span class="meta">Nothing due in the next 14 days</span></li>'; }
  up.forEach(x=>{
    const li = document.createElement('li'); li.className='item';
    const side = x.type==='income'?`+${fmt(x.amount)}`:`-${fmt(x.amount)}`;
    li.innerHTML = `<div class="meta"><strong>${x.name}</strong><span class="sub">${x.type} • ${x.date||''}</span></div><span class="amt">${side}</span>`;
    ul.appendChild(li);
  });

  // Chart
  const ctx = $('#budgetChart');
  const ds = [Math.max(0,monthlyIncome), Math.max(0,monthlyExpenses), Math.max(0,net)];
  if(chart) chart.destroy();
  // Chart.js is loaded via CDN in index.html; guard if missing
  if(window.Chart){
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['Income','Expenses','Net'], datasets: [{ data: ds }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{ y:{ beginAtZero:true } }
      }
    });
  }

  // Budgets block
  renderBudgets();
}

// ---------- Budgets ----------
function ensureBudgetUI(){
  const dash = $('#view-dashboard');
  if(!$('#budgetBlock')){
    const block = document.createElement('div');
    block.className='list-block'; block.id='budgetBlock';
    block.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="margin:0">Budgets</h2>
        <button id="addBudgetBtn" class="btn small">Set budget</button>
      </div>
      <ul id="budgetProgress" class="list"></ul>`;
    dash.appendChild(block);
    $('#addBudgetBtn').addEventListener('click', ()=>{
      const cat = prompt('Category to set monthly budget for (case sensitive):');
      if(!cat) return;
      const amt = prompt(`Monthly budget for "${cat}" (USD):`, budgets[titleCase(cat)] ?? '');
      if(amt===null) return;
      setBudget(cat, amt);
    });
  }
}
function setBudget(category, amount){
  const cat = titleCase(category||'Uncategorized');
  budgets[cat] = Number(amount)||0;
  save(keys.budgets, budgets);
  renderBudgets();
}
function monthlySpendByCategory(){
  const sum = {};
  expenses.forEach(x=>{ sum[x.category||'Uncategorized']=(sum[x.category||'Uncategorized']||0)+monthlyize(x.amount,x.cadence); });
  expenses.filter(x=>x.cadence==='oneoff' && inThisMonth(x.date))
          .forEach(x=>{ sum[x.category||'Uncategorized']=(sum[x.category||'Uncategorized']||0)+x.amount; });
  return sum;
}
function renderBudgets(){
  ensureBudgetUI();
  const data = monthlySpendByCategory();
  const ul = $('#budgetProgress'); ul.innerHTML='';
  const cats = Object.keys({...data, ...budgets}).sort();
  if(!cats.length){ ul.innerHTML='<li class="item"><span class="meta">No budgets yet. Tap "Set budget".</span></li>'; return; }
  cats.forEach(cat=>{
    const spent = data[cat]||0, cap = budgets[cat]||0;
    const pct = cap ? Math.min(100, Math.round(spent*100/cap)) : 0;
    const over = cap && spent > cap;
    const li = document.createElement('li'); li.className='item';
    li.innerHTML = `<div class="meta">
      <strong>${cat}</strong>
      <span class="sub">${fmt(spent)}${cap?` / ${fmt(cap)}`:''} • ${pct}%${over?' (over)':''}</span>
      <div class="bar${over?' over':''}"><div class="barFill" style="width:${cap?Math.min(100,(spent/cap)*100):0}%;"></div></div>
    </div>
    <div class="row"><button class="btn small" data-bcat="${cat}">Edit</button></div>`;
    li.querySelector('[data-bcat]').addEventListener('click', ()=>{
      const amt = prompt(`Monthly budget for "${cat}" (USD):`, budgets[cat] ?? '');
      if(amt===null) return;
      setBudget(cat, amt);
    });
    ul.appendChild(li);
  });
}

// ---------- History / Export / Import / Backup ----------
function renderHistory(){
  const items = [];
  income.forEach(x=>{ if(x.cadence==='oneoff' && inThisMonth(x.date)) items.push({date:x.date||'', name:x.name, type:'income', amount:x.amount}); });
  expenses.forEach(x=>{ if(x.cadence==='oneoff' && inThisMonth(x.date)) items.push({date:x.date||'', name:x.name, type:'expense', amount:x.amount}); });
  items.sort((a,b)=> new Date(a.date) - new Date(b.date));
  const ul = $('#historyList'); ul.innerHTML='';
  if(!items.length){ ul.innerHTML='<li class="item"><span class="meta">No one-off items logged this month</span></li>'; }
  items.forEach(it=>{
    const li = document.createElement('li'); li.className='item';
    li.innerHTML = `<div class="meta"><strong>${it.name}</strong><span class="sub">${it.type} • ${it.date}</span></div><span class="amt">${fmt(it.amount)}</span>`;
    ul.appendChild(li);
  });

  // Buttons
  $('#exportBtn')?.addEventListener('click', exportJSON, { once:true });
  $('#wipeBtn')?.addEventListener('click', wipeAll, { once:true });

  // Inject Import + Restore if missing
  installImportUI();
}

function exportJSON(){
  const payload = { exportedAt: new Date().toISOString(), income, expenses, budgets };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'budget-buddy-export.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function wipeAll(){
  if(!confirm('Wipe all on-device data?')) return;
  expenses=[]; income=[]; budgets={};
  save(keys.expenses, expenses); save(keys.income, income); save(keys.budgets, budgets);
  renderDashboard(); renderExpenses(); renderIncome(); renderHistory();
}

// ---- Backup / Restore ----
function makeBackup(){
  try{
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const payload = { stamp, income, expenses, budgets };
    const key = `bb_backup_${stamp}`;
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.setItem(keys.backupLatest, key);
    return key;
  }catch(e){ console.warn('Backup failed', e); return null; }
}
function restoreLatestBackup(){
  const key = localStorage.getItem(keys.backupLatest);
  if(!key){ alert('No backup found'); return; }
  try{
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    if(!data || !Array.isArray(data.expenses) || !Array.isArray(data.income)){
      alert('Backup corrupted/unusable'); return;
    }
    expenses = data.expenses; income = data.income; budgets = data.budgets || {};
    save(keys.expenses, expenses); save(keys.income, income); save(keys.budgets, budgets);
    renderDashboard(); renderExpenses(); renderIncome(); renderHistory();
    alert('Restored from backup: ' + key);
  }catch(e){ alert('Restore failed: ' + e.message); }
}

// ---- CSV parsing & import ----
function parseCSV(text){
  const lines = String(text).replace(/\r\n?/g,'\n').split('\n').filter(Boolean);
  if(!lines.length) return { rows: [], headers: [] };
  const parseLine = (line)=>{
    const out=[]; let cur=''; let q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i], nx=line[i+1];
      if(ch === '"'){
        if(q && nx === '"'){ cur+='"'; i++; }
        else q = !q;
      } else if(ch === ',' && !q){ out.push(cur); cur=''; }
      else { cur += ch; }
    }
    out.push(cur); return out;
  };
  const headers = parseLine(lines[0]).map(h=>h.trim().toLowerCase());
  const rows = lines.slice(1).map(l=>{
    const cells = parseLine(l).map(c=>c.trim());
    const obj={}; headers.forEach((h,i)=> obj[h] = cells[i] ?? '');
    return obj;
  });
  return { rows, headers };
}
function normalizeRow(row){
  const name = row.name || row.title || '';
  let amount = parseFloat(String(row.amount||row.amt||'').replace(/[^-\d.]/g,'')) || 0;
  let type = (row.type || '').toLowerCase();
  const cadence = (row.cadence || row.freq || 'monthly').toLowerCase();
  const category = titleCase(row.category || 'Uncategorized');
  const date = row.date ? String(row.date).slice(0,10) : '';
  if(!type){ type = amount >= 0 ? 'income' : 'expense'; }
  amount = Math.abs(amount);
  return { type, item: { id:uid(), name: name || '(Unnamed)', amount, category, cadence, date: date || null, createdAt: Date.now() } };
}
function sig(x, type){
  const d = x.date || '';
  return [type, (x.name||'').toLowerCase(), Number(x.amount||0).toFixed(2), (x.category||'').toLowerCase(), x.cadence, d].join('|');
}

function installImportUI(){
  const hist = $('#view-history');
  if(!hist) return;
  if($('#importBtn')) return; // already installed

  const row = hist.querySelector('.row');
  if(!row) return;

  const importBtn = document.createElement('button');
  importBtn.id='importBtn'; importBtn.className='btn'; importBtn.textContent='Import CSV';
  row.insertBefore(importBtn, row.firstChild);

  const restoreBtn = document.createElement('button');
  restoreBtn.id='restoreBtn'; restoreBtn.className='btn'; restoreBtn.textContent='Restore Backup';
  row.appendChild(restoreBtn);

  const fi = document.createElement('input');
  fi.type='file'; fi.accept='.csv,text/csv'; fi.style.display='none';
  hist.appendChild(fi);

  importBtn.addEventListener('click', ()=> fi.click());
  restoreBtn.addEventListener('click', restoreLatestBackup);
  fi.addEventListener('change', (e)=>{
    const file = e.target.files?.[0]; if(!file) return;

    // backup first
    const key = makeBackup(); if(key) console.log('Backup:', key);

    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const { rows } = parseCSV(reader.result||'');
        if(!rows.length){ alert('CSV appears empty'); return; }

        const replace = confirm('Import mode:\nOK = MERGE (recommended)\nCancel = REPLACE (destructive, but backed up)');

        const existingSigs = new Set([
          ...income.map(x=>sig(x,'income')),
          ...expenses.map(x=>sig(x,'expense'))
        ]);

        const importedIncome=[], importedExpenses=[]; let skipped=0;
        rows.forEach(r=>{
          const { type, item } = normalizeRow(r);
          const s = sig(item, type);
          if(!replace && existingSigs.has(s)){ skipped++; return; }
          if(type==='income') importedIncome.push(item); else importedExpenses.push(item);
        });

        if(replace){ income = importedIncome; expenses = importedExpenses; }
        else { income = [...importedIncome, ...income]; expenses = [...importedExpenses, ...expenses]; }

        save(keys.income, income); save(keys.expenses, expenses); save(keys.budgets, budgets);
        renderDashboard(); renderIncome(); renderExpenses(); renderHistory();

        alert(
          `Import complete:\n`+
          `+${importedIncome.length} income, +${importedExpenses.length} expenses\n`+
          `${skipped ? `(${skipped} duplicates skipped)` : ''}\n`+
          (replace ? 'Mode: REPLACE (backup created)' : 'Mode: MERGE (safe)')
        );
      }catch(err){
        alert('Import failed: ' + (err?.message||err));
      }finally{
        fi.value = '';
      }
    };
    reader.readAsText(file);
  });
}

// ---------- Init ----------
function init(){
  initNav();
  initForms();
  renderDashboard(); renderExpenses(); renderIncome(); renderHistory();

  // Ensure no sideways scroll (belt-and-suspenders)
  document.documentElement.style.overflowX = 'hidden';
  document.body.style.overflowX = 'hidden';

  // Service worker register (if present)
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); });
  }
}
document.addEventListener('DOMContentLoaded', init);
// === PATCH v2.7: Manual Backup + JSON Import (append-only) ===
(function addBackupAndJsonImport(){
  const hist = document.getElementById('view-history');
  const row = hist?.querySelector('.row');
  if(!row) return;

  // Create Backup button (stores a snapshot in localStorage; restore via "Restore Backup")
  if(!document.getElementById('backupBtn')){
    const b = document.createElement('button');
    b.id='backupBtn'; b.className='btn'; b.textContent='Create Backup';
    b.addEventListener('click', ()=>{
      const key = (typeof makeBackup==='function') ? makeBackup() : null;
      alert(key ? ('Backup saved: ' + key) : 'Backup failed');
    });
    row.insertBefore(b, row.firstChild);
  }

  // Import JSON button (lossless restore/merge from your Export JSON file)
  if(!document.getElementById('importJsonBtn')){
    const btn = document.createElement('button');
    btn.id='importJsonBtn'; btn.className='btn'; btn.textContent='Import JSON';
    const file = document.createElement('input');
    file.type='file'; file.accept='.json,application/json'; file.style.display='none';
    hist.appendChild(file);
    btn.addEventListener('click', ()=> file.click());

    file.addEventListener('change', (e)=>{
      const f = e.target.files?.[0]; if(!f) return;
      const key = (typeof makeBackup==='function') ? makeBackup() : null; // always back up first
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const data = JSON.parse(reader.result||'{}');
          if(!data || typeof data!=='object') throw new Error('Invalid JSON');
          const merge = confirm('Import JSON:\nOK = MERGE (safe)\nCancel = REPLACE (uses backup)');
          const incNew = Array.isArray(data.income)? data.income : [];
          const expNew = Array.isArray(data.expenses)? data.expenses : [];
          const budNew = (data.budgets && typeof data.budgets==='object') ? data.budgets : {};

          if(merge){
            income = [...incNew, ...income];
            expenses = [...expNew, ...expenses];
            budgets = {...budgets, ...budNew};
          }else{
            income = incNew; expenses = expNew; budgets = budNew;
          }

          localStorage.setItem('bb_income', JSON.stringify(income));
          localStorage.setItem('bb_expenses', JSON.stringify(expenses));
          localStorage.setItem('bb_budgets', JSON.stringify(budgets));

          // Re-render
          if (typeof renderDashboard==='function') renderDashboard();
          if (typeof renderIncome==='function')    renderIncome();
          if (typeof renderExpenses==='function')  renderExpenses();
          if (typeof renderHistory==='function')   renderHistory();

          alert('JSON import complete' + (key ? ' (backup created)' : ''));
        }catch(err){
          alert('JSON import failed: ' + (err?.message||err));
        }finally{
          file.value = '';
        }
      };
      reader.readAsText(f);
    });

    const csvBtn = document.getElementById('importBtn');
    if(csvBtn) row.insertBefore(btn, csvBtn.nextSibling);
    else row.insertBefore(btn, row.firstChild);
  }
})();
