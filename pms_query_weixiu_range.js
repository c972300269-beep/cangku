// 用法: node pms_query_weixiu_range.js "项目名关键词" <起始日> <结束日> [月偏移] [收费项目]
//   月偏移: 0=当月(默认), -1=上月, 1=下月；收费项目默认「维修服务」，传 ALL 表示不筛选
//   例: node pms_query_weixiu_range.js "雅悦花园" 1 5
// 已收款管理：指定计费周期 + 收费项目 → 条数 + 缴款总额 + 明细
const {chromium}=require('playwright');
const fs=require('fs');
const projKey=process.argv[2]||'';
const startDay=parseInt(process.argv[3]||'1',10);
const endDay=parseInt(process.argv[4]||new Date().getDate(),10);
const monthOffset=parseInt(process.argv[5]||'0',10);
const feeItem=process.argv[6]||'维修服务';
const OUT_DIR='E:/workbuddy/Claw/reports/pms';
(async()=>{
fs.mkdirSync(OUT_DIR,{recursive:true});
const ctx=await chromium.launchPersistentContext('C:/Users/chenjialin3/.workbuddy/pms_profile',{headless:true,channel:'chrome'});
const pg=ctx.pages()[0]||await ctx.newPage();
const log=(...a)=>console.log(...a);
await pg.goto('https://new-pms.linli580.cn/portal',{timeout:60000,waitUntil:'domcontentloaded'});
await pg.waitForTimeout(6000);

// 切换项目（顶部项目选择器）
if(projKey){
  const cur=await pg.evaluate(()=>{
    const sels=[...document.querySelectorAll('.ant-select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.y<60;});
    return sels.length?sels[0].getBoundingClientRect():null;
  });
  if(!cur){ log('ERR 找不到项目选择器'); await ctx.close(); return process.exit(2); }
  await pg.mouse.click(cur.x+cur.width/2,cur.y+cur.height/2);
  await pg.waitForTimeout(1500);
  const opt=await pg.evaluate((k)=>{
    const d=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if(!d) return null;
    const items=[...d.querySelectorAll('li,[role=option],.ant-select-item')].filter(e=>e.getBoundingClientRect().height>0);
    const t=items.find(e=>(e.textContent||'').includes(k));
    if(!t) return {notfound:items.map(e=>(e.textContent||'').trim()).slice(0,20)};
    const r=t.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  },projKey);
  if(!opt){ log('ERR 项目下拉未打开'); await ctx.close(); return process.exit(2); }
  if(opt.notfound){ log('ERR 项目列表无匹配:',projKey,'| 可选:',opt.notfound.join(', ')); await ctx.close(); return process.exit(2); }
  await pg.mouse.click(opt.x,opt.y);
  await pg.waitForTimeout(3000);
}

const curProj=await pg.evaluate(()=>{
  const sels=[...document.querySelectorAll('.ant-select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.y<60;});
  return sels.length?(sels[0].textContent||'').trim():'?';
});
log('当前项目:',curProj);

// 收款管理→已收款管理
await pg.evaluate(()=>{
  const t=[...document.querySelectorAll('div.ant-menu-submenu-title')].find(e=>(e.textContent||'').trim()==='收款管理'); t.click();
});
await pg.waitForTimeout(1500);
await pg.evaluate(()=>{
  const li=[...document.querySelectorAll('li.ant-menu-item')].find(e=>(e.textContent||'').trim()==='已收款管理'); li.click();
});
await pg.waitForTimeout(6000);
await pg.evaluate(()=>{
  const exp=[...document.querySelectorAll('span,div,a,button')].find(e=>(e.textContent||'').trim()==='展开'&&e.getBoundingClientRect().width>0);
  if(exp) exp.click();
});
await pg.waitForTimeout(2000);

// 计费周期：打开日历，按偏移翻月，精确点选「本月」的起始日/结束日
const sBox=await pg.evaluate(()=>{
  const els=[...document.querySelectorAll('input[placeholder=开始日期]')].filter(e=>e.getBoundingClientRect().width>0);
  els.sort((a,b)=>a.getBoundingClientRect().y-b.getBoundingClientRect().y);
  const r=els[0].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
});
await pg.mouse.click(sBox.x,sBox.y); await pg.waitForTimeout(1200);
for(let i=0;i<Math.abs(monthOffset);i++){
  await pg.evaluate((off)=>{
    const c=document.querySelector('.ant-calendar-picker-container:not([style*="display: none"])');
    const sel=off<0?'.ant-calendar-range-left .ant-calendar-prev-month-btn':'.ant-calendar-range-left .ant-calendar-next-month-btn';
    c.querySelector(sel)?.click();
  },monthOffset);
  await pg.waitForTimeout(700);
}
const monthTitle=await pg.evaluate(()=>{
  const c=document.querySelector('.ant-calendar-picker-container:not([style*="display: none"]) .ant-calendar-range-left');
  return (c.querySelector('.ant-calendar-ym-select,.ant-calendar-my-select')?.textContent||'?').trim();
});
log('日历面板:',monthTitle,'| 目标:',startDay,'~',endDay);

async function pickDay(day){
  const pos=await pg.evaluate((d)=>{
    const l=document.querySelector('.ant-calendar-picker-container:not([style*="display: none"]) .ant-calendar-range-left');
    const cells=[...l.querySelectorAll('td.ant-calendar-cell')].filter(td=>
      !td.classList.contains('ant-calendar-last-month-cell') &&
      !td.classList.contains('ant-calendar-next-month-cell-btn'));
    const td=cells.find(td=>{
      const a=td.querySelector('.ant-calendar-date');
      return a && (a.textContent||'').trim()===String(d);
    });
    if(!td) return {missing:true, seen:cells.slice(0,6).map(x=>(x.textContent||'').trim())};
    const r=td.querySelector('.ant-calendar-date').getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  },day);
  if(pos.missing){ log('ERR 日历找不到日期',day,'样本:',pos.seen); return false; }
  await pg.mouse.click(pos.x,pos.y);
  await pg.waitForTimeout(1000);
  return true;
}
if(!await pickDay(startDay)){ await ctx.close(); return process.exit(4); }
if(!await pickDay(endDay)){ await ctx.close(); return process.exit(4); }
await pg.waitForTimeout(800);
const dateVals=await pg.evaluate(()=>[...document.querySelectorAll('input[placeholder=开始日期],input[placeholder=结束日期]')].map(e=>e.value));
log('计费周期输入框:',dateVals.join(' ~ '));

// 收费项目（默认维修服务；ALL 则跳过）
if(feeItem!=='ALL'){
  let ok=false;
  for(let i=0;i<5&&!ok;i++){
    await pg.evaluate(()=>{
      const labels=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='收费项目'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().y<500);
      const lb=labels[0].getBoundingClientRect();
      const sels=[...document.querySelectorAll('.ant-select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&Math.abs(r.y-lb.y)<20&&r.x>lb.x&&r.x-lb.x<300;});
      sels.sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x);
      sels[0].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      sels[0].click();
    });
    await pg.waitForTimeout(1500);
    const r=await pg.evaluate((fee)=>{
      const d=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      if(!d) return {ok:false};
      const items=[...d.querySelectorAll('li,[role=option],.ant-select-item,.ant-select-tree-li')].filter(e=>e.getBoundingClientRect().height>0);
      const t=items.find(e=>(e.textContent||'').trim()===fee);
      if(!t) return {ok:false,seen:items.slice(0,10).map(x=>(x.textContent||'').trim())};
      t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      t.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      t.click();
      return {ok:true};
    },feeItem);
    ok=r.ok;
    if(!ok){ await pg.keyboard.press('Escape'); await pg.waitForTimeout(1000); }
  }
  if(!ok){ log('ERR 未能选中收费项目',feeItem); await ctx.close(); return process.exit(3); }
  await pg.waitForTimeout(1200);
  await pg.mouse.click(660,650);
  await pg.waitForTimeout(800);
}

// 查询前条件自检：直接读页面输入框真实值，日期不符就拒绝查询，避免误判零结果
const cond=await pg.evaluate(()=>{
  const di=[...document.querySelectorAll('input[placeholder=开始日期],input[placeholder=结束日期]')].map(e=>e.value);
  const fee=[...document.querySelectorAll('.ant-select-selection__rendered')].map(e=>(e.textContent||'').trim()).filter(Boolean);
  return {dateInputs:di,feeSelects:fee.slice(0,12)};
});
log('查询前条件:',JSON.stringify(cond));
function num(v){const m=/(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v||'');return m?{y:+m[1],m:+m[2],d:+m[3]}:null;}
const ds=num(cond.dateInputs[0]),de=num(cond.dateInputs[1]);
if(!ds||!de||ds.d!==startDay||de.d!==endDay){
  log('ERR 计费周期与预期不符，放弃查询以免误判'); await ctx.close(); return process.exit(5);
}

// 查询
await pg.evaluate(()=>{
  const btn=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').trim()==='查询'&&e.getBoundingClientRect().width>0);
  btn.click();
});
await pg.waitForTimeout(12000);
const res=await pg.evaluate(()=>{
  const body=document.body.innerText;
  const pager=(body.match(/共\s*[\d,]+\s*条记录/)||[])[0]||'';
  const i=body.indexOf('缴款总额');
  const strip=i>=0?body.slice(i,i+200).replace(/\n+/g,' '):'NO';
  const rows=[];
  document.querySelectorAll('table tbody tr').forEach(tr=>{
    const tds=[...tr.querySelectorAll('td')].map(td=>(td.textContent||'').trim());
    if(tds.length>3&&tds.join('').trim()) rows.push(tds.slice(0,20).join(' | '));
  });
  return {pager,strip,allRows:rows.length,feeRows:rows.filter(r=>r.includes('维修服务')).length,
          rows:rows.slice(0,10),hasEmpty:/暂无数据|无数据/.test(body)};
});
log('条数:',res.pager||'(未匹配到分页文案)');
log('汇总:',res.strip);
log('是否出现空数据提示:',res.hasEmpty,'| 明细行数:',res.allRows,'| 其中维修服务行:',res.feeRows);
log('明细(前10行):');
res.rows.forEach(r=>log('  '+r));
const tag=[projKey.replace(/[^\w\u4e00-\u9fa5]/g,''),feeItem,startDay+'-'+endDay,monthOffset].join('_');
const shot=OUT_DIR+'/pms_'+Date.now()+'_'+tag+'.png';
await pg.screenshot({path:shot,fullPage:false});
log('截图:',shot);
await ctx.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
