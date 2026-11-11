const fs=require('fs'),path=require('path');
const ASSETS='/Users/chollo/FitFlex/fitflexmobile/assets';
const themes={
 navy:{bg:'#0B1F3A',fg:'#FFFFFF',acc:'#00B67A',acc2:'#FF9800',soft:'#16335A',ink:'#0B1F3A'},
 cream:{bg:'#FFF6E5',fg:'#0B1F3A',acc:'#1F7A3A',acc2:'#FF9800',soft:'#FFE2B0',ink:'#0B1F3A'},
 green:{bg:'#00B67A',fg:'#0B1F3A',acc:'#FFFFFF',acc2:'#FF9800',soft:'#009A67',ink:'#0B1F3A'},
 orange:{bg:'#FF9800',fg:'#0B1F3A',acc:'#FFFFFF',acc2:'#0B1F3A',soft:'#E88700',ink:'#0B1F3A'},
};
const person=(x,y,s,c,c2)=>`<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-70" r="26" fill="${c}"/><rect x="-30" y="-36" width="60" height="100" rx="26" fill="${c2||c}"/><rect x="-26" y="52" width="22" height="70" rx="10" fill="${c}"/><rect x="4" y="52" width="22" height="70" rx="10" fill="${c}"/></g>`;
const star=(x,y,r,c)=>{let p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*0.45:r;p.push((x+Math.cos(a)*rr).toFixed(1)+','+(y+Math.sin(a)*rr).toFixed(1));}return `<polygon points="${p.join(' ')}" fill="${c}"/>`};
const phone=(x,y,w,h,p,inner)=>`<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="44" fill="${p.ink}"/><rect x="12" y="12" width="${w-24}" height="${h-24}" rx="34" fill="${p.bg==='#0B1F3A'?'#16335A':'#FFFFFF'}"/><rect x="${w/2-40}" y="22" width="80" height="12" rx="6" fill="${p.ink}"/>${inner}</g>`;
const dumbbell=(x,y,s,c,c2)=>`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-120" y="-10" width="240" height="20" rx="10" fill="${c}"/><rect x="-150" y="-60" width="34" height="120" rx="12" fill="${c2}"/><rect x="-186" y="-38" width="30" height="76" rx="10" fill="${c}"/><rect x="116" y="-60" width="34" height="120" rx="12" fill="${c2}"/><rect x="156" y="-38" width="30" height="76" rx="10" fill="${c}"/></g>`;
const pin=(x,y,s,c,c2)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 120 C-70 40 -90 10 -90 -30 A90 90 0 1 1 90 -30 C90 10 70 40 0 120Z" fill="${c}"/><circle cx="0" cy="-30" r="36" fill="${c2}"/></g>`;
const check=(x,y,r,c,c2)=>`<g><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><path d="M${x-r*.45} ${y} L${x-r*.1} ${y+r*.38} L${x+r*.5} ${y-r*.35}" stroke="${c2}" stroke-width="${r*.22}" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
const bubble=(x,y,w,h,c,tail)=>`<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="${c}"/><path d="M${x+(tail?w-90:70)} ${y+h-4} l${tail?30:-10} 56 l${tail?-70:70} -56z" fill="${c}"/></g>`;
const txt=(x,y,s,t,c,w=800,a='middle')=>`<text x="${x}" y="${y}" font-family="Inter" font-weight="${w}" font-size="${s}" fill="${c}" text-anchor="${a}">${t}</text>`;
const bar=(x,y,w,h,c,r=14)=>`<rect x="${x}" y="${y-h}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`;

const art={
 bars:p=>`<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/>
  ${bar(120,500,90,400,p.acc2)}${bar(230,500,90,70,p.acc)}${bar(400,500,90,330,p.acc2)}${bar(510,500,90,120,p.acc)}
  <rect x="80" y="505" width="640" height="8" rx="4" fill="${p.fg}"/>
  ${txt(165,548,22,'JOINED',p.fg)}${txt(275,548,22,'STAYED',p.fg)}${txt(445,548,22,'JOINED',p.fg)}${txt(555,548,22,'STAYED',p.fg)}
  `,
 stayed:p=>`<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/>
  ${person(220,285,1.35,p.acc2,p.acc2)}${person(400,285,1.35,p.acc,p.acc)}${person(580,285,1.35,p.fg,p.fg)}
  ${txt(400,105,48,'Who actually stays?',p.fg)}${txt(400,525,42,'Visits answer it.',p.acc2)}`,
 notebook:p=>`<g transform="translate(0 -20) rotate(-6 400 300) scale(1 .92)"><rect x="170" y="40" width="460" height="520" rx="28" fill="#FFFFFF"/><rect x="170" y="40" width="70" height="520" rx="28" fill="${p.acc2}"/>
  ${[0,1,2,3,4,5].map(i=>`<circle cx="205" cy="${100+i*80}" r="12" fill="${p.ink}"/>`).join('')}
  ${[0,1,2,3,4].map(i=>`<path d="M280 ${130+i*80} q40 -30 80 0 t80 0 t80 0" stroke="${p.ink}" stroke-width="8" fill="none" stroke-linecap="round" opacity=".55"/>`).join('')}
  <path d="M560 60 l60 -40 l30 50 l-60 40z" fill="${p.acc}"/></g>
  ${txt(400,570,38,'Names. Tallies. Smudges.',p.fg)}`.replace('<g transform','<g transform'),
 leaving:p=>`<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/>
  <rect x="540" y="130" width="170" height="330" rx="16" fill="${p.ink}"/><circle cx="680" cy="300" r="10" fill="${p.acc2}"/>
  ${person(300,300,1.3,p.acc,p.acc)}${person(150,310,1.1,p.fg,p.fg)}
  <path d="M390 300 H500" stroke="${p.acc2}" stroke-width="16" stroke-linecap="round" stroke-dasharray="4 28"/><path d="M485 270 l40 30 l-40 30" stroke="${p.acc2}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${txt(400,540,38,'Gone before you noticed.',p.fg)}`,
 chartgap:p=>`<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/>
  <path d="M100 440 H700 M100 440 V120" stroke="${p.fg}" stroke-width="8" stroke-linecap="round"/>
  <path d="M120 360 L220 260 L320 330 L400 400" stroke="${p.acc}" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M400 400 L700 400" stroke="${p.acc2}" stroke-width="14" stroke-dasharray="4 26" stroke-linecap="round"/>
  <rect x="420" y="130" width="250" height="240" rx="20" fill="${p.acc2}" opacity=".25"/>${txt(545,260,110,'?',p.acc2)}
  ${txt(260,500,34,'busy',p.fg)}${txt(545,500,34,'empty',p.fg)}`,
 dashboard:p=>`<rect x="60" y="60" width="680" height="480" rx="36" fill="${p.fg}"/><rect x="60" y="60" width="680" height="80" rx="36" fill="${p.acc}"/><rect x="60" y="110" width="680" height="30" fill="${p.acc}"/>
  ${txt(110,118,34,'Today',p.ink,800,'start')}
  ${bar(120,420,60,120,p.acc)}${bar(200,420,60,200,p.acc2)}${bar(280,420,60,160,p.acc)}${bar(360,420,60,260,p.acc2)}${bar(440,420,60,100,p.acc)}
  <rect x="540" y="180" width="170" height="60" rx="16" fill="${p.soft}"/><rect x="540" y="260" width="170" height="60" rx="16" fill="${p.soft}"/><rect x="540" y="340" width="170" height="60" rx="16" fill="${p.soft}"/>
  ${check(575,210,18,p.acc,p.ink)}${check(575,290,18,p.acc,p.ink)}${check(575,370,18,p.acc2,p.ink)}
  <rect x="120" y="440" width="560" height="14" rx="7" fill="${p.soft}"/>`,
 growth:p=>`${pin(400,260,2.0,p.acc2,p.fg)}${dumbbell(400,262,0.28,p.ink,p.acc)}
  ${person(120,430,1,p.fg,p.fg)}${person(220,450,0.9,p.acc,p.acc)}${person(580,450,0.9,p.fg,p.fg)}${person(680,430,1,p.acc,p.acc)}
  <path d="M170 380 q80 -30 150 -10" stroke="${p.acc}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="2 22"/><path d="M630 380 q-80 -30 -150 -10" stroke="${p.acc}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="2 22"/>`,
 cta:(p,kw)=>`${bubble(60,60,680,330,'#FFFFFF',false)}${txt(400,175,56,'Comment',p.ink)}
  <rect x="130" y="205" width="540" height="130" rx="65" fill="${p.ink}"/>${txt(400,297,84,kw,'#FFFFFF',900)}
  ${person(640,480,0.75,p.ink,p.ink)}${person(540,490,0.65,'#FFFFFF','#FFFFFF')}${txt(70,520,40,'Then check your DMs.',p.ink,800,'start')}`,
 // trainers
 emptycal:p=>`<rect x="140" y="50" width="520" height="500" rx="40" fill="${p.fg}"/><rect x="140" y="50" width="520" height="120" rx="40" fill="${p.acc2}"/><rect x="140" y="130" width="520" height="40" fill="${p.acc2}"/>
  ${[0,1,2,3,4,5,6,7,8,9].map(i=>`<rect x="${175+(i%5)*92}" y="${200+Math.floor(i/5)*95}" width="70" height="70" rx="14" fill="${p.soft}" opacity=".6"/>`).join('')}
  ${txt(400,470,60,'0 bookings',p.ink,900)}${txt(660,100,110,'?',p.acc,900)}`,
 target:p=>`<circle cx="400" cy="290" r="230" fill="${p.acc2}"/><circle cx="400" cy="290" r="160" fill="${p.fg}"/><circle cx="400" cy="290" r="95" fill="${p.acc}"/><circle cx="400" cy="290" r="35" fill="${p.ink}"/>
  <path d="M640 80 L470 240" stroke="${p.ink}" stroke-width="16" stroke-linecap="round"/><path d="M640 80 l-8 56 M640 80 l-56 8" stroke="${p.ink}" stroke-width="16" stroke-linecap="round"/>
  ${txt(400,580,38,'Say who you help.',p.fg)}`,
 chat:p=>`${bubble(60,50,520,170,p.soft,false)}${txt(320,155,52,'“Personal trainer”',p.fg,700)}
  <path d="M110 105 l60 0" stroke="${p.fg}" stroke-width="0"/>
  ${bubble(220,300,520,210,p.acc,true)}${txt(480,385,38,'“I help desk workers',p.ink,800)}${txt(480,445,38,'beat back pain”',p.ink,800)}
  ${check(700,300,34,p.acc2,p.ink)}${txt(320,100,0,'',p.fg)}`,
 proof:p=>`<rect x="60" y="70" width="330" height="260" rx="30" fill="${p.fg}"/><circle cx="225" cy="190" r="70" fill="${p.acc2}"/><path d="M205 150 l60 40 l-60 40z" fill="${p.ink}"/>
  <rect x="430" y="70" width="310" height="260" rx="30" fill="${p.fg}"/>${[0,1,2,3,4].map(i=>star(480+i*53,150,24,p.acc2)).join('')}<rect x="470" y="210" width="230" height="16" rx="8" fill="${p.soft}"/><rect x="470" y="250" width="170" height="16" rx="8" fill="${p.soft}"/>
  <rect x="60" y="370" width="680" height="170" rx="30" fill="${p.soft}"/>${check(150,455,42,p.acc,p.ink)}${txt(220,470,44,'Photos. Clips. Reviews.',p.fg,800,'start')}`,
 cashdm:p=>`<rect x="60" y="80" width="330" height="200" rx="26" fill="#FFFFFF"/><circle cx="225" cy="180" r="62" fill="${p.ink}"/>${txt(225,205,70,'$',p.acc2==p.ink?'#FFFFFF':p.acc2,900)}
  <rect x="430" y="80" width="310" height="200" rx="26" fill="#FFFFFF"/><path d="M430 100 l155 110 l155 -110" stroke="${p.ink}" stroke-width="12" fill="none"/>
  <circle cx="700" cy="90" r="30" fill="${p.acc}"/>${txt(700,102,36,'1',p.ink)}
  <circle cx="400" cy="440" r="110" fill="${p.soft}"/><path d="M400 370 V440 L450 470" stroke="${p.fg}" stroke-width="16" fill="none" stroke-linecap="round"/>
  ${txt(400,590,36,'“I’ll send it later.”',p.fg)}`,
 three:p=>[0,1,2].map(i=>`<rect x="60" y="${60+i*170}" width="680" height="140" rx="36" fill="${p.fg}"/>${check(140,130+i*170,44,p.acc,p.ink)}${txt(220,145+i*170,44,['Clear offer','Visible proof','Easy booking'][i],p.bg,900,'start')}`).join(''),
 profile:p=>phone(240,20,320,560,p,`<circle cx="160" cy="130" r="44" fill="${p.acc}"/><rect x="60" y="200" width="200" height="22" rx="11" fill="${p.ink}"/><rect x="85" y="240" width="150" height="16" rx="8" fill="${p.soft}"/>${[0,1,2,3,4].map(i=>star(90+i*35,300,13,p.acc2)).join('')}
   <rect x="50" y="340" width="220" height="64" rx="32" fill="${p.acc}"/>${txt(160,382,28,'Book now',p.ink,900)}<rect x="50" y="424" width="220" height="64" rx="32" fill="${p.acc2}"/>${txt(160,466,28,'Pay in app',p.ink,900)}`),
 // members
 stuck:p=>`<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/><rect x="250" y="190" width="300" height="270" rx="20" fill="${p.fg}"/><path d="M230 200 L400 90 L570 200Z" fill="${p.acc2}"/><rect x="360" y="330" width="80" height="130" rx="10" fill="${p.ink}"/>
  <g transform="translate(640 320)"><rect x="-70" y="-10" width="140" height="110" rx="20" fill="${p.acc}"/><path d="M-36 -10 v-34 a36 36 0 0 1 72 0 v34" stroke="${p.acc}" stroke-width="20" fill="none"/><circle cx="0" cy="45" r="14" fill="${p.ink}"/></g>${txt(400,525,40,'1 gym. 1 contract.',p.fg)}`,
 mobilemoney:p=>phone(250,20,300,560,p,`<rect x="40" y="70" width="220" height="100" rx="24" fill="${p.acc}"/>${txt(150,135,36,'M-Pesa',p.ink,900)}<rect x="40" y="190" width="220" height="100" rx="24" fill="${p.acc2}"/>${txt(150,255,32,'Airtel Money',p.ink,900)}<rect x="40" y="310" width="220" height="100" rx="24" fill="${p.soft}"/>${txt(150,375,32,'Tigo Pesa',p.fg,900)}${check(150,470,36,p.acc,p.ink)}`)+`<circle cx="130" cy="150" r="60" fill="${p.acc2}"/>${txt(130,175,70,'TSh',p.ink,900).replace('font-size="70"','font-size="40"')}<circle cx="680" cy="420" r="70" fill="${p.acc}"/>${txt(680,448,70,'✓',p.ink,900)}`,
 network:p=>{const pts=[[400,300],[160,160],[640,150],[140,440],[660,450],[400,110],[400,500]];return `<g stroke="${p.fg}" stroke-width="8" stroke-dasharray="2 18" stroke-linecap="round">${pts.slice(1).map(q=>`<path d="M400 300 L${q[0]} ${q[1]}"/>`).join('')}</g>`+pts.map((q,i)=>pin(q[0],q[1]-(i?10:0),i?0.5:1.0,i?p.acc:p.acc2,p.fg)).join('')+dumbbell(400,300,0.22,p.ink,p.ink)},
 vetted:p=>`<path d="M400 40 L660 130 V330 C660 450 540 520 400 570 C260 520 140 450 140 330 V130Z" fill="${p.fg}"/><path d="M400 90 L610 160 V330 C610 420 520 475 400 515 C280 475 190 420 190 330 V160Z" fill="${p.acc}"/>
  ${[0,1,2,3,4].map(i=>star(280+i*60,250,26,p.acc2)).join('')}${check(400,390,60,p.fg,p.ink)}`,
 travel:p=>`<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/><rect x="230" y="190" width="340" height="270" rx="36" fill="#FFFFFF"/><path d="M330 190 v-45 a20 20 0 0 1 20 -20 h100 a20 20 0 0 1 20 20 v45" stroke="#FFFFFF" stroke-width="18" fill="none"/>
  <rect x="320" y="190" width="24" height="270" fill="${p.ink}" opacity=".25"/><rect x="456" y="190" width="24" height="270" fill="${p.ink}" opacity=".25"/>${dumbbell(400,325,0.36,p.ink,p.acc2==p.ink?p.ink:p.acc2)}
  ${pin(660,200,0.9,p.acc,p.fg)}${pin(140,420,0.7,p.acc,p.fg)}`,
 qr:p=>{let cells='';const s=22,ox=240,oy=110;let seed=7;for(let r=0;r<12;r++)for(let c=0;c<12;c++){seed=(seed*9301+49297)%233280;const on=seed/233280>0.45||((r<3||r>8)&&(c<3||c>8)&&!(r>8&&c>8));if(on&&!(r>8&&c>8))cells+=`<rect x="${ox+c*s}" y="${oy+r*s}" width="${s-2}" height="${s-2}" rx="4" fill="${p.ink}"/>`;}
  return `<rect x="215" y="85" width="330" height="330" rx="30" fill="#FFFFFF"/>${cells}<circle cx="630" cy="440" r="110" fill="${p.acc2}"/><path d="M630 370 a70 70 0 1 1 -60 35" stroke="${p.ink}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M560 385 l20 40 l40 -25" fill="${p.ink}"/>${txt(630,462,48,'60s',p.ink,900)}${txt(400,585,34,'New code every minute.',p.fg)}`},
 appfeat:p=>phone(240,20,320,560,p,`<rect x="40" y="70" width="240" height="110" rx="26" fill="${p.acc}"/>${txt(160,138,34,'Trainers',p.ink,900)}<rect x="40" y="200" width="240" height="110" rx="26" fill="${p.acc2}"/>${txt(160,268,34,'Gear',p.ink,900)}<rect x="40" y="330" width="240" height="110" rx="26" fill="${p.soft}"/>${txt(160,398,34,'Gyms',p.fg,900)}`)+dumbbell(110,500,0.4,p.fg,p.acc2),
};
const slides={
 A:[{t:'navy',h:'You’re counting the <em>wrong</em> members.',a:'stayed'},
    {t:'cream',h:'Sign-ups tell you who <em>joined.</em>',s:'Visits tell you who <b>stayed.</b>',a:'bars'},
    {t:'orange',h:'Most small gyms track visits in a <em>notebook.</em>',s:'Or not at all.',a:'notebook'},
    {t:'navy',h:'Can’t see visits? You can’t see who’s <em>leaving.</em>',a:'leaving'},
    {t:'green',h:'Empty off-peak hours aren’t a mystery.',s:'They’re a <b>data problem.</b>',a:'chartgap'},
    {t:'cream',h:'A dashboard shows check-ins, busy hours and who <em>stopped coming.</em>',a:'dashboard'},
    {t:'navy',h:'And it brings <em>new members</em> to your door.',a:'growth'},
    {t:'orange',h:'Own a gym in <em>Dar es Salaam?</em>',kw:'PARTNER',cta:'We’ll DM you how FitFlex works.'}],
 B:[{t:'navy',h:'Why clients don’t book you.',s:'(It’s not your <em>price.</em>)',a:'emptycal'},
    {t:'cream',h:'1. They can’t tell what you actually <em>help</em> with.',a:'target'},
    {t:'green',h:'“Personal trainer” says nothing.',s:'Say <b>who you help</b> and why.',a:'chat'},
    {t:'navy',h:'2. They can’t see <em>proof.</em>',s:'Photos, clips and honest reviews build trust.',a:'proof'},
    {t:'orange',h:'3. Booking and paying is <em>hard.</em>',s:'Cash, DMs and “later” kill sales.',a:'cashdm'},
    {t:'cream',h:'Fix all <em>three.</em>',a:'three'},
    {t:'navy',h:'A profile, bookings and payment — <em>in one app.</em>',a:'profile'},
    {t:'green',h:'Are you a <em>trainer?</em>',kw:'TRAINER',cta:'We’ll DM you how to join.'}],
 C:[{t:'navy',h:'One gym. One contract. <em>Stuck.</em>',s:'There’s a better way.',a:'stuck'},
    {t:'cream',h:'Pay once with <em>mobile money.</em>',a:'mobilemoney'},
    {t:'green',h:'Train at gyms across the <em>network.</em>',a:'network'},
    {t:'navy',h:'Every gym is visited and <em>scored</em> before it joins.',a:'vetted'},
    {t:'orange',h:'Travelling for work? Your pass <em>goes with you.</em>',a:'travel'},
    {t:'cream',h:'Check in with a QR that <em>refreshes</em> every minute.',a:'qr'},
    {t:'navy',h:'Book a trainer and buy gear in <em>one app.</em>',a:'appfeat'},
    {t:'green',h:'Want <em>in?</em>',kw:'PASS',cta:'We’ll DM you the link.'}],
};
const names={A:'Gym owners',B:'Trainers',C:'Members'};
const outDir=process.argv[2];
function html(set,i,sl){
 const p=themes[sl.t];const n=slides[set].length;
 const isC=!!sl.kw;
 const art_=isC?art.cta(p,sl.kw):art[sl.a](p);
 const hs=sl.h.replace(/<[^>]+>/g,'').length;
 const fs=isC?96:(hs<28?112:hs<48?96:84);
 return `<!doctype html><html><head><meta charset="utf-8"><style>
 @font-face{font-family:Inter;font-weight:400 900;src:url("file://${ASSETS}/fonts/Inter-900.ttf")}
 @font-face{font-family:Inter;font-weight:700;src:url("file://${ASSETS}/fonts/Inter-700.ttf")}
 @font-face{font-family:Inter;font-weight:800;src:url("file://${ASSETS}/fonts/Inter-800.ttf")}
 *{box-sizing:border-box;margin:0}
 body{width:1080px;height:1350px;background:${p.bg};color:${p.fg};font-family:Inter,sans-serif;display:flex;flex-direction:column;padding:70px 80px 60px;overflow:hidden}
 .top{display:flex;justify-content:space-between;align-items:center;height:70px}
 .brand{display:flex;align-items:center;gap:16px;font-weight:800;font-size:34px;letter-spacing:-.5px}
 .brand img{width:62px;height:62px;border-radius:16px}
 .n{font-weight:800;font-size:30px;opacity:.7}
 h1{font-weight:900;font-size:${fs}px;line-height:1.02;letter-spacing:-3px;margin-top:50px}
 h1 em{font-style:normal;color:${p.acc2==p.bg?p.acc:(sl.t==='navy'||sl.t==='cream'?p.acc:p.acc)}}
 ${sl.t==='navy'?`h1 em{color:${p.acc2}}`:''}${sl.t==='cream'?`h1 em{color:${p.acc}}`:''}${sl.t==='green'?`h1 em{color:#fff}`:''}${sl.t==='orange'?`h1 em{color:#fff}`:''}
 .s{font-weight:700;font-size:50px;line-height:1.15;margin-top:26px;letter-spacing:-1px}
 .s em{font-style:normal;color:${sl.t==='navy'?p.acc2:sl.t==='cream'?p.acc:'#fff'}}
 .s b{font-weight:900;color:${sl.t==='navy'?p.acc:sl.t==='cream'?p.acc:'#fff'}}
 .art{flex:1;display:flex;align-items:center;justify-content:center;margin-top:20px;min-height:0}
 .art svg{width:100%;height:100%}
 .foot{height:40px;font-weight:700;font-size:28px;opacity:.75;display:flex;justify-content:space-between}
 </style></head><body>
 <div class="top"><div class="brand"><img src="file://${ASSETS}/brand/fitflex-logo.png">FitFlex Africa</div><div class="n">${i+1}/${n}</div></div>
 <h1>${sl.h}</h1>${sl.s?`<div class="s">${sl.s}</div>`:''}${isC?`<div class="s">${sl.cta}</div>`:''}
 <div class="art"><svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">${art_}</svg></div>
 <div class="foot"><span>${i<n-1?'Swipe →':''}</span><span>@fitflex.africa</span></div>
 </body></html>`;
}
for(const set of Object.keys(slides)){slides[set].forEach((sl,i)=>{const f=path.join(outDir,`${set}${String(i+1).padStart(2,'0')}.html`);fs.writeFileSync(f,html(set,i,sl));});}
console.log('ok');
