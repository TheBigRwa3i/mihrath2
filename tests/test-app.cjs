const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('fs');const assert=require('assert/strict');const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
fs.mkdirSync('tests/output',{recursive:true});
const nasa=Object.fromEntries(['mafraq','valley','irbid'].map(r=>[r,JSON.parse(fs.readFileSync('data/nasa-'+r+'.json'))]));
const forecast=JSON.parse(fs.readFileSync('tests/fixtures/open-meteo-2026-11-14.json'));
const url=process.env.TEST_URL || 'http://127.0.0.1:8765/index.html';
// Date-shift the fixture only for tests; it never becomes a live forecast.
const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Amman',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const today=['year','month','day'].map(k=>dateParts.find(p=>p.type===k).value).join('-');
forecast.daily.time=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
const errors=[],results=[];
function ok(name,condition){assert.ok(condition,name);results.push(name);console.log('PASS',name);}
function near(a,b){return Math.abs(a-b)<1e-7;}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH}:{})});
 async function newPage(mode='fixture',viewport={width:1440,height:1000}){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  if(mode==='fixture'){
   await context.route('https://power.larc.nasa.gov/**',route=>{const lon=new URL(route.request().url()).searchParams.get('longitude');const region=lon==='36.208'?'mafraq':lon==='35.5667'?'valley':'irbid';return route.fulfill({json:nasa[region]});});
   await context.route('https://api.open-meteo.com/**',route=>route.fulfill({json:forecast}));
  }else if(mode==='offline'){await context.route('**/*',route=>route.request().url().startsWith('https:')?route.abort('internetdisconnected'):route.continue());}
  await page.goto(url);await page.waitForFunction(()=>state.nasaStatus!=='loading'&&state.forecastStatus!=='loading');
  return page;
 }
 async function report(page){await page.click('#nextBtn');await page.click('#nextBtn');await page.click('#nextBtn');await page.locator('#dashboard').waitFor({state:'visible'});}
 const page=await newPage();await report(page);
 let actual=await page.evaluate(()=>({b:getAnalysis().b,paths:getAnalysis().paths.map(p=>({id:p.id,ratio:p.coverage,area:p.maxArea,extra:p.extraGross})),best:getAnalysis().best.id}));
 const days=[31,28.25,31,30,31,30,31,31,30,31,30,31],keys=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const rain=[10,11,0,1,2,3].reduce((s,m)=>s+nasa.mafraq.properties.parameter.PRECTOTCORR[keys[m]]*days[m],0);
 ok('Monthly daily rainfall converted and default water budget correct',near(actual.b.total,900+rain*10*.5));
 ok('All 3 distinct strategies and 7 forecast days',new Set(actual.paths.map(p=>p.id)).size===3&&await page.locator('.day').count()===7);
 ok('Defaults identify barley as water sufficient',actual.best==='barley');
 ok('Legume maximum viable area recomputes rainfall with area',near(actual.paths[1].area,900/(250-rain*.5)));
 ok('Additional gross water includes irrigation efficiency',near(actual.paths[1].extra,(2500-actual.b.total)/.9));
 ok('Drip toggle disabled when already using drip',await page.locator('#simDrip').isDisabled());
 const baseline=actual.b.total;
 await page.click('#simRain');actual=await page.evaluate(()=>getAnalysis().b);
 ok('20% rainfall reduction preserves net irrigation',near(actual.total,900+rain*.8*10*.5));
 await page.click('#simFrost');
 let risks=await page.evaluate(()=>getAnalysis().paths.map(p=>({id:p.id,frost:p.scenarioFrost})));
 ok('Minus 2 frost harms potato while legume and barley within thresholds',risks[0].frost&&!risks[1].frost&&!risks[2].frost);
 await page.click('#simHeat');
 ok('Heat toggles off frost and activates thermal emergency',await page.evaluate(()=>!state.sim.frost&&state.sim.heat&&getAnalysis().paths.every(p=>p.scenarioHeat)));
 await page.click('#resetSim');ok('Reset returns exact baseline',near(await page.evaluate(()=>getAnalysis().b.total),baseline));
 await page.click('#editTop');await page.click('#nextBtn');await page.selectOption('#surface','residue');await page.click('#nextBtn');await page.selectOption('#irrigation','sprinkler');await page.click('[data-water-mode="tank"]');await page.fill('#tankCount','100');await page.fill('#tankCapacity','10');await page.click('#nextBtn');
 ok('Tanker total and sprinkler efficiency',await page.evaluate(()=>state.input.gross===1000&&Math.abs(getAnalysis().b.net-750)<1e-8));
 await page.click('#simDrip');ok('Drip conversion increases net water correctly',near(await page.evaluate(()=>getAnalysis().b.net),900));
 ok('Drip saving text distinguishes alternatives',(await page.locator('#simSummary').textContent()).includes('167'));
 await page.click('#simHeat');ok('Heat+dry air+crop residue activates fire warning',(await page.locator('#shieldCards').textContent()).includes('خطر مرتفع مشروط'));
 await page.evaluate(()=>{window.__prints=0;window.print=()=>window.__prints++;});await page.click('#printTop');await page.click('#printBottom');ok('Both print buttons call window.print',await page.evaluate(()=>window.__prints===2));
 await page.emulateMedia({media:'print'});await page.pdf({path:'tests/output/print-check.pdf',format:'A4',printBackground:true});await page.screenshot({path:'tests/output/print-layout.png',fullPage:true});await page.emulateMedia({media:'screen'});
 await page.click('#editBottom');await page.fill('#area','0');await page.click('#nextBtn');ok('Zero area is rejected',await page.locator('#formError').isVisible());await page.fill('#area','10');await page.click('#nextBtn');await page.click('#nextBtn');await page.selectOption('#irrigation','rainfed');
 ok('Rainfed disables water input',await page.locator('#tankCount').isDisabled());await page.click('#nextBtn');
 ok('Rainfed budget has no irrigation and no misleading area rescue',await page.evaluate(()=>getAnalysis().b.net===0&&getAnalysis().paths.filter(p=>!p.enough).every(p=>p.maxArea===0&&p.extraGross===null)));
 ok('Rainfed disables drip conversion',await page.locator('#simDrip').isDisabled());
 // Validate all crop thresholds and monotonic budgets on both seasons and all climates.
 const matrix=await page.evaluate(()=>{
  let count=0;
  for(const region of Object.keys(REGIONS))for(const season of ['winter','summer'])for(const planned of Object.keys(CROPS))for(const irrigation of Object.keys(IRRIGATION)){
   const a={region,area:10,previous:'tomato',planned,season,surface:'bare',irrigation,gross:1000};
   const n=parseNASA(NASA_FALLBACK[region]),b=budget(a,n,{}),dry=budget(a,n,{rain:true});
   const p=evaluateCrop(planned,a,b,{},fallbackForecast(region));
   if(!(b.total>=dry.total&&p.coverage>=0&&Number.isFinite(p.coverage)))return false;
   if(irrigation==='rainfed'&&b.net!==0)return false;count++;
  }return count;
 });ok('144 climate/season/crop/irrigation combinations remain finite and monotonic',matrix===144);
 const mobile=await newPage('offline',{width:390,height:844});await mobile.screenshot({path:'tests/output/mobile-form.png',fullPage:true});await report(mobile);await mobile.screenshot({path:'tests/output/mobile-report.png',fullPage:true});
 ok('Offline sources clearly labelled',await mobile.evaluate(()=>state.nasaSource==='fallback'&&state.forecastSource==='fallback'&&document.getElementById('weatherSource').textContent.includes('ليست توقع')));
 ok('Offline embedded Arabic font loads',await mobile.evaluate(()=>document.fonts.check('400 16px "Noto Sans Arabic"')));
 ok('Mobile page does not overflow horizontally',await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 ok('Climate table and timeline collapsed by default',!await mobile.locator('#timelineTable').isVisible()&&!await mobile.locator('#nasaTable').isVisible());
 await mobile.locator('#calendarAccordion>summary').click();await mobile.locator('#dataAccordion>summary').click();ok('Tables accessible when expanded',await mobile.locator('#timelineTable').isVisible()&&await mobile.locator('#nasaTable').isVisible());
 const malformed=await browser.newContext();await malformed.route('https://power.larc.nasa.gov/**',route=>{const broken=structuredClone(nasa.mafraq);broken.properties.parameter.GWETTOP.JAN=null;return route.fulfill({json:broken});});await malformed.route('https://api.open-meteo.com/**',route=>{const broken=structuredClone(forecast);broken.daily.temperature_2m_min[0]=null;return route.fulfill({json:broken});});
 const bad=await malformed.newPage();bad.on('pageerror',e=>errors.push(e.message));await bad.goto(url);await bad.waitForFunction(()=>state.nasaStatus==='fallback'&&state.forecastStatus==='fallback');await report(bad);
 ok('Null API values trigger independent valid fallbacks',await bad.evaluate(()=>Number.isFinite(getAnalysis().b.total)&&!document.getElementById('dashboard').textContent.includes('NaN')));
 const raceContext=await browser.newContext();let calls=[];
 await raceContext.route('https://power.larc.nasa.gov/**',async route=>{const lon=new URL(route.request().url()).searchParams.get('longitude');calls.push(lon);await new Promise(r=>setTimeout(r,lon==='36.208'?350:40));const key=lon==='36.208'?'mafraq':lon==='35.5667'?'valley':'irbid';await route.fulfill({json:nasa[key]}).catch(()=>{});});
 await raceContext.route('https://api.open-meteo.com/**',async route=>{await new Promise(r=>setTimeout(r,80));await route.fulfill({json:forecast}).catch(()=>{});});
 const race=await raceContext.newPage();race.on('pageerror',e=>errors.push(e.message));await race.goto(url);await race.check('input[value="valley"]');await race.check('input[value="irbid"]');await race.waitForFunction(()=>state.nasaStatus==='live'&&state.region==='irbid');await race.waitForTimeout(450);
 const irbidJan=nasa.irbid.properties.parameter.PRECTOTCORR.JAN*31;
 ok('Rapid region changes cannot overwrite latest selected climate',near(await race.evaluate(()=>state.nasa.months[0].rain),irbidJan)&&calls.includes('35.8469'));
 // Exercise the real timeout path, allowing the normal request to remain pending.
 const timedContext=await browser.newContext();await timedContext.route('**/*',async route=>{if(!route.request().url().startsWith('https:'))return route.continue();await new Promise(r=>setTimeout(r,11000));await route.abort().catch(()=>{});});
 const timed=await timedContext.newPage();timed.on('pageerror',e=>errors.push(e.message));await timed.goto(url);await report(timed);ok('Report is immediately usable while requests pending',await timed.locator('.strategy').count()===3);await timed.waitForFunction(()=>state.nasaStatus==='fallback'&&state.forecastStatus==='fallback',{},{timeout:13000});ok('Slow endpoints time out to fallback without blocking UI',await timed.evaluate(()=>state.nasaError.includes('مهلة')&&state.forecastError.includes('مهلة')));
 // A single-file URL works with all networking blocked.
 const localContext=await browser.newContext({offline:true});const local=await localContext.newPage();local.on('pageerror',e=>errors.push(e.message));await local.goto('file://'+path.resolve('index.html'));await report(local);ok('Standalone file opens and analyzes with network fully offline',await local.locator('.strategy').count()===3);
 ok('No uncaught JavaScript errors across all scenarios',errors.length===0);
 fs.writeFileSync('tests/output/validation.json',JSON.stringify({passed:results.length,results,errors},null,2));
 await browser.close();console.log('COMPLETED',results.length,'checks');
})().catch(e=>{console.error(e);process.exit(1)});
