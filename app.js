/* ===== Budget Buddy v1.4 — original look + MTD + iOS fixes ===== */
// Storage keys
const EXP_KEY='expenses'; const INC_KEY='incomes';

let expenses = JSON.parse(localStorage.getItem(EXP_KEY) || '[]');
let incomes  = JSON.parse(localStorage.getItem(INC_KEY) || '[]');

const $ = (sel)=>document.querySelector(sel);
const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

// Date helpers
const startOfMonth = (d=new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d=new Date()) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
const inThisMonth  = (iso)=> iso ? (d=> d>=startOfMonth() && d<=endOfMonth())(new Date(iso)) : false;

// Migrations
(function migrate(){
  let changed=false;
  for (const e of expenses){ if(!e.createdAt){ e.createdAt=new Date().toISOString(); changed=true; }
    if(e.frequency==null){ e.frequency='oneoff'; changed=true; }
    e.amount=Number(e.amount)||0; }
  if(changed) localStorage.setItem(EXP_KEY, JSON.stringify(expenses));
})();

// Totals
const incomeMTD = ()=> (incomes||[]).filter(i=>inThisMonth(i.date||i.createdAt)).reduce((s,i)=>s+(+i.amount||0),0);
const spentMTD  = ()=> (expenses||[]).filter(e=>inThisMonth(e.date||e.createdAt)).reduce((s,e)=>s+(+e.amount||0),0);
const recurringMonthly = ()=> (expenses||[]).filter(e=>e.frequency==='monthly').reduce((s,e)=>s+(+e.amount||0),0);

// UI
const set$ = (sel,val)=>{ const el=$(sel); if(el) el.textContent = `$${(Number(val)||0).toFixed(2)}`; };

// Chart
function ensureChart(){
  const c = $('#summaryChart'); if(!c || typeof Chart==='undefined') return null;
  if(window.summaryChart) return window.summaryChart;
  window.summaryChart = new Chart(c.getContext('2d'),{
    type:'bar',
    data:{ labels:['Income','Expenses','Net'], datasets:[{ label:'This Month', data:[0,0,0] }] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true }}, animation:false }
  });
  return window.summaryChart;
}

// Dashboard update
function updateDashboard(){
  const inc = incomeMTD();
  const exp = spentMTD();
  const net = inc - exp;
  set$('#monthlyIncome',inc);
  set$('#monthlyExpenses',exp);
  const netEl = $('#netAmount'); if(netEl){ netEl.textContent = `$${net.toFixed(2)}`; netEl.classList.toggle('positive', net>=0); }

  const ch = ensureChart();
  if(ch){ ch.data.datasets[0].data=[inc,exp,net]; try{ ch.update(); }catch{} }
}
function set$(sel,val){ const el=$(sel); if(el) el.textContent = `$${(Number(val)||0).toFixed(2)}`; }

// Expenses list render
function renderExpenses(){
  const host = $('#expensesList'); if(!host) return;
  host.innerHTML='';
  const data = [...expenses].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  for(const e of data){
    const row = document.createElement('div'); row.className='item';
    const left = document.createElement('div'); left.className='left';
    left.innerHTML = `<div class="name">${e.name||'Expense'}</div><div class="meta">${e.category||'General'} • ${e.frequency} • ${(e.date||e.createdAt||'').slice(0,10)}</div>`;
    const right = document.createElement('div'); right.className='right';
    right.innerHTML = `<span class="amount">$${(+e.amount||0).toFixed(2)}</span> <button class="del" data-id="${e.id}">×</button>`;
    row.append(left,right); host.appendChild(row);
  }
  host.querySelectorAll('.del').forEach(btn=>{
    if(!btn.dataset.bound){ btn.addEventListener('click',()=>{ const id=btn.getAttribute('data-id'); expenses=expenses.filter(x=>x.id!==id); localStorage.setItem(EXP_KEY,JSON.stringify(expenses)); renderExpenses(); updateDashboard(); }); btn.dataset.bound='1'; }
  });
}

// Save expense
function saveExpense(){
  const name = $('#expenseName')?.value||'';
  const amount = +($('#expenseAmount')?.value||0);
  const category = $('#expenseCategory')?.value||'';
  const frequency = $('#expenseFrequency')?.value||'oneoff';
  const dateInput = $('#expenseDate')?.value;
  const dateISO = dateInput ? new Date(dateInput).toISOString() : null;
  if(!name || !amount){ alert('Enter a name and amount'); return; }
  const exp = { id: (crypto.randomUUID&&crypto.randomUUID())||String(Date.now()+Math.random()), name, amount, category, frequency, date:dateISO, createdAt:new Date().toISOString() };
  expenses.push(exp); localStorage.setItem(EXP_KEY,JSON.stringify(expenses));
  ['expenseName','expenseAmount','expenseCategory','expenseDate'].forEach(id=>{ const el=$('#'+id); if(el) el.value=''; });
  $('#expenseFrequency').value='oneoff';
  renderExpenses(); updateDashboard();
}

// Save income (simple)
function saveIncome(){
  const name = $('#incomeName')?.value||'Income';
  const amount = +($('#incomeAmount')?.value||0);
  const dateInput = $('#incomeDate')?.value;
  const dateISO = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();
  if(!amount){ alert('Enter an amount'); return; }
  incomes.push({ id:String(Date.now()+Math.random()), name, amount, createdAt:dateISO, date:dateISO });
  localStorage.setItem(INC_KEY, JSON.stringify(incomes));
  $('#incomeName').value=''; $('#incomeAmount').value=''; $('#incomeDate').value='';
  renderIncome(); updateDashboard();
}
function renderIncome(){
  const host = $('#incomeList'); if(!host) return;
  host.innerHTML = (incomes||[]).slice(-50).reverse().map(i=>`<div class="item"><div class="left"><div class="name">${i.name||'Income'}</div><div class="meta">${(i.date||i.createdAt||'').slice(0,10)}</div></div><div class="amount">$${(+i.amount||0).toFixed(2)}</div></div>`).join('');
}

// Tabs
function showTab(tab){
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  $$('.page').forEach(p=>p.classList.toggle('active', p.id===`page-${tab}`));
  window.scrollTo({ top: 0, behavior:'instant' });
}

// Ready
document.addEventListener('DOMContentLoaded', () => {
  // Prevent form submits
  document.querySelectorAll('form').forEach(f=> f.addEventListener('submit', e=> e.preventDefault()));
  // Buttons
  $('#saveExpenseBtn')?.addEventListener('click', saveExpense);
  $('#clearExpenseBtn')?.addEventListener('click', ()=>{
    ['expenseName','expenseAmount','expenseCategory','expenseDate'].forEach(id=>{ const el=$('#'+id); if(el) el.value=''; });
    $('#expenseFrequency').value='oneoff';
  });
  $('#saveIncomeBtn')?.addEventListener('click', saveIncome);
  $('#exportBtn')?.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify({ expenses, incomes }, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='budget-buddy-data.json'; a.click(); URL.revokeObjectURL(url);
  });
  $('#clearAllBtn')?.addEventListener('click', ()=>{
    if(!confirm('Delete ALL expenses and incomes?')) return;
    expenses=[]; incomes=[];
    localStorage.setItem(EXP_KEY,'[]'); localStorage.setItem(INC_KEY,'[]');
    renderExpenses(); renderIncome(); updateDashboard();
  });

  // Quick amount chips
  $$('.chip[data-amount]').forEach(ch=> ch.addEventListener('click', ()=>{ const amt = +ch.dataset.amount; const f=$('#expenseAmount'); if(f){ f.value = (+(f.value||0) + amt).toFixed(2); } }));

  // Tabs
  $$('.tab').forEach(t=> t.addEventListener('click', ()=> showTab(t.dataset.tab)));

  // Initial render
  renderExpenses(); renderIncome(); updateDashboard();
});
/* ===== v1.4.1 — Button fix + Emoji UI (append to end) ===== */
(function () {
  if (window.__BB_EMOJI_PATCH__) return; // avoid double-patch
  window.__BB_EMOJI_PATCH__ = true;

  // --- helpers ---
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const n  = (v, d=0) => Number(v ?? d) || d;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // Prevent accidental form submits (common cause of "button doesn't work")
  function preventFormSubmits() {
    document.querySelectorAll('form').forEach(f => {
      if (!f.dataset.nosubmit) {
        f.addEventListener('submit', (e) => e.preventDefault());
        f.dataset.nosubmit = '1';
      }
    });
  }

  // ---- action wrappers (call whichever exists in your app) ----
  function bbSaveExpense() {
    if (typeof saveExpense === 'function') return saveExpense();
    if (typeof onSaveExpenseClick === 'function') return onSaveExpenseClick();

    // Fallback: minimal inline save using common IDs
    const name = $('#expenseName')?.value || '';
    const amount = n($('#expenseAmount')?.value);
    if (!name || !amount) { alert('Enter a name and amount.'); return; }
    const category  = $('#expenseCategory')?.value || '';
    const frequency = $('#expenseFrequency')?.value || 'oneoff';
    const dval      = $('#expenseDate')?.value;
    const dateISO   = dval ? new Date(dval).toISOString() : null;

    const EXP_KEY = 'expenses';
    let expenses  = JSON.parse(localStorage.getItem(EXP_KEY) || '[]');
    expenses.push({
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()),
      name, category, amount, frequency, date: dateISO, createdAt: new Date().toISOString()
    });
    localStorage.setItem(EXP_KEY, JSON.stringify(expenses));

    // best-effort refresh if app provided functions exist
    try { renderExpenses?.(); } catch {}
    try { recomputeDashboard?.('mtd'); updateDashboard?.(); } catch {}

    // clear fields
    ['expenseName','expenseCategory','expenseAmount','expenseDate'].forEach(id => { const el = $('#'+id); if (el) el.value=''; });
    const f = $('#expenseFrequency'); if (f) f.value = 'oneoff';
  }

  function bbClearExpenseForm() {
    ['expenseName','expenseCategory','expenseAmount','expenseDate'].forEach(id => { const el = $('#'+id); if (el) el.value=''; });
    const f = $('#expenseFrequency'); if (f) f.value = 'oneoff';
  }

  function bbSaveIncome() {
    if (typeof saveIncome === 'function') return saveIncome();

    // Fallback inline income add
    const INC_KEY = 'incomes';
    let incomes   = JSON.parse(localStorage.getItem(INC_KEY) || '[]');
    const name    = $('#incomeName')?.value || 'Income';
    const amount  = n($('#incomeAmount')?.value);
    const dval    = $('#incomeDate')?.value;
    const dateISO = dval ? new Date(dval).toISOString() : new Date().toISOString();
    if (!amount) { alert('Enter income amount'); return; }
    incomes.push({ id:String(Date.now()+Math.random()), name, amount, date: dateISO, createdAt: dateISO });
    localStorage.setItem(INC_KEY, JSON.stringify(incomes));

    try { renderIncome?.(); } catch {}
    try { recomputeDashboard?.('mtd'); updateDashboard?.(); } catch {}

    ['incomeName','incomeAmount','incomeDate'].forEach(id => { const el = $('#'+id); if (el) el.value=''; });
  }

  function bbDeleteExpense(id) {
    if (typeof deleteExpense === 'function') return deleteExpense(id);

    // Fallback inline delete by id or data-del
    const EXP_KEY = 'expenses';
    let expenses  = JSON.parse(localStorage.getItem(EXP_KEY) || '[]');
    expenses = expenses.filter(e => String(e.id) !== String(id));
    localStorage.setItem(EXP_KEY, JSON.stringify(expenses));
    try { renderExpenses?.(); } catch {}
    try { recomputeDashboard?.('mtd'); updateDashboard?.(); } catch {}
  }

  function bbExportJSON() {
    const data = {
      expenses: JSON.parse(localStorage.getItem('expenses') || '[]'),
      incomes : JSON.parse(localStorage.getItem('incomes')  || '[]')
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'budget-buddy-data.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function bbClearAll() {
    if (!confirm('Delete ALL expenses and incomes?')) return;
    localStorage.setItem('expenses', '[]');
    localStorage.setItem('incomes',  '[]');
    try { renderExpenses?.(); renderIncome?.(); } catch {}
    try { recomputeDashboard?.('mtd'); updateDashboard?.(); } catch {}
  }

  function bbShowTab(tab) {
    if (typeof showTab === 'function') { showTab(tab); return; }
    // Fallback: classic page switcher with ids page-*
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${tab}`));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ---- Event delegation (one handler fixes all dead buttons) ----
  function attachDelegatedClicks() {
    if (document.__bbDelegatedClicksBound) return;
    document.__bbDelegatedClicksBound = true;

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action], .tab, [data-del], .del, #saveExpenseBtn, #clearExpenseBtn, #saveIncomeBtn, #exportBtn, #clearAllBtn');
      if (!t) return;

      // Normalize to an action
      let action = t.dataset.action;
      if (!action) {
        if (t.matches('.tab')) action = 'switch-tab';
        else if (t.matches('[data-del], .del')) action = 'delete-expense';
        else if (t.id === 'saveExpenseBtn') action = 'save-expense';
        else if (t.id === 'clearExpenseBtn') action = 'clear-expense';
        else if (t.id === 'saveIncomeBtn') action = 'save-income';
        else if (t.id === 'exportBtn')) action = 'export-json';
        else if (t.id === 'clearAllBtn') action = 'clear-all';
      }

      // Route
      switch (action) {
        case 'save-expense':  e.preventDefault(); bbSaveExpense(); break;
        case 'clear-expense': e.preventDefault(); bbClearExpenseForm(); break;
        case 'save-income':   e.preventDefault(); bbSaveIncome(); break;
        case 'export-json':   e.preventDefault(); bbExportJSON(); break;
        case 'clear-all':     e.preventDefault(); bbClearAll(); break;
        case 'switch-tab':    e.preventDefault(); bbShowTab(t.dataset.tab || 'dashboard'); break;
        case 'delete-expense':
          e.preventDefault();
          const id = t.getAttribute('data-del') || t.dataset.id || t.value || t.getAttribute('data-id');
          if (id) bbDeleteExpense(id);
          break;
        default: break;
      }
    }, { passive: false });
  }

  // ---- Emoji-ize the UI (no HTML edits needed) ----
  function emojiizeUI() {
    // Save / Clear (Expenses)
    const saveExp = $('#saveExpenseBtn'); if (saveExp) { saveExp.textContent = '💾'; saveExp.classList.add('btn-emoji'); saveExp.setAttribute('aria-label','Save Expense'); saveExp.dataset.action = 'save-expense'; }
    const clrExp = $('#clearExpenseBtn'); if (clrExp) { clrExp.textContent = '🧹'; clrExp.classList.add('btn-emoji'); clrExp.setAttribute('aria-label','Clear'); clrExp.dataset.action = 'clear-expense'; }

    // Income Save
    const saveInc = $('#saveIncomeBtn'); if (saveInc) { saveInc.textContent = '➕💵'; saveInc.classList.add('btn-emoji'); saveInc.setAttribute('aria-label','Save Income'); saveInc.dataset.action = 'save-income'; }

    // Export / Clear All
    const exportBtn = $('#exportBtn'); if (exportBtn) { exportBtn.textContent = '📤'; exportBtn.classList.add('btn-emoji'); exportBtn.setAttribute('aria-label','Export JSON'); exportBtn.dataset.action = 'export-json'; }
    const clearAll  = $('#clearAllBtn'); if (clearAll) { clearAll.textContent = '🗑️'; clearAll.classList.add('btn-emoji'); clearAll.setAttribute('aria-label','Clear All'); clearAll.dataset.action = 'clear-all'; }

    // Tabs
    const tabIcon = { dashboard:'🏠', expenses:'🧾', income:'💵', history:'📜' };
    document.querySelectorAll('.tab[data-tab]').forEach(tab => {
      const k = tab.dataset.tab; if (tabIcon[k]) { tab.textContent = tabIcon[k]; tab.classList.add('btn-emoji'); }
    });

    // Delete icons inside the expenses list (works with existing renderers)
    function emojiizeDeletes(root=document) {
      root.querySelectorAll('.del, [data-del]').forEach(btn => {
        btn.textContent = '🗑️';
        btn.classList.add('btn-trash');
        if (!btn.dataset.action) btn.dataset.action = 'delete-expense';
        if (!btn.getAttribute('data-id') && btn.getAttribute('data-del')) {
          btn.setAttribute('data-id', btn.getAttribute('data-del'));
        }
      });
    }
    emojiizeDeletes();

    // Watch for future list renders and re-emojiize
    const list = $('#expensesList');
    if (list && !list.__observer) {
      const mo = new MutationObserver(() => emojiizeDeletes(list));
      mo.observe(list, { childList: true, subtree: true });
      list.__observer = mo;
    }
  }

  // ---- Boot sequence ----
  ready(() => {
    // Never let CSS lock scrolling
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';

    preventFormSubmits();
    attachDelegatedClicks();
    emojiizeUI();

    // Re-run after initial renders
    setTimeout(emojiizeUI, 200);   // after first render
    setTimeout(emojiizeUI, 800);   // after chart/layout settles
  });
})();
/* ===== Budget Buddy v1.1 — MTD Expenses Fix ===== */

// --- Storage helpers ---
const EXP_KEY = 'expenses';
const INC_KEY = 'incomes';

let expenses = JSON.parse(localStorage.getItem(EXP_KEY) || '[]');
let incomes  = JSON.parse(localStorage.getItem(INC_KEY) || '[]');

function saveExpensesToStore(){ localStorage.setItem(EXP_KEY, JSON.stringify(expenses)); }
function saveIncomesToStore(){ localStorage.setItem(INC_KEY, JSON.stringify(incomes)); }

// --- Date utils ---
function startOfMonth(d=new Date()){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d=new Date()){ return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }
function isISOInThisMonth(iso){
  if (!iso) return false;
  const dt = new Date(iso);
  return dt >= startOfMonth() && dt <= endOfMonth();
}

// One-time migration so old items get a createdAt and default frequency
(function migrateLegacyExpenses(){
  let changed = false;
  for (const e of expenses){
    if (!e.createdAt) { e.createdAt = new Date().toISOString(); changed = true; }
    if (!('frequency' in e)) { e.frequency = 'oneoff'; changed = true; }
  }
  if (changed) saveExpensesToStore();
})();

// --- Saving NEW expense (use this inside your Save button handler) ---
function addExpense({ name, category, amount, frequency = 'oneoff', dateISO }){
  const now = new Date().toISOString();
  const exp = {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    name: String(name || '').trim(),
    category: String(category || '').trim(),
    amount: Number(amount) || 0,
    frequency,                                // 'oneoff' | 'monthly' | ...
    date: dateISO || null,                    // user-chosen "Due/Date" if any
    createdAt: now                            // always set for MTD reporting
  };
  expenses.push(exp);
  saveExpensesToStore();
  renderExpensesList?.();                     // if you have a list renderer
  recomputeDashboard();                       // <— updates tiles + chart to MTD
}

// Example: patch your existing save handler to call addExpense(...)
function onSaveExpenseClick(){
  // wire to your form inputs
  const name = document.getElementById('expenseName')?.value || '';
  const category = document.getElementById('expenseCategory')?.value || '';
  const amount = document.getElementById('expenseAmount')?.value || 0;
  const frequency = document.getElementById('expenseFrequency')?.value || 'oneoff';
  const dateInput = document.getElementById('expenseDate')?.value; // "Due/Date" field
  const dateISO = dateInput ? new Date(dateInput).toISOString() : null;
  addExpense({ name, category, amount, frequency, dateISO });
}

// --- MTD/Recurring computations ---
function incomeMTD(){
  return (incomes || [])
    .filter(i => isISOInThisMonth(i?.date || i?.createdAt))
    .reduce((s,i)=> s + (Number(i.amount)||0), 0);
}
function spentMTD(){
  return (expenses || [])
    .filter(e => isISOInThisMonth(e?.date || e?.createdAt))
    .reduce((s,e)=> s + (Number(e.amount)||0), 0);
}
function recurringMonthlyTotal(){
  return (expenses || [])
    .filter(e => e.frequency === 'monthly')
    .reduce((s,e)=> s + (Number(e.amount)||0), 0);
}

// --- Dashboard + Chart update (MTD by default) ---
function setCurrency(selOrEl, val){
  const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
  if (el) el.textContent = `$${(Number(val)||0).toFixed(2)}`;
}

function recomputeDashboard(view='mtd'){
  const inc = incomeMTD();
  const mtd = spentMTD();
  const recurring = recurringMonthlyTotal();
  const expToShow = view === 'recurring' ? recurring : mtd;

  // Update tiles (adjust selectors to yours)
  setCurrency('#monthlyIncome', inc);         // label now means "Income MTD"
  setCurrency('#monthlyExpenses', expToShow); // label becomes "Spent this month (MTD)" or "Recurring bills"
  setCurrency('#netAmount', inc - expToShow);

  // Optional footnote about recurring when in MTD view
  const note = document.getElementById('recurringBillsNote');
  if (note) note.textContent = view === 'mtd' ? `Recurring bills this month: $${recurring.toFixed(2)}` : '';

  // Update chart
  if (window.summaryChart) {
    window.summaryChart.data.datasets[0].data = [inc, expToShow, inc - expToShow];
    window.summaryChart.update();
  }
}

// --- View toggle (MTD vs Recurring) — injected if not present ---
(function ensureViewToggle(){
  let select = document.getElementById('chartView');
  if (!select){
    const container = document.querySelector('#dashboardControls') || document.querySelector('#dashboard') || document.body;
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0';
    wrap.innerHTML = `
      <label style="display:flex;gap:.5rem;align-items:center;font-size:.9rem">
        View:
        <select id="chartView">
          <option value="mtd" selected>MTD</option>
          <option value="recurring">Recurring</option>
        </select>
      </label>`;
    container.prepend(wrap);
    select = wrap.querySelector('#chartView');
  }
  select.addEventListener('change', e => recomputeDashboard(e.target.value));
})();

// --- Initialize chart reference if you haven't already ---
(function ensureChartRef(){
  const canvas = document.getElementById('summaryChart');
  if (!canvas || window.summaryChart) return;
  try {
    window.summaryChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: ['Income','Expenses','Net'], datasets: [{ label: 'This Month', data: [0,0,0] }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, animation: false }
    });
  } catch (_) { /* Chart.js not loaded here — safe no-op */ }
})();

// Kick everything once on load
document.addEventListener('DOMContentLoaded', () => recomputeDashboard('mtd'));
/* ===== End v1.1 patch ===== */
/* ===== v1.2: scroll + button reliability ===== */

// Never let an old CSS toggle lock the page
(function unlockScroll() {
  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'auto';
})();

// Attach handlers once DOM is ready, and only once.
function ready(fn){ 
  if (document.readyState !== 'loading') fn(); 
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

ready(() => {
  // 1) Prevent any form from reloading the page on submit
  document.querySelectorAll('form').forEach(f => {
    if (!f.dataset.nosubmit) {
      f.addEventListener('submit', (e) => e.preventDefault());
      f.dataset.nosubmit = '1';
    }
  });

  // 2) Wire Save Expense button once
  const btn = document.getElementById('saveExpenseBtn');
  if (btn && !btn.dataset.bound) {
    btn.type = 'button'; // stop implicit submit
    btn.addEventListener('click', onSaveExpenseClick);
    btn.dataset.bound = '1';
  }

  // 3) Tab/nav buttons (if you have them)
  document.querySelectorAll('[data-nav-target]').forEach(el => {
    if (!el.dataset.bound) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.dataset.navTarget; // e.g., "dashboard" | "expenses" | ...
        if (typeof switchTab === 'function') switchTab(target);
      }, { passive: true });
      el.dataset.bound = '1';
    }
  });

  // 4) Defensive: remove any invisible full-page overlays that could eat taps
  document.querySelectorAll('.overlay,.scrim,.backdrop').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.opacity === '0') el.remove();
  });

  // 5) Rekick dashboard once everything is attached
  try { recomputeDashboard?.(document.getElementById('chartView')?.value || 'mtd'); } catch {}
});
