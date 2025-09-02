/* Budget Buddy – Emoji tabs + Settings
 * PWA, offline, localStorage persistence
 */
'use strict';
(() => {
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  // ---------- Settings (constants) ----------
  const DEFAULT_SETTINGS = {
    currency: guessCurrency(),
    paySchedule: 'monthly',   // monthly | biweekly | weekly
    defaultMonth: 'current',  // current | last
    density: 'comfortable',   // comfortable | compact
    showCharts: 'on'          // on | off
  };

  const SETTINGS = loadSettings();

  // Apply density
  document.documentElement.classList.toggle('compact', SETTINGS.density === 'compact');

  // ---------- Currency formatter (reacts to settings) ----------
  let money = nf(SETTINGS.currency);
  function nf(code){ return new Intl.NumberFormat(undefined,{style:'currency', currency:code}); }

  function guessCurrency(){
    try{
      const region=(Intl.DateTimeFormat().resolvedOptions().locale||'en-US').split('-').pop()||'US';
      return ({US:'USD',CA:'CAD',GB:'GBP',AU:'AUD',NZ:'NZD',EU:'EUR',IE:'EUR',DE:'EUR',FR:'EUR',ES:'EUR',IT:'EUR',
               IN:'INR',JP:'JPY',SG:'SGD',HK:'HKD',MX:'MXN',BR:'BRL',ZA:'ZAR'}[region]||'USD');
    }catch{ return 'USD'; }
  }

  // ---------- Categories ----------
  const GROUPS = [
    { key:'housing', label:'Housing', color:'var(--c-housing)', cats:['Rent/Mortgage','Insurance/Property Taxes']},
    { key:'transport', label:'Transportation', color:'var(--c-transport)', cats:['Car Payment','Car Insurance']},
    { key:'utilities', label:'Utilities', color:'var(--c-utilities)', cats:['Electricity','Water','Internet/Cable','Phone Bill']},
    { key:'debt', label:'Debt Repayment', color:'var(--c-debt)', cats:['Student Loans','Credit Cards']},
    { key:'fixedother', label:'Other Fixed', color:'var(--c-fixedother)', cats:['Subscriptions','Other Fixed Loans']},
    { key:'food', label:'Food', color:'var(--c-food)', cats:['Groceries','Dining Out']},
    { key:'household', label:'Household', color:'var(--c-household)', cats:['Personal Care','Household Supplies']},
    { key:'personal', label:'Personal', color:'var(--c-personal)', cats:['Shopping','Entertainment']},
    { key:'medical', label:'Medical', color:'var(--c-medical)', cats:['Co-pays & Prescriptions','Health Care']},
    { key:'othervar', label:'Other Variable', color:'var(--c-othervar)', cats:['Fuel/Gas','Travel','Gifts']},
  ];
  const ALL_CATEGORIES = GROUPS.flatMap(g => g.cats.map(c => ({
    key:`${g.key}:${slug(c)}`, group:g.key, groupLabel:g.label, label:c, color:g.color
  })));
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-');

  // ---------- State ----------
  const EMPTY_MONTH = () => ({ incomes:[], budgets:{}, transactions:[], savings:[], debtExtra:[] });
  const STATE = loadState();
  const monthPicker = $('#monthPicker');

  // Default month logic
  const startMonth = SETTINGS.defaultMonth === 'last'
    ? (STATE._lastMonth || getMonthKey(new Date()))
    : getMonthKey(new Date());
  ensureMonth(startMonth);
  monthPicker.value = startMonth;

  // ---------- DOM Refs ----------
  const tlIncome = $('#tl-income'), tlExpenses = $('#tl-expenses'), tlResult = $('#tl-result');

  const incomeBody = $('#income-tbody'), incomeTotal = $('#income-total');
  const budgetGroups = $('#budget-groups'), budgetedTotal = $('#budgeted-total');

  const txBody = $('#tx-tbody'), txTotal = $('#tx-total');

  const saveBody = $('#save-tbody'), saveTotal = $('#save-total');
  const debtBody = $('#debt-tbody'), debtTotal = $('#debt-total');

  const btnOpenMenu = $('#btn-open-menu'), btnCloseMenu = $('#btn-close-menu'),
        sheet = $('#sheet-menu'), btnExport = $('#btn-export'),
        fileImport = $('#file-import'), btnClearMonth = $('#btn-clear-month'),
        btnLoadSample = $('#btn-load-sample'), statusBox = $('#status');

  // Settings form
  const setForm = $('#settings-form');
  $('#set-currency').value = SETTINGS.currency;
  $('#set-pay').value = SETTINGS.paySchedule;
  $('#set-default-month').value = SETTINGS.defaultMonth;
  $('#set-density').value = SETTINGS.density;
  $('#set-charts').value = SETTINGS.showCharts;

  // Tabs
  initTabs();

  // Category select
  $('#tx-category').innerHTML = ALL_CATEGORIES.map(c=>`<option value="${c.key}">${c.groupLabel} — ${c.label}</option>`).join('');
  // Dates default today
  $('#tx-date').valueAsDate = new Date();
  $('#save-date').valueAsDate = new Date();
  $('#debt-date').valueAsDate = new Date();

  // Forms
  $('#income-form').addEventListener('submit', e=>{
    e.preventDefault();
    const src = $('#income-source').value.trim();
    const amt = num($('#income-amount').value);
    if(!src || !(amt>0)) return;
    currentMonth().incomes.push({id:id(), source:src, amount:amt});
    save(); e.target.reset();
    renderIncome(); renderTop(); renderCharts();
    toast('Income added ✔️');
  });

  $('#tx-form').addEventListener('submit', e=>{
    e.preventDefault();
    const m = currentMonth();
    const row = {
      id:id(),
      date: $('#tx-date').value,
      desc: $('#tx-desc').value.trim(),
      category: $('#tx-category').value,
      need: $('#tx-needwant').value === 'need',
      amount: num($('#tx-amount').value),
      notes: $('#tx-notes').value.trim()
    };
    if(!row.desc || !(row.amount>0)) return;
    m.transactions.push(row);
    save(); e.target.reset(); $('#tx-date').valueAsDate=new Date();
    renderTransactions(); renderTop(); renderCharts();
    toast('Expense recorded 💸');
  });

  $('#goal-form').addEventListener('submit', e=>{
    e.preventDefault();
    const name = $('#goal-name').value.trim();
    const target = num($('#goal-target').value);
    if(!name || !(target>0)) return;
    STATE.goals = STATE.goals || [];
    STATE.goals.push({id:id(), name, target, archived:false});
    save(); e.target.reset();
    renderGoals();
    toast('Goal added 🎯');
  });

  $('#save-form').addEventListener('submit', e=>{
    e.preventDefault();
    const m = currentMonth();
    const s = {
      id:id(), goalId: $('#save-goal').value, date: $('#save-date').value, amount: num($('#save-amount').value)
    };
    if(!s.goalId || !(s.amount>0)) return;
    m.savings.push(s);
    save(); e.target.reset(); $('#save-date').valueAsDate=new Date();
    renderSavings(); renderCharts(); renderTop();
    toast('Savings added 🧠');
  });

  $('#debt-form').addEventListener('submit', e=>{
    e.preventDefault();
    const m = currentMonth();
    const amt = num($('#debt-amount').value);
    const name = $('#debt-name').value.trim();
    if(!name || !(amt>0)) return;
    const date = $('#debt-date').value;
    m.debtExtra.push({id:id(), date, name, amount:amt});
    m.transactions.push({id:id(), date, desc: `${name} (extra)`, category:'debt:'+slug('Credit Cards'), need:true, amount:amt, notes:'Extra payment'});
    save(); e.target.reset(); $('#debt-date').valueAsDate=new Date();
    renderDebt(); renderTransactions(); renderTop(); renderCharts();
    toast('Extra debt payment added ✅');
  });

  // Sheet
  btnOpenMenu.addEventListener('click',()=>sheet.setAttribute('aria-hidden','false'));
  btnCloseMenu.addEventListener('click',()=>sheet.setAttribute('aria-hidden','true'));
  sheet.addEventListener('click',e=>{ if(e.target===sheet) sheet.setAttribute('aria-hidden','true'); });

  btnExport.addEventListener('click', doExport);
  fileImport.addEventListener('change', handleImport);
  btnClearMonth.addEventListener('click', ()=>{
    if(!confirm('Reset all data for '+monthPicker.value+'?')) return;
    STATE.months[monthPicker.value] = EMPTY_MONTH();
    save(); renderAll();
    toast('Month reset.');
  });
  btnLoadSample.addEventListener('click', ()=>{
    if(!confirm('Load vivid sample data into the current month?')) return;
    loadSampleData(monthPicker.value); save(); renderAll(); toast('Sample data loaded ✨');
  });

  // Settings save/reset
  setForm.addEventListener('submit', e=>{
    e.preventDefault();
    SETTINGS.currency = $('#set-currency').value;
    SETTINGS.paySchedule = $('#set-pay').value;
    SETTINGS.defaultMonth = $('#set-default-month').value;
    SETTINGS.density = $('#set-density').value;
    SETTINGS.showCharts = $('#set-charts').value;
    saveSettings();
    document.documentElement.classList.toggle('compact', SETTINGS.density === 'compact');
    money = nf(SETTINGS.currency);
    renderAll();
    toast('Settings saved ⚙️');
  });
  $('#settings-reset').addEventListener('click', ()=>{
    Object.assign(SETTINGS, DEFAULT_SETTINGS);
    saveSettings(true);
    $('#set-currency').value = SETTINGS.currency;
    $('#set-pay').value = SETTINGS.paySchedule;
    $('#set-default-month').value = SETTINGS.defaultMonth;
    $('#set-density').value = SETTINGS.density;
    $('#set-charts').value = SETTINGS.showCharts;
    document.documentElement.classList.toggle('compact', SETTINGS.density === 'compact');
    money = nf(SETTINGS.currency);
    renderAll();
    toast('Defaults restored');
  });

  // Month change
  monthPicker.addEventListener('change', ()=>{
    ensureMonth(monthPicker.value); STATE._lastMonth = monthPicker.value; save();
    renderAll(); toast('Switched to '+monthPicker.value);
  });

  // ---------- Render ----------
  renderAll();

  function renderAll(){
    buildBudgetPlanner();
    renderTop();
    renderIncome();
    renderTransactions();
    renderGoals();
    renderSavings();
    renderDebt();
    renderCharts();
  }

  function renderTop(){
    const m=currentMonth();
    const income=sum(m.incomes.map(x=>x.amount));
    const expenses=sum(m.transactions.map(x=>x.amount));
    const result=income-expenses;
    tlIncome.textContent = money.format(income);
    tlExpenses.textContent = money.format(expenses);
    tlResult.textContent = money.format(result);
  }

  function buildBudgetPlanner(){
    const m=currentMonth();
    for(const c of ALL_CATEGORIES){ if(m.budgets[c.key]==null) m.budgets[c.key]=0; }
    budgetGroups.innerHTML = GROUPS.map(g=>{
      const rows=g.cats.map(cat=>{
        const key=`${g.key}:${slug(cat)}`; const val=m.budgets[key]||0;
        return `<div class="group row-wrap">
            <div class="row">
              <label><span class="color-dot" style="background:${g.color}"></span>${cat}</label>
              <input type="number" step="0.01" min="0" data-bkey="${key}" value="${val}">
            </div>
          </div>`;
      }).join('');
      return `<div class="group"><h4 class="color-${g.key}">${g.label}</h4>${rows}</div>`;
    }).join('');
    $$('#budget-groups input[type="number"]').forEach(inp=>{
      inp.addEventListener('input',e=>{
        m.budgets[e.target.dataset.bkey]=num(e.target.value); save();
        renderBudgetTotals(); renderCharts();
      });
    });
    renderBudgetTotals();
  }
  function renderBudgetTotals(){
    const total=sum(Object.values(currentMonth().budgets||{}));
    budgetedTotal.textContent=money.format(total);
  }

  function renderIncome(){
    const m=currentMonth();
    incomeBody.innerHTML=m.incomes.map(r=>`
      <tr><td>${esc(r.source)}</td>
      <td class="r">${money.format(r.amount)}</td>
      <td class="c"><button class="icon-btn" data-del-income="${r.id}">🗑️</button></td></tr>`).join('');
    $$('[data-del-income]').forEach(b=>b.addEventListener('click',()=>{
      m.incomes=m.incomes.filter(x=>x.id!==b.dataset.delIncome); save(); renderIncome(); renderTop(); renderCharts();
    }));
    incomeTotal.textContent=money.format(sum(m.incomes.map(x=>x.amount)));
  }

  function renderTransactions(){
    const m=currentMonth();
    txBody.innerHTML=m.transactions.map(row=>{
      const cat=ALL_CATEGORIES.find(c=>c.key===row.category);
      return `<tr>
        <td>${row.date}</td><td>${esc(row.desc)}</td>
        <td>${cat?`${cat.groupLabel} / ${cat.label}`:esc(row.category)}</td>
        <td>${row.need?'<span class="badge need">Need</span>':'<span class="badge want">Want</span>'}</td>
        <td class="r">${money.format(row.amount)}</td>
        <td>${esc(row.notes||'')}</td>
        <td class="c"><button class="icon-btn" data-del-tx="${row.id}">🗑️</button></td>
      </tr>`;
    }).join('');
    $$('[data-del-tx]').forEach(b=>b.addEventListener('click',()=>{
      m.transactions=m.transactions.filter(x=>x.id!==b.dataset.delTx); save(); renderTransactions(); renderTop(); renderCharts();
    }));
    txTotal.textContent=money.format(sum(m.transactions.map(x=>x.amount)));
  }

  function renderGoals(){
    const goals=STATE.goals||[];
    const list=$('#goal-list');
    list.innerHTML=goals.map(g=>{
      const cur=totalSavedForGoal(g.id);
      const pct=Math.min(100, Math.round(cur/Math.max(1,g.target)*100));
      return `<div class="group">
        <div style="display:flex; align-items:center; gap:.5rem">
          <h4>${esc(g.name)}</h4>
          <span class="badge">${money.format(cur)} / ${money.format(g.target)}</span>
          <span class="badge">${pct}%</span>
          <span style="margin-left:auto"></span>
          <button class="icon-btn" data-archive-goal="${g.id}">📦</button>
          <button class="icon-btn" data-del-goal="${g.id}">🗑️</button>
        </div>
        <div style="background:#0c1a26; border:1px solid #103049; border-radius:999px; overflow:hidden; height:12px">
          <div style="width:${pct}%; background:linear-gradient(90deg,#22c55e,#0ea5e9); height:100%"></div>
        </div>
      </div>`;
    }).join('');
    $$('[data-del-goal]').forEach(b=>b.addEventListener('click',()=>{
      if(!confirm('Delete this goal?')) return;
      STATE.goals=(STATE.goals||[]).filter(x=>x.id!==b.dataset.delGoal);
      for(const k of Object.keys(STATE.months)){ STATE.months[k].savings = STATE.months[k].savings.filter(s=>s.goalId!==b.dataset.delGoal); }
      save(); renderGoals(); renderSavings(); renderCharts();
    }));
    $$('[data-archive-goal]').forEach(b=>b.addEventListener('click',()=>{
      const g=(STATE.goals||[]).find(x=>x.id===b.dataset.archiveGoal); if(g){ g.archived=!g.archived; save(); renderGoals(); }
    }));
    const opts=(STATE.goals||[]).filter(g=>!g.archived).map(g=>`<option value="${g.id}">${esc(g.name)}</option>`);
    $('#save-goal').innerHTML=opts.join('');
  }

  function renderSavings(){
    const m=currentMonth();
    saveBody.innerHTML=m.savings.map(s=>{
      const goal=(STATE.goals||[]).find(g=>g.id===s.goalId);
      return `<tr>
        <td>${s.date}</td><td>${goal?esc(goal.name):'—'}</td>
        <td class="r">${money.format(s.amount)}</td>
        <td class="c"><button class="icon-btn" data-del-save="${s.id}">🗑️</button></td>
      </tr>`;
    }).join('');
    $$('[data-del-save]').forEach(b=>b.addEventListener('click',()=>{
      m.savings=m.savings.filter(x=>x.id!==b.dataset.delSave); save(); renderSavings(); renderCharts(); renderTop();
    }));
    saveTotal.textContent=money.format(sum(m.savings.map(x=>x.amount)));
  }

  function renderDebt(){
    const m=currentMonth();
    debtBody.innerHTML=m.debtExtra.map(d=>`
      <tr><td>${d.date}</td><td>${esc(d.name)}</td><td class="r">${money.format(d.amount)}</td>
      <td class="c"><button class="icon-btn" data-del-debt="${d.id}">🗑️</button></td></tr>`).join('');
    $$('[data-del-debt]').forEach(b=>b.addEventListener('click',()=>{
      const rec=m.debtExtra.find(x=>x.id===b.dataset.delDebt);
      m.transactions=m.transactions.filter(tx=>!(tx.notes==='Extra payment'&&tx.desc.startsWith(rec.name)));
      m.debtExtra=m.debtExtra.filter(x=>x.id!==b.dataset.delDebt);
      save(); renderDebt(); renderTransactions(); renderTop(); renderCharts();
    }));
    debtTotal.textContent=money.format(sum(m.debtExtra.map(x=>x.amount)));
  }

  // ---------- Charts ----------
  let chartByCat, chartBudget, chartNeedWant, chartCashflow;
  function renderCharts(){
    const show = SETTINGS.showCharts === 'on';
    $('#panel-charts').style.display = show ? '' : 'none';
    if(!show) return;

    const m=currentMonth();
    const byCat=aggByCat(m.transactions);
    const byGroup=aggByGroup(byCat);
    const labels=Object.keys(byGroup);
    const values=labels.map(k=>byGroup[k].total);
    const colors=labels.map(k=>byGroup[k].color);

    chartByCat = upsert(chartByCat, $('#chart-category').getContext('2d'), {
      type:'doughnut',
      data:{labels:labels.map(groupLabel), datasets:[{data:values, backgroundColor:colors, borderWidth:0}]},
      options:{plugins:{legend:{position:'bottom', labels:{color:'#cfe7ff'}}}, cutout:'55%'}
    });

    const budgetTotals = labels.map(gk=>{
      const keys=ALL_CATEGORIES.filter(c=>c.group===gk).map(c=>c.key);
      return sum(keys.map(k=>currentMonth().budgets[k]||0));
    });
    chartBudget = upsert(chartBudget, $('#chart-budget').getContext('2d'), {
      type:'bar',
      data:{labels:labels.map(groupLabel), datasets:[
        {label:'Budget', data:budgetTotals, backgroundColor:'rgba(14,165,233,.45)'},
        {label:'Actual', data:values, backgroundColor:'rgba(34,197,94,.55)'}
      ]},
      options:{scales:{x:{ticks:{color:'#cfe7ff'}}, y:{ticks:{color:'#cfe7ff'}, grid:{color:'#173040'}}},
               plugins:{legend:{labels:{color:'#cfe7ff'}}}}
    });

    const need=sum(m.transactions.filter(t=>t.need).map(t=>t.amount));
    const want=sum(m.transactions.filter(t=>!t.need).map(t=>t.amount));
    chartNeedWant = upsert(chartNeedWant, $('#chart-needwant').getContext('2d'), {
      type:'pie',
      data:{labels:['Need','Want'], datasets:[{data:[need,want], backgroundColor:['#22c55e','#ef4444'], borderWidth:0}]},
      options:{plugins:{legend:{position:'bottom', labels:{color:'#cfe7ff'}}}}
    });

    const days=daysIn(monthPicker.value); let running=0;
    const incomeTot=sum(m.incomes.map(i=>i.amount));
    const exp = Array.from({length:days},()=>0);
    m.transactions.forEach(t=>{ const d=+t.date.split('-')[2]; if(d>=1&&d<=days) exp[d-1]+=t.amount; });
    const cash=[]; for(let d=1; d<=days; d++){ if(d===1) running+=incomeTot; running-=exp[d-1]; cash.push(running); }
    chartCashflow = upsert(chartCashflow, $('#chart-cashflow').getContext('2d'), {
      type:'line',
      data:{labels:Array.from({length:days},(_,i)=>String(i+1)), datasets:[{label:'Balance (viz)', data:cash, borderColor:'#0ea5e9', backgroundColor:'rgba(14,165,233,.15)', fill:true, tension:.25}]},
      options:{plugins:{legend:{labels:{color:'#cfe7ff'}}}, scales:{x:{ticks:{color:'#cfe7ff'}}, y:{ticks:{color:'#cfe7ff'}, grid:{color:'#173040'}}}}
    });
  }
  function upsert(inst, ctx, cfg){ if(inst){ inst.data=cfg.data; inst.options=cfg.options||{}; inst.update(); return inst; } return new Chart(ctx,cfg); }
  function aggByCat(list){ const m={}; for(const t of list){ m[t.category]=(m[t.category]||0)+t.amount; } return m; }
  function groupLabel(key){ return GROUPS.find(g=>g.key===key)?.label || key; }
  function aggByGroup(map){ const gmap={}; for(const [k,v] of Object.entries(map)){ const cat=ALL_CATEGORIES.find(c=>c.key===k); const g=cat?.group||'other'; if(!gmap[g]) gmap[g]={total:0, color:cat?.color||'#999'}; gmap[g].total+=v; } for(const g of GROUPS){ if(!gmap[g.key]) gmap[g.key]={total:0, color:g.color}; } return gmap; }

  // ---------- Tabs ----------
  function initTabs(){
    const tabs=$$('.tabs [role="tab"]');
    const panels=$$('.panel');
    tabs.forEach(tab=>{
      tab.addEventListener('click', ()=>{
        tabs.forEach(t=>t.setAttribute('aria-selected','false'));
        tab.setAttribute('aria-selected','true');
        panels.forEach(p=>p.classList.remove('is-active'));
        $('#'+tab.getAttribute('aria-controls')).classList.add('is-active');
        // Scroll top for new panel
        window.scrollTo({top:0, behavior:'smooth'});
      });
    });
  }

  // ---------- Helpers ----------
  function daysIn(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  const id=()=>Math.random().toString(36).slice(2,11);
  const num=v=>Math.max(0, parseFloat(v||'0'))||0;
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const getMonthKey=d=>d.toISOString().slice(0,7);
  const currentMonth=()=>STATE.months[monthPicker.value];
  function ensureMonth(k){ STATE.months[k]=STATE.months[k]||EMPTY_MONTH(); }

  function loadState(){
    const raw=localStorage.getItem('bb.state');
    let base={version:3, months:{}, goals:[], _lastMonth:null};
    if(raw){ try{ const p=JSON.parse(raw); if(p && typeof p==='object') base=p; }catch{} }
    base.months ||= {}; base.goals ||= [];
    return base;
  }
  function save(){ STATE._lastMonth = monthPicker.value; localStorage.setItem('bb.state', JSON.stringify(STATE)); }
  function toast(msg){ const s=statusBox; s.textContent=msg; clearTimeout(toast._t); toast._t=setTimeout(()=>s.textContent='', 3000); }
  function totalSavedForGoal(goalId){ let t=0; for(const m of Object.values(STATE.months)){ for(const s of m.savings){ if(s.goalId===goalId) t+=s.amount; } } return t; }

  function doExport(){
    const blob=new Blob([JSON.stringify({settings:SETTINGS, state:STATE}, null, 2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`budget-buddy-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function handleImport(e){
    const f=e.target.files?.[0]; if(!f) return;
    try{
      const text=await f.text(); const obj=JSON.parse(text);
      if(!obj) throw new Error('Invalid file');
      if(obj.settings){ Object.assign(SETTINGS, obj.settings); saveSettings(); money = nf(SETTINGS.currency); }
      if(obj.state){ localStorage.setItem('bb.state', JSON.stringify(obj.state)); Object.assign(STATE, obj.state); }
      renderAll(); toast('Import complete 💾');
    }catch(err){ alert('Import failed: '+err.message); }
    e.target.value='';
  }

  function loadSettings(){
    const raw=localStorage.getItem('bb.settings');
    let s={...DEFAULT_SETTINGS};
    if(raw){ try{ const p=JSON.parse(raw); Object.assign(s,p||{}); }catch{} }
    return s;
  }
  function saveSettings(rewrite=false){
    if(rewrite){ localStorage.removeItem('bb.settings'); }
    localStorage.setItem('bb.settings', JSON.stringify(SETTINGS));
  }

  // ---------- Sample Data ----------
  function loadSampleData(monthKey){
    ensureMonth(monthKey);
    const m=STATE.months[monthKey]=EMPTY_MONTH();
    m.incomes=[{id:id(),source:'Paycheck (post-tax)',amount:3400},{id:id(),source:'Freelance',amount:850},{id:id(),source:'Rental income',amount:600},{id:id(),source:'Interest',amount:25}];
    const s=slug, setB=(k,v)=>m.budgets[k]=v;
    setB('housing:'+s('Rent/Mortgage'),1600); setB('housing:'+s('Insurance/Property Taxes'),180);
    setB('transport:'+s('Car Payment'),320); setB('transport:'+s('Car Insurance'),110);
    setB('utilities:'+s('Electricity'),90); setB('utilities:'+s('Water'),40); setB('utilities:'+s('Internet/Cable'),70); setB('utilities:'+s('Phone Bill'),60);
    setB('debt:'+s('Student Loans'),150); setB('debt:'+s('Credit Cards'),100);
    setB('fixedother:'+s('Subscriptions'),45); setB('fixedother:'+s('Other Fixed Loans'),0);
    setB('food:'+s('Groceries'),420); setB('food:'+s('Dining Out'),160);
    setB('household:'+s('Personal Care'),35); setB('household:'+s('Household Supplies'),45);
    setB('personal:'+s('Shopping'),120); setB('personal:'+s('Entertainment'),80);
    setB('medical:'+s('Co-pays & Prescriptions'),30); setB('medical:'+s('Health Care'),30);
    setB('othervar:'+s('Fuel/Gas'),130); setB('othervar:'+s('Travel'),0); setB('othervar:'+s('Gifts'),0);

    const mm=monthKey, t=(d,dd,desc,cat,need,amt,notes='')=>({id:id(), date:`${d}-${dd}`, desc, category:cat, need, amount:amt, notes});
    m.transactions=[ t(mm,'01','Rent','housing:'+s('Rent/Mortgage'),true,1600),
      t(mm,'02','Groceries – Trader Joe\'s','food:'+s('Groceries'),true,98.25),
      t(mm,'03','Car Payment','transport:'+s('Car Payment'),true,320),
      t(mm,'04','Electric Utility','utilities:'+s('Electricity'),true,88.4),
      t(mm,'06','Netflix & Gym','fixedother:'+s('Subscriptions'),false,32.99),
      t(mm,'07','Dining – Thai','food:'+s('Dining Out'),false,28.75),
      t(mm,'09','Gas','othervar:'+s('Fuel/Gas'),true,42.1),
      t(mm,'12','Phone Bill','utilities:'+s('Phone Bill'),true,59),
      t(mm,'15','Entertainment – Movies','personal:'+s('Entertainment'),false,21.5),
      t(mm,'17','Household Supplies','household:'+s('Household Supplies'),true,14.9),
      t(mm,'20','Credit Card Minimum','debt:'+s('Credit Cards'),true,60),
      t(mm,'23','Co-pay','medical:'+s('Co-pays & Prescriptions'),true,25),
      t(mm,'25','Internet','utilities:'+s('Internet/Cable'),true,70),
      t(mm,'27','Shopping – T-shirt','personal:'+s('Shopping'),false,24.99),
      t(mm,'20','Credit Card (extra)','debt:'+s('Credit Cards'),true,40,'Extra payment')
    ];

    STATE.goals=[{id:id(),name:'Emergency Fund',target:5000,archived:false},{id:id(),name:'Vacation',target:1500,archived:false}];
    m.savings=[{id:id(),date:`${mm}-05`,goalId:STATE.goals[0].id,amount:150},{id:id(),date:`${mm}-18`,goalId:STATE.goals[1].id,amount:100}];
    m.debtExtra=[{id:id(),date:`${mm}-20`,name:'Credit Card',amount:40}];
  }
})();
