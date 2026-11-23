const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+process.cwd()+'/ins.html');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
for(const [mode,dur,dir] of [['ins',4.5,'fi'],['end',3.2,'fe']]){fs.mkdirSync(dir,{recursive:true});await p.evaluate(m=>window.mode=m,mode);
for(let i=0;i<Math.round(dur*30);i++){await p.evaluate(t=>renderFast(t),i/30);await p.screenshot({path:`${dir}/f${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});}}
await b.close();console.log('ok')})();
