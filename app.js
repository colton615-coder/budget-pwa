/* Ledgerly – vanilla JS PWA money tracker
   Storage: IndexedDB (with a tiny helper)
   Accessibility: ARIA live regions, keyboardable dialogs
*/
(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const byId = id => document.getElementById(id);

  const state = {
    currency: navigator.language ? new Intl.NumberFormat(navigator.language, { style: 'currency', currency: guessCurrency() }) : null,
    installPrompt: null,
    db: null,
    budgets: [], // {id, category, limit}
    transactions: [], // {id, type, date, category, amount, note}
  };

  function guessCurrency(){
    try{
      const region = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || 'US';
      const map = { US:'USD', GB:'GBP', AU:'AUD', CA:'CAD', EU:'EUR', DE:'EUR', FR:'EUR', IN:'INR', JP:'JPY' };
      return map[region] || 'USD';
    }catch{ return 'USD'; }
  }

  /* ---------- IndexedDB Helper ---------- */
  const idb = {
    open(name='ledgerly', version=1){
      return new Promise((res, rej) => {
        const req = indexedDB.open(name, version);
        req.onupgradeneeded = (e) => {
          const db = req.result;
          if(!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath:'id', autoIncrement:true }).createIndex('date', 'date');
          if(!db.objectStoreNames.contains('budget')) db.createObjectStore('budget', { keyPath:'id', autoIncrement:true }).createIndex('category', 'category', { unique:true });
          if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath:'k' });
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    },
    tx(db, store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); },
    all(db, store){ return new Promise((res, rej) => {
      const os = idb.tx(db, store); const out = [];
      os.openCursor().onsuccess = e => {
        const c = e.target.result; if(!c) return res(out);
        out.push(c.value); c.continue();
      };
      os.transaction.onerror = () => rej(os.transaction.error);
    });},
    add(db, store, value){ return new Promise((res, rej) => { const r=idb.tx(db,store,'readwrite').add(value); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);} ); },
    put(db, store, value){ return new Promise((res, rej) => { const r=idb.tx(db,store,'readwrite').put(value); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);} ); },
    get(db, store, id){ return new Promise((res, rej) => { const r=idb.tx(db,store).get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);} ); },
    delete(db, store, id){ return new Promise((res, rej) => { const r=idb.tx(db,store,'readwrite').delete(id); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);} ); },
    clear(db, store){ return new Promise((res, rej)=>{ const r=idb.tx(db,store,'readwrite').clear(); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);} ); }
  };

  /* ---------- Utilities ---------- */
  const fmtMoney = n => (state.currency || new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'})).format(+n || 0);
  const todayStr = () => new Date().toISOString().slice(0,10);
  const parseAmount = s => Math.round(parseFloat(s || '0') * 100) / 100;

  /* ---------- Boot ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    byId('year').textContent = new Date().getFullYear();
    await initDB();
    await loadAll();
    renderAll();
    wireUI();
    registerSW();
    setupInstall();
    maybeShowIosTip();
  });

  async function initDB(){
    state.db = await idb.open('ledgerly', 1);
  }

  async function loadAll(){
    [state.transactions, state.budgets] = await Promise.all([
      idb.all(state.db, 'tx'),
      idb.all(state.db, 'budget')
    ]);
  }

  function renderAll(){
    fillCategoryFilters();
    renderKPIs();
    renderBudgets();
    renderTransactions();
    drawChart();
  }

  /* ---------- UI Wiring ---------- */
  function wireUI(){
    // Add/Edit transaction dialog
    const txDialog = byId('txDialog');
    const budgetDialog = byId('budgetDialog');

    byId('addBtn').addEventListener('click', () => openTxDialog());
    byId('closeTxDialog').addEventListener('click', () => txDialog.close());
    byId('cancelTx').addEventListener('click', () => txDialog.close());

    byId('addBudgetBtn').addEventListener('click', () => openBudgetDialog());
    byId('closeBudgetDialog').addEventListener('click', () => budgetDialog.close());
    byId('cancelBudget').addEventListener('click', () => budgetDialog.close());

    byId('txForm').addEventListener('submit', onSaveTx);
    byId('budgetForm').addEventListener('submit', onSaveBudget);

    // Filters
    byId('filterForm').addEventListener('input', debounce(renderTransactions, 100));
    byId('clearFilters').addEventListener('click', (e)=>{
      e.preventDefault(); byId('filterForm').reset(); renderTransactions();
    });

    // Export/Import
    byId('exportBtn').addEventListener('click', onExport);
    byId('importFile').addEventListener('change', onImport);

    // iOS tip close
    byId('closeIosTip').addEventListener('click', ()=> byId('iosTip').hidden = true);

    // Close dialogs with Escape keeping focus safety
    $$('dialog').forEach(d => d.addEventListener('cancel', e => { e.preventDefault(); d.close(); }));
  }

  function openTxDialog(tx=null){
    const d = byId('txDialog');
    byId('txDialogTitle').textContent = tx ? 'Edit transaction' : 'Add transaction';
    byId('txType').value = tx?.type || 'expense';
    byId('txDate').value = tx?.date || todayStr();
    byId('txCategory').value = tx?.category || '';
    byId('txAmount').value = tx?.amount?.toFixed(2) || '';
    byId('txNote').value = tx?.note || '';
    byId('txId').value = tx?.id || '';
    d.showModal();
    byId('txType').focus();
  }

  function openBudgetDialog(b=null){
    const d = byId('budgetDialog');
    byId('budgetDialogTitle').textContent = b ? 'Edit budget' : 'Add budget';
    byId('budgetCategory').value = b?.category || '';
    byId('budgetLimit').value = b?.limit?.toFixed(2) || '';
    byId('budgetId').value = b?.id || '';
    d.showModal();
    byId('budgetCategory').focus();
  }

  /* ---------- Transactions ---------- */
  async function onSaveTx(e){
    e.preventDefault();
    const tx = {
      id: byId('txId').value ? Number(byId('txId').value) : undefined,
      type: byId('txType').value,
      date: byId('txDate').value,
      category: byId('txCategory').value.trim(),
      amount: parseAmount(byId('txAmount').value) * (byId('txType').value === 'expense' ? -1 : 1),
      note: byId('txNote').value.trim()
    };
    if(!tx.date || !tx.category || !tx.amount){ alert('Please fill required fields.'); return; }

    if(tx.id){
      await idb.put(state.db, 'tx', tx);
      const idx = state.transactions.findIndex(t => t.id === tx.id);
      state.transactions[idx] = tx;
    } else {
      tx.id = await idb.add(state.db, 'tx', tx);
      state.transactions.push(tx);
    }
    byId('txDialog').close();
    renderAll();
  }

  function filteredTx(){
    const f = {
      from: byId('fromDate').value,
      to: byId('toDate').value,
      type: byId('typeFilter').value,
      category: byId('categoryFilter').value,
      q: byId('searchInput').value.toLowerCase().trim(),
      sort: byId('sortBy').value
    };
    let list = [...state.transactions];
    if(f.from) list = list.filter(t => t.date >= f.from);
    if(f.to) list = list.filter(t => t.date <= f.to);
    if(f.type) list = list.filter(t => t.type === f.type);
    if(f.category) list = list.filter(t => t.category === f.category);
    if(f.q) list = list.filter(t =>
      t.note.toLowerCase().includes(f.q) || t.category.toLowerCase().includes(f.q) || Math.abs(t.amount).toString().includes(f.q)
    );

    const sorters = {
      'date-desc': (a,b)=> b.date.localeCompare(a.date),
      'date-asc': (a,b)=> a.date.localeCompare(b.date),
      'amount-desc': (a,b)=> Math.abs(b.amount) - Math.abs(a.amount),
      'amount-asc': (a,b)=> Math.abs(a.amount) - Math.abs(b.amount),
    };
    list.sort(sorters[f.sort] || sorters['date-desc']);
    return list;
  }

  function renderTransactions(){
    const tbody = byId('txTableBody');
    tbody.innerHTML = '';
    const rows = filteredTx();
    byId('txCount').textContent = `${rows.length} item${rows.length!==1?'s':''}`;

    const frag = document.createDocumentFragment();
    rows.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.date}</td>
        <td>${t.type === 'income' ? 'Income' : 'Expense'}</td>
        <td>${escapeHtml(t.category)}</td>
        <td class="right amount ${t.amount<0?'neg':'pos'}">${fmtMoney(Math.abs(t.amount))}</td>
        <td>${escapeHtml(t.note || '')}</td>
        <td>
          <button class="icon-btn" aria-label="Edit" data-edit="${t.id}">✎</button>
          <button class="icon-btn" aria-label="Delete" data-del="${t.id}">🗑</button>
        </td>`;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    tbody.onclick = async (e) => {
      const editId = e.target.getAttribute('data-edit');
      const delId = e.target.getAttribute('data-del');
      if(editId){
        const tx = state.transactions.find(x => x.id === Number(editId));
        openTxDialog(tx);
      }
      if(delId){
        if(confirm('Delete this transaction?')){
          await idb.delete(state.db, 'tx', Number(delId));
          state.transactions = state.transactions.filter(x => x.id !== Number(delId));
          renderAll();
        }
      }
    };
  }

  /* ---------- Budgets ---------- */
  async function onSaveBudget(e){
    e.preventDefault();
    const rec = {
      id: byId('budgetId').value ? Number(byId('budgetId').value) : undefined,
      category: byId('budgetCategory').value.trim(),
      limit: parseAmount(byId('budgetLimit').value)
    };
    if(!rec.category){ alert('Category required.'); return; }
    if(rec.id){
      await idb.put(state.db, 'budget', rec);
      const i = state.budgets.findIndex(b => b.id === rec.id);
      state.budgets[i] = rec;
    } else {
      try{
        rec.id = await idb.add(state.db, 'budget', rec);
        state.budgets.push(rec);
      }catch(err){
        alert('Budget category must be unique.');
      }
    }
    byId('budgetDialog').close();
    renderAll();
  }

  function renderBudgets(){
    const ul = byId('budgetList'); ul.innerHTML = '';
    const monthKey = new Date().toISOString().slice(0,7); // YYYY-MM
    const frag = document.createDocumentFragment();

    state.budgets.forEach(b => {
      const spent = state.transactions
        .filter(t => t.type==='expense' && t.category===b.category && t.date.startsWith(monthKey))
        .reduce((s,t)=> s + Math.abs(t.amount), 0);

      const left = Math.max(0, b.limit - spent);
      const pct = b.limit ? Math.min(100, Math.round((spent / b.limit) * 100)) : 0;

      const li = document.createElement('li');
      li.className = 'budget-item';
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(b.category)}</strong>
          <div class="hint">Spent ${fmtMoney(spent)} of ${fmtMoney(b.limit)} — Left ${fmtMoney(left)}</div>
          <div class="progress" aria-label="Budget progress for ${escapeHtml(b.category)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <span style="width:${pct}%"></span>
          </div>
        </div>
        <div>
          <button class="btn small" data-edit-budget="${b.id}">Edit</button>
          <button class="btn small ghost" data-del-budget="${b.id}">Delete</button>
        </div>
      `;
      frag.appendChild(li);
    });
    ul.appendChild(frag);

    ul.onclick = async (e)=>{
      const eb = e.target.getAttribute('data-edit-budget');
      const db = e.target.getAttribute('data-del-budget');
      if(eb){
        const rec = state.budgets.find(x => x.id === Number(eb));
        openBudgetDialog(rec);
      }
      if(db){
        if(confirm('Delete this budget?')){
          await idb.delete(state.db, 'budget', Number(db));
          state.budgets = state.budgets.filter(x => x.id !== Number(db));
          renderAll();
        }
      }
    };
  }

  function fillCategoryFilters(){
    const set = new Set(state.transactions.map(t => t.category).concat(state.budgets.map(b=>b.category)).filter(Boolean));
    const options = Array.from(set).sort().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    byId('categoryFilter').innerHTML = `<option value="">All</option>${options}`;
    byId('categoryList').innerHTML = options;
  }

  /* ---------- KPIs ---------- */
  function renderKPIs(){
    const income = state.transactions.filter(t => t.amount > 0).reduce((s,t)=> s + t.amount, 0);
    const expense = state.transactions.filter(t => t.amount < 0).reduce((s,t)=> s + Math.abs(t.amount), 0);
    const balance = income - expense;
    const monthKey = new Date().toISOString().slice(0,7);
    const monthBudget = state.budgets.reduce((s,b)=> s + b.limit, 0);
    const monthSpent = state.transactions.filter(t => t.type==='expense' && t.date.startsWith(monthKey))
      .reduce((s,t)=> s + Math.abs(t.amount), 0);
    const budgetLeft = Math.max(0, monthBudget - monthSpent);

    byId('kpiIncome').textContent = fmtMoney(income);
    byId('kpiExpense').textContent = fmtMoney(expense);
    byId('kpiBalance').textContent = fmtMoney(balance);
    byId('kpiBudgetLeft').textContent = fmtMoney(budgetLeft);
  }

  /* ---------- Chart (30-day running balance) ---------- */
  function drawChart(){
    const canvas = byId('trendChart');
    const ctx = canvas.getContext('2d');
    const days = 30;
    const now = new Date();
    const labels = [];
    const points = [];
    for(let i=days-1;i>=0;i--){
      const d = new Date(now); d.setDate(now.getDate()-i);
      const key = d.toISOString().slice(0,10);
      labels.push(key.slice(5));
      const daySum = state.transactions.filter(t => t.date === key).reduce((s,t)=> s + t.amount, 0);
      points.push(daySum);
    }
    // cumulative
    let cum = 0; const series = points.map(v => (cum += v));

    // clear
    const DPR = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth - 32;
    const h = canvas.getAttribute('height');
    canvas.width = w * DPR; canvas.height = h * DPR; canvas.style.width = w+'px';
    ctx.scale(DPR,DPR);
    ctx.clearRect(0,0,w,h);

    // axes
    ctx.strokeStyle = '#ffffff25';
    ctx.lineWidth = 1;
    for(let i=0;i<5;i++){
      const y = (h/4)*i;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }

    // scale
    const min = Math.min(0, Math.min(...series));
    const max = Math.max(0, Math.max(...series), 1);
    const range = max - min || 1;
    const xStep = w / (days-1);

    // gradient line
    const grad = ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0, '#22d3ee');
    grad.addColorStop(1, '#0ea5e9');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((v,i)=>{
      const x = i*xStep;
      const y = h - ((v - min)/range)*h;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // zero line
    const zeroY = h - ((0 - min)/range)*h;
    ctx.strokeStyle = '#ef4444aa';
    ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(0,zeroY); ctx.lineTo(w,zeroY); ctx.stroke(); ctx.setLineDash([]);
  }

  /* ---------- Export / Import ---------- */
  function onExport(){
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      currency: (state.currency && state.currency.resolvedOptions ? state.currency.resolvedOptions().currency : 'USD'),
      budgets: state.budgets,
      transactions: state.transactions
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ledgerly-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function onImport(e){
    const file = e.target.files?.[0];
    if(!file) return;
    const text = await file.text();
    try{
      const data = JSON.parse(text);
      if(!Array.isArray(data.transactions) || !Array.isArray(data.budgets)) throw new Error('Invalid file');
      // wipe + restore
      await idb.clear(state.db, 'tx');
      await idb.clear(state.db, 'budget');
      state.transactions = [];
      state.budgets = [];
      for(const b of data.budgets){
        const rec = { category: String(b.category), limit: Number(b.limit)||0 };
        rec.id = await idb.add(state.db, 'budget', rec);
        state.budgets.push(rec);
      }
      for(const t of data.transactions){
        const rec = {
          type: t.amount >= 0 ? 'income' : 'expense',
          date: t.date,
          category: String(t.category),
          amount: Number(t.amount),
          note: String(t.note||'')
        };
        rec.id = await idb.add(state.db, 'tx', rec);
        state.transactions.push(rec);
      }
      renderAll(); alert('Import complete ✔️');
    }catch(err){
      alert('Import failed. File not recognized.');
    } finally {
      e.target.value = '';
    }
  }

  /* ---------- Install / PWA ---------- */
  function setupInstall(){
    window.addEventListener('beforeinstallprompt', (e)=>{
      e.preventDefault();
      state.installPrompt = e;
      byId('installBtn').hidden = false;
    });
    byId('installBtn').addEventListener('click', async ()=>{
      if(!state.installPrompt) return;
      const evt = state.installPrompt;
      state.installPrompt = null;
      byId('installBtn').hidden = true;
      await evt.prompt();
    });
  }

  function maybeShowIosTip(){
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if(isIos && !isStandalone){
      // small delay to not be annoying
      setTimeout(()=>{ byId('iosTip').hidden = false; }, 800);
    }
  }

  async function registerSW(){
    if('serviceWorker' in navigator){
      try{
        await navigator.serviceWorker.register('sw.js');
      }catch(e){ /* no-op */ }
    }
  }

  /* ---------- Helpers ---------- */
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
})();
