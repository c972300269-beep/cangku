// 用法: node pms_query_weixiu.js "项目名关键词"
// 已收款管理：计费周期2026-10-01~10-31 + 收费项目=维修服务 → 条数+缴款总额+明细
const {chromium}=require('playwright');
const projKey=process.argv[2]||'';
(async()=>{
const ctx=await chromium.launchPersistentContext('C:/Users/chenjialin3/.workbuddy/pms_profile',{headless:true,channel:'chrome'});
const pg=ctx.pages()[0]||await ctx.newPage();
const log=(...a)=>console.log(...a);
await pg.goto('https://new-pms.linli580.cn/portal',{timeout:60000,waitUntil:'domcontentloaded'});
await pg.waitForTimeout(6000);

// 切换项目（顶部项目选择器）
if(projKey){
  // 顶部选择器是含当前项目名的 ant-select
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
// 展开
await pg.evaluate(()=>{
  const exp=[...document.querySelectorAll('span,div,a,button')].find(e=>(e.textContent||'').trim()==='展开'&&e.getBoundingClientRect().width>0);
  if(exp) exp.click();
});
await pg.waitForTimeout(2000);

// 计费周期
const sBox=await pg.evaluate(()=>{
  const els=[...document.querySelectorAll('input[placeholder=开始日期]')].filter(e=>e.getBoundingClientRect().width>0);
  els.sort((a,b)=>a.getBoundingClientRect().y-b.getBoundingClientRect().y);
  const r=els[0].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
});
await pg.mouse.click(sBox.x,sBox.y); await pg.waitForTimeout(1200);
await pg.evaluate(()=>{
  const c=document.querySelector('.ant-calendar-picker-container:not([style*="display: none"])');
  c.querySelector('.ant-calendar-range-left .ant-calendar-prev-month-btn')?.click();
});
await pg.waitForTimeout(800);
const d1=await pg.evaluate(()=>{
  const l=document.querySelector('.ant-calendar-picker-container:not([style*="display: none"]) .ant-calendar-range-left');
  const el=[...l.querySelectorAll('.ant-calendar-date')].find(e=>(e.textContent||'').trim()==='1');
  const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
});
await pg.mouse.click(d1.x,d1.y); await pg.waitForTimeout(1000);
const d31=await pg.evaluate(()=>{
  const l=document.querySelector('.ant-calendar-picker-container:not([style*="display: none"]) .ant-calendar-range-left');
  const el=[...l.querySelectorAll('.ant-calendar-date')].find(e=>(e.textContent||'').trim()==='31');
  const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
});
await pg.mouse.click(d31.x,d31.y); await pg.waitForTimeout(1000);

// 收费项目=维修服务（重试）
let ok=false;
for(let i=0;i<5&&!ok;i++){
  await pg.evaluate(()=>{
    const labels=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='收费项目'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().y<500);
    const lb=labels[0].getBoundingClientRect();
    const sels=[...document.querySelectorAll('.ant-select')].map(e=>e).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&Math.abs(r.y-lb.y)<20&&r.x>lb.x&&r.x-lb.x<300;});
    sels.sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x);
    sels[0].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    sels[0].click();
  });
  await pg.waitForTimeout(1500);
  const r=await pg.evaluate(()=>{
    const d=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if(!d) return {ok:false};
    const items=[...d.querySelectorAll('li,[role=option],.ant-select-item,.ant-select-tree-li')].filter(e=>e.getBoundingClientRect().height>0);
    const t=items.find(e=>(e.textContent||'').trim()==='维修服务');
    if(!t) return {ok:false};
    t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    t.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    t.click();
    return {ok:true};
  });
  ok=r.ok;
  if(!ok){ await pg.keyboard.press('Escape'); await pg.waitForTimeout(1000); }
}
if(!ok){ log('ERR 未能选中维修服务'); await ctx.close(); return process.exit(3); }
await pg.waitForTimeout(1200);
await pg.mouse.click(660,650);
await pg.waitForTimeout(800);

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
  return {pager,strip,rows:rows.slice(0,5)};
});
log('条数:',res.pager);
log('汇总:',res.strip);
log('明细(前5行):');
res.rows.forEach(r=>log('  '+r));
await pg.screenshot({path:'E:/workbuddy/Claw/.workbuddy/pms_q_'+Date.now()+'.png',fullPage:false});
await ctx.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
