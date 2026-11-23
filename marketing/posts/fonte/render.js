const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const [hash,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+process.cwd()+'/reel.html#'+encodeURIComponent(hash));await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
const N=30*25;for(let i=0;i<N;i++){await p.evaluate(t=>renderFast(t),i/30);await p.screenshot({path:`${out}/f${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92});}
await b.close();console.log('ok',out)})();
