'use strict';
// Snapshot from the exact NASA POWER endpoints, downloaded 2026-11-14.
// Both units and provenance are retained. No forecast sample is presented as live data.
const NASA_FALLBACK = /*__NASA_DATA__*/;
const REGIONS = {
  mafraq:{name:'المفرق',lat:32.3429,lon:36.2080,kind:'بادية وسهول جافة',normalMin:[3,4,7,11,15,18,20,20,18,14,8,4],normalMax:[13,15,19,24,29,32,34,34,31,27,20,15]},
  valley:{name:'الأغوار الوسطى',lat:32.1167,lon:35.5667,kind:'أغوار دافئة',normalMin:[9,10,13,17,21,24,26,26,24,20,15,11],normalMax:[20,22,26,31,36,39,41,41,38,33,27,22]},
  irbid:{name:'إربد',lat:32.5568,lon:35.8469,kind:'سهول ومرتفعات متوسطية',normalMin:[5,6,8,11,15,18,20,20,18,15,10,6],normalMax:[13,15,18,23,28,31,33,33,31,27,21,15]}
};
const CROPS = {
  potato:{name:'بطاطا',family:'solanaceae',familyLabel:'باذنجانية',water:500,frost:-1,heat:30,heatEffect:'خطر توقف تكوين الدرنات',soil:'مستنزفة للنيتروجين؛ حساسة للانجراف في بداية النمو',icon:'leaf',phases:['bare','grow','flower','flower','harvest','bare']},
  tomato:{name:'بندورة',family:'solanaceae',familyLabel:'باذنجانية',water:600,frost:0,heat:35,heatEffect:'خطر تساقط الأزهار واللفحة الشمسية',soil:'مستنزفة للعناصر؛ حساسة لضرر الأزهار واللفحة',icon:'leaf',phases:['bare','grow','flower','flower','harvest','harvest']},
  chickpea:{name:'حمص',family:'legume',familyLabel:'بقولية',water:250,frost:-3,heat:35,heatEffect:'إجهاد الإزهار والعقد',soil:'تثبيت نيتروجين تقديري +40 إلى 60 كغ/هكتار',icon:'leaf',phases:['bare','grow','grow','flower','harvest','bare']},
  fava:{name:'فول',family:'legume',familyLabel:'بقولية',water:280,frost:-4,heat:32,heatEffect:'تأثر الإزهار بالحر والرياح الجافة',soil:'تثبيت نيتروجين مرتفع؛ حساس للرياح الحارة عند الإزهار',icon:'leaf',phases:['bare','grow','flower','flower','harvest','bare']},
  barley:{name:'شعير',family:'cereal',familyLabel:'نجيلية',water:180,frost:-8,heat:38,heatEffect:'عند حد التحمل؛ راقب امتلاء الحبوب',soil:'جذور ليفية كثيفة تثبّت التربة',icon:'wheat',phases:['bare','grow','grow','flower','harvest','bare']},
  wheat:{name:'قمح',family:'cereal',familyLabel:'نجيلية',water:250,frost:-6,heat:36,heatEffect:'إجهاد حراري في امتلاء الحبوب',soil:'جذور تساعد تثبيت التربة',icon:'wheat',phases:['bare','grow','grow','flower','flower','harvest']}
};
const PREVIOUS = {...CROPS,onion:{name:'بصل',family:'allium'},fallow:{name:'بور',family:null}};
const IRRIGATION = {drip:{name:'تنقيط',eff:.9},sprinkler:{name:'رشاشات',eff:.75},surface:{name:'ري سطحي',eff:.6},rainfed:{name:'بعلية',eff:0}};
const MONTH_NAMES = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
const MONTH_KEYS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MONTH_DAYS = [31,28.25,31,30,31,30,31,31,30,31,30,31];
const SEASONS = {winter:{name:'شتوي / ربيعي',months:[10,11,0,1,2,3]},summer:{name:'ربيعي / صيفي',months:[2,3,4,5,6,7]}};
const SURFACES = {bare:'محروثة ومكشوفة',residue:'مغطاة ببقايا المحصول',partial:'مغطاة جزئياً'};
const PARAMS = ['PRECTOTCORR','T2M_MIN','T2M_MAX','WS10M','RH2M','ALLSKY_SFC_SW_DWN','GWETTOP','GWETROOT'];
const $ = id => document.getElementById(id);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const num = (n,d=0) => Number(n).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const temp = n => `<bdi>${num(n,1)}°C</bdi>`;
const state = {step:0,waterMode:'direct',region:'mafraq',input:null,sim:{rain:false,drip:false,frost:false,heat:false},nasa:null,forecast:[],nasaSource:'fallback',forecastSource:'fallback',nasaStatus:'fallback',forecastStatus:'fallback',nasaError:'',forecastError:'',nasaTime:null,forecastTime:null,version:0,controllers:[],report:false};
let toastTimer;

function jordanDate(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Amman',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
function currentMonth(){return Number(jordanDate().slice(5,7))-1;}
function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function formatTime(t){return t?new Intl.DateTimeFormat('ar-JO',{timeZone:'Asia/Amman',hour:'2-digit',minute:'2-digit'}).format(new Date(t)):'';}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
function valueOf(id){return Number($(id).value);}
function grossWater(){return $('irrigation').value==='rainfed'?0:state.waterMode==='direct'?valueOf('water'):valueOf('tankCount')*valueOf('tankCapacity');}
function readInput(){return {region:state.region,area:valueOf('area'),previous:$('previous').value,planned:$('planned').value,season:$('season').value,surface:$('surface').value,irrigation:$('irrigation').value,gross:grossWater()};}

// Strict validation: a null or NASA -999 fill value is never interpreted as zero.
function parseNASA(json){
  const params=json?.properties?.parameter;
  if(!params||!json.parameters)throw Error('بنية بيانات NASA غير مكتملة');
  const fill=json.header?.fill_value??-999;
  const units={};
  for(const p of PARAMS){
    units[p]=json.parameters[p]?.units;
    if(!units[p])throw Error('وحدة قياس غير متاحة');
    for(const key of MONTH_KEYS){const v=params[p]?.[key];if(typeof v!=='number'||!Number.isFinite(v)||v===fill||v<=-900)throw Error('قيم NASA مفقودة');}
  }
  const rainUnit=units.PRECTOTCORR.toLowerCase();
  const solarUnit=units.ALLSKY_SFC_SW_DWN.toLowerCase();
  if(!['mm/day','mm/month','mm'].includes(rainUnit))throw Error('وحدة أمطار غير مدعومة');
  if(!['mj/m^2/day','kwh/m^2/day','w/m^2'].includes(solarUnit))throw Error('وحدة إشعاع غير مدعومة');
  if(!['m/s','km/h'].includes(units.WS10M))throw Error('وحدة رياح غير مدعومة');
  for(const p of ['T2M_MIN','T2M_MAX'])if(!['C','°C','degC'].includes(units[p]))throw Error('وحدة حرارة غير مدعومة');
  if(units.RH2M!=='%'||!['1','dimensionless'].includes(units.GWETTOP)||!['1','dimensionless'].includes(units.GWETROOT))throw Error('وحدات رطوبة غير مدعومة');
  const months=MONTH_KEYS.map((key,i)=>{
    const row={month:i,rainRate:params.PRECTOTCORR[key],rain:params.PRECTOTCORR[key]*(rainUnit==='mm/day'?MONTH_DAYS[i]:1),min:params.T2M_MIN[key],max:params.T2M_MAX[key],wind:params.WS10M[key]*(units.WS10M==='m/s'?3.6:1),rh:params.RH2M[key],solar:params.ALLSKY_SFC_SW_DWN[key]*(solarUnit==='kwh/m^2/day'?3.6:solarUnit==='w/m^2'?.0864:1),top:params.GWETTOP[key],root:params.GWETROOT[key]};
    if(row.rain<0||row.wind<0||row.solar<0||row.rh<0||row.rh>100||row.top<0||row.top>1||row.root<0||row.root>1||row.min>row.max)throw Error('قيم مناخ غير صالحة');
    return row;
  });
  return {months,period:String(json.header?.range||'الفترة كما يحددها المصدر'),units};
}
function fallbackForecast(region){
  const r=REGIONS[region],start=jordanDate(),offsets=[0,1.2,-.8,.4,1.7,-1.1,.2];
  return offsets.map((v,i)=>{const date=addDays(start,i),m=Number(date.slice(5,7))-1;return {date,min:r.normalMin[m]+v/2,max:r.normalMax[m]+v,wind:14+i%3*5+(region==='mafraq'?4:0),rain:[10,11,0,1,2,3].includes(m)&&i===3?(region==='irbid'?6:region==='valley'?3:2):0};});
}
function parseForecast(json){
  const d=json?.daily,u=json?.daily_units;
  if(!d||!u||u.temperature_2m_min!=='°C'||u.temperature_2m_max!=='°C'||u.precipitation_sum!=='mm'||!['km/h','m/s'].includes(u.wind_speed_10m_max))throw Error('وحدات التوقع غير مدعومة');
  if(!Array.isArray(d.time)||d.time.length<7)throw Error('التوقع لا يغطي سبعة أيام');
  const today=jordanDate();
  return d.time.slice(0,7).map((date,i)=>{
    if(date!==addDays(today,i))throw Error('التوقع قديم أو غير متصل');
    const values=['temperature_2m_min','temperature_2m_max','wind_speed_10m_max','precipitation_sum'].map(k=>d[k]?.[i]);
    if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('قيم توقع مفقودة');
    if(values[0]>values[1]||values[2]<0||values[3]<0)throw Error('قيم توقع غير صالحة');
    return {date,min:values[0],max:values[1],wind:values[2]*(u.wind_speed_10m_max==='m/s'?3.6:1),rain:values[3]};
  });
}
function nasaURL(region){const r=REGIONS[region];return 'https://power.larc.nasa.gov/api/temporal/climatology/point?'+new URLSearchParams({parameters:PARAMS.join(','),community:'AG',longitude:r.lon,latitude:r.lat,format:'JSON'});}
function forecastURL(region){const r=REGIONS[region];return 'https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:r.lat,longitude:r.lon,daily:'temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum',timezone:'Asia/Amman',forecast_days:7,wind_speed_unit:'kmh'});}
async function fetchJSON(url,controller){
  const timeout=setTimeout(()=>controller.abort(),9500);
  try{const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);return await response.json();}
  finally{clearTimeout(timeout);}
}
function setStatus(){
  const text={loading:'جارٍ الاتصال · الاحتياط متاح',live:'متصل',fallback:'نسخة NASA مضمنة'};
  $('nasaStatus').textContent=text[state.nasaStatus];
  $('forecastStatus').textContent=state.forecastStatus==='loading'?'جارٍ جلب التوقع':state.forecastStatus==='live'?'توقع حي':'مثال تجريبي · ليس توقعًا';
  $('nasaDot').className='dot '+(state.nasaStatus==='live'?'live':state.nasaStatus==='fallback'?'error':'');
  $('forecastDot').className='dot '+(state.forecastStatus==='live'?'live':state.forecastStatus==='fallback'?'error':'');
  $('nasaStatus').title=state.nasaError||'Agroclimatology & Soil Moisture';$('forecastStatus').title=state.forecastError||'Open-Meteo operational forecast. ERA5 is historical reanalysis.';
  const r=REGIONS[state.region];$('coordinates').textContent=`${r.lat.toFixed(4)}° N, ${r.lon.toFixed(4)}° E`;
}
async function loadRegion(region){
  state.controllers.forEach(c=>c.abort());state.controllers=[];
  const version=++state.version;
  state.region=region;state.nasa=parseNASA(NASA_FALLBACK[region]);state.forecast=fallbackForecast(region);state.nasaSource='fallback';state.forecastSource='fallback';state.nasaTime=null;state.forecastTime=null;state.nasaError='';state.forecastError='';state.nasaStatus='loading';state.forecastStatus='loading';
  setStatus();renderPreview();if(state.report)renderReport();
  const fetchSource=async(kind,url,parser)=>{
    const controller=new AbortController();state.controllers.push(controller);
    try{
      const data=parser(await fetchJSON(url,controller));if(version!==state.version)return;
      state[kind]=data;state[kind+'Status']='live';state[kind+'Source']='live';state[kind+'Time']=Date.now();
    }catch(error){if(version!==state.version)return;state[kind+'Status']='fallback';state[kind+'Error']=error.name==='AbortError'?'انتهت مهلة الاتصال (9.5 ثوانٍ)':String(error.message);}
    finally{if(version===state.version){setStatus();if(state.report)renderReport();}}
  };
  await Promise.allSettled([fetchSource('nasa',nasaURL(region),parseNASA),fetchSource('forecast',forecastURL(region),parseForecast)]);
}

function validateStep(step){
  const ids=step===0?['area']:step===2&&$('irrigation').value!=='rainfed'?(state.waterMode==='direct'?['water']:['tankCount','tankCapacity']):[];
  for(const id of ids){const el=$(id);if(el.value.trim()===''||!Number.isFinite(el.valueAsNumber)||!el.checkValidity()){$('formError').textContent=id==='area'?'أدخل مساحة صحيحة من 0.1 إلى 100,000 دونم.':'أدخل كمية مياه صحيحة غير سالبة. عدد الصهاريج عدد صحيح وسعتها أكبر من صفر.';$('formError').hidden=false;el.setAttribute('aria-invalid','true');el.focus();return false;}el.removeAttribute('aria-invalid');}
  if(step===2&&grossWater()>100000000){$('formError').textContent='إجمالي المياه أكبر من الحد المسموح (100 مليون م³).';$('formError').hidden=false;return false;}
  $('formError').hidden=true;return true;
}
function setStep(n,focus=true){
  state.step=n;$$('.form-step').forEach((el,i)=>el.hidden=i!==n);
  $$('.step-tab').forEach((el,i)=>{el.classList.toggle('active',i===n);el.classList.toggle('done',i<n);if(i===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  $('backBtn').hidden=n===0;$('stepTime').hidden=n!==0;
  $('nextBtn').innerHTML=(n===0?'التالي: محاصيلك وموسمك':n===1?'التالي: المياه والري':'حلّل خطتي الزراعية')+' '+icon(n===2?'shield':'arrow');
  if(focus)document.querySelector(`[data-panel="${n}"] h2`).focus({preventScroll:true});
}
function syncWater(){
  const rainfed=$('irrigation').value==='rainfed';$('waterFields').disabled=rainfed;$('directWater').hidden=state.waterMode!=='direct';$('tankWater').hidden=state.waterMode!=='tank';
  const gross=grossWater();$('waterTotal').textContent=rainfed?'زراعة بعلية: مياه الري المضافة = 0 م³. يعتمد الحساب على المطر فقط.':`إجمالي مياه الري: ${Number.isFinite(gross)?num(gross,1):'—'} م³ · يصل للجذور نحو ${Number.isFinite(gross)?num(gross*IRRIGATION[$('irrigation').value].eff,1):'—'} م³`;
  $$('[data-water-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.waterMode===state.waterMode)));
}
function renderPreview(){
  const a=readInput();$('farmPreview').innerHTML=[['المنطقة',REGIONS[a.region].name],['المساحة',`${Number.isFinite(a.area)?num(a.area,1):'—'} دونم`],['دورتك المقترحة',`${PREVIOUS[a.previous].name} ← ${CROPS[a.planned].name}`],['الموسم',SEASONS[a.season].name],['طريقة الري',IRRIGATION[a.irrigation].name]].map(([k,v])=>`<div class="side-row"><span>${k}</span><strong>${v}</strong></div>`).join('');
}
function advance(){if(!validateStep(state.step))return;if(state.step<2){setStep(state.step+1);return;}analyze();}
function analyze(){
  for(let i=0;i<3;i++){if(!validateStep(i)){setStep(i);validateStep(i);return;}}
  state.input=readInput();state.sim={rain:false,drip:false,frost:false,heat:false};state.report=true;
  $('wizardView').hidden=true;$('intro').hidden=true;$('dashboard').hidden=false;$('bottomActions').hidden=false;$('calculationDetails').hidden=false;renderReport();$('reportTitle').focus();$('dashboard').scrollIntoView({behavior:'smooth',block:'start'});
}
function edit(){state.report=false;$('dashboard').hidden=true;$('bottomActions').hidden=true;$('calculationDetails').hidden=true;$('wizardView').hidden=false;$('intro').hidden=false;setStep(0);$('wizardView').scrollIntoView({behavior:'smooth',block:'start'});}

// Water budget in m³. Rain per dunum equals rain in mm because 1 dunum = 1000 m².
function budget(a,nasa,sim){
  const rows=SEASONS[a.season].months.map(i=>nasa.months[i]);
  const rainRaw=rows.reduce((sum,row)=>sum+row.rain,0),rain=rainRaw*(sim.rain?.8:1),rainPerDunum=rain*.5;
  const eff=a.irrigation==='rainfed'?0:sim.drip?.9:IRRIGATION[a.irrigation].eff;
  const gross=a.irrigation==='rainfed'?0:a.gross,net=gross*eff,effectiveRain=rainPerDunum*a.area;
  return {rows,rainRaw,rain,rainPerDunum,eff,gross,net,effectiveRain,total:net+effectiveRain,low:Math.min(...rows.map(r=>r.min)),high:Math.max(...rows.map(r=>r.max))};
}
function evaluateCrop(id,a,b,sim,forecast){
  const c=CROPS[id],need=c.water*a.area,coverage=b.total/need*100,balance=b.total-need;
  const same=Boolean(PREVIOUS[a.previous].family)&&PREVIOUS[a.previous].family===c.family;
  const frostClimate=b.low<=c.frost,heatClimate=b.high>=c.heat;
  const forecastFrost=Math.min(...forecast.map(d=>d.min))<=c.frost,forecastHeat=Math.max(...forecast.map(d=>d.max))>=c.heat;
  const scenarioFrost=sim.frost&&-2<=c.frost,scenarioHeat=sim.heat&&38>=c.heat;
  const denominator=c.water-b.rainPerDunum,maxArea=denominator<=0?a.area:Math.min(a.area,b.net/denominator);
  const extraNet=Math.max(0,-balance),extraGross=b.eff>0?extraNet/b.eff:null;
  const enough=coverage>=100-1e-8;
  const soil=c.family==='legume'?28:c.family==='cereal'?14:0;
  const livePenalty=state.forecastSource==='live'?(forecastFrost?18:0)+(forecastHeat?14:0):0;
  const score=(enough?110:Math.min(coverage,100)*.65)+soil-(same?35:0)-(frostClimate?8:0)-(heatClimate?8:0)-livePenalty-(scenarioFrost?65:0)-(scenarioHeat?45:0);
  return {id,c,need,coverage,balance,same,frostClimate,heatClimate,forecastFrost,forecastHeat,scenarioFrost,scenarioHeat,maxArea,extraNet,extraGross,enough,score};
}
function getAnalysis(){
  const a=state.input,b=budget(a,state.nasa,state.sim),evaluate=id=>evaluateCrop(id,a,b,state.sim,state.forecast);
  const choose=ids=>ids.filter(id=>id!==a.planned).map(evaluate).sort((x,y)=>y.score-x.score||x.c.water-y.c.water)[0];
  const paths=[evaluate(a.planned),choose(['chickpea','fava']),choose(['barley','wheat'])];
  const eligible=paths.filter(p=>p.enough&&!p.same&&!p.scenarioFrost&&!p.scenarioHeat);
  const best=eligible.sort((x,y)=>y.score-x.score)[0]||null;
  return {a,b,paths,best};
}
function renderCards(x){
  const {a,b,paths,best}=x,labels=['مسار ١ · خطتك الحالية','مسار ٢ · إصلاح التربة بالبقوليات','مسار ٣ · الأمان المائي والمناخي'];
  const expanded=new Set($$('#strategyCards details[open]').map(el=>el.closest('[data-crop]').dataset.crop));
  $('strategyCards').innerHTML=paths.map((p,i)=>{
    const cls=p.coverage<70?'low':p.coverage<100?'mid':'';
    let soil=p.same?'<span class="badge red">خطر استنزاف النيتروجين وتوطن آفات التربة (تكرار نفس العائلة)</span>':'';
    if(p.c.family==='legume')soil+='<span class="badge">يعوض النيتروجين طبيعياً (+50 كغ/هكتار تقديريًا) ويكسر دورة الآفات المرتبطة بالمحصول السابق.</span>';
    else if(p.c.family==='cereal')soil+='<span class="badge blue">جذور كثيفة تحمي التربة من الانجراف وأقل استهلاكاً للمياه.</span>';
    else if(!p.same)soil+='<span class="badge amber">تغيير العائلة يخفف تكرار آفاتها؛ المحصول مستنزف للعناصر ويحتاج متابعة خصوبة التربة.</span>';
    const climate=[];if(p.frostClimate)climate.push('صقيع');if(p.heatClimate)climate.push('حر');
    let scenario='';
    if(state.sim.frost)scenario=`<div class="scenario-badge ${p.scenarioFrost?'':'safe'}">${p.scenarioFrost?'محاكاة −2°C: خطر تلف بالصقيع / حرق البرد':'محاكاة −2°C: ضمن التحمل الاسمي؛ نجاة محتملة'}</div>`;
    if(state.sim.heat)scenario=`<div class="scenario-badge ${p.scenarioHeat?'':'safe'}">${p.scenarioHeat?'محاكاة 38°C: '+p.c.heatEffect:'محاكاة 38°C: دون حد الحر المحدد'}</div>`;
    const shortage=!p.enough?(p.extraGross!==null?`${num(p.extraGross)} م³ مياه ري إضافية (${num(p.extraNet)} م³ صافية)`:`${num(p.extraNet)} م³ صافية من مصدر ري تكميلي؛ الزراعة البعلية لا تضيف ماءً`):'';
    const notes=!p.enough?`${i===1?'الأفضل للتربة، لكنه يحتاج توفير':'لتغطية الاحتياج تحتاج'} ${shortage}، أو تقليص المساحة إلى <strong>${num(p.maxArea,2)} دونم</strong> بنفس مخزون الري. ${b.eff===0&&p.maxArea===0?'تقليل المساحة وحده لا يرفع نسبة تغطية المطر.':''}`:'كفاية موسمية تقديرية؛ الفائض ليس مخزونًا مضمونًا بين الأشهر ولا يلغي مخاطر التربة والمناخ.';
    const forecastText=state.forecastSource==='live'?(p.forecastFrost||p.forecastHeat?`الأسبوع القادم: ${[p.forecastFrost?'خطر صقيع':'',p.forecastHeat?'خطر حر':''].filter(Boolean).join(' و')}`:'الأسبوع القادم: لا تجاوز للعتبتين في التوقع الحالي.'):'لا يوجد توقع حي مؤكد؛ راجع حالة الاتصال قبل قرار ميداني.';
    return `<article class="strategy ${best?.id===p.id?'recommended':''} ${p.scenarioFrost||p.scenarioHeat?'emergency':''}" data-crop="${p.id}"><div class="crop-head"><div><h3>${p.c.name}</h3><p class="rotation-line">${PREVIOUS[a.previous].name} <span aria-label="ثم">←</span> ${p.c.name}</p></div>${icon(p.c.icon)}</div><span class="soil-short ${p.same?'soil-stress':''}">${p.same?'إجهاد للتربة':p.c.family==='legume'?'يعوض النيتروجين':p.c.family==='cereal'?'يحمي من الانجراف':'يحتاج تغذية للتربة'}</span><div class="water-line"><span>تغطية الاحتياج المائي</span><strong class="water-percent ${cls}" data-coverage="${p.coverage}">${num(p.coverage)}%</strong></div><div class="progress-track" role="progressbar" aria-label="تغطية مياه ${p.c.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,p.coverage).toFixed(1)}" aria-valuetext="تغطية ${num(p.coverage,1)} بالمئة"><div class="progress-bar ${cls}" style="width:${Math.min(100,p.coverage).toFixed(2)}%"></div></div><p class="balance ${p.enough?'':'low'}">${p.enough?'فائض تقديري':'عجز'} ${num(Math.abs(p.balance))} م³</p><details class="crop-details" ${expanded.has(p.id)?'open':''}><summary>تفاصيل المحصول والمخاطر</summary><div class="crop-details-body"><p class="path-label">${labels[i]} · ${best?.id===p.id?'أفضل توازن مشروط':p.c.familyLabel}</p><p class="risk-text">الاحتياج ${num(p.need)} م³ · ${p.c.water} م³/دونم</p><div class="card-divider"></div>${soil}<div class="thermal">حد الصقيع الحرج: <bdi>${p.c.frost}°C</bdi> | حد الحر الحرج: <bdi>${p.c.heat}°C</bdi><p class="risk-text ${climate.length?'danger':''}">${REGIONS[a.region].name} في الموسم: ${climate.length?'مؤشر خطر '+climate.join(' و'):'لا تجاوز في القيم المناخية المستخدمة'} (${temp(b.low)} إلى ${temp(b.high)}).</p></div><p class="risk-text ${state.forecastSource==='live'&&(p.forecastFrost||p.forecastHeat)?'danger':''}" style="margin:0 0 12px">${forecastText}</p>${scenario}<div class="strategy-note">${notes}</div></div></details></article>`;
  }).join('');
  $('rankingNote').textContent=best?'الترتيب يوازن كفاية الماء، فائدة الدورة، تكرار العائلة، وتجاوز العتبات التاريخية والحيّة والمحاكاة. الإطار توصية تخطيط مشروطة، لا شهادة ملاءمة مناخية أو تربة.':'لا نضع إطار توصية خضراء: لا يوجد مسار يجمع الكفاية المائية وعدم تكرار العائلة والسلامة من السيناريو النشط. راجع العجز والقيود الظاهرة لكل مسار.';
}
function renderWeather(x){
  const live=state.forecastSource==='live';
  $('weatherSource').className='tag '+(live?'':'amber');$('weatherSource').textContent=live?'Open-Meteo · حي '+formatTime(state.forecastTime):'بيانات توضيحية · ليست توقعًا';
  $('forecastDays').innerHTML=state.forecast.map((d,i)=>`<div class="day"><div class="day-name">${i===0?'اليوم':new Intl.DateTimeFormat('ar-JO',{weekday:'short',timeZone:'Asia/Amman'}).format(new Date(d.date+'T12:00:00Z'))}</div><div class="day-date">${d.date.slice(5).replace('-','/')}</div>${icon(d.rain>0?'cloud':'sun')}<div class="day-max"><bdi>${num(d.max,0)}°</bdi></div><div class="day-min"><bdi>${num(d.min,0)}°</bdi></div><div class="day-detail" title="الرياح كم/ساعة">رياح ${num(d.wind)} كم/س</div><div class="day-detail">${num(d.rain,1)} ملم</div></div>`).join('');
  const lo=Math.min(...state.forecast.map(d=>d.min)),hi=Math.max(...state.forecast.map(d=>d.max)),wind=Math.max(...state.forecast.map(d=>d.wind));
  $('weatherRange').innerHTML=`${live?'نطاق التوقع':'نطاق المثال الاصطناعي'}: أدنى ${temp(lo)} · أعلى ${temp(hi)} · رياح قصوى ${num(wind,1)} كم/ساعة. التواريخ بتوقيت عمّان.`;
  const alerts=[];
  if(!live)alerts.push('<div class="alert">تعذّر تأكيد توقع حي. الأرقام أعلاه سيناريو موسمي تجريبي للعرض فقط؛ لا تستعملها لاتخاذ قرار وقاية الليلة.</div>');
  else{
    const frost=x.paths.filter(p=>p.forecastFrost),heat=x.paths.filter(p=>p.forecastHeat);
    if(frost.length)alerts.push(`<div class="alert red">تنبيه توقع حي: الصغرى تلامس عتبة الصقيع لـ ${frost.map(p=>p.c.name).join('، ')}. تحقق من حرارة الحقل.</div>`);
    if(heat.length)alerts.push(`<div class="alert red">تنبيه توقع حي: العظمى تلامس عتبة الحر لـ ${heat.map(p=>p.c.name).join('، ')}. راقب الإزهار ورطوبة الجذور.</div>`);
    if(wind>=30)alerts.push(`<div class="alert">رياح نشطة متوقعة حتى ${num(wind)} كم/ساعة؛ راقب الانجراف وثبّت الأغطية.</div>`);
    if(!alerts.length)alerts.push('<div class="alert green">لا تتجاوز التوقعات الحالية عتبات المحاصيل المعروضة أو عتبة الرياح. يبقى رصد الحقل ضروريًا.</div>');
  }
  if(state.sim.frost)alerts.push('<div class="alert red">محاكاة مستقلة: −2°C، رطوبة نسبية 20%، ورياح خفيفة. الحرارة الورقية قد تختلف؛ ليست نشرة لليلة المقبلة.</div>');
  if(state.sim.heat)alerts.push('<div class="alert red">محاكاة مستقلة: 38°C، رياح شرقية 35 كم/ساعة، ورطوبة نسبية 20%. راقب اللفحة والانجراف وقابلية اشتعال البقايا.</div>');
  $('weatherAlerts').innerHTML=alerts.join('');
}
function renderSimulator(x){
  $$('[data-sim]').forEach(el=>el.setAttribute('aria-pressed',String(state.sim[el.dataset.sim])));
  const disabled=['drip','rainfed'].includes(x.a.irrigation);$('simDrip').disabled=disabled;
  $('dripLabel').textContent=x.a.irrigation==='drip'?'التنقيط مستخدم بالفعل · 90%':x.a.irrigation==='rainfed'?'البعلية: لا يوجد مخزون ري للتحويل':'التحول للتنقيط · كفاءة 90%';
  const parts=[];
  if(state.sim.rain)parts.push(`انخفاض المطر الفعّال ${num(x.b.rainRaw*.2*.5*x.a.area)} م³.`);
  if(state.sim.drip){const old=IRRIGATION[x.a.irrigation].eff;parts.push(`نفس المخزون يوصل ${num(x.a.gross*(.9-old))} م³ إضافية للجذور. أو توفر ${num(x.a.gross*(1-old/.9))} م³ من السحب لتوصيل صافي الري السابق؛ البديلان لا يُجمعان.`);}
  if(state.sim.frost)parts.push('سيناريو الصقيع مفعّل؛ راجع شارات التحمل وإدارة الغطاء.');
  if(state.sim.heat)parts.push('سيناريو الحر والرياح مفعّل؛ الاحتياج المائي الموسمي ثابت في هذا النموذج.');
  $('simSummary').textContent=parts.length?parts.join(' '):'الخطة الأساسية معروضة. فعّل أي سيناريو وشاهد أثره مباشرةً.';
}
function renderTimeline(x){
  const months=SEASONS[x.a.season].months;
  const headers=months.map(m=>`<th scope="col">${MONTH_NAMES[m]}</th>`).join('');
  const rows=x.paths.map((p,index)=>`<tr><th scope="row">${p.c.name}<span class="phase-small">المسار ${index+1}</span></th>${p.c.phases.map((phase,i)=>{
    const covered=phase==='bare'&&x.a.surface!=='bare',labels={grow:'نمو خضري',flower:p.id==='potato'?'تكوين درنات · حساس':'إزهار · حساس',harvest:'نضج / حصاد',bare:covered?(x.a.surface==='residue'?'بقايا تحمي السطح':'سطح مكشوف جزئياً'):'أرض مكشوفة'};
    const r=state.nasa.months[months[i]],risk=(r.min<=p.c.frost||r.max>=p.c.heat)&&phase==='flower';
    return `<td><span class="phase ${covered?'covered':phase==='grow'?'':phase}">${labels[phase]}</span><span class="phase-small">${phase==='bare'?(covered?'راقب الغطاء والصقيع':'معرضة للانجراف بالرياح'):risk?'تجاوز حراري مناخي محتمل':'تابع رطوبة الجذور'}</span></td>`;
  }).join('')}</tr>`).join('');
  const climate=months.map(m=>{const r=state.nasa.months[m];return `<td class="climate-row">حرارة <bdi>${num(r.min,1)} / ${num(r.max,1)}°C</bdi><br>مطر ${num(r.rain*(state.sim.rain?.8:1),1)} ملم${state.sim.rain?' *':''}<br>سطح <b>${num(r.top,2)}</b> · جذور ${num(r.root,2)}</td>`;}).join('');
  $('timelineTable').innerHTML=`<caption class="sr-only">التقويم الزراعي ومناخ أشهر الموسم</caption><thead><tr><th scope="col">مسار المحصول</th>${headers}</tr></thead><tbody>${rows}<tr><th scope="row">NASA POWER<span class="phase-small">صغرى / عظمى · GWETTOP${state.sim.rain?' · * المطر بعد المحاكاة':''}</span></th>${climate}</tr></tbody>`;
}
function renderShields(x){
  const m=state.nasa.months[currentMonth()],drip=x.a.irrigation==='drip'||state.sim.drip,exposed=x.a.surface!=='residue';
  const forecastLive=state.forecastSource==='live';
  const t=state.sim.heat?38:state.sim.frost?-2:forecastLive?Math.max(...state.forecast.map(d=>d.max)):null;
  const rh=state.sim.heat||state.sim.frost?20:m.rh,wind=state.sim.heat?35:state.sim.frost?5:forecastLive?Math.max(...state.forecast.map(d=>d.wind)):m.wind;
  const dry=m.top<.3,fire=t!==null&&t>35&&rh<25&&x.a.surface!=='bare';
  const frostActive=state.sim.frost||forecastLive&&x.paths.some(p=>p.forecastFrost),heatActive=state.sim.heat||forecastLive&&x.paths.some(p=>p.forecastHeat);
  const cover=x.a.surface==='residue'?'القش الموجود عندك قد يقلل انتقال حرارة التربة إلى الهواء قرب النبات ليلًا.':x.a.surface==='bare'?'الحراثة الحديثة تفكك السطح وقد تقلل تخزينه ونقله للحرارة.':'الغطاء الجزئي يحتاج موازنة بين تثبيت التربة وانتقال الحرارة وقت الصقيع.';
  const erosion=(exposed||drip)?`قيد علمي (GWETTOP؛ مرجع SMAP): ${dry?'مؤشر رطوبة السطح الإقليمي منخفض':'لا تشير القراءة الشهرية الحالية وحدها إلى جفاف السطح'}. ${drip?'التنقيط يرطب نطاقًا محدودًا حول النقاطات والجذور؛ قد تبقى المسافات بين الخطوط جافة ومفككة.':'السطح المكشوف أو جزئي الغطاء أكثر عرضة للتطاير عندما يجف.'} حافظ على بقايا المحصول لتثبيت السطح خارج ظروف الصقيع، وأجّل الحراثة قبل هبات الرياح.`:'بقايا المحصول تساعد تثبيت السطح وتقليل الانجراف. حافظ على توزيعها وراقب جفافها، مع مراجعة إدارة الغطاء عند الصقيع.';
  const fireText=fire?'خطر مرتفع مشروط: حرارة فوق 35°C، ورطوبة أقل من 25%، ووجود بقايا مفترضة الجفاف. هذه الظروف تسهّل الاشتعال والانتشار عند وجود شرارة؛ لا تعني اشتعالًا تلقائيًا. اعمل خطوط عزل ترابية حول الحقل، وأبعد مصادر الشرر والآلات الساخنة.':'لا تكتمل مؤشرات الخطر الثلاثة في البيانات المتاحة؛ هذا لا ينفي خطر الحريق. راقب جفاف البقايا ومصادر الشرر، وحافظ على خطوط عزل مناسبة.';
  $('shieldCards').innerHTML=`
  <article class="shield ${frostActive?'active':''}"><div class="shield-title">${icon('snow')}<h3>درع الصقيع الإشعاعي</h3></div><div class="reading">إدارة الغطاء وقت الصقيع · ${SURFACES[x.a.surface]}</div><p>${cover} التربة الرطبة باعتدال والمستقرة تخزن حرارة النهار وتعيدها ليلًا؛ قد يكون الفرق نحو 2–3 درجات في ظروف معينة، وليس ضمان حماية. القش الجاف والحراثة الحديثة قد يعزلان حرارة الأرض ويزيدان الخطر قرب الأوراق. تجنّب تشبيع التربة أو دمكها بما يضر الجذور.</p><div class="operational"><strong>تنبيه تشغيلي:</strong> وجود شبكة تنقيط أو رشاشات عادية لا يعني توفر نظام حماية من الصقيع؛ التشغيل العشوائي للمياه وقت التجمد قد يضاعف الضرر ويكسر النباتات. راجع المرشد الزراعي.</div></article>
  <article class="shield ${heatActive?'active':''}"><div class="shield-title">${icon('sun')}<h3>درع اللفحة الشمسية والإجهاد الحراري</h3></div><div class="reading">إشعاع ${MONTH_NAMES[currentMonth()]} المناخي: ${num(m.solar,1)} MJ/m²/day · ${num(m.solar/3.6,1)} kWh/m²/day</div><p>${m.solar>=22?'الإشعاع الموسمي مرتفع نسبيًا؛ راقب الثمار المكشوفة.':'راجع تعرض الثمار للشمس حتى إن كان المتوسط الشهري معتدلًا.'} وجّه الري للجذور صباحًا لتقليل فاقد التبخر. تجنّب الرش الروتيني للأوراق وقت الظهيرة؛ قطرات الماء ليست سببًا عامًا مثبتًا لحرق الأوراق. يمكن استخدام شاش تظليل أو كاولين مخصص وفق إرشاد مختص، أو مصدات وزراعة مترافقة كخطوط الذرة مع احتساب منافستها للماء والضوء.</p></article>
  <article class="shield ${(exposed||drip)&&wind>=30?'active':''}"><div class="shield-title">${icon('wind')}<h3>درع التربة ضد الانجراف بالرياح</h3></div><div class="reading">GWETTOP ${num(m.top,2)} · GWETROOT ${num(m.root,2)} · ${state.sim.heat||state.sim.frost?'رياح المحاكاة':forecastLive?'الرياح المتوقعة':'متوسط الرياح المناخي'} ${num(wind,1)} كم/ساعة</div><p>${erosion} بيانات GWETTOP إقليمية ونموذجية وليست قياسًا مباشرًا للحقل أو منتج SMAP؛ تحقق ميدانيًا من رطوبة المسافات بين الخطوط.</p></article>
  <article class="shield ${fire?'active':''}"><div class="shield-title">${icon('fire')}<h3>درع حرائق القش والأعشاب</h3></div><div class="reading">${t===null?'لا حرارة حية متاحة':`حرارة ${num(t,1)}°C`} · RH ${num(rh,1)}% (${state.sim.heat||state.sim.frost?'افتراض المحاكاة':'متوسط تاريخي، ليس توقعًا حيًا'})</div><p>${fireText} دمج البقايا بالتربة بدل حرقها يحافظ على المادة العضوية وأحياء التربة؛ نسّق توقيته مع مخاطر الرياح والصقيع. في غياب المحاكاة، لا تتوفر رطوبة جوية متوقعة من الرابط المستخدم، لذا هذا مؤشر تخطيطي ولا يثبت اجتماع الشروط في ساعة واحدة.</p></article>`;
}
function renderData(x){
  $('nasaMeta').textContent=`${state.nasaSource==='live'?'اتصال حي ببيانات المناخ التاريخي · '+formatTime(state.nasaTime):'نسخة NASA فعلية مضمنة · جُلبت 2026-11-14'} · ${state.nasa.period}`;
  const heads=['الشهر','المطر (ملم/شهر)','الصغرى °C','العظمى °C','الرياح كم/س','RH2M %','الإشعاع MJ/m²/يوم','GWETTOP','GWETROOT'];
  $('nasaTable').innerHTML=`<caption class="sr-only">قيم NASA الأصلية بعد توحيد الوحدات دون المحاكاة</caption><thead><tr>${heads.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${state.nasa.months.map((m,i)=>`<tr class="${SEASONS[x.a.season].months.includes(i)?'in-season':''}"><th scope="row">${MONTH_NAMES[i]}</th>${[m.rain,m.min,m.max,m.wind,m.rh,m.solar,m.top,m.root].map((v,j)=>`<td dir="ltr">${num(v,j>=6?2:1)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const b=x.b,p=x.paths[0];
  $('calculationDetails').innerHTML=[['١. مياه الري الصافية',`${num(b.gross)} × ${num(b.eff*100)}% = ${num(b.net,1)}`,'م³'],['٢. المطر الفعّال (ملم × دونم × 0.5)',`${num(b.rain,2)} × ${num(x.a.area,1)} × 0.5 = ${num(b.effectiveRain,1)}`,'م³'],['٣. إجمالي المياه المتاحة',`${num(b.net,1)} + ${num(b.effectiveRain,1)} = ${num(b.total,1)}`,'م³'],['٤. تغطية خطتك الحالية',`${num(b.total,1)} ÷ (${p.c.water} × ${num(x.a.area,1)}) × 100 = ${num(p.coverage,1)}%`,'']].map(([label,value,unit])=>`<div class="equation">${label}<strong><bdi dir="ltr">${value}</bdi> <span>${unit}</span></strong></div>`).join('');
}
function renderReport(){
  if(!state.input||state.input.region!==state.region)return;
  const x=getAnalysis(),{a,b,paths}=x,yes=paths.filter(p=>p.enough);
  $('smartSummary').textContent=yes.length?`كفاية مائية لـ ${yes.map(p=>p.c.name).join(' و')}${state.sim.rain||state.sim.drip?' بعد المحاكاة':''}. ${x.best?'أفضل توازن مشروط: '+x.best.c.name+'.':'راجع قيود الدورة والمخاطر قبل الاختيار.'}`:'المياه لا تغطي أيًا من المسارات الثلاثة بالكامل. عدّل المخزون أو المساحة أو المحصول.';
  $('reportMeta').textContent=`${REGIONS[a.region].name} · ${num(a.area,1)} دونم · ${SEASONS[a.season].name} · ${IRRIGATION[a.irrigation].name} · ${PREVIOUS[a.previous].name} ← ${CROPS[a.planned].name}`;
  const active=Object.entries(state.sim).filter(([,v])=>v).map(([k])=>({rain:'مطر −20%',drip:'تنقيط 90%',frost:'صقيع −2°C',heat:'حر 38°C ورياح 35 كم/ساعة'})[k]);
  $('printContext').textContent=`تاريخ التقرير: ${jordanDate()} · السيناريو: ${active.join(' + ')||'الخطة الأساسية'} · غطاء التربة: ${SURFACES[a.surface]}`;
  $('dataNotice').textContent=`NASA: ${state.nasaSource==='live'?'بيانات تاريخية جُلبت الآن':'نسخة تاريخية مضمنة من 2026-11-14'}. الطقس: ${state.forecastSource==='live'?'توقع حي لـ 7 أيام':'مثال اصطناعي فقط، ليس توقعًا حيًا'}.${state.nasaStatus==='loading'||state.forecastStatus==='loading'?' جارٍ محاولة الاتصال؛ يمكنك استخدام التحليل الاحتياطي فورًا.':''}${active.length?' المحاكاة النشطة: '+active.join(' + ')+'.':''}`;
  const metrics=[['drop','المياه المتاحة',num(b.total),'م³','صافي الري + المطر الفعّال'],['cloud','المطر الفعّال',num(b.effectiveRain),'م³',`${num(b.rain,1)} ملم موسمي × استفادة 50%`],['field','كفاءة الري',num(b.eff*100),'%',a.irrigation==='rainfed'?'بعلية · دون مياه ري مضافة':`${num(b.gross)} م³ إجمالي الري المتاح`],['leaf','مسارات كافية مائيًا',`${yes.length} / 3`,'','الكفاية لا تعني ملاءمة كاملة']];
  $('metrics').innerHTML=metrics.map(([ic,label,value,unit,sub])=>`<div class="metric"><div class="metric-label">${icon(ic)}${label}</div><div class="metric-value"><bdi dir="ltr">${value}</bdi><small>${unit}</small></div><p class="metric-sub">${sub}</p></div>`).join('');
  renderCards(x);renderWeather(x);renderSimulator(x);renderTimeline(x);renderShields(x);renderData(x);
}
function toggleSim(key){
  if(key==='drip'&&['drip','rainfed'].includes(state.input.irrigation))return;
  state.sim[key]=!state.sim[key];if(key==='frost'&&state.sim.frost)state.sim.heat=false;if(key==='heat'&&state.sim.heat)state.sim.frost=false;
  renderReport();
}

$('farmForm').addEventListener('submit',e=>{e.preventDefault();advance();});
$('nextBtn').addEventListener('click',advance);$('backBtn').addEventListener('click',()=>setStep(Math.max(0,state.step-1)));
$$('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{const n=Number(btn.dataset.step);if(n>state.step&&!validateStep(state.step))return;setStep(n);}));
$$('input[name="region"]').forEach(el=>el.addEventListener('change',()=>{if(el.checked)loadRegion(el.value);}));
$$('[data-water-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.waterMode=btn.dataset.waterMode;syncWater();renderPreview();}));
$('farmForm').addEventListener('input',e=>{if(e.target.getAttribute('aria-invalid')==='true'){e.target.removeAttribute('aria-invalid');$('formError').hidden=true;}syncWater();renderPreview();});
$('farmForm').addEventListener('change',()=>{syncWater();renderPreview();});
$$('[data-sim]').forEach(btn=>btn.addEventListener('click',()=>toggleSim(btn.dataset.sim)));
$('resetSim').addEventListener('click',()=>{state.sim={rain:false,drip:false,frost:false,heat:false};renderReport();notify('رجعنا للخطة الأساسية.');});
['editTop','editBottom'].forEach(id=>$(id).addEventListener('click',edit));
['printTop','printBottom'].forEach(id=>$(id).addEventListener('click',()=>window.print()));
$('refreshData').addEventListener('click',()=>{loadRegion(state.region);notify('جارٍ تحديث المصدرين، والنسخة الاحتياطية متاحة فورًا.');});
$('navPlanner').addEventListener('click',e=>{if(state.report){e.preventDefault();$('dashboard').scrollIntoView({behavior:'smooth'});}});
window.addEventListener('online',()=>loadRegion(state.region));
// On a date rollover never keep yesterday's seven-day forecast labelled as current.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.forecast[0]?.date!==jordanDate())loadRegion(state.region);});

// Presentation-only organization. Native details stay closed until the farmer opens them.
function setupMinimalUI(){
  const wrap=(id,title,before)=>{
    const d=document.createElement('details');d.className='accordion';d.id=id;
    const summary=document.createElement('summary');summary.textContent=title;
    const body=document.createElement('div');body.className='accordion-body';
    d.append(summary,body);before.before(d);return {d,body};
  };
  const water=wrap('waterAccordion','كيف حسبنا المياه؟',$('calendarSection'));
  water.body.append($('metrics'),$('calculationDetails'),$('dataNotice'),$('rankingNote'));
  const calendar=wrap('calendarAccordion','التقويم الزراعي المصور',$('calendarSection'));calendar.body.append($('calendarSection'));
  const shields=wrap('shieldsAccordion','درع الحماية وملاحظات البرد والحر والرياح',$('shieldsSection'));
  shields.body.append(document.querySelector('.forecast-panel'),$('shieldsSection'));
  const data=wrap('dataAccordion','أرقام ناسا الشهرية للمنطقة',$('dataSection'));data.body.append($('dataSection'));
  const science=wrap('scienceAccordion','المصادر العلمية وحدود الحساب',$('aboutMethod'));science.body.append($('aboutMethod'));
  $('dashboard').append(science.d);
  const scienceHeading=$('aboutMethod').firstElementChild;scienceHeading.hidden=true;
  water.body.append(document.querySelector('.sim-explainer'),$('simSummary'));
  $('weatherSection').querySelector('h2').textContent='جرّب وشوف الفرق';
  $('strategies').querySelector('h2').textContent='قارن مسارات الموسم';
  document.querySelector('.summary-strip p').textContent='الكفاية المائية لا تكفي وحدها؛ راجع التربة ومخاطر المناخ في التفاصيل.';
  $('navScience').addEventListener('click',e=>{
    e.preventDefault();if(!state.report){notify('أكمل إجاباتك لعرض تفاصيل حساب المياه.');return;}
    water.d.open=true;water.d.scrollIntoView({behavior:'smooth'});
  });
}
let printDetailsState=null;
window.addEventListener('beforeprint',()=>{printDetailsState=$$('details').map(el=>[el,el.open]);printDetailsState.forEach(([el])=>el.open=true);});
window.addEventListener('afterprint',()=>{if(printDetailsState)printDetailsState.forEach(([el,open])=>el.open=open);printDetailsState=null;});
setupMinimalUI();
syncWater();renderPreview();setStep(0,false);loadRegion('mafraq');
