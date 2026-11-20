const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
function log(m){console.log(`[${new Date().toISOString()}] ${m}`);}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function cleanDates(txt){return txt.replace(/new Date\(([^)]+)\)/g,(m,args)=>{const p=args.split(',').map(x=>parseInt(x.trim()));if(p.length>=3){const d=new Date(p[0],p[1],p[2],p[3]||0,p[4]||0,p[5]||0);return JSON.stringify(d.toISOString());}return 'null';});}

async function fetchPage(page, start){
  const params=new URLSearchParams({method:'GetHistoryTasks',HistoryTaskType:'MyRequest',ThisTaskState:'Approved',byYear:'0',start:String(start),limit:'500',_dc:Date.now().toString()});
  const raw=await page.evaluate(async(url)=>{const r=await fetch(url,{credentials:'include'});return await r.text();},'/YZSoft.Services.REST/BPM/TaskList.ashx?'+params.toString());
  return raw;
}

async function main(){
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',args:['--no-sandbox','--disable-setuid-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']});
  const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'zh-CN',ignoreHTTPSErrors:true,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'});
  const page=await ctx.newPage();
  try{
    log('登录中...');
    await page.goto('http://bpm.timesgroup.cn',{waitUntil:'domcontentloaded',timeout:60000});
    await sleep(9000);
    let all=[], start=0, guard=0;
    while(guard<20){
      guard++;
      const raw=await fetchPage(page,start);
      let j; try{j=JSON.parse(cleanDates(raw));}catch(e){log('parse fail at '+start);break;}
      const kids=j.children||[];
      const total=j.total||0;
      all=all.concat(kids);
      log(`start=${start} 本页=${kids.length} 累计=${all.length} total=${total}`);
      if(kids.length<500) break;
      start+=500;
      await sleep(1000);
    }
    fs.writeFileSync(path.join(OUTPUT_DIR,'approved_all.json'),JSON.stringify({count:all.length,items:all},null,2));
    log('SAVED approved_all.json count='+all.length);
  }catch(e){log('ERR '+e.message);log(e.stack);}
  finally{await browser.close();}
}
main().catch(e=>{console.error('Fatal',e);process.exit(1);});
