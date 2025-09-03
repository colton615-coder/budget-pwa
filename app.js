
// Budget Buddy v2 (Income + Expenses). Offline-first, localStorage.
// SPA navigation
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const keys = {
  expenses: 'bb_expenses',
  income: 'bb_income'
};

function load(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fmt(n){ return `$${Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`; }

// Cadence -> monthly multiplier
function monthlyize(amount, cadence){
  const a = Number(amount||0);
  switch(cadence){
    case 'weekly': return a * 52 / 12;
    case 'biweekly': return a * 26 / 12;
    case 'yearly': return a / 12;
    case 'monthly': return a;
    case 'oneoff': return 0; // oneoffs not included in recurring monthly calc
    default: return 0;
  }
}
// === PATCH v2.4: normalize categories, net color, over-budget bars, quick amounts, tab scroll reset ===

// Title-case helper to keep categories consistent
function titleCase(s){ return String(s||'').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()); }

// Normalize category BEFORE the original handler runs (capture phase)
(function normalizeCatInputs(){
  const ef = document.getElementById('expenseForm');
  if(ef){
    ef.addEventListener('submit', ()=> {
      const el = document.getElementById('expCategory');
      el.value = titleCase(el.value || 'Uncategorized');
    }, true); // run before existing submit listener
  }
})();

// Ensure budgets use normalized category names too
if (typeof setBudget === 'function'){
  const __setBudget = setBudget;
  setBudget = function(cat, amount){ __setBudget(titleCase(cat||'Uncategorized'), amount); };
}

// Color the NET value (green if >=0, red if <0) after dashboard renders
const __renderDashboard2 = renderDashboard;
renderDashboard = function(){
  __renderDashboard2();
  const el = document.getElementById('monthlyNet');
  if(el){
    const num = parseFloat((el.textContent||'').replace(/[^-\d.]/g,''));
    el.classList.remove('pos','neg');
    if(!isNaN(num)) el.classList.add(num >= 0 ? 'pos' : 'neg');
  }
};

// Rebuild Budgets renderer to mark overspends red and keep editing
if (typeof renderBudgets === 'function'){
  renderBudgets = function(){
    ensureBudgetUI();
    const data = monthlySpendByCategory();
    const ul = document.getElementById('budgetProgress');
    ul.innerHTML = '';
    const cats = Object.keys({...data, ...budgets}).sort();
    if(!cats.length){ ul.innerHTML = '<li class="item"><span class="meta">No budgets yet. Tap "Set budget".</span></li>'; return; }
    cats.forEach(cat=>{
      const spent = data[cat]||0, cap = budgets[cat]||0;
      const pct = cap ? Math.min(100, Math.round(spent*100/cap)) : 0;
      const over = cap && spent > cap;
      const li = document.createElement('li'); li.className='item';
      li.innerHTML = `<div class="meta">
        <strong>${cat}</strong>
        <span class="sub">${fmt(spent)}${cap?` / ${fmt(cap)}`:''} • ${pct}%${over?' (over)':''}</span>
        <div class="bar${over?' over':''}"><div class="barFill" style="width:${Math.min(100, (spent/cap)*100 || 0)}%;"></div></div>
      </div>
      <div class="row"><button class="btn small" data-bcat="${cat}">Edit</button></div>`;
      li.querySelector('[data-bcat]').addEventListener('click', ()=>{
        const amt = prompt(`Monthly budget for "${cat}" (USD):`, budgets[cat] ?? '');
        if(amt===null) return;
        setBudget(cat, amt);
      });
      ul.appendChild(li);
    });
  };
}

// Quick-amount buttons (both forms) for faster entry
(function quickAmounts(){
  const add = (formId, inputId)=>{
    const f = document.getElementById(formId);
    const input = document.getElementById(inputId);
    if(!f || !input) return;
    const row = document.createElement('div');
    row.className = 'row';
    ['25','50','100','250','500'].forEach(v=>{
      const b = document.createElement('button');
      b.type='button'; b.className='btn small'; b.textContent='$'+v;
      b.addEventListener('click', ()=>{ input.value = v; input.dispatchEvent(new Event('input',{bubbles:true})); });
      row.appendChild(b);
    });
    f.insertBefore(row, f.querySelector('.row')); // above Save/Clear
  };
  add('expenseForm','expAmount');
  add('incomeForm','incAmount');
})();

// Reset scroll to top when switching tabs (prevents "miles of scroll" feeling)
(function resetOnTabChange(){
  $$('.tab').forEach(btn=>btn.addEventListener('click', ()=>{ window.scrollTo({top:0, behavior:'instant'}); }, {passive:true}));
})();
function inThisMonth(dateStr){
  if(!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function nextNDays(dateStr, n=14){
  if(!dateStr) return false;
  const now = new Date();
  const d = new Date(dateStr);
  const diff = (d - now) / (1000*60*60*24);
  return diff >= 0 && diff <= n;
}

function uid(){ return Math.random().toString(36).slice(2,9); }

// STATE
let expenses = load(keys.expenses);
let income = load(keys.income);

// NAV
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#'+target).classList.add('active');
    if(target === 'view-dashboard') renderDashboard();
    if(target === 'view-expense') renderExpenses();
    if(target === 'view-income') renderIncome();
    if(target === 'view-history') renderHistory();
  });
});

// EXPENSES
$('#expenseForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const item = {
    id: uid(),
    name: $('#expName').value.trim(),
    amount: Number($('#expAmount').value||0),
    category: $('#expCategory').value.trim() || 'Uncategorized',
    cadence: $('#expCadence').value,
    date: $('#expDate').value || null,
    createdAt: Date.now()
  };
  if(!item.name || !item.amount){ return; }
  expenses.unshift(item);
  save(keys.expenses, expenses);
  e.target.reset();
  renderExpenses();
  renderDashboard();
});

function deleteExpense(id){
  expenses = expenses.filter(x=>x.id!==id);
  save(keys.expenses, expenses);
  renderExpenses(); renderDashboard(); renderHistory();
}

function renderExpenses(){
  const list = $('#expenseList');
  list.innerHTML = '';
  if(!expenses.length){ list.innerHTML = '<li class="item"><span class="meta">No expenses yet</span></li>'; return; }
  expenses.forEach(x=>{
    const li = document.createElement('li');
    li.className = 'item';
    const sub = `${x.category} • ${x.cadence}${x.date?` • ${x.date}`:''}`;
    li.innerHTML = `<div class="meta"><strong>${x.name}</strong><span class="sub">${sub}</span></div>
                    <div class="row">
                      <span class="amt">${fmt(x.amount)}</span>
                      <button class="btn small" aria-label="Delete ${x.name}">✕</button>
                    </div>`;
    li.querySelector('button').addEventListener('click', ()=>deleteExpense(x.id));
    list.appendChild(li);
  });
}

// INCOME
$('#incomeForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const item = {
    id: uid(),
    name: $('#incName').value.trim(),
    amount: Number($('#incAmount').value||0),
    cadence: $('#incCadence').value,
    date: $('#incDate').value || null,
    createdAt: Date.now()
  };
  if(!item.name || !item.amount){ return; }
  income.unshift(item);
  save(keys.income, income);
  e.target.reset();
  renderIncome();
  renderDashboard();
});

function deleteIncome(id){
  income = income.filter(x=>x.id!==id);
  save(keys.income, income);
  renderIncome(); renderDashboard(); renderHistory();
}

function renderIncome(){
  const list = $('#incomeList');
  list.innerHTML = '';
  if(!income.length){ list.innerHTML = '<li class="item"><span class="meta">No income yet</span></li>'; return; }
  income.forEach(x=>{
    const li = document.createElement('li');
    li.className = 'item';
    const sub = `${x.cadence}${x.date?` • ${x.date}`:''}`;
    li.innerHTML = `<div class="meta"><strong>${x.name}</strong><span class="sub">${sub}</span></div>
                    <div class="row">
                      <span class="amt">${fmt(x.amount)}</span>
                      <button class="btn small" aria-label="Delete ${x.name}">✕</button>
                    </div>`;
    li.querySelector('button').addEventListener('click', ()=>deleteIncome(x.id));
    list.appendChild(li);
  });
}

// DASHBOARD & CHART
let chart;
function renderDashboard(){
  // Monthly recurring
  const monthlyIncome = income.reduce((sum,x)=> sum + monthlyize(x.amount, x.cadence), 0);
  const monthlyExpenses = expenses.reduce((sum,x)=> sum + monthlyize(x.amount, x.cadence), 0);
  // One-offs in this month
  const oneOffIncome = income.filter(x=>x.cadence==='oneoff' && inThisMonth(x.date)).reduce((s,x)=>s+x.amount,0);
  const oneOffExpenses = expenses.filter(x=>x.cadence==='oneoff' && inThisMonth(x.date)).reduce((s,x)=>s+x.amount,0);

  const mInc = monthlyIncome + oneOffIncome;
  const mExp = monthlyExpenses + oneOffExpenses;
  const net = mInc - mExp;

  $('#monthlyIncome').textContent = fmt(mInc);
  $('#monthlyExpenses').textContent = fmt(mExp);
  $('#monthlyNet').textContent = fmt(net);

  // Upcoming (next 14d)
  const up = [
    ...income.filter(x=>x.date && nextNDays(x.date)).map(x=>({type:'income', ...x})),
    ...expenses.filter(x=>x.date && nextNDays(x.date)).map(x=>({type:'expense', ...x}))
  ].sort((a,b)=> new Date(a.date) - new Date(b.date));
  const ul = $('#upcomingList'); ul.innerHTML = '';
  if(!up.length){ ul.innerHTML = '<li class="item"><span class="meta">Nothing due in the next 14 days</span></li>'; }
  up.forEach(x=>{
    const li = document.createElement('li');
    li.className = 'item';
    const side = x.type==='income'?`+${fmt(x.amount)}`:`-${fmt(x.amount)}`;
    li.innerHTML = `<div class="meta"><strong>${x.name}</strong><span class="sub">${x.type} • ${x.date||''}</span></div><span class="amt">${side}</span>`;
    ul.appendChild(li);
  });

  // Chart
  const ctx = $('#budgetChart');
  const dataInc = Math.max(0, mInc);
  const dataExp = Math.max(0, mExp);
  const dataNet = Math.max(0, net);
  const ds = [dataInc, dataExp, dataNet];
  if(chart){ chart.destroy(); }
  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: ['Income','Expenses','Net'],
            datasets: [{ data: ds }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: { y: { beginAtZero:true } }
    }
  });
}

// HISTORY / EXPORT
function renderHistory(){
  const now = new Date();
  const items = [];
  income.forEach(x=>{
    if(x.cadence==='oneoff' && inThisMonth(x.date)){
      items.push({date:x.date||'', name:x.name, type:'income', amount:x.amount});
    }
  });
  expenses.forEach(x=>{
    if(x.cadence==='oneoff' && inThisMonth(x.date)){
      items.push({date:x.date||'', name:x.name, type:'expense', amount:x.amount});
    }
  });
  items.sort((a,b)=> new Date(a.date) - new Date(b.date));
  const ul = $('#historyList'); ul.innerHTML = '';
  if(!items.length){ ul.innerHTML = '<li class="item"><span class="meta">No one‑off items logged this month</span></li>'; return; }
  items.forEach(it=>{
    const li = document.createElement('li'); li.className = 'item';
    li.innerHTML = `<div class="meta"><strong>${it.name}</strong><span class="sub">${it.type} • ${it.date}</span></div>
                    <span class="amt">${fmt(it.amount)}</span>`;
    ul.appendChild(li);
  });
}

$('#exportBtn').addEventListener('click', ()=>{
  const payload = { exportedAt: new Date().toISOString(), income, expenses };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'budget-buddy-export.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

$('#wipeBtn').addEventListener('click', ()=>{
  if(!confirm('Wipe all on‑device data?')) return;
  income = []; expenses = [];
  save(keys.income, income); save(keys.expenses, expenses);
  renderDashboard(); renderIncome(); renderExpenses(); renderHistory();
});

// INIT
addEventListener('DOMContentLoaded', ()=>{
  renderDashboard(); renderExpenses(); renderIncome(); renderHistory();
});

// Register Service Worker
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js');
  });
}
// === PATCH v2.3: Inline Edit + Category Budgets (append-only) ===
keys.budgets = 'bb_budgets';
let budgets = load(keys.budgets, {}); // { "Housing": 1200, ... }
function setBudget(category, amount){ budgets[category]=Number(amount)||0; save(keys.budgets, budgets); renderBudgets(); }

// Monthly spend per category (recurring + this month's one-offs)
function monthlySpendByCategory(){
  const sum = {};
  expenses.forEach(x => sum[x.category]=(sum[x.category]||0)+monthlyize(x.amount,x.cadence));
  expenses.filter(x=>x.cadence==='oneoff' && inThisMonth(x.date))
          .forEach(x => sum[x.category]=(sum[x.category]||0)+x.amount);
  return sum;
}

// Inject "Budgets" block into Dashboard (no HTML edits needed)
function ensureBudgetUI(){
  const dash = document.getElementById('view-dashboard');
  if(!document.getElementById('budgetBlock')){
    const block = document.createElement('div');
    block.className='list-block';
    block.id='budgetBlock';
    block.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="margin:0">Budgets</h2>
        <button id="addBudgetBtn" class="btn small">Set budget</button>
      </
