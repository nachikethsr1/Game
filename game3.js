
/* ============================================================ PLAYER */
const player=new Fighter({isPlayer:true,name:'You',pos:new THREE.Vector3(0,0,0),maxHp:100});
player.xp=0;player.coins=120;player.rank=0;player.title='';
player.name='YOU';
player.owned=[{type:TYPES[0],mat:MATS[0]}];
player.weapon=player.owned[0];
player.sel=0;

const SAVE_KEY='blockArenaProgress.v1';
let savedArenaIndex=0;
function saveProgress(){
  try{
    const data={
      version:1,xp:player.xp,coins:player.coins,rank:player.rank,title:player.title,
      kills:player.kills,deaths:player.deaths,armor:player.armor,
      owned:player.owned.map(w=>({type:w.type.id,mat:w.mat.id})),
      selected:player.sel,arena:ARENA_I
    };
    localStorage.setItem(SAVE_KEY,JSON.stringify(data));
    return true;
  }catch(e){
    console.warn('[Save] Could not save player progress:',e);
    return false;
  }
}
function loadProgress(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return false;
    const data=JSON.parse(raw);
    if(!data||data.version!==1)return false;
    const savedInt=(value,min,max,fallback=min)=>Number.isFinite(value)?clamp(Math.floor(value),min,max):fallback;
    player.xp=savedInt(data.xp,0,1000000000);
    player.coins=savedInt(data.coins,0,1000000000,120);
    player.kills=savedInt(data.kills,0,1000000000);
    player.deaths=savedInt(data.deaths,0,1000000000);
    let rank=0;
    for(let i=0;i<RANKS.length;i++)if(player.xp>=RANKS[i].xp)rank=i;
    player.rank=rank;
    player.title=rank===RANKS.length-1?MAX_RANK_TITLE:'';
    player.maxHp=100+rank*10;player.hp=player.maxHp;
    const armor=savedInt(data.armor,0,ARMORS.length-1);
    player.armor=ARMORS[armor].rank<=rank?armor:0;
    const owned=[];
    if(Array.isArray(data.owned)){
      for(const item of data.owned.slice(0,6)){
        if(!item)continue;
        const type=TYPES.find(t=>t.id===item.type),mat=MATS.find(m=>m.id===item.mat);
        if(!type||!mat||mat.rank>rank||owned.some(w=>w.type===type&&w.mat===mat))continue;
        owned.push({type,mat});
      }
    }
    player.owned=owned.length?owned:[{type:TYPES[0],mat:MATS[0]}];
    player.sel=savedInt(data.selected,0,player.owned.length-1);
    player.weapon=player.owned[player.sel];
    savedArenaIndex=Math.min(savedInt(data.arena,0,ARENAS.length-1),rank);
    return true;
  }catch(e){
    console.warn('[Save] Could not load player progress:',e);
    return false;
  }
}
loadProgress();
addEventListener('pagehide',saveProgress);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')saveProgress();
});

let fighters=[player];

function spawnNPCs(){
  // remove old npcs
  fighters=[player];
  const a=ARENA;
  // Phase 4: a proper population (10-15) with fighters spread out and levels distributed on purpose
  const npcCount=irnd(10,15);
  const levelBag=buildLevelBag(npcCount);
  for(let i=0;i<npcCount;i++){
    const tier=irnd(a.tiers[0],a.tiers[1]);
    const mat=MATS[clamp(tier+irnd(-1,0),0,4)];
    const f=new Fighter({
      pos:arenaSpot(12),maxHp:a.hp,rank:ARENA_I,
      weapon:{type:pick(TYPES),mat},
      coins:irnd(30,260),armor:clamp(irnd(ARENA_I-1,ARENA_I+1),0,4),
      level:levelBag[i],
      archetype:pick(ARCHETYPES)
    });
    fighters.push(f);
  }
  seedInitialStates(); // Phase 5: arena feels alive the instant you spawn in
}
// Phase 5: seed a believable mix of initial states instead of everyone idly roaming
function seedInitialStates(){
  const pool=fighters.filter(f=>!f.isPlayer).sort((a,b)=>b.aggro-a.aggro);
  if(pool.length<2)return;
  const takeOne=()=>pool.length?pool.shift():null;
  // Start with 2-3 active duels, led by the more aggressive personalities.
  const fightPairs=Math.min(3,Math.max(2,Math.floor(pool.length/5)));
  let watchedFight=null;
  for(let i=0;i<fightPairs&&pool.length>=2;i++){
    const a=takeOne(),b=takeOne();
    a.pos.copy(arenaSpot(6));b.pos.set(a.pos.x+rnd(-3,3),a.pos.y,a.pos.z+rnd(-3,3));
    a.target=b;a.state='FIGHT';a.reactT=a.react;
    b.target=a;b.state='FIGHT';b.reactT=b.react*1.2;
    watchedFight=watchedFight||a;
  }
  // At most one social spectator; the rest remain available to roam, hunt, shop, or join fights.
  if(watchedFight&&pool.length){const w=takeOne();w.state='WATCH';w.watchTarget=watchedFight;w.watchT=rnd(2.5,5);}
  if(pool.length){const s=takeOne();s.state='SHOP';s.shopT=rnd(1.5,3.5);s.pendingBuy=upgradeCost(s);}
}

/* ---------- view model ---------- */
let VM=null;
function buildViewModel(){
  vmScene.children.filter(c=>c.isGroup).forEach(c=>vmScene.remove(c));
  const g=new THREE.Group();
  const arm=new THREE.Group();
  const sk=new THREE.Mesh(new THREE.BoxGeometry(.26,.72,.26),new THREE.MeshLambertMaterial({color:player.skin}));
  sk.position.y=-.3;arm.add(sk);
  arm.rotation.set(-.3,0,-.15);
  const w=buildWeaponMesh(player.weapon.type.id,player.weapon.mat,0.85);
  w.position.set(0,-.55,-.1);w.rotation.set(.15,0,.25);
  arm.add(w);
  g.add(arm);
  g.position.set(.42,-.42,-.62);
  g.rotation.set(0,-.35,0);
  vmScene.add(g);
  VM={g,arm};
}
buildViewModel();

/* ============================================================ INPUT */
const keys={};
let MOBILE=matchMedia('(pointer: coarse)').matches||('ontouchstart' in window && innerWidth<1200);
const input={mx:0,mz:0,look:{x:0,y:0},attack:false,block:false,jump:false};
let locked=false;

const mobEl=document.getElementById('mob');
function enableMobile(){if(MOBILE)mobEl.classList.add('on');}
if(MOBILE)enableMobile();
addEventListener('touchstart',()=>{if(!MOBILE){MOBILE=true;enableMobile();}},{once:true,passive:true});

/* ---- PC ---- */
addEventListener('keydown',e=>{
  if(e.code==='ShiftLeft'||e.code==='ShiftRight')return;
  if(e.code==='Tab')e.preventDefault();
  const wasDown=keys[e.code];
  keys[e.code]=true;
  if(e.code==='KeyE')toggleShop();
  if(e.code==='KeyM'){sndOn=!sndOn;UI.toast('Sound '+(sndOn?'ON':'OFF'));}
  if(e.code==='KeyC'&&!wasDown&&!player.dead)player.crouchSignal();
  if(/^Digit[1-9]$/.test(e.code)){const i=+e.code.slice(5)-1;if(player.owned[i]){player.sel=i;player.weapon=player.owned[i];buildViewModel();UI.hotbar();saveProgress();}}
});
addEventListener('keyup',e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')return;keys[e.code]=false;});
renderer.domElement.addEventListener('mousedown',e=>{
  if(MOBILE)return;
  if(!locked&&!shopOpen&&!startOpen&&!deadOpen){renderer.domElement.requestPointerLock();return;}
  if(e.button===0)input.attack=true;
  if(e.button===2)input.block=true;
});
addEventListener('mouseup',e=>{if(e.button===0)input.attack=false;if(e.button===2)input.block=false;});
addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer.domElement;});
addEventListener('mousemove',e=>{
  if(!locked)return;
  player.yaw-=e.movementX*0.0022;
  player.pitch=clamp(player.pitch-e.movementY*0.0022,-1.5,1.5);
});

/* ---- MOBILE ---- */
const stick=document.getElementById('stick'),knob=document.getElementById('knob');
let stickId=null,lookId=null,lastLook={x:0,y:0},tapCandidate=null;
const TAP_MOVE_THRESHOLD=14;
stick.addEventListener('touchstart',e=>{
  e.preventDefault();const t=e.changedTouches[0];stickId=t.identifier;
  moveKnob(t);
},{passive:false});
function moveKnob(t){
  const r=stick.getBoundingClientRect();
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=t.clientX-cx,dy=t.clientY-cy;
  const max=r.width/2;const d=Math.hypot(dx,dy);
  if(d>max){dx*=max/d;dy*=max/d;}
  knob.style.transform=`translate(${dx}px,${dy}px)`;
  input.mx=dx/max;input.mz=dy/max;
}
addEventListener('touchmove',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===stickId){moveKnob(t);e.preventDefault();}
    else if(t.identifier===lookId){
      if(tapCandidate&&tapCandidate.id===t.identifier&&Math.hypot(t.clientX-tapCandidate.x,t.clientY-tapCandidate.y)>TAP_MOVE_THRESHOLD)tapCandidate.moved=true;
      player.yaw-=(t.clientX-lastLook.x)*0.0055;
      player.pitch=clamp(player.pitch-(t.clientY-lastLook.y)*0.0055,-1.5,1.5);
      lastLook.x=t.clientX;lastLook.y=t.clientY;e.preventDefault();
    }
  }
},{passive:false});
function endTouch(e){
  for(const t of e.changedTouches){
    if(t.identifier===stickId){stickId=null;input.mx=input.mz=0;knob.style.transform='';}
    if(t.identifier===lookId){
      const tap=tapCandidate;
      lookId=null;tapCandidate=null;
      if(e.type==='touchend'&&tap&&tap.id===t.identifier&&!tap.moved&&!player.dead&&!startOpen&&!shopOpen&&!deadOpen)player.attack();
    }
  }
}
addEventListener('touchend',endTouch);addEventListener('touchcancel',endTouch);
renderer.domElement.addEventListener('touchstart',e=>{
  for(const t of e.changedTouches){
    if(lookId===null&&t.clientX>innerWidth*0.32){
      lookId=t.identifier;lastLook.x=t.clientX;lastLook.y=t.clientY;
      tapCandidate=t.clientX>innerWidth*0.5?{id:t.identifier,x:t.clientX,y:t.clientY,moved:false}:null;
    }
  }
},{passive:true});
function holdBtn(id,on,off){
  const el=document.getElementById(id);
  el.addEventListener('touchstart',e=>{e.preventDefault();el.classList.add('on');on();},{passive:false});
  const end=e=>{e.preventDefault();el.classList.remove('on');off&&off();};
  el.addEventListener('touchend',end);el.addEventListener('touchcancel',end);
}
holdBtn('bBlk',()=>input.block=true,()=>input.block=false);
holdBtn('bJmp',()=>input.jump=true,()=>input.jump=false);
document.getElementById('bShop').addEventListener('touchstart',e=>{e.preventDefault();toggleShop();},{passive:false});
document.getElementById('bCrouch').addEventListener('touchstart',e=>{e.preventDefault();if(!player.dead)player.crouchSignal();},{passive:false});

/* ============================================================ UI */
const el=id=>document.getElementById(id);
const UI={
  hearts(){
    const n=10,box=el('hearts');
    if(box.children.length!==n){box.innerHTML='';for(let i=0;i<n;i++){const d=document.createElement('div');d.className='heart';box.appendChild(d);} }
    const p=clamp(player.hp/player.maxHp,0,1)*n;
    [...box.children].forEach((d,i)=>{
      d.className='heart'+(p>=i+1?' full':p>i+0.35?' half':'');
    });
  },
  hotbar(){
    const b=el('hotbar');b.innerHTML='';
    player.owned.forEach((w,i)=>{
      const d=document.createElement('div');
      d.className='slot'+(i===player.sel?' sel':'');
      d.innerHTML=`<span style="color:#${w.mat.col.toString(16).padStart(6,'0')}">${w.mat.name}<br>${w.type.name}</span><small>${i+1}</small>`;
      d.addEventListener('touchstart',e=>{e.preventDefault();player.sel=i;player.weapon=w;buildViewModel();UI.hotbar();saveProgress();},{passive:false});
      d.addEventListener('click',()=>{player.sel=i;player.weapon=w;buildViewModel();UI.hotbar();saveProgress();});
      b.appendChild(d);
    });
  },
  stats(){
    const r=RANKS[player.rank],nx=RANKS[player.rank+1];
    el('rankLine').innerHTML=`RANK: <span style="color:${r.col}">${r.name}</span>`;
    el('titleLine').textContent=player.title?'TITLE: '+player.title:'';
    el('titleLine').style.display=player.title?'block':'none';
    el('arenaLine').textContent='ARENA: '+ARENA.name;
    const base=r.xp,top=nx?nx.xp:r.xp+1;
    el('xpfill').style.width=(nx?clamp((player.xp-base)/(top-base),0,1)*100:100)+'%';
    el('xptext').textContent=nx?`${player.xp} / ${nx.xp} XP → ${nx.name}`:`${player.xp} XP · MAX RANK`;
    el('coins').textContent='⛃ '+player.coins+' coins';
    el('wep').textContent=`${player.weapon.mat.name} ${player.weapon.type.name} · ${ARMORS[player.armor].name} · K/D ${player.kills}/${player.deaths}`;
    this.hearts();
  },
  board(){
    const arr=[...fighters].sort((a,b)=>b.kills-a.kills).slice(0,7);
    el('board').innerHTML='<b>LEADERBOARD</b>'+arr.map(f=>
      `<div class="${f.isPlayer?'me':''}"><span>${f.isPlayer?'YOU':f.name}</span><span>${f.kills}</span></div>`).join('');
  },
  feed(t){
    const d=document.createElement('div');
    d.innerHTML=t.replace(/§7/g,'').length?t.replace('§7','<span style="opacity:.7">')+'</span>':t;
    el('kills').prepend(d);
    while(el('kills').children.length>6)el('kills').lastChild.remove();
    setTimeout(()=>{d.style.transition='opacity .6s';d.style.opacity=0;setTimeout(()=>d.remove(),700);},7000);
  },
  kill(by,vic){
    const w=by?`${by.weapon.mat.name} ${by.weapon.type.name}`:'gravity';
    const n=v=>v.isPlayer?'<span style="color:#7ee36b">YOU</span>':v.name;
    this.feed(`${by?n(by):'???'} <span style="opacity:.7">[${w}]</span> ⚔ ${n(vic)}`);
  },
  chat(name,text,rank){
    const d=document.createElement('div');
    d.innerHTML=`<span style="color:${RANKS[rank||0].col}">&lt;${name}&gt;</span> ${text}`;
    el('chat').prepend(d);
    while(el('chat').children.length>7)el('chat').lastChild.remove();
    setTimeout(()=>{d.style.transition='opacity .8s';d.style.opacity=0;setTimeout(()=>d.remove(),900);},9000);
  },
  hitmark(){const h=el('hitmark');h.classList.add('on');clearTimeout(h._t);h._t=setTimeout(()=>h.classList.remove('on'),110);},
  hurt(){const h=el('hurt');h.style.opacity=.85;clearTimeout(h._t);h._t=setTimeout(()=>h.style.opacity=0,120);this.hearts();},
  toast(t){const x=el('toast');x.textContent=t;x.style.opacity=1;clearTimeout(x._t);x._t=setTimeout(()=>x.style.opacity=0,1400);},
  banner(t,sub){const b=el('banner');b.innerHTML=t+(sub?`<small>${sub}</small>`:'');b.style.opacity=1;clearTimeout(b._t);b._t=setTimeout(()=>b.style.opacity=0,2600);},
  pops:[],
  popup(world3,text,color){
    if(this.pops.length>12)return;
    const d=document.createElement('div');d.className='pop';d.style.color=color;d.textContent=text;
    el('hud').appendChild(d);
    this.pops.push({d,p:world3.clone(),life:0.95});
  },
  updatePops(dt){
    for(let i=this.pops.length-1;i>=0;i--){
      const o=this.pops[i];o.life-=dt;o.p.y+=dt*1.2;
      if(o.life<=0){o.d.remove();this.pops.splice(i,1);continue;}
      const v=o.p.clone().project(camera);
      if(v.z>1){o.d.style.display='none';continue;}
      o.d.style.display='';
      o.d.style.left=((v.x*.5+.5)*innerWidth)+'px';
      o.d.style.top=((-v.y*.5+.5)*innerHeight)+'px';
      o.d.style.opacity=clamp(o.life,0,1);
    }
  },
  showDead(by){
    deadOpen=true;
    cgGameplayStop(); // SDK: game break (death screen)
    el('deadTxt').innerHTML=`You were killed by <b>${by}</b>.<br>Lost 10% coins. XP kept.`;
    el('dead').classList.remove('hide');
    if(locked)document.exitPointerLock();
  }
};

/* ---------- rank / arena progression ---------- */
function checkRank(){
  let r=0;
  for(let i=0;i<RANKS.length;i++)if(player.xp>=RANKS[i].xp)r=i;
  if(r>player.rank){
    const reachedMaxRank=r===RANKS.length-1;
    player.rank=r;S.lvl();
    cgHappy(); // SDK: happytime on a feel-good moment
    if(reachedMaxRank){
      player.title=MAX_RANK_TITLE;
      UI.banner('MAX RANK REACHED!','TITLE UNLOCKED: '+player.title+' · Final arena green teleporter → THE FINAL TRIAL');
      UI.chat('SERVER',`You earned the title ${player.title}! Max rank reached — step on the GREEN teleporter in the Legend arena to enter THE FINAL TRIAL.`,r);
    }else{
      UI.banner('RANK UP → '+RANKS[r].name,'New gear unlocked · new arena portal open');
      UI.chat('SERVER',`YOU ranked up to ${RANKS[r].name}!`,r);
    }
  }
  player.maxHp=100+player.rank*10;
  UI.stats();
  saveProgress();
}
function travel(dir){
  const i=ARENA_I+dir;
  if(i<0||i>=ARENAS.length){UI.toast('No arena there');return;}
  if(i>player.rank){UI.toast('LOCKED — need rank '+RANKS[i].name);return;}
  buildArena(i);
  buildViewModel();
  player.pos.copy(arenaSpot());player.vel.set(0,0,0);player.hp=player.maxHp;
  spawnNPCs();
  UI.banner('ENTERED '+ARENA.name,`${fighters.length-1} players online · rewards x${ARENA.reward}`);
  UI.stats();UI.hotbar();
  S.lvl();
  saveProgress();
}
/* ==================== FINAL TRIAL ==================== */
const TRIAL={
  active:false,
  defeated:JSON.parse(localStorage.getItem('blockArenaTrialWins')||'[]'),
  fighters:[]
};

const LEGENDARY=[
  {name:'VoidWalker',arch:'destroyer',type:'mace',mat:'diamond',hp:190,ability:'knockback'},
  {name:'ShadowStriker',arch:'revenger',type:'spear',mat:'gold',hp:165,ability:'speed'},
  {name:'IronTitan',arch:'builder',type:'axe',mat:'iron',hp:210,ability:'block'},
  {name:'BladeDancer',arch:'social',type:'sword',mat:'diamond',hp:175,ability:'strafe'},
  {name:'GrimReaper',arch:'destroyer',type:'axe',mat:'diamond',hp:185,ability:'crit'},
  {name:'StoneGuardian',arch:'builder',type:'mace',mat:'iron',hp:230,ability:'tank'},
  {name:'FrostBite',arch:'zen',type:'sword',mat:'gold',hp:170,ability:'slow'},
  {name:'ChaosLord',arch:null,type:'spear',mat:'diamond',hp:180,ability:'random'},
  {name:'SilentKiller',arch:'revenger',type:'spear',mat:'iron',hp:160,ability:'stealth'},
  {name:'ARENA KING',arch:'destroyer',type:'mace',mat:'diamond',hp:260,ability:'boss'}
];

function startFinalTrial(){
  if(player.rank<RANKS.length-1)return UI.toast('Reach LEGEND rank first!');
  if(TRIAL.active)return;

  TRIAL.active=true; // must be set BEFORE buildArena so the trial obstacle layout is used
  buildArena(4); // Use Legend Nether arena (rebuilt with trial obstacles)
  player.pos.set(0,0,HALF-8);player.vel.set(0,0,0);player.hp=player.maxHp;

  // Remove all NPCs
  fighters=[player];
  TRIAL.fighters=[];

  // Spawn 10 Legendary Fighters in semicircle — every one of them is out for YOU
  LEGENDARY.forEach((L,i)=>{
    const ang=Math.PI+(i/9)*Math.PI; // Semicircle facing player
    const R=HALF*0.6;
    const f=new Fighter({
      pos:new THREE.Vector3(Math.cos(ang)*R,0,Math.sin(ang)*R),
      maxHp:L.hp,rank:4,
      weapon:{type:TYPES.find(t=>t.id===L.type),mat:MATS.find(m=>m.id===L.mat)},
      coins:0,armor:4,
      level:NPC_LEVELS[4], // Elite
      archetype:ARCHETYPES.find(a=>a&&a.id===L.arch)||null
    });
    f.name=L.name;
    f.trialAbility=L.ability;
    f.trialIndex=i;
    f.noRegen=true; // KEY: No HP regen
    // Trial fighters are relentless: max aggression/bravery, no fleeing, locked onto the player
    f.personality.aggression=1;f.aggro=1;
    f.personality.bravery=1;f.mood.fear=0;f.mood.anger=0.6;
    f.personality.friendliness=0;f.personality.revenge=1;
    f.skill=Math.max(f.skill,0.85);
    f.react=lerp(.42,.11,f.skill);
    f.target=player;
    f.state='HUNT';
    f.reactT=f.react*0.5;
    const pm=getMemory(f,player);pm.trust=0;pm.revenge=1; // personal grudge from second zero
    fighters.push(f);
    TRIAL.fighters.push(f);
  });

  UI.banner('⚔️ THE FINAL TRIAL ⚔️','All 10 Legendary Fighters are coming for YOU — they do NOT regenerate HP');
  UI.chat('SERVER','THE FINAL TRIAL BEGINS! They hunt you together. No enemy respawns. Good luck, Champion.',4);
  UI.stats();
}

function checkTrialVictory(){
  if(!TRIAL.active)return;
  const alive=TRIAL.fighters.filter(f=>!f.dead);
  if(alive.length===0){
    TRIAL.active=false;
    TRIAL.defeated.push(Date.now());
    localStorage.setItem('blockArenaTrialWins',JSON.stringify(TRIAL.defeated));
    showVictoryScreen();
  }else{
    UI.banner(`${10-alive.length}/10 DEFEATED`,'Keep fighting! They cannot regenerate HP!');
  }
}

/* ==================== VICTORY + VOTING ==================== */
const VOTE_KEY='blockArenaVotes';
const VOTE_GOAL=10;

function getVotes(){return parseInt(localStorage.getItem(VOTE_KEY))||4;}
function hasVoted(){return localStorage.getItem('blockArenaVoted')==='1';}

function showVictoryScreen(){
  cgGameplayStop();
  const votes=getVotes();
  const voted=hasVoted();

  const ov=document.createElement('div');
  ov.className='ov';
  ov.id='victory';
  ov.innerHTML=`
    <div class="panel" style="text-align:center;max-width:480px;">
      <h1 style="color:#ffd84b;font-size:32px;margin-bottom:8px;">🏆 CHAMPION 🏆</h1>
      <p style="font-size:14px;margin-bottom:15px;">
        You conquered <b>THE FINAL TRIAL</b>

        All 10 Legendary Fighters have fallen.
      </p>
      <div style="background:#1a1a1a;border:2px solid #ffd84b;padding:12px;margin:15px 0;">
        <h2 style="color:#ffd84b;margin-bottom:8px;">🌍 OPEN WORLD EXPANSION</h2>
        <p style="margin-bottom:10px;font-size:12px;">Vote to make it happen!</p>
        <div style="background:#333;height:24px;position:relative;margin-bottom:8px;border:1px solid #555;">
          <div id="voteFill" style="background:linear-gradient(90deg,#ffd84b,#ff9d00);height:100%;width:${(votes/VOTE_GOAL)*100}%;transition:width .5s;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-weight:bold;font-size:12px;" id="voteText">${votes} / ${VOTE_GOAL}</div>
        </div>
        <button class="btn" id="voteBtn" style="background:#ffd84b;color:#000;border-color:#b8952e;${voted?'opacity:.5;pointer-events:none;':''}">
          ${voted?'✓ VOTED':'🔥 VOTE NOW 🔥'}
        </button>
        <p id="voteMsg" style="margin-top:8px;font-size:11px;color:#7ee36b;">
          ${votes>=VOTE_GOAL?'🎉 GOAL REACHED! Open World confirmed!':'Every vote counts! Share with friends!'}
        </p>
      </div>
      <button class="btn" id="eternalBtn">⚔ CONTINUE (ETERNAL MODE)</button>
      <button class="btn grey" id="menuBtn2">MAIN MENU</button>
    </div>`;
  document.body.appendChild(ov);

  document.getElementById('voteBtn').onclick=()=>{
    if(hasVoted())return;
    localStorage.setItem('blockArenaVoted','1');
    const nv=Math.min(getVotes()+1,VOTE_GOAL);
    localStorage.setItem(VOTE_KEY,nv);
    document.getElementById('voteFill').style.width=(nv/VOTE_GOAL)*100+'%';
    document.getElementById('voteText').textContent=`${nv} / ${VOTE_GOAL}`;
    document.getElementById('voteBtn').textContent='✓ VOTED';
    document.getElementById('voteBtn').style.opacity='.5';
    document.getElementById('voteBtn').style.pointerEvents='none';
    if(nv>=VOTE_GOAL){
      document.getElementById('voteMsg').innerHTML='🎉 <b>GOAL REACHED!</b> Open World is confirmed!<br>Follow for dev updates!';
      S.lvl();cgHappy();
    }else{
      UI.toast(`Vote counted! ${VOTE_GOAL-nv} more needed!`);
    }
  };

  document.getElementById('eternalBtn').onclick=()=>{
    ov.remove();
    cgGameplayStart();
    spawnNPCs(); // Back to normal
    UI.banner('ETERNAL MODE','Free PvP — Keep fighting, Champion!');
  };

  document.getElementById('menuBtn2').onclick=()=>{
    location.reload();
  };

  if(locked)document.exitPointerLock();
  S.lvl();cgHappy();
}

el('cheatForm').addEventListener('submit',e=>{
  e.preventDefault();
  const field=el('cheatInput');
  const code=field.value.trim().toLowerCase();
  field.value='';
  if(code==='trial'){startFinalTrial();return;}
  if(code!=='finish')return UI.toast('Invalid cheat code');

  player.xp=Math.max(player.xp,RANKS[RANKS.length-1].xp);
  checkRank();
  player.title=MAX_RANK_TITLE;
  player.hp=player.maxHp;
  const finalArena=ARENAS.length-1;
  if(ARENA_I<finalArena)travel(finalArena-ARENA_I);
  UI.stats();
  saveProgress();
  UI.banner('CONGRATULATIONS!','FINISH CODE ACCEPTED · FINAL ARENA · MAX RANK · FULL HP · Green teleporter → FINAL TRIAL');
  UI.chat('SERVER','Congratulations! You reached the final arena at max rank with full HP.',player.rank);
  field.blur();
});

/* ---------- shop ---------- */
let shopOpen=false,startOpen=true,deadOpen=false;
function toggleShop(){
  if(startOpen||deadOpen)return;
  if(!shopOpen&&player.pos.distanceTo(SHOP_POS)>4){UI.toast('Move closer to the gold shop block');return;}
  shopOpen=!shopOpen;
  el('shop').classList.toggle('hide',!shopOpen);
  if(shopOpen){cgGameplayStop();renderShop();if(locked)document.exitPointerLock();}
  else cgGameplayStart(); // SDK: shop = game break, closing = gameplay resumes
}
el('closeShop').onclick=()=>toggleShop();
function renderShop(){
  el('shopCoins').textContent='⛃ '+player.coins;
  let h='<div class="item" data-ad="1" style="border-color:#ffd84b"><b style="color:#ffd84b">▶ WATCH AD → +150 ⛃</b> free coins for the arena fund · <span style="opacity:.75">rewarded ad</span></div>'
       +'<h2>WEAPONS</h2><div class="cols">';
  for(const ty of TYPES){
    h+='<div>';
    for(const mt of MATS){
      const cost=Math.round(ty.cost*mt.cost);
      const owned=player.owned.some(w=>w.type===ty&&w.mat===mt);
      const locked=mt.rank>player.rank;
      const can=player.coins>=cost&&!locked&&!owned;
      h+=`<div class="item ${owned?'own':can?'':'no'}" data-t="${ty.id}" data-m="${mt.id}">
      <b style="color:#${mt.col.toString(16).padStart(6,'0')}">${mt.name} ${ty.name}</b>
      dmg ${(ty.dmg*mt.mult).toFixed(1)} · spd ${(1/(ty.cd*mt.cd)).toFixed(2)}/s · reach ${ty.reach}
      <br>${owned?'<span style="color:#7ee36b">OWNED</span>':locked?'<span style="color:#e35">needs '+RANKS[mt.rank].name+'</span>':'<span class="cost">⛃ '+cost+'</span>'}</div>`;
    }
    h+='</div>';
  }
  h+='</div><h2>ARMOR &amp; SUPPLIES</h2>';
  for(let i=1;i<ARMORS.length;i++){
    const a=ARMORS[i];const have=player.armor>=i;const lock=a.rank>player.rank;
    h+=`<div class="item ${have?'own':(player.coins>=a.cost&&!lock?'':'no')}" data-a="${i}">
      <b>${a.name}</b> -${Math.round(a.red*100)}% damage taken ·
      ${have?'<span style="color:#7ee36b">EQUIPPED</span>':lock?'<span style="color:#e35">needs '+RANKS[a.rank].name+'</span>':'<span class="cost">⛃ '+a.cost+'</span>'}</div>`;
  }
  h+=`<div class="item ${player.coins>=40?'':'no'}" data-p="1"><b>Healing Potion</b> instantly heal 55 HP · <span class="cost">⛃ 40</span></div>`;
  el('shopBody').innerHTML=h;
  el('shopBody').querySelectorAll('.item').forEach(d=>{
    d.onclick=()=>{
      if(d.dataset.t){
        const ty=TYPES.find(t=>t.id===d.dataset.t),mt=MATS.find(m=>m.id===d.dataset.m);
        const cost=Math.round(ty.cost*mt.cost);
        if(mt.rank>player.rank)return UI.toast('Locked: need '+RANKS[mt.rank].name);
        if(player.owned.some(w=>w.type===ty&&w.mat===mt))return UI.toast('Already owned');
        if(player.coins<cost)return UI.toast('Not enough coins');
        player.coins-=cost;
        if(player.owned.length>=6)player.owned.shift();
        player.owned.push({type:ty,mat:mt});
        player.sel=player.owned.length-1;player.weapon=player.owned[player.sel];
        buildViewModel();S.buy();UI.hotbar();
      }else if(d.dataset.a){
        const i=+d.dataset.a,a=ARMORS[i];
        if(player.armor>=i)return;
        if(a.rank>player.rank)return UI.toast('Locked: need '+RANKS[a.rank].name);
        if(player.coins<a.cost)return UI.toast('Not enough coins');
        player.coins-=a.cost;player.armor=i;S.buy();
      }else if(d.dataset.p){
        if(player.coins<40)return UI.toast('Not enough coins');
        player.coins-=40;player.hp=Math.min(player.maxHp,player.hp+55);S.buy();
      }else if(d.dataset.ad){
        // SDK rewarded ad: +150 coins on completion
        if(CG.adBusy)return;CG.adBusy=true;
        UI.toast('Loading ad...');
        cgRequestAd('rewarded',
          ()=>{CG.adBusy=false;player.coins+=150;saveProgress();S.buy();UI.toast('+150 ⛃ — thanks for supporting the arena!');UI.stats();renderShop();},
          ()=>{CG.adBusy=false;UI.toast('No ad available right now — try again soon');});
        return; // coins/UI refresh handled in callbacks
      }
      saveProgress();
      UI.stats();renderShop();
    };
  });
}

/* ---------- start / death ---------- */
el('playBtn').onclick=()=>{
  startOpen=false;el('start').classList.add('hide');
  if(!MOBILE)renderer.domElement.requestPointerLock();
  cgGameplayStart(); // SDK: active gameplay begins
  UI.banner('WELCOME TO '+ARENA.name,'Kill players → earn XP → rank up → next arena');
};
el('respawnBtn').onclick=()=>{
  const doRespawn=()=>{
    deadOpen=false;el('dead').classList.add('hide');
    player.dead=false;player.hp=player.maxHp;player.pos.copy(arenaSpot(8));player.vel.set(0,0,0);
    UI.stats();
    if(!MOBILE)renderer.domElement.requestPointerLock();
    cgGameplayStart(); // SDK: gameplay resumes
  };
  // death screen is a natural break: show an interstitial, throttled to 1 per MIDGAME_COOLDOWN
  if(cgMidgameReady())cgRequestAd('midgame',doRespawn,doRespawn);
  else doRespawn();
};

/* ============================================================ PLAYER UPDATE */
let portalT=0;
function updatePlayer(dt){
  if(player.dead)return;
  // out-of-combat regen: no damage dealt or taken for 7s -> slowly heal back up
  if(player.hp<player.maxHp&&now()-player.lastCombat>7){
    player.hp=Math.min(player.maxHp,player.hp+player.maxHp*0.06*dt);
    UI.hearts();
  }
  let wx=0,wz=0;
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  const rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
  if(!MOBILE){
    let f=0,s=0;
    if(keys.KeyW)f+=1;if(keys.KeyS)f-=1;if(keys.KeyA)s-=1;if(keys.KeyD)s+=1;
    wx=fx*f+rx*s;wz=fz*f+rz*s;
    if(keys.Space)player.jump();
  }else{
    const f=-input.mz,s=input.mx;
    wx=fx*f+rx*s;wz=fz*f+rz*s;
    if(input.jump)player.jump();
  }
  player.sprinting=Math.hypot(wx,wz)>0.001;
  player.blocking=(!MOBILE?input.block:input.block);
  if(!shopOpen&&!startOpen&&input.attack&&player.atkCd<=0)player.attack();
  if(player.atkCd>0)player.atkCd-=dt;
  player.applyMove(wx,wz,dt);
  physics(player,dt);
  if(player.swing>0)player.swing=Math.max(0,player.swing-dt*4.2);
  player.crouch=Math.max(0,player.crouch-dt*5); // Phase 3: crouch-signal decay
  // portals
  const nearPad=p=>Math.abs(player.pos.x-p.x)<1.6&&Math.abs(player.pos.z-p.z)<1.6&&player.pos.y<1.5;
  let onPad=0;
  if(PORTAL_NEXT&&nearPad(PORTAL_NEXT))onPad=1;
  else if(PORTAL_PREV&&nearPad(PORTAL_PREV))onPad=-1;
  if(onPad){
    portalT+=dt;
    const nx=ARENA_I+onPad;
    if(onPad===1&&nx>=ARENAS.length){
      // Green teleporter at the edge of the FINAL arena → THE FINAL TRIAL.
      // Only opens once the last arena is fully completed (LEGEND rank reached).
      if(TRIAL.active){UI.toast('FINISH THE TRIAL FIRST!');portalT=0;}
      else if(player.rank>=RANKS.length-1){
        UI.toast(`Entering THE FINAL TRIAL... ${(1.2-portalT).toFixed(1)}s`);
        if(portalT>1.2){portalT=0;startFinalTrial();}
      }else{
        UI.toast('LOCKED — fully complete the final arena (reach LEGEND) first');portalT=0;
      }
    }else{
      const ok=nx>=0&&nx<ARENAS.length&&nx<=player.rank;
      UI.toast(ok?`Warping to ${ARENAS[nx]?ARENAS[nx].name:'???'}... ${(1.2-portalT).toFixed(1)}s`
                :(nx<0?'This is the first arena':'LOCKED — reach rank '+RANKS[nx].name));
      if(portalT>1.2){portalT=0;travel(onPad);}
    }
  }else portalT=0;

  // camera
  const bob=Math.sin(player.anim*3.4)*(player.sprinting?0.055:0.03)*Math.min(Math.hypot(player.vel.x,player.vel.z)/4,1);
  camera.position.set(player.pos.x,player.pos.y+1.62+bob-player.crouch*0.3,player.pos.z);
  camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;
  const targetFov=player.sprinting?82:75;
  camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*8);camera.updateProjectionMatrix();
  // viewmodel anim
  if(VM){
    const sw=Math.sin(player.swing*Math.PI);
    VM.arm.rotation.x=-0.3-sw*1.9+ (player.blocking?-0.9:0);
    VM.arm.rotation.z=-0.15+sw*0.6;
    VM.g.position.x=0.42+Math.sin(player.anim*3.4)*0.035-(player.blocking?0.12:0);
    VM.g.position.y=-0.42+Math.abs(Math.cos(player.anim*3.4))*0.03+(player.blocking?0.06:0);
  }
}

/* ============================================================ MAIN LOOP */
buildArena(savedArenaIndex);
player.pos.copy(arenaSpot());
spawnNPCs();
UI.stats();UI.hotbar();UI.board();
UI.chat('SERVER','Welcome! Kill players to earn XP and coins.',0);
saveProgress();
CG.loaded=true;cgMaybeLoadingStop(); // game is rendered & playable → loading finished

/* tiny e2e hook — inert unless the page URL contains #e2e (used by automated tests) */
if(location.hash.includes('e2e'))window.__E2E={player,el,UI,SHOP_POS,kill:()=>UI.showDead('e2e-test'),state:()=>({startOpen,deadOpen,shopOpen})};

let last=now(),boardT=0;
function loop(){
  requestAnimationFrame(loop);
  const t=now();let dt=Math.min(t-last,0.05);last=t;
  if(!startOpen&&!deadOpen&&!shopOpen){
    updatePlayer(dt);
    for(const f of fighters){
      if(f.isPlayer)continue;
      if(f.dead){if(f.trialIndex!==undefined)continue;f.respawnT-=dt;if(f.respawnT<=0)f.respawn();continue;}
      // FINAL TRIAL: the 10 legendary fighters never lose interest — they always hunt YOU
      if(TRIAL.active&&f.trialIndex!==undefined){
        if(f.target!==player)f.target=player;
        if(f.state!=='FIGHT'&&f.state!=='HUNT'&&f.state!=='COVER'){
          f.state=f.pos.distanceTo(player.pos)<f.reach+3.2?'FIGHT':'HUNT';
        }
        f.mood.fear=0;f.allyOf=null;f.allyT=0; // no fear, no wandering off
      }
      f.think-=dt;
      if(f.think<=0)aiThink(f);
      aiAct(f,dt);
    }
    resolveCrouchSignals(dt);
    updateParticles(dt);
    UI.updatePops(dt);
    boardT+=dt;
    if(boardT>0.8){boardT=0;UI.board();UI.stats();}
    // spin the shop block & pulse portals
    world.children.forEach(c=>{if(c.userData.spin)c.rotation.y+=dt*1.1;});
    if(PORTAL_NEXT)PORTAL_NEXT.mesh.material.opacity=.55+Math.sin(t*4)*.25;
    if(PORTAL_PREV)PORTAL_PREV.mesh.material.opacity=.55+Math.sin(t*4+1)*.25;
  }
  renderer.clear();
  renderer.render(scene,camera);
  renderer.clearDepth();
  renderer.render(vmScene,vmCam);
}
loop();
