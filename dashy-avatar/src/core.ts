/**
 * Dashy core: pure simulation, no DOM, no timers.
 * Feed it time (ms) via step(now) and get back geometry to draw.
 * Coordinate system: 300 x 300 viewBox, body 220 x 220 (40..260), pivot at bottom centre (150, 260).
 */
export type Status = 'idle' | 'received' | 'working' | 'thinking' | 'waiting' | 'blocked' | 'done';
export type Mood = 'happy' | 'sad' | 'angry' | 'strict' | 'dancing' | 'sleepy'
  | 'surprised' | 'love' | 'confused' | 'excited' | 'scared' | 'curious' | 'proud' | 'dizzy' | 'bored' | 'wink' | 'talking' | 'listening' | 'shy'
  | 'laughing' | 'crying' | 'sick' | 'cool' | 'mischief' | 'determined' | 'relieved' | 'nervous' | 'cold' | 'hot' | 'starstruck'
  | 'nodding' | 'searching' | 'loading' | 'success' | 'error' | 'idea' | 'gloomy';
export type DashyState = Status | Mood;
/** Every state, in display order. The one list the other modules (static, definition, svg) take theirs from. */
export const STATE_KEYS: readonly DashyState[] = ['idle', 'received', 'working', 'thinking', 'waiting', 'blocked', 'done', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy',
  'surprised', 'love', 'confused', 'excited', 'scared', 'curious', 'proud', 'dizzy', 'bored', 'wink', 'talking', 'listening', 'shy',
  'laughing', 'crying', 'sick', 'cool', 'mischief', 'determined', 'relieved', 'nervous', 'cold', 'hot', 'starstruck',
  'nodding', 'searching', 'loading', 'success', 'error', 'idea', 'gloomy'];
export type Shape = 'square' | 'circle';
export type { Look, BlinkConfig } from './timeline';

export interface DashyOptions {
  /** Seed for the (deterministic) randomness: blink timing, glances. */
  seed?: number;
  /** Eye height multiplier. Default 55/66 = golden ratio with 34 wide eyes (34 x 55). Use 1 for 34 x 66. */
  eyeScale?: number;
  /** Ambient life (micro-saccades in the eyes, slow drift in the body). false/0 = off (default here, so the recorded reference stays exact), true = 1, or a strength. */
  ambient?: boolean | number;
  /** Head turn: the eye on the far side narrows when he looks sideways, up/down squashes the eyes. false/0 = off (default), true = 1, or a strength. */
  perspective?: boolean | number;
  /** Blink timing. Default: every 2.0 to 5.2 s, about 175 ms long. */
  blink?: BlinkConfig;
  /** Eye width in core units. Default 34. Kept narrow enough that the eyes never touch (at most 2 x eyeSpacing - 22). */
  eyeWidth?: number;
  /** Distance from the face centre to each eye. Default 34 (range 24..46). */
  eyeSpacing?: number;
  /** Bounciness of the body springs: 1 = default, higher wobbles longer, lower settles quicker (0.4..2.5). */
  bounce?: number;
}
export interface EyeGeometry {
  x: number; y: number; tilt: number; ew: number; eh: number;
  /** fraction covered from the top by the upper lid (0..1) */
  cov: number;
  /** upper lid rotation in degrees (positive on the left eye = angry slant) */
  lidA: number;
  /** fraction covered from the bottom by the curved lower lid (happy arcs) */
  low: number;
  /** current blink amount 0..1 */
  blink: number;
}
export interface Geometry {
  cur: DashyState;
  /** corner radius of the body: 22 = rounded square, 110 = circle */
  rx: number;
  body: { tx: number; ty: number; rot: number; sx: number; sy: number };
  face: { tx: number; ty: number; rot: number; sx: number; sy: number };
  eyes: EyeGeometry[];
}
export interface Dashy {
  states: Record<string, { n: string }>;
  getState(): DashyState;
  setState(k: DashyState, now: number): void;
  setShape(s: Shape): void;
  setEyeScale(k: number): void;
  poke(now: number): void;
  /** nx, ny in -1..1 relative to the centre of the avatar */
  pointer(nx: number, ny: number, now: number): void;
  /** Override the eyes of the current state (a custom expression). null = back to the state's own look. `spring` sets how fast the eyes get there. */
  setLook(look: Look | null, spring?: { k: number; d: number }): void;
  setAmbient(strength: boolean | number): void;
  setPerspective(strength: boolean | number): void;
  setBlink(cfg: BlinkConfig | null): void;
  /** Corner radius of the body in core units, 0 (sharp) to 110 (circle). setShape picks 22 or 110. */
  setCornerRadius(rx: number): void;
  setEyeWidth(w: number): void;
  setEyeSpacing(s: number): void;
  setBounce(b: number): void;
  step(now: number): Geometry;
}

import type { BlinkConfig, Look } from './timeline';
import { AMBIENT_WEIGHTS, ambientAt } from './ambient';
import { eyePerspective } from './perspective';
const level = (v: boolean | number | undefined) => v === true ? 1 : !v ? 0 : clamp(v, 0, 2);
class Sp{x:number;v=0;t:number;k:number;d:number;constructor(x:number,k:number,d:number){this.x=x;this.t=x;this.k=k;this.d=d}
 s(dt:number){const a=(this.t-this.x)*this.k-this.v*this.d;this.v+=a*dt;this.x+=this.v*dt}}
function clamp(v:number,a:number,b:number){return Math.max(a,Math.min(b,v))}
function ease(x:number){x=clamp(x,0,1);return x*x*(3-2*x)}
export function createDashy(options: DashyOptions = {}): Dashy {
 var rs:number=options.seed||12345;function R(): number{rs=(rs*1664525+1013904223)>>>0;return rs/4294967296}
 function rnd(a:number,b:number){return a+R()*(b-a)}
 var EW=clamp(options.eyeWidth??34,16,60),H0=66,SEP=clamp(options.eyeSpacing??34,24,46);
 // sd = sep delta, eh absolute, cover, lidA (+ = angry slant, - = sad), low, tilt, asym
 var M:Record<string,any>={
  idle:{n:'Idle',sd:0,eh:66,cover:.05,lidA:0,low:0,tilt:0,asym:0},
  received:{n:'Taak received',sd:0,eh:66,cover:.05,lidA:0,low:0,tilt:0,asym:0},
  working:{n:'Werken',sd:-1,eh:60,cover:.2,lidA:4,low:0,tilt:0,asym:0},
  thinking:{n:'Denken',sd:0,eh:64,cover:.12,lidA:8,low:0,tilt:0,asym:.22},
  waiting:{n:'Wachten',sd:2,eh:72,cover:.08,lidA:-14,low:0,tilt:0,asym:0},
  blocked:{n:'Geblokkeerd',sd:3,eh:68,cover:.26,lidA:-30,low:0,tilt:0,asym:0},
  done:{n:'Klaar',sd:0,eh:62,cover:0,lidA:0,low:.42,tilt:7,asym:0},
  happy:{n:'Blij',sd:0,eh:68,cover:0,lidA:0,low:.26,tilt:6,asym:0},
  sad:{n:'Sip',sd:3,eh:54,cover:.4,lidA:-16,low:0,tilt:0,asym:0},
  angry:{n:'Boos',sd:-2,eh:62,cover:.44,lidA:24,low:0,tilt:0,asym:0},
  strict:{n:'Streng',sd:0,eh:66,cover:.5,lidA:3,low:0,tilt:0,asym:0},
  dancing:{n:'Dansen',sd:0,eh:68,cover:0,lidA:0,low:.44,tilt:7,asym:0},
  sleepy:{n:'Slaperig',sd:2,eh:62,cover:.6,lidA:-6,low:0,tilt:0,asym:0},
  surprised:{n:'Verrast',sd:3,eh:84,cover:0,lidA:0,low:0,tilt:0,asym:0},
  love:{n:'Verliefd',sd:-1,eh:74,cover:0,lidA:0,low:.42,tilt:-4,asym:0},
  confused:{n:'Verward',sd:0,eh:64,cover:.14,lidA:-10,low:0,tilt:-5,asym:.35},
  excited:{n:'Opgewonden',sd:1,eh:74,cover:0,lidA:0,low:.3,tilt:3,asym:0},
  scared:{n:'Bang',sd:-3,eh:74,cover:.06,lidA:-22,low:0,tilt:0,asym:0},
  curious:{n:'Nieuwsgierig',sd:0,eh:70,cover:.04,lidA:0,low:0,tilt:0,asym:-.3},
  proud:{n:'Trots',sd:0,eh:62,cover:.4,lidA:7,low:0,tilt:0,asym:-.1},
  dizzy:{n:'Duizelig',sd:0,eh:62,cover:.1,lidA:0,low:0,tilt:0,asym:.2},
  bored:{n:'Verveeld',sd:1,eh:58,cover:.52,lidA:-4,low:0,tilt:0,asym:0},
  wink:{n:'Knipoog',sd:0,eh:68,cover:0,lidA:0,low:.34,tilt:5,asym:.5},
  talking:{n:'Praten',sd:0,eh:66,cover:.06,lidA:0,low:0,tilt:0,asym:0},
  listening:{n:'Luisteren',sd:0,eh:70,cover:0,lidA:-6,low:0,tilt:0,asym:0},
  shy:{n:'Verlegen',sd:-1,eh:60,cover:0,lidA:0,low:.32,tilt:-3,asym:0},
  laughing:{n:'Lachen',sd:0,eh:60,cover:0,lidA:0,low:.55,tilt:8,asym:0},
  crying:{n:'Huilen',sd:3,eh:56,cover:.3,lidA:-20,low:0,tilt:0,asym:0},
  sick:{n:'Ziek',sd:2,eh:54,cover:.45,lidA:-8,low:0,tilt:0,asym:.15},
  cool:{n:'Cool',sd:0,eh:60,cover:.42,lidA:0,low:.1,tilt:0,asym:0},
  mischief:{n:'Ondeugend',sd:-1,eh:62,cover:.35,lidA:12,low:.25,tilt:0,asym:.2},
  determined:{n:'Vastberaden',sd:-2,eh:62,cover:.3,lidA:16,low:0,tilt:0,asym:0},
  relieved:{n:'Opgelucht',sd:1,eh:60,cover:.5,lidA:-10,low:.2,tilt:0,asym:0},
  nervous:{n:'Zenuwachtig',sd:-2,eh:70,cover:.1,lidA:-18,low:0,tilt:0,asym:0},
  cold:{n:'Koud',sd:-2,eh:60,cover:.2,lidA:-10,low:0,tilt:0,asym:0},
  hot:{n:'Warm',sd:2,eh:58,cover:.45,lidA:-6,low:0,tilt:0,asym:0},
  starstruck:{n:'Sterren in de ogen',sd:2,eh:82,cover:0,lidA:0,low:.1,tilt:0,asym:0},
  nodding:{n:'Knikken',sd:0,eh:64,cover:.08,lidA:0,low:.12,tilt:0,asym:0},
  searching:{n:'Zoeken',sd:0,eh:70,cover:0,lidA:0,low:0,tilt:0,asym:0},
  loading:{n:'Laden',sd:0,eh:60,cover:.1,lidA:0,low:0,tilt:0,asym:0},
  success:{n:'Gelukt',sd:0,eh:64,cover:0,lidA:0,low:.4,tilt:6,asym:0},
  error:{n:'Fout',sd:1,eh:62,cover:.3,lidA:-24,low:0,tilt:0,asym:0},
  idea:{n:'Idee',sd:2,eh:80,cover:0,lidA:0,low:0,tilt:0,asym:0},
  gloomy:{n:'Somber',sd:2,eh:56,cover:.45,lidA:-14,low:0,tilt:0,asym:0}
 };
 var KEYS=['sep','eh','cover','lidA','low','tilt','asym'];
 var P:Record<string,Sp>={};
 KEYS.forEach(function(n:string){P[n]=new Sp(n==='sep'?SEP:M.idle[n],220,26)});
 P.sx=new Sp(1,170,11);P.sy=new Sp(1,170,11);P.rot=new Sp(0,150,13);P.tx=new Sp(0,150,14);P.ty=new Sp(0,140,10);
 P.gx=new Sp(0,140,24);P.gy=new Sp(0,140,24);P.fx=new Sp(0,60,15.5);P.fy=new Sp(0,60,15.5);P.rx=new Sp(22,120,22);
 P.bx=new Sp(0,85,8.5);P.by=new Sp(0,85,8);P.bsx=new Sp(1,95,7.5);P.bsy=new Sp(1,95,7.5);P.brot=new Sp(0,80,7);
 var BODY=['sx','sy','rot','tx','ty','bx','by','bsx','bsy','brot'],BD:Record<string,number>={};BODY.forEach(function(n:string){BD[n]=P[n].d});
 function setBounce(b:number){b=clamp(b,.4,2.5);BODY.forEach(function(n:string){P[n].d=BD[n]/b})}
 if(options.bounce!==undefined)setBounce(options.bounce);
 var st:any={cur:'idle',shape:'square',modeT:0,last:null,acc:0,
  nextHop:2500,nextStomp:2000,nextBlink:1800,nextWander:0,nextYawn:5000,nextNo:4500,nextCut:5000,nextScan:0,nextPing:3000,nextBurst:2000,nextMicro:0,nextSigh:4000,sighUntil:0,nextPeek:3500,peekUntil:0,nextJitter:1500,jitterUntil:0,
  blinkStart:-1e9,blinkLen:180,pokeUntil:0,yawnUntil:0,cutUntil:0,cutDir:1,noStart:-1e9,pingUntil:0,burstUntil:0,noticeUntil:0,
  ehK:options.eyeScale ?? 55/66,look:null as Look|null,amb:level(options.ambient),persp:level(options.perspective),spring:null as {k:number;d:number}|null,blinkCfg:(options.blink??null) as BlinkConfig|null,aw:null as {eye:number;body:number}|null,lastPtr:-1e9,ptx:0,pty:0,ptxF:0,ptyF:0,gtx:0,gty:0,msx:0,msy:0,pokes:[],revertAt:0,revertTo:null};
 var S=1.01,H=1/120;
 function setMode(k:string,now:number,quiet?:boolean){
  st.cur=k;st.modeT=now;st.noStart=-1e9;st.revertAt=0;
  if(!quiet){
   if(k==='received')P.ty.v=-300;
   else if(k==='done'){P.ty.v=-380;P.sy.v=-2}
   else{P.ty.v=-200;P.sy.v=-2;P.sx.v=2}
  }
 }
 function setShape(s:string){st.shape=s;P.rx.t=s==='circle'?110:22;P.by.v=-60;P.bsy.v=-1.2}
 function poke(now:number){
  P.sy.v=-4;P.sx.v=4;P.ty.v=-220;P.rot.v=(R()<.5?-1:1)*120;st.pokeUntil=now+750;
  st.pokes=st.pokes.filter(function(t:number){return now-t<3000});st.pokes.push(now);
  if(st.pokes.length>=4&&st.cur!=='angry'){
   var prev=st.cur;setMode('angry',now);st.pokes=[];st.revertTo=prev==='angry'?'idle':prev;st.revertAt=now+3800;
  }
 }
 function setRatio(k:number){st.ehK=k}
 function pointer(nx:number,ny:number,now:number){
  if(now-st.lastPtr>2500&&(st.cur==='idle'||st.cur==='waiting'))st.noticeUntil=now+380;
  st.ptx=clamp(nx,-1,1);st.pty=clamp(ny,-1,1);st.lastPtr=now;
 }
 function step(now:number): Geometry{
  if(st.last===null){st.last=now;st.modeT=now}
  var dt=Math.min(.05,(now-st.last)/1000);st.last=now;var t=now/1000;
  var cur=st.cur;
  if(st.revertAt&&now>st.revertAt){setMode(st.revertTo,now,true)}
  cur=st.cur;
  if(cur==='received'&&now-st.modeT>650){setMode('working',now,true);cur='working'}
  if(cur==='done'&&now-st.modeT>3600){setMode('idle',now,true);cur='idle'}
  var m=M[cur],T:Record<string,number>={};KEYS.forEach(function(n:string){T[n]=m[n]});T.sep=SEP+m.sd;
  if(st.look){var lk:any=st.look;for(var lkk in lk){if(lk[lkk]===undefined)continue;if(lkk==='sd')T.sep=SEP+lk.sd;else T[lkk]=lk[lkk]}}
  var b=Math.sin(t*2.2)*.012,sx=1-b,sy=1+b,tx=0,ty=0,rot=0,amp=1,ptrRecent=now-st.lastPtr<2500;
  var k1=1-Math.exp(-dt*12);st.ptxF+=(st.ptx-st.ptxF)*k1;st.ptyF+=(st.pty-st.ptyF)*k1;
  if(cur==='idle'){ty=Math.sin(t*1.1)*-2;rot=Math.sin(t*.5)*1.5+st.gtx*3;amp=.85}
  else if(cur==='received'){if(now-st.modeT<650){T.eh=82;T.cover=0;sy+=.03}}
  else if(cur==='working'){ty=-Math.abs(Math.sin(t*12))*2.5;rot=Math.sin(t*9)*.8;sx+=Math.sin(t*12)*.01;amp=1.15}
  else if(cur==='thinking'){rot=-5+Math.sin(t*.8)*1.5;ty=-1}
  else if(cur==='waiting'){
   rot=3+Math.sin(t*.9)*5;ty=Math.sin(t*1.6)*-3;
   if(now>st.nextPing){P.ty.v=-220;st.pingUntil=now+450;st.nextPing=now+3200}
   if(now<st.pingUntil){T.eh=82;T.cover=0}
  }else if(cur==='blocked'){
   ty=6;rot=-2;
   if(now>st.nextBurst){st.burstUntil=now+700;st.nextBurst=now+2600}
   if(now<st.burstUntil)tx=Math.sin(t*50)*3.2*Math.min(1,(st.burstUntil-now)/300);
  }else if(cur==='done'){ty=Math.sin(t*2)*-3;rot=Math.sin(t*1.4)*1.5}
  else if(cur==='happy'){ty=Math.sin(t*2)*-3;rot=Math.sin(t*1.4)*1.5;if(now>st.nextHop){P.ty.v=-300;st.nextHop=now+rnd(3500,6500)}}
  else if(cur==='dancing'){var ph=t*2*Math.PI*1.03;ty=-Math.abs(Math.sin(ph))*18+8;rot=Math.sin(ph/2)*7;tx=Math.sin(ph/2)*8}
  else if(cur==='sad'){ty=10;sy+=Math.sin(t*1.1)*.02;rot=-2+Math.sin(t*.7)*2}
  else if(cur==='angry'){tx=Math.sin(t*55)*2.2;rot=Math.sin(t*47)*1.2;sy+=Math.sin(t*9)*.015;amp=.6;if(now>st.nextStomp){P.ty.v=-200;st.nextStomp=now+2400}}
  else if(cur==='strict'){
   if(now>st.nextNo){st.noStart=now;st.nextNo=now+6500}
   var seq=[-7,7,-5,5,0],ni=Math.floor((now-st.noStart)/230);
   rot=(ni>=0&&ni<seq.length)?seq[ni]:0;
  }else if(cur==='sleepy'){
   sy+=Math.sin(t*1.1)*.03;sx-=Math.sin(t*1.1)*.02;rot=-4+Math.sin(t*.5)*3;ty=8;amp=.2;
   if(now>st.nextYawn){st.yawnUntil=now+1600;st.nextYawn=now+rnd(7000,10000)}
  }
  else if(cur==='surprised'){ty=-4;sy+=.02;sx-=.015;amp=.7}
  else if(cur==='love'){var hb=Math.pow(Math.max(0,Math.sin(t*2*Math.PI*1.1)),12);ty=Math.sin(t*1.8)*-3;rot=Math.sin(t*1.2)*3;sy+=hb*.035;sx+=hb*.035}
  else if(cur==='confused'){rot=Math.sin(t*.45)*7;ty=-1;amp=.8}
  else if(cur==='excited'){var pe2=t*2*Math.PI*1.6;ty=-Math.abs(Math.sin(pe2))*14+6;rot=Math.sin(pe2)*3;sx+=Math.sin(pe2*2)*.012}
  else if(cur==='scared'){tx=Math.sin(t*38)*1.4;ty=5;sx-=.03;sy-=.04;rot=Math.sin(t*29)*.6;amp=.9}
  else if(cur==='curious'){rot=8+Math.sin(t*.7)*2;ty=-3+Math.sin(t*1.3)*-1.5;tx=4}
  else if(cur==='proud'){ty=-4;sy+=.02;rot=Math.sin(t*.6)*1.2;amp=.8}
  else if(cur==='dizzy'){rot=Math.sin(t*2.2)*6;tx=Math.sin(t*1.1)*4;ty=Math.sin(t*2.2)*2}
  else if(cur==='bored'){
   ty=6;rot=-3+Math.sin(t*.3)*1.5;amp=.7;
   if(now>st.nextSigh){st.sighUntil=now+1400;st.nextSigh=now+rnd(5000,8000)}
   if(now<st.sighUntil){var sp2=Math.sin((1-(st.sighUntil-now)/1400)*Math.PI);sy+=sp2*.04;sx-=sp2*.02;ty-=sp2*4}
  }
  else if(cur==='wink'){ty=Math.sin(t*2)*-2;rot=4+Math.sin(t*1.4)*1}
  else if(cur==='talking'){var tk=Math.abs(Math.sin(t*9)*Math.sin(t*2.3));ty=-tk*2.5;rot=Math.sin(t*1.3)*2;sy+=tk*.012}
  else if(cur==='listening'){rot=6+Math.sin(t*.5);ty=-1+Math.sin(t*1.7)*-1}
  else if(cur==='shy'){ty=7;sx-=.02;sy-=.03;rot=-4+Math.sin(t*.6);amp=.8}
  else if(cur==='laughing'){ty=-Math.abs(Math.sin(t*14))*4;rot=Math.sin(t*7)*2;sy+=Math.abs(Math.sin(t*14))*.02;amp=.6}
  else if(cur==='crying'){var sob=Math.pow(Math.abs(Math.sin(t*3.2)),6);ty=8-sob*3;sy+=sob*.03;sx-=sob*.015;rot=-2+Math.sin(t*.7)*1.5;amp=.5}
  else if(cur==='sick'){ty=7;rot=Math.sin(t*.6)*4;tx=Math.sin(t*.45)*3;sy+=Math.sin(t*1.2)*.02;amp=.5}
  else if(cur==='cool'){rot=-5+Math.sin(t*1.6)*1.2;ty=Math.abs(Math.sin(t*1.6))*-2;amp=.7}
  else if(cur==='mischief'){rot=Math.sin(t*1.1)*3;ty=-1+Math.sin(t*2.2)*-1.5;sx+=Math.sin(t*4.4)*.008}
  else if(cur==='determined'){ty=-2+Math.abs(Math.sin(t*2.4))*-2;rot=0;sy+=.015;amp=.5}
  else if(cur==='relieved'){
   ty=4;rot=Math.sin(t*.5)*1.5;amp=.6;
   if(now>st.nextSigh){st.sighUntil=now+1800;st.nextSigh=now+rnd(4500,7000)}
   if(now<st.sighUntil){var rl=Math.sin((1-(st.sighUntil-now)/1800)*Math.PI);sy-=rl*.05;sx+=rl*.03;ty+=rl*4}
  }
  else if(cur==='nervous'){tx=Math.sin(t*31)*.9;ty=3;sx-=.02;sy-=.02;rot=Math.sin(t*23)*.5}
  else if(cur==='cold'){tx=Math.sin(t*60)*1.6;rot=Math.sin(t*53)*.8;sx-=.035;sy-=.03;ty=4;amp=.6}
  else if(cur==='hot'){ty=9;rot=Math.sin(t*.8)*3;sy+=Math.sin(t*.9)*.025;sx+=.02;amp=.5}
  else if(cur==='starstruck'){ty=-3+Math.sin(t*3)*-2;rot=Math.sin(t*1.5)*2;sx+=Math.sin(t*6)*.01}
  else if(cur==='nodding'){var nd=Math.sin(t*5.5);ty=Math.max(0,nd)*5;rot=0;sy-=Math.max(0,nd)*.025;amp=.8}
  else if(cur==='searching'){rot=Math.sin(t*1.2)*4;tx=Math.sin(t*1.2)*3;ty=-1}
  else if(cur==='loading'){ty=Math.sin(t*2)*-1;rot=0;amp=.7}
  else if(cur==='success'){ty=Math.sin(t*2.4)*-3;rot=Math.sin(t*1.6)*2;if(now>st.nextHop){P.ty.v=-320;st.nextHop=now+rnd(2600,4200)}}
  else if(cur==='error'){
   ty=4;rot=-1;
   if(now>st.nextJitter){st.jitterUntil=now+450;st.nextJitter=now+2400}
   if(now<st.jitterUntil)tx=Math.sin(t*60)*3.5*Math.min(1,(st.jitterUntil-now)/200);
  }
  else if(cur==='idea'){ty=-5;sy+=.025;rot=Math.sin(t*1.2)*1.5;amp=.8}
  else if(cur==='gloomy'){ty=10;rot=-3+Math.sin(t*.4)*1.5;sy+=Math.sin(t*.8)*.015;amp=.5}
  var sq=clamp(-P.ty.v*.0007,-.25,.25);sy+=sq;sx-=sq*.7;
  var bc=st.blinkCfg,noBlink=(cur==='sleepy'||cur==='angry')||(bc!==null&&bc.enabled===false),bf=cur==='working'?1.8:1;
  if(now>st.nextBlink&&!noBlink){st.blinkStart=now;st.blinkLen=bc&&bc.durationMs?rnd(bc.durationMs*.86,bc.durationMs*1.14):rnd(150,200);st.nextBlink=now+(R()<.18?330:rnd(bc&&bc.minMs?bc.minMs:2000,bc&&bc.maxMs?bc.maxMs:5200)*bf)}
  var bt=now-st.blinkStart,blink=0;
  if(bt>=0&&bt<st.blinkLen){var cl=st.blinkLen*.38;blink=bt<cl?ease(bt/cl):1-ease((bt-cl)/(st.blinkLen-cl))}
  if(now<st.noticeUntil){T.eh*=1.12;T.cover=0}
  if(now<st.yawnUntil&&cur==='sleepy'){T.cover=.93;T.eh=70}
  if(now<st.pokeUntil){T.eh=84;T.cover=0;T.low=0;T.asym=0;T.sep+=3}
  if(cur==='working'){if(now>st.nextScan){st.gtx=[-1,-.55,0,.55,1][Math.floor(R()*5)];st.gty=rnd(-.2,.5);st.nextScan=now+rnd(220,520)}}
  else if(cur==='thinking'){st.gtx=.6+Math.sin(t*.7)*.3;st.gty=-.8+Math.sin(t*.5)*.1}
  else if(cur==='blocked'){st.gtx=-.6;st.gty=.9}
  else if(cur==='received'){st.gtx=0;st.gty=(now-st.modeT>250)?.8:0}
  else if(cur==='dizzy'){st.gtx=Math.cos(t*4)*.8;st.gty=Math.sin(t*4)*.6}
  else if(cur==='confused'){st.gtx=Math.sin(t*.45)*-.5;st.gty=-.55}
  else if(cur==='proud'){st.gtx=Math.sin(t*.4)*.2;st.gty=-.7}
  else if(cur==='bored'){st.gtx=-.7+Math.sin(t*.2)*.3;st.gty=.45}
  else if(cur==='listening'){st.gtx=-.55+Math.sin(t*.6)*.1;st.gty=-.1}
  else if(cur==='scared'){if(now>st.nextScan){st.gtx=[-1,-.7,.7,1][Math.floor(R()*4)];st.gty=rnd(-.3,.3);st.nextScan=now+rnd(400,900)}}
  else if(cur==='shy'){
   if(now>st.nextPeek){st.peekUntil=now+800;st.nextPeek=now+rnd(3500,6000)}
   if(now<st.peekUntil){st.gtx=ptrRecent?st.ptxF*.6:0;st.gty=ptrRecent?st.ptyF*.6:0}else{st.gtx=-.6;st.gty=.75}
  }
  else if(cur==='curious'||cur==='surprised'||cur==='talking'){if(ptrRecent){st.gtx=st.ptxF;st.gty=st.ptyF}else{st.gtx=cur==='curious'?.45+Math.sin(t*.8)*.2:0;st.gty=cur==='curious'?-.1:cur==='surprised'?-.2:.05}}
  else if(cur==='laughing'){st.gtx=0;st.gty=-.35}
  else if(cur==='crying'||cur==='gloomy'){st.gtx=cur==='crying'?0:-.3;st.gty=.7}
  else if(cur==='sick'){st.gtx=Math.sin(t*.6)*.4;st.gty=.4}
  else if(cur==='cool'){st.gtx=ptrRecent?st.ptxF*.5:.3;st.gty=0}
  else if(cur==='mischief'){st.gtx=Math.sin(t*.9)>0?.85:-.85;st.gty=.1}
  else if(cur==='determined'){st.gtx=0;st.gty=0}
  else if(cur==='nervous'){if(now>st.nextScan){st.gtx=rnd(-1,1);st.gty=rnd(-.4,.5);st.nextScan=now+rnd(250,600)}}
  else if(cur==='cold'||cur==='hot'){st.gtx=0;st.gty=cur==='hot'?.5:.2}
  else if(cur==='starstruck'||cur==='idea'){st.gtx=ptrRecent?st.ptxF*.4:0;st.gty=-.6}
  else if(cur==='nodding'){st.gtx=ptrRecent?st.ptxF*.5:0;st.gty=Math.max(0,Math.sin(t*5.5))*.5}
  else if(cur==='searching'){st.gtx=Math.sin(t*1.2);st.gty=-.1+Math.sin(t*2.4)*.15}
  else if(cur==='loading'){st.gtx=Math.cos(t*3)*.55;st.gty=Math.sin(t*3)*.4}
  else if(cur==='error'){st.gtx=-.3;st.gty=.3}
  else if(cur==='waiting'||cur==='done'){if(ptrRecent){st.gtx=st.ptxF;st.gty=st.ptyF}else{st.gtx=0;st.gty=.1}}
  else{
   if(ptrRecent){st.gtx=st.ptxF;st.gty=st.ptyF}
   else if(now>st.nextWander){st.gtx=rnd(-1,1);st.gty=rnd(-.6,.6);if(R()<.3){st.gtx=0;st.gty=0}st.nextWander=now+(cur==='idle'?rnd(2500,5500):rnd(1600,4000))}
   if(cur==='strict'){
    if(now>st.nextCut){st.cutUntil=now+1100;st.cutDir=R()<.5?-1:1;st.nextCut=now+5200}
    if(now<st.cutUntil){st.gtx=st.cutDir;st.gty=0}
   }
  }
  if(now>st.nextMicro){st.msx=rnd(-.06,.06);st.msy=rnd(-.05,.05);st.nextMicro=now+rnd(300,900)}
  var calm=(cur!=='working'&&cur!=='dancing'&&cur!=='angry'&&cur!=='excited'&&cur!=='scared'&&cur!=='dizzy'&&cur!=='laughing'&&cur!=='cold'&&cur!=='nervous'&&cur!=='loading'),fast=cur==='working';
  P.gx.k=fast?650:140;P.gx.d=fast?50:24;P.gy.k=P.gx.k;P.gy.d=P.gx.d;
  P.gx.t=(st.gtx+(calm?st.msx:0))*14*amp;P.gy.t=(st.gty+(calm?st.msy:0))*9*amp;
  P.fx.t=st.gtx*7*amp;P.fy.t=st.gty*4*amp;
  T.eh*=st.ehK;
  KEYS.forEach(function(n:string){P[n].t=T[n];if(st.spring){P[n].k=st.spring.k;P[n].d=st.spring.d}});
  P.sx.t=sx;P.sy.t=sy;P.rot.t=rot;P.tx.t=tx;P.ty.t=ty;
  var gxn=clamp(P.gx.x/14,-1,1),gyn=clamp(P.gy.x/9,-1,1),EWs=Math.min(EW,2*SEP-22);
  P.bx.t=P.tx.x*.6+gxn*5;P.by.t=P.ty.x*.6+gyn*2;
  P.bsx.t=1+(P.sx.x-1)*1.1;P.bsy.t=1+(P.sy.x-1)*1.1;P.brot.t=P.rot.x*.6+gxn*2.5;
  st.acc+=dt;var steps=0;
  while(st.acc>=H&&steps<8){for(var k in P)P[k].s(H);st.acc-=H;steps++}
  if(steps>=8)st.acc=0;
  var fol=clamp(-P.ty.v*.025,-6,6),folx=clamp(-P.tx.v*.02,-5,5);
  var G:Geometry={cur:cur,rx:clamp(P.rx.x,0,110),
   body:{tx:150+P.bx.x,ty:260+P.by.x,rot:P.brot.x,sx:P.bsx.x,sy:P.bsy.x},
   face:{tx:150+P.tx.x*.5+P.fx.x,ty:150+P.ty.x*.5+P.fy.x,rot:P.rot.x*.5,sx:S*(1+(P.sx.x-1)*.5),sy:S*(1+(P.sy.x-1)*.5)},
   eyes:[] as EyeGeometry[]};
  for(var i=0;i<2;i++){
   var gs=i===0?-1:1,px=i===0?-1:1,sg=i===0?1:-1;
   var side=1+gxn*gs*.06,pe=st.persp>0?eyePerspective(gxn,gyn,px*P.sep.x,st.persp):null;
   var eh=Math.max(2,P.eh.x*(1-.9*blink)*(pe?pe.fh:side)),ew=EWs*(pe?pe.fw:1+gxn*gs*.03);
   var cov=clamp(P.cover.x+(i===0?P.asym.x:-P.asym.x*.5),0,1);
   G.eyes.push({x:px*P.sep.x+P.gx.x+folx,y:P.gy.x*.6+fol-cov*eh*.22,tilt:P.tilt.x,ew:ew,eh:eh,cov:cov,lidA:sg*P.lidA.x,low:P.low.x,blink:blink});
  }
  if(st.amb>0){
   var aw=AMBIENT_WEIGHTS[cur],w0=st.aw||(st.aw={eye:aw.eye,body:aw.body}),ka=1-Math.exp(-dt*3);
   w0.eye+=(aw.eye-w0.eye)*ka;w0.body+=(aw.body-w0.body)*ka;
   var am=ambientAt(now,w0,st.amb);
   G.body.tx+=am.bodyX;G.body.ty+=am.bodyY;G.body.rot+=am.bodyRot;G.face.tx+=am.bodyX*.5;G.face.ty+=am.bodyY*.5;
   for(var ai=0;ai<2;ai++){G.eyes[ai].x+=am.eyeX;G.eyes[ai].y+=am.eyeY}
  }
  return G;
 }
 return {
  states:M as Record<string,{n:string}>,
  getState:()=>st.cur as DashyState,
  setState:(k:DashyState,now:number)=>{if(!(k in M))throw new Error('Unknown state: '+k);setMode(k,now)},
  setShape:(s:Shape)=>setShape(s),setEyeScale:setRatio,poke,pointer,step,
  setLook:(look:Look|null,spring?:{k:number;d:number})=>{st.look=look;st.spring=spring??null;if(!spring)KEYS.forEach(function(n:string){P[n].k=220;P[n].d=26})},
  setCornerRadius:(rx:number)=>{P.rx.t=clamp(rx,0,110)},setEyeWidth:(w:number)=>{EW=clamp(w,16,60)},setEyeSpacing:(v:number)=>{SEP=clamp(v,24,46)},setBounce,
  setAmbient:(v:boolean|number)=>{st.amb=level(v)},setPerspective:(v:boolean|number)=>{st.persp=level(v)},setBlink:(c:BlinkConfig|null)=>{st.blinkCfg=c}
 };
}
