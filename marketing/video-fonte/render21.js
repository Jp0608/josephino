const { chromium } = require('playwright');
const dir = process.argv[2], FPS = 30, DUR = 21;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + dir + '/scene.html'); await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready);
  const n = FPS * DUR;
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.renderFast(t), i / FPS);
    await p.screenshot({ path: `${dir}/frames21/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 150 === 0) console.log('quadro', i, 'de', n);
  }
  await b.close();
  console.log('quadros ok');
})();
