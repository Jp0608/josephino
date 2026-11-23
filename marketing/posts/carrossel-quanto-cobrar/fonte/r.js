const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350}});
for(let i=1;i<=8;i++){await p.goto('file://'+process.cwd()+'/p.html#'+i);await p.reload();await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(200);await p.screenshot({path:`out-${String(i).padStart(2,'0')}.png`});}
await b.close()})();
