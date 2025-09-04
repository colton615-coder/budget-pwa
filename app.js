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
