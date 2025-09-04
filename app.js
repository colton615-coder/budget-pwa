/* ===== Budget Buddy v1.3 — Robust MTD + fallbacks ===== */

const EXP_KEY = 'expenses';
const INC_KEY = 'incomes';

let expenses = JSON.parse(localStorage.getItem(EXP_KEY) || '[]');
let incomes  = JSON.parse(localStorage.getItem(INC_KEY) || '[]');

function saveExpensesToStore(){ localStorage.setItem(EXP_KEY, JSON.stringify(expenses)); }
function saveIncomesToStore(){ localStorage.setItem(INC_KEY, JSON.stringify(incomes)); }

function startOfMonth(d=new Date()){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d=new Date()){ return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }
function isISOInThisMonth(iso){ if(!iso) return false; const dt=new Date(iso); return dt>=startOfMonth() && dt<=endOfMonth(); }

(function migrate(){
  let changed=false;
  for (const e of expenses){
    if (!e.createdAt) { e.createdAt = new Date().toISOString(); changed = true; }
    if (e.frequency == null) { e.frequency = 'oneoff'; changed = true; }
    e.amount = Number(e.amount)||0;
  }
  if (changed) saveExpensesToStore();
})();

function incomeMTD(){ return (incomes||[]).filter(i=>isISOInThisMonth(i.date||i.createdAt)).reduce((s,i)=>s+(Number(i.amount)||0),0); }
function spentMTD(){ return (expenses||[]).filter(e=>isISOInThisMonth(e.date||e.createdAt)).reduce((s,e)=>s+(Number(e.amount)||0),0); }
function recurringMonthlyTotal(){ return (expenses||[]).filter(e=>e.frequency==='monthly').reduce((s,e)=>s+(Number(e.amount)||0),0); }

function $(sel){ return document.querySelector(sel); }
function setCurrency(selOrEl, val){ const el = typeof selOrEl === 'string' ? $(selOrEl) : selOrEl; if (el) el.textContent = `$${(Number(val)||0).toFixed(2)}`; }

function recomputeDashboard(view='mtd'){
  const inc = incomeMTD();
  const mtd = spentMTD();
  const recurring = recurringMonthlyTotal();
  const expToShow = view === 'recurring' ? recurring : mtd;

  setCurrency('#monthlyIncome', inc);
  setCurrency('#monthlyExpenses', expToShow);
  setCurrency('#netAmount', inc - expToShow);

  const note = $('#recurringBillsNote');
  if (note) note.textContent = view === 'mtd' ? `Recurring bills this month: $${recurring.toFixed(2)}` : '';

  const cf = $('#chartFallback');
  if (window.summaryChart) {
    window.summaryChart.data.datasets[0].data = [inc, expToShow, inc - expToShow];
    try { window.summaryChart.update(); } catch {}
    if (cf) cf.hidden = true;
  } else {
    if (cf) cf.hidden = false;
  }
}

(function ensureViewToggle(){
  let select = document.getElementById('chartView');
  if (!select){
    const container = document.getElementById('dashboardControls') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'row';
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

(function ensureChart(){
  const canvas = document.getElementById('summaryChart');
  if (!canvas) return;
  if (typeof Chart === 'undefined') return;
  if (window.summaryChart) return;
  window.summaryChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: ['Income','Expenses','Net'], datasets: [{ label: 'This Month', data: [0,0,0] }] },
    options: { responsive: true, maintainAspectRatio: false, scales:{ y:{ beginAtZero:true }}, animation:false }
  });
})();

function addExpense({ name, category, amount, frequency = 'oneoff', dateISO }){
  const now = new Date().toISOString();
  const exp = { id: (crypto.randomUUID&&crypto.randomUUID())||String(Date.now()+Math.random()),
    name:String(name||'').trim(), category:String(category||'').trim(),
    amount:Number(amount)||0, frequency, date:dateISO||null, createdAt:now };
  expenses.push(exp); saveExpensesToStore(); renderExpensesList(); recomputeDashboard($('#chartView')?.value || 'mtd');
}
function deleteExpense(id){ expenses = expenses.filter(e=>e.id!==id); saveExpensesToStore(); renderExpensesList(); recomputeDashboard($('#chartView')?.value || 'mtd'); }

function renderExpensesList(){
  const host = document.getElementById('expensesList'); if (!host) return;
  host.innerHTML = '';
  const data = [...expenses].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  for (const e of data.slice(0,200)){
    const row = document.createElement('div'); row.className = 'list-item';
    const left = document.createElement('div'); const right = document.createElement('div'); right.className='right';
    left.innerHTML = `<div><strong>${e.name||'Expense'}</strong> <span class="badge">${e.category||'General'}</span></div>
      <div class="small">${e.frequency==='monthly'?'Monthly bill':'One-off'} • ${(e.date||e.createdAt||'').slice(0,10)}</div>`;
    right.innerHTML = `<div><strong>$${(Number(e.amount)||0).toFixed(2)}</strong></div>
      <button class="btn small danger" data-del="${e.id}">Delete</button>`;
    row.append(left,right); host.appendChild(row);
  }
  host.querySelectorAll('[data-del]').forEach(btn=>{
    if (!btn.dataset.bound){ btn.addEventListener('click',()=> deleteExpense(btn.getAttribute('data-del'))); btn.dataset.bound='1'; }
  });
}

function onSaveExpenseClick(){
  const name = $('#expenseName')?.value || '';
  const category = $('#expenseCategory')?.value || '';
  const amount = $('#expenseAmount')?.value || 0;
  const frequency = $('#expenseFrequency')?.value || 'oneoff';
  const dateInput = $('#expenseDate')?.value;
  const dateISO = dateInput ? new Date(dateInput).toISOString() : null;

  if (!name || !amount) { alert('Enter a name and amount.'); return; }
  addExpense({ name, category, amount, frequency, dateISO });
  ['expenseName','expenseCategory','expenseAmount','expenseDate'].forEach(id=>{ const el=$('#'+id); if (el) el.value=''; });
  $('#expenseFrequency').value='oneoff';
}

function clearForm(){ ['expenseName','expenseCategory','expenseAmount','expenseDate'].forEach(id=>{ const el=$('#'+id); if (el) el.value=''; }); $('#expenseFrequency').value='oneoff'; }
function exportJSON(){
  const blob = new Blob([JSON.stringify({ expenses, incomes }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='budget-buddy-data.json';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function clearAll(){
  if (!confirm('Delete ALL expenses?')) return;
  expenses = []; saveExpensesToStore(); renderExpensesList(); recomputeDashboard($('#chartView')?.value || 'mtd');
}

(function unlock(){ document.documentElement.style.overflow='auto'; document.body.style.overflow='auto'; })();
function ready(fn){ if (document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, { once:true }); }

ready(()=>{
  document.querySelectorAll('form').forEach(f=>{
    if (!f.dataset.nosubmit){ f.addEventListener('submit', e=> e.preventDefault()); f.dataset.nosubmit='1'; }
  });
  const saveBtn = $('#saveExpenseBtn'); if (saveBtn && !saveBtn.dataset.bound){ saveBtn.type='button'; saveBtn.addEventListener('click', onSaveExpenseClick); saveBtn.dataset.bound='1'; }
  const clrBtn = $('#clearFormBtn'); if (clrBtn && !clrBtn.dataset.bound){ clrBtn.addEventListener('click', clearForm); clrBtn.dataset.bound='1'; }
  const expBtn = $('#exportBtn'); if (expBtn && !expBtn.dataset.bound){ expBtn.addEventListener('click', exportJSON); expBtn.dataset.bound='1'; }
  const delAll = $('#clearAllBtn'); if (delAll && !delAll.dataset.bound){ delAll.addEventListener('click', clearAll); delAll.dataset.bound='1'; }

  document.querySelectorAll('[data-nav-target]').forEach(el=>{
    if (!el.dataset.bound){ el.addEventListener('click',(e)=>{ e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }); el.dataset.bound='1'; }
  });

  renderExpensesList();
  recomputeDashboard('mtd');
});
