
/* ============================================================ FIGHTER */
let FID=1;
class Fighter{
  constructor(opts){
    this.id=FID++;
    this.isPlayer=!!opts.isPlayer;
    this.name=opts.name||genName();
    this.rank=opts.rank??0;
    this.pos=opts.pos.clone();this.vel=new THREE.Vector3();
    this.yaw=rnd(-Math.PI,Math.PI);this.pitch=0;this.aimYaw=this.yaw;
    this.onGround=false;
    this.baseHp=opts.maxHp||100;this.maxHp=this.baseHp;this.hp=this.maxHp;
    this.kills=0;this.deaths=0;this.dead=false;this.respawnT=0;
    this.atkCd=0;this.blocking=false;this.sprinting=false;
    this.hurtT=0;this.coins=opts.coins||0;this.armor=opts.armor||0;
    this.skin=pick([0xc69b6b,0x8d5524,0xffdbac,0xe0ac69,0xa9714b,0x6b4a2c]);
    this.shirt=new THREE.Color().setHSL(Math.random(),rnd(.4,.9),rnd(.35,.6)).getHex();
    this.pants=new THREE.Color().setHSL(Math.random(),rnd(.2,.7),rnd(.2,.45)).getHex();
    this.weapon=opts.weapon||{type:TYPES[0],mat:MATS[0]};
    this.owned=[this.weapon];
    // Phase 2: fighter level (combat strength) is rolled separately from personality/archetype
    this.level=opts.level||pick(NPC_LEVELS);
    this.maxHp=this.baseHp*this.level.hpMult;this.hp=this.maxHp;
    // AI personality (Phase 1: traits beyond raw skill; Phase 5: archetype-flavored)
    this.skill=opts.skill??rollLevelSkill(this.level);
    this.archetype=opts.archetype!==undefined?opts.archetype:pick(ARCHETYPES);
    this.personality=rollPersonality(this.archetype);
    this.personality.skill=this.skill;
    // back-compat aliases (existing AI math reads these directly)
    this.aggro=this.personality.aggression;
    this.greed=this.personality.greed;
    this.react=lerp(.42,.11,this.skill);
    // Phase 1: mood drifts around personality baseline based on events
    this.mood={
      fear:(1-this.personality.bravery)*0.3,
      anger:0,
      confidence:this.personality.confidence,
      excitement:0.1
    };
    // Phase 2: memory of other fighters, keyed by id, persists across own respawns
    this.memory=new Map();
    this.strafeDir=Math.random()<.5?-1:1;
    this.state='ROAM';this.target=null;this.think=rnd(0,.4);
    this.roamPt=arenaSpot();this.roamPt.y=0;
    this.timer=0;this.reactT=0;this.strafeT=0;this.jumpT=0;this.msg='';this.msgT=0;
    this.tauntT=0;this.crouch=0;this.shopT=0;this.campT=0;this.chatT=rnd(5,25);
    this.anim=0;this.swing=0;
    // Phase 3: crouch-as-language + ally system
    this.crouchBurst=0;this.crouchBurstT=0;
    this.allyOf=null;this.allyT=0;
    this.watchTarget=null;this.watchT=0;
    this.safeExit=null;this.safeExitBest=Infinity;this.safeExitStuckT=0;
    this.healCommitted=false;this.healTarget=0;this.healHoldT=0;this.healCooldown=0;this.healSpot=null;
    this.postSafeT=0;this.postSafeThreat=null;
    this.idleT=0;this.lookT=0;this.lookTarget=null;this.crouchHoldT=0;this.crouchActionCooldown=0;this.crouchPropagate=false;
    this.assessT=0;this.coverT=0;this.coverPt=null;this.coverCooldown=0;this.roamSprint=Math.random()<0.15;
    this.lastCombat=-999;
    if(!this.isPlayer)this.buildModel();
  }
  // Phase 3: tap crouch as a social signal (1=greet, 2=team up, 3+=celebrate)
  crouchSignal(propagate=this.isPlayer){
    if(this.dead)return;
    this.crouchPropagate=this.crouchPropagate||propagate;
    this.crouch=1;this.crouchHoldT=Math.max(this.crouchHoldT||0,0.35);
    this.crouchBurst=(this.crouchBurst||0)+1;
    this.crouchBurstT=0.6;
    if(!this.isPlayer)drawTag(this);
  }
  buildModel(){
    if(this.parts)world.remove(this.parts.G);
    this.parts=buildFighterModel(this);
    this.tag=makeTag();
    this.parts.G.add(this.tag.sprite);
    this.wmesh=buildWeaponMesh(this.weapon.type.id,this.weapon.mat,0.9);
    this.parts.hand.add(this.wmesh);
    world.add(this.parts.G);
    drawTag(this);
  }
  refreshWeaponMesh(){
    if(this.isPlayer){buildViewModel();return;}
    if(this.wmesh)this.parts.hand.remove(this.wmesh);
    this.wmesh=buildWeaponMesh(this.weapon.type.id,this.weapon.mat,0.9);
    this.parts.hand.add(this.wmesh);
    drawTag(this);
  }
  say(text){
    this.msg=text;this.msgT=4;
    if(!this.isPlayer)drawTag(this);
    UI.chat(this.name,text,this.rank);
  }
  get eye(){return new THREE.Vector3(this.pos.x,this.pos.y+1.62,this.pos.z);}
  get dmg(){return this.weapon.type.dmg*this.weapon.mat.mult*(this.level?this.level.dmgMult:1);}
  get reach(){return this.weapon.type.reach;}
  get cooldown(){return this.weapon.type.cd*this.weapon.mat.cd;}
  forward(){return new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw));}

  attack(){
    if(this.atkCd>0||this.dead||safeDecisionLocked(this))return false;
    this.atkCd=this.cooldown;
    this.swing=1;
    S.swing();
    const crit=(!this.onGround&&this.vel.y<-0.6);
    const fwd=this.forward();
    let best=null,bestD=1e9;
    for(const t of fighters){
      if(t===this||t.dead)continue;
      if(inSafe(t.pos)||inSafe(this.pos)||safeLocked(t))continue;
      const dx=t.pos.x-this.pos.x,dz=t.pos.z-this.pos.z;
      const d=Math.hypot(dx,dz);
      if(d>this.reach+0.35)continue;
      if(t.pos.y>this.pos.y+2.1||t.pos.y+EH<this.pos.y-0.6)continue;
      const dot=(dx/d)*fwd.x+(dz/d)*fwd.z;
      if(dot<0.55)continue;
      if(d<bestD){bestD=d;best=t;}
    }
    if(best){
      let dmg=this.dmg*(crit?1.5:1);
      const kbBoost=this.sprinting?1.45:1;
      best.takeHit(dmg,this,crit,kbBoost);
      return true;
    }
    return false;
  }
  takeHit(dmg,from,crit,kbBoost){
    if(this.dead||inSafe(this.pos)||safeLocked(this))return;
    this.lastCombat=now();if(from)from.lastCombat=now();
    if(this.blocking)dmg*=0.42;
    dmg*=(1-ARMORS[this.armor].red);
    this.hp-=dmg;
    this.hurtT=0.25;
    if(!this.isPlayer)drawTag(this);
    // knockback
    const dx=this.pos.x-from.pos.x,dz=this.pos.z-from.pos.z;
    const d=Math.hypot(dx,dz)||1;
    const k=from.weapon.type.kb*kbBoost*(this.blocking?.5:1);
    this.vel.x+=(dx/d)*6.0*k;this.vel.z+=(dz/d)*6.0*k;
    this.vel.y=Math.max(this.vel.y,4.4*Math.min(k,1.5));
    this.onGround=false;
    particles(this.pos.clone().add(new THREE.Vector3(0,1.1,0)),crit?0xffffff:0xc0303a,crit?14:8);
    if(from.isPlayer){
      UI.hitmark();S[crit?'crit':'hit']();
      UI.popup(this.pos.clone().add(new THREE.Vector3(0,1.9,0)),(crit?'✧':'')+Math.round(dmg),crit?'#fff36b':'#ff8b8b');
    }
    if(this.isPlayer){UI.hurt();S.hurt();}
    // Phase 2: remember who hit us, Phase 1: mood reacts to being attacked
    if(!this.isPlayer&&from&&from!==this){
      const m=getMemory(this,from);
      m.trust=clamp(m.trust-(0.08+this.mood.anger*0.06),0,1);
      m.revenge=clamp(m.revenge+0.10*this.personality.revenge,0,1);
      m.timesFought++;m.lastSeen=now();
      this.mood.anger=clamp(this.mood.anger+0.22,0,1);
      this.mood.fear=clamp(this.mood.fear+0.05,0,1);
    }
    // Phase 6: nearby friends of the victim grow cold toward the attacker
    if(from&&from!==this)notifyWitnesses(this,from,0.45);
    // aggro flip: personalities still control whether a hit triggers immediate retaliation
    if(!this.isPlayer&&this.state!=='FLEE'){
      const retaliate=0.35+this.personality.aggression*0.35+this.mood.anger*0.25;
      if(Math.random()<clamp(retaliate,0,0.95)){this.target=from;this.state='FIGHT';this.reactT=this.react*.6;}
    }
    // Phase 3: allies rally to defend their friend when they're attacked
    if(from&&from!==this){
      for(const helper of fighters){
        if(helper===this||helper===from||helper.dead||helper.isPlayer)continue;
        if(helper.allyOf===this.id&&helper.allyT>0&&helper.state!=='FIGHT'&&helper.state!=='FLEE'&&!safeDecisionLocked(helper)){
          const d=helper.pos.distanceTo(this.pos);
          if(d<26&&Math.random()<0.5+helper.personality.friendliness*0.3){
            helper.target=from;helper.state=d<helper.reach+3.2?'FIGHT':'HUNT';helper.reactT=helper.react*0.5;
            if(Math.random()<0.5)helper.say(pick(CHAT.taunt));
          }
        }
      }
    }
    if(this.hp<=0)this.die(from);
  }
  die(by){
    if(this.dead)return;
    this.dead=true;this.deaths++;
    this.hp=0;
    particles(this.pos.clone().add(new THREE.Vector3(0,1,0)),this.shirt,26,true);
    if(this.parts)this.parts.G.visible=false;
    UI.kill(by,this);
    if(by&&by!==this){
      by.kills++;
      if(by.isPlayer){
        const r=ARENA.reward;
        const xp=Math.round((18+this.rank*14)*r), co=Math.round((14+this.rank*10)*r*rnd(.8,1.3));
        player.xp+=xp;player.coins+=co;
        UI.toast('+'+xp+' XP   +'+co+' ⛃');
        checkRank();UI.stats();
      }else{
        by.coins+=Math.round((16+this.rank*10)*ARENA.reward*rnd(.8,1.3));
        if(Math.random()<.55)by.say(pick(CHAT.kill));
        if(Math.random()<.35){by.state='TAUNT';by.tauntT=rnd(1.2,2.6);by.roamPt=this.pos.clone();}
      }
      // Phase 2: getting killed leaves a lasting grudge against the killer
      if(!this.isPlayer){
        const m=getMemory(this,by);
        m.revenge=clamp(m.revenge+0.30*this.personality.revenge+0.12,0,1);
        m.trust=clamp(m.trust-0.3,0,1);
        m.timesKilledMe++;m.lastSeen=now();
      }
      this.mood.anger=clamp(this.mood.anger+0.35,0,1);
      this.mood.fear=clamp(this.mood.fear+0.15,0,1);
      this.mood.confidence=clamp(this.mood.confidence-0.15,0,1);
      // Phase 2: onlookers who hold a grudge against the dead fighter might celebrate
      for(const other of fighters){
        if(other===this||other===by||other.dead||other.isPlayer)continue;
        const om=other.memory.get(this.id);
        if(om&&om.revenge>0.5&&Math.random()<0.12)other.say(pick(CHAT.celebrate));
      }
      // Phase 6: friends of the victim turn cold on the killer; co-fighters bond closer with the killer
      notifyWitnesses(this,by,1);
      for(const helper of fighters){
        if(helper===this||helper===by||helper.dead||helper.isPlayer)continue;
        if(helper.target===this){
          const mb=getMemory(helper,by);
          mb.trust=clamp(mb.trust+0.15,0,1);
          if(!by.isPlayer){const mby=getMemory(by,helper);mby.trust=clamp(mby.trust+0.15,0,1);}
          helper.allyOf=by.id;helper.allyT=Math.max(helper.allyT,rnd(45,90));
        }
      }
      // Phase 7: the kill ripples outward - friends grieve, the killer's friends get hyped, bystanders grow uneasy
      moodCascadeOnDeath(this,by);
      moodCascadeOnKill(by,this);
    }
    if(this.isPlayer){
      S.die();
      player.coins=Math.round(player.coins*0.9);
      saveProgress();
      UI.showDead(by?by.name:'the void');
    }else{
      if(Math.random()<.5)this.say(pick(CHAT.death));
      this.respawnT=rnd(2.6,6.0);
    }
    if(!this.isPlayer&&this.trialIndex!==undefined)checkTrialVictory();
  }
  respawn(){
    this.dead=false;this.hp=this.maxHp;
    this.pos.copy(arenaSpot());this.vel.set(0,0,0);
    this.state='ROAM';this.target=null;this.roamPt=arenaSpot();
    this.lastCombat=-999;
    this.healCommitted=false;this.healTarget=0;this.healHoldT=0;this.healCooldown=0;this.healSpot=null;
    this.safeExit=null;this.safeExitBest=Infinity;this.safeExitStuckT=0;this.postSafeT=0;this.postSafeThreat=null;
    if(this.parts){this.parts.G.visible=true;drawTag(this);}
    // sometimes "a new player joins" instead - fresh identity, clean slate, new archetype
    if(!this.isPlayer&&Math.random()<0.18){
      this.name=genName();
      this.level=pick(NPC_LEVELS);this.skill=rollLevelSkill(this.level);
      this.maxHp=this.baseHp*this.level.hpMult;this.hp=this.maxHp;
      this.archetype=pick(ARCHETYPES);
      this.personality=rollPersonality(this.archetype);
      this.personality.skill=this.skill;
      this.aggro=this.personality.aggression;this.greed=this.personality.greed;
      this.react=lerp(.42,.11,this.skill);
      this.mood={fear:(1-this.personality.bravery)*0.3,anger:0,confidence:this.personality.confidence,excitement:0.1};
      this.memory=new Map();
      this.allyOf=null;this.allyT=0;
      UI.feed(`§7${this.name} joined the arena${this.archetype?' '+this.archetype.icon:''}`);
      drawTag(this);
    }
  }
  /* ---------- movement helper used by AI + player ---------- */
  applyMove(wishX,wishZ,dt,speedMul=1){
    let sp=(this.sprinting?5.75:4.35)*speedMul*(this.level?this.level.speedMul:1);
    if(this.blocking)sp*=0.42;
    const len=Math.hypot(wishX,wishZ);
    if(len>0.001){
      wishX/=len;wishZ/=len;
      const accel=this.onGround?42:9;
      this.vel.x+=wishX*sp*accel*dt;
      this.vel.z+=wishZ*sp*accel*dt;
      const h=Math.hypot(this.vel.x,this.vel.z);
      const cap=sp*(this.onGround?1:1.28);
      if(h>cap){this.vel.x*=cap/h;this.vel.z*=cap/h;}
    }
    if(this.onGround){
      const f=Math.pow(0.0022,dt);
      this.vel.x*=f;this.vel.z*=f;
    }else{
      const f=Math.pow(0.55,dt);
      this.vel.x*=f;this.vel.z*=f;
    }
    this.anim+=Math.hypot(this.vel.x,this.vel.z)*dt*2.1;
  }
  jump(){if(this.onGround){this.vel.y=JUMPV;this.onGround=false;}}

  updateVisual(dt){
    if(!this.parts||this.dead)return;
    const P=this.parts;
    P.G.position.set(this.pos.x,this.pos.y,this.pos.z);
    P.G.rotation.y=this.yaw;
    const sway=Math.sin(this.anim*2)*0.75;
    const sp=Math.min(Math.hypot(this.vel.x,this.vel.z)/5,1.3);
    P.legL.rotation.x=sway*sp;P.legR.rotation.x=-sway*sp;
    P.armL.rotation.x=-sway*sp*0.7;
    P.head.rotation.x=clamp(this.pitch,-.6,.6);
    // swing anim
    if(this.swing>0){this.swing=Math.max(0,this.swing-dt*4.2);}
    const sw=Math.sin(this.swing*Math.PI);
    P.armR.rotation.x=-sway*sp*0.7-sw*2.1;
    P.armR.rotation.z=sw*0.5;
    if(this.blocking){P.armR.rotation.x=-1.35;P.armL.rotation.x=-1.1;}
    // crouch spam / taunt
    const c=this.crouch;
    P.G.scale.y=1-c*0.22;
    // hurt flash
    const flash=this.hurtT>0;
    P.torso.material.color.setHex(flash?0xff5555:(ARMORS[this.armor].red>0?ARMORS[this.armor].col:this.shirt));
    if(this.msgT>0){this.msgT-=dt;if(this.msgT<=0)drawTag(this);}
    if(this.hurtT>0){this.hurtT-=dt;if(this.hurtT<=0)drawTag(this);}
    // tag faces camera automatically (sprite)
  }
}

/* ============================================================ PARTICLES */
const pPool=[];
function particles(pos,color,n,big=false){
  for(let i=0;i<n;i++){
    let p=pPool.find(q=>!q.alive);
    if(!p){
      if(pPool.length>150)return;
      const g=new THREE.BoxGeometry(1,1,1),m=new THREE.MeshBasicMaterial();
      p={mesh:new THREE.Mesh(g,m),vel:new THREE.Vector3(),life:0,alive:false};
      scene.add(p.mesh);pPool.push(p);
    }
    p.alive=true;p.life=rnd(.3,.8);
    const s=big?rnd(.09,.19):rnd(.05,.13);
    p.mesh.scale.setScalar(s);p.mesh.visible=true;
    p.mesh.material.color.setHex(color);
    p.mesh.position.copy(pos);
    p.vel.set(rnd(-3,3),rnd(1,6),rnd(-3,3));
  }
}
function updateParticles(dt){
  for(const p of pPool){
    if(!p.alive)continue;
    p.life-=dt;
    if(p.life<=0){p.alive=false;p.mesh.visible=false;continue;}
    p.vel.y-=22*dt;
    p.mesh.position.addScaledVector(p.vel,dt);
    if(p.mesh.position.y<0.05){p.mesh.position.y=0.05;p.vel.y*=-0.3;p.vel.x*=.7;p.vel.z*=.7;}
    p.mesh.rotation.x+=dt*6;p.mesh.rotation.y+=dt*5;
  }
}

/* ============================================================ AI  (human-feeling) */
/* ---- Phase 2: memory & relationships ---- */
function getMemory(f,target){
  let m=f.memory.get(target.id);
  if(!m){
    // Phase 6: first impressions are colored by faction affinity between archetypes
    const aff=archetypeAffinity(f,target);
    m={trust:clamp(0.3+f.personality.trust*0.4+aff*0.5,0,1),revenge:0,timesFought:0,timesIKilled:0,timesKilledMe:0,lastSeen:now()};
    f.memory.set(target.id,m);
  }
  return m;
}
// strongest grudge this fighter is currently holding against someone alive & reachable
function findGrudge(f){
  let best=null,bestRev=0.001;
  for(const [id,m] of f.memory){
    if(m.revenge<=bestRev)continue;
    const t=fighters.find(x=>x.id===id);
    if(t&&!t.dead&&!inSafe(t.pos)&&!safeDecisionLocked(t)){bestRev=m.revenge;best=t;}
  }
  return best;
}
/* ---- Phase 3: crouch language, fight-watching, ally rallying ---- */
function socialCrouch(f,source){
  f.state='IDLE';f.idleT=rnd(.65,1.25);f.lookTarget=source;f.target=null;f.sprinting=false;
  f.vel.x*=0.25;f.vel.z*=0.25;f.crouchActionCooldown=rnd(2.5,5);f.crouchSignal();
}
function broadcastCrouch(f,taps){
  if(safeDecisionLocked(f))return;
  // Phase 8: crouch bursts form a small emote language - meaning depends on tap count + context
  const kind=taps>=5?'mock':taps===4?'respect':taps===3?'celebrate':taps===2?'team':(f.state==='FLEE'||f.state==='PEACE')?'peace':'greet';
  if(f.isPlayer){
    const msgs={
      greet:'§7You crouch — friendly greeting',
      peace:'§7You crouch while backing away — offering peace',
      team:'§7You crouch twice — proposing to team up',
      celebrate:'§7You crouch repeatedly — celebrating',
      respect:'§7You crouch 4x — showing respect (gg)',
      mock:'§7You spam crouch — taunting/mocking'
    };
    UI.feed(msgs[kind]);
  }else{
    if(kind==='mock'&&Math.random()<0.5)f.say(pick(CHAT.mock));
    else if(kind==='respect'&&Math.random()<0.4)f.say(pick(CHAT.respect));
  }
  for(const o of fighters){
    if(o===f||o.dead||o.isPlayer||safeDecisionLocked(o))continue;
    if(f.pos.distanceTo(o.pos)>9)continue;
    const m=getMemory(o,f);
    if(kind==='greet'){
      m.trust=clamp(m.trust+0.06,0,1);
      if(o.crouchBurstT<=0&&o.state!=='FIGHT'&&o.state!=='FLEE'&&Math.random()<0.35+o.personality.friendliness*0.4)socialCrouch(o,f);
    }else if(kind==='peace'){
      m.trust=clamp(m.trust+0.12,0,1);
      if(o.target===f&&(o.state==='HUNT'||o.state==='FIGHT')){
        const standDown=0.15+o.personality.friendliness*0.4-o.personality.aggression*0.2;
        if(Math.random()<clamp(standDown,0.05,0.75)){
          o.state='ROAM';o.target=null;o.roamPt=arenaSpot();
          if(o.crouchBurstT<=0)socialCrouch(o,f);
        }
      }
    }else if(kind==='team'){
      m.trust=clamp(m.trust+0.1,0,1);
      const wantAlly=o.personality.friendliness*0.6+m.trust*0.4;
      if(wantAlly>0.55&&o.state!=='FIGHT'&&o.state!=='FLEE'){
        o.allyOf=f.id;o.allyT=rnd(30,60);
        if(o.crouchBurstT<=0)socialCrouch(o,f);
        if(Math.random()<0.4)o.say(pick(CHAT.idle));
      }
    }else if(kind==='respect'){
      m.trust=clamp(m.trust+0.15,0,1);
      m.revenge=clamp(m.revenge-0.15,0,1);
      if(o.crouchBurstT<=0&&Math.random()<0.5)socialCrouch(o,f);
    }else if(kind==='mock'){
      m.trust=clamp(m.trust-0.15,0,1);
      const offended=o.personality.confidence*0.5+o.personality.aggression*0.5;
      if(offended>0.5&&Math.random()<offended*0.6&&o.state!=='FIGHT'&&o.state!=='FLEE'&&!safeDecisionLocked(o)&&!safeDecisionLocked(f)&&!inSafe(o.pos)&&!inSafe(f.pos)){
        m.revenge=clamp(m.revenge+0.25,0,1);
        o.target=f;o.state=f.pos.distanceTo(o.pos)<o.reach+3.2?'FIGHT':'HUNT';o.reactT=o.react*0.5;
        if(Math.random()<0.6)o.say(pick(CHAT.taunt));
      }
    }else{
      m.trust=clamp(m.trust+0.03,0,1);
      if(o.crouchBurstT<=0&&Math.random()<0.3+o.personality.social*0.3)socialCrouch(o,f);
    }
  }
}
function resolveCrouchSignals(dt){
  for(const f of fighters){
    if(f.crouchBurstT>0){
      f.crouchBurstT-=dt;
      if(f.crouchBurstT<=0){
        const n=f.crouchBurst,propagate=f.crouchPropagate;f.crouchBurst=0;f.crouchPropagate=false;
        if(propagate)broadcastCrouch(f,n);
      }
    }
  }
}
// is anyone (other than f) currently mid-fight nearby? returns the attacker fighter
function nearbyFight(f,range=22){
  for(const a of fighters){
    if(a===f||a.dead||safeDecisionLocked(a)||a.state!=='FIGHT'||!a.target||a.target.dead||safeDecisionLocked(a.target))continue;
    if(f.pos.distanceTo(a.pos)<range)return a;
  }
  return null;
}
/* ---- Phase 6: relationship chains - friends of a victim turn cold on the attacker ---- */
function notifyWitnesses(victim,attacker,severity=1){
  if(!attacker||attacker===victim)return;
  for(const w of fighters){
    if(w===victim||w===attacker||w.dead||w.isPlayer)continue;
    if(w.pos.distanceTo(victim.pos)>20)continue;
    const wv=w.memory.get(victim.id);
    if(!wv||wv.trust<0.6)continue; // only friends of the victim care
    const wa=getMemory(w,attacker);
    const loyalty=wa.trust>0.6?0.3:1; // dampened if w already likes the attacker too
    const hit=(0.06+w.personality.friendliness*0.14)*severity*loyalty;
    wa.trust=clamp(wa.trust-hit,0,1);
    wa.revenge=clamp(wa.revenge+hit*(0.5+w.personality.revenge*0.6),0,1);
  }
}
/* ---- Phase 7: mood cascades - emotions ripple through nearby fighters ---- */
function moodCascadeOnDeath(victim,by){
  for(const w of fighters){
    if(w===victim||w.dead||w.isPlayer)continue;
    const d=w.pos.distanceTo(victim.pos);
    if(d>22)continue;
    const wv=w.memory.get(victim.id);
    if(wv&&wv.trust>0.6){
      w.mood.anger=clamp(w.mood.anger+0.35,0,1);
      w.mood.fear=clamp(w.mood.fear+0.2,0,1);
      w.mood.confidence=clamp(w.mood.confidence-0.1,0,1);
    }else if(d<12){
      w.mood.fear=clamp(w.mood.fear+0.06*(1-w.personality.bravery),0,1);
    }
  }
}
function moodCascadeOnKill(by,victim){
  if(!by)return;
  for(const w of fighters){
    if(w===by||w.dead||w.isPlayer)continue;
    if(w.pos.distanceTo(by.pos)>18)continue;
    const wb=w.memory.get(by.id);
    if(wb&&wb.trust>0.6){
      w.mood.confidence=clamp(w.mood.confidence+0.15,0,1);
      w.mood.excitement=clamp(w.mood.excitement+0.2,0,1);
    }
  }
}
// fighters actively fleeing spread fear to nearby low-bravery bystanders
function cascadeFear(f,dt){
  if(f.state!=='FLEE')return;
  for(const o of fighters){
    if(o===f||o.dead||o.isPlayer||safeDecisionLocked(o)||o.state==='FLEE'||o.state==='FIGHT')continue;
    if(f.pos.distanceTo(o.pos)>10)continue;
    const susceptibility=(1-o.personality.bravery)*0.5+0.05;
    o.mood.fear=clamp(o.mood.fear+susceptibility*dt*0.6,0,1);
  }
}
/* ---- Phase 1: mood drifts around personality baseline each tick ---- */
function updateMood(f,dt){
  const p=f.personality;
  f.mood.fear=lerp(f.mood.fear,(1-p.bravery)*0.3,1-Math.exp(-dt*0.5));
  f.mood.anger=lerp(f.mood.anger,0,1-Math.exp(-dt*0.35));
  f.mood.confidence=lerp(f.mood.confidence,p.confidence,1-Math.exp(-dt*0.4));
  const wantExcite=(f.state==='FIGHT'||f.state==='HUNT')?0.6:0.1;
  f.mood.excitement=lerp(f.mood.excitement,wantExcite,1-Math.exp(-dt*0.6));
}
function nearestEnemy(f,maxD=1e9){
  let best=null,score=1e9;
  for(const t of fighters){
    if(t===f||t.dead||inSafe(t.pos)||safeDecisionLocked(t))continue;
    const d=f.pos.distanceTo(t.pos);
    if(d>maxD)continue;
    // humans third-party low-hp targets & prefer close ones
    let s=d*(0.55+t.hp/t.maxHp*0.9);
    if(t.isPlayer)s*=lerp(1.25,0.75,f.aggro);
    const mem=f.memory.get(t.id);
    if(mem){
      if(mem.revenge>0.15)s*=lerp(1,0.4,mem.revenge); // grudges pull attention
      else if(mem.trust>0.75)s*=1.25;                 // less eager to fight friends
    }
    // Phase 6: rival factions are juicier targets, allied factions less appealing
    const aff=archetypeAffinity(f,t);
    if(aff<-0.05)s*=lerp(1,0.75,clamp(-aff,0,1));
    else if(aff>0.05)s*=lerp(1,1.3,clamp(aff,0,1));
    if(s<score){score=s;best=t;}
  }
  return best;
}
function upgradeCost(f){
  // best affordable upgrade path
  let best=null;
  for(const ty of TYPES)for(const mt of MATS){
    if(mt.rank>f.rank)continue;
    const cost=Math.round(ty.cost*mt.cost);
    const power=ty.dmg*mt.mult/ (ty.cd*mt.cd) + ty.reach*0.7;
    const cur=f.weapon.type.dmg*f.weapon.mat.mult/(f.weapon.type.cd*f.weapon.mat.cd)+f.weapon.type.reach*0.7;
    if(power>cur*1.06&&(!best||cost<best.cost))best={type:ty,mat:mt,cost};
  }
  return best;
}
// Phase 4: how many hostiles are nearby right now (being outnumbered matters)
function nearbyThreatCount(f,range=16){
  let n=0;
  for(const t of fighters){
    if(t===f||t.dead||inSafe(t.pos)||safeDecisionLocked(t))continue;
    if(f.pos.distanceTo(t.pos)<range)n++;
  }
  return n;
}
function findCoverPoint(f,threat){
  if(!threat)return null;
  let best=null,bestScore=Infinity;
  for(const b of COLL){
    const w=b.x1-b.x0,d=b.z1-b.z0;
    if(w>20||d>20)continue;
    const cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
    if(cx>SAFE.x0-2&&cx<SAFE.x1+2&&cz>SAFE.z0-2&&cz<SAFE.z1+2)continue;
    const fd=Math.hypot(cx-f.pos.x,cz-f.pos.z);
    if(fd>18)continue;
    let dx=cx-threat.pos.x,dz=cz-threat.pos.z,len=Math.hypot(dx,dz)||1;
    dx/=len;dz/=len;
    const pad=Math.max(w,d)/2+1.2;
    const p=new THREE.Vector3(clamp(cx+dx*pad,-HALF+2,HALF-2),0,clamp(cz+dz*pad,-HALF+2,HALF-2));
    if(inSafe(p)||hitsWorld(p))continue;
    const score=fd+threat.pos.distanceTo(p)*0.08;
    if(score<bestScore){bestScore=score;best=p;}
  }
  return best;
}
function aiThink(f){
  f.think=(f.state==='FIGHT'||f.state==='HUNT')?rnd(.18,.42):rnd(.5,1.25);
  const hpFrac=f.hp/f.maxHp;

  if(f.state==='IDLE'||f.state==='ASSESS'||f.state==='COVER'||f.state==='WATCH'||f.state==='PEACE')return;

  if(f.state==='SHOP'||f.state==='TAUNT')return;

  // flee decision (skill + bravery threshold, current fear mood + being outnumbered tips it further)
  const threat=nearbyThreatCount(f,16);
  const fleeAt=lerp(0.36,0.16,f.skill*0.55+f.personality.bravery*0.45)*(1+f.mood.fear*0.5)*(f.aggro<0.4?1.15:1)*(threat>1?1+(threat-1)*0.18:1);
  if(hpFrac<fleeAt&&f.state!=='FLEE'&&f.healCooldown<=0){
    beginRetreat(f);
    if(Math.random()<.5)f.say(pick(CHAT.low));
    return;
  }
  // Phase 7: contagious panic - fear picked up from fleeing neighbors can trigger a flee on its own
  if(f.state!=='FLEE'&&f.state!=='FIGHT'&&f.healCooldown<=0&&f.mood.fear>0.72&&f.personality.bravery<0.5&&Math.random()<0.35){
    beginRetreat(f);
    if(Math.random()<.5)f.say(pick(CHAT.low));
    return;
  }
  if(f.state==='FLEE')return;

  // Tactical fighters sometimes disengage briefly to nearby cover instead of blindly trading hits.
  if(f.state==='FIGHT'&&f.target&&f.hp/f.maxHp<0.6&&f.skill>0.52&&f.personality.confidence>0.48&&f.coverCooldown<=0){
    const cover=findCoverPoint(f,f.target);
    if(cover&&Math.random()<0.3){f.coverPt=cover;f.coverT=rnd(2,4);f.coverCooldown=rnd(7,12);f.state='COVER';return;}
  }

  // Phase 2: grudges override normal targeting - revenge-driven fighters hunt across the map
  const grudge=findGrudge(f);
  if(grudge&&f.personality.revenge>0.3){
    const gd=f.pos.distanceTo(grudge.pos);
    if(gd<55){
      if(f.target!==grudge&&Math.random()<0.7)f.say(pick(CHAT.revenge));
      f.target=grudge;
      f.state=gd<f.reach+3.2?'FIGHT':'HUNT';
      f.reactT=f.react*.7;
      return;
    }
  }

  // Phase 3: notice fights happening nearby and react like a real bystander would
  if(f.state==='ROAM'){
    const brawler=nearbyFight(f);
    if(brawler){
      const foe=brawler.target;
      // Phase 6: faction affinity colors first impressions even before any direct history
      const memBrawler=getMemory(f,brawler);
      const memFoe=getMemory(f,foe);
      const likesBrawler=(memBrawler&&memBrawler.trust>0.65)||f.allyOf===brawler.id;
      const likesFoe=(memFoe&&memFoe.trust>0.65)||f.allyOf===foe.id;
      const hatesBrawler=memBrawler&&memBrawler.revenge>0.4;
      const hatesFoe=memFoe&&memFoe.revenge>0.4;
      // Phase 4: peacemakers (high friendliness, near-zero aggression) try to break up fights they have no stake in
      if(f.personality.friendliness>0.82&&f.personality.aggression<0.16&&!hatesBrawler&&!hatesFoe&&Math.random()<0.12){
        f.state='PEACE';f.watchTarget=brawler;f.watchT=rnd(4,8);
        return;
      }
      let joinTarget=null;
      if(hatesFoe||likesBrawler)joinTarget=foe;
      else if(hatesBrawler||likesFoe)joinTarget=brawler;
      if(joinTarget&&f.personality.friendliness+f.personality.aggression>0.82&&Math.random()<0.62){
        f.target=joinTarget;f.state=f.pos.distanceTo(joinTarget.pos)<f.reach+3.2?'FIGHT':'HUNT';f.reactT=f.react*.7;
        return;
      }
      // loot gremlin: greedy fighters swoop in to steal a near-death kill
      if(f.personality.greed>0.65){
        const weakSide=brawler.hp<foe.hp?brawler:foe;
        if(weakSide.hp/weakSide.maxHp<0.35&&Math.random()<f.personality.greed*0.7){
          f.target=weakSide;f.state=f.pos.distanceTo(weakSide.pos)<f.reach+3.2?'FIGHT':'HUNT';f.reactT=f.react*.5;
          return;
        }
      }
      // cowardly fighters steer clear of trouble
      if(f.personality.bravery<0.35&&Math.random()<0.15){
        f.roamPt=arenaSpot();
        return;
      }
      // social fighters like to gather and watch
      if(f.personality.social>0.72&&Math.random()<0.025){
        f.state='WATCH';f.watchTarget=brawler;f.watchT=rnd(3,7);
        return;
      }
    }
  }

  // Calm/social NPCs regularly pause instead of constantly seeking another action.
  if(f.state==='ROAM'&&Math.random()<0.04+(1-f.personality.aggression)*0.08){
    f.state='IDLE';f.idleT=rnd(.7,2.4)*(1.1-f.personality.aggression*0.25);
    f.lookTarget=nearestEnemy(f,16);f.target=null;return;
  }

  const t=nearestEnemy(f,46);
  if(!t){f.state='IDLE';f.idleT=rnd(.7,2.2);f.lookTarget=null;f.target=null;return;}
  const d=f.pos.distanceTo(t.pos);
  const mem=f.memory.get(t.id);
  const hostile=!!(mem&&mem.revenge>0.35);
  const willingness=clamp(.24+f.personality.aggression*0.56+f.mood.anger*0.2+f.personality.confidence*0.12+(1-t.hp/t.maxHp)*f.personality.greed*0.15-(mem&&mem.trust>0.65?0.38:0),0,1);
  if(f.target!==t){f.target=t;f.reactT=f.react*rnd(.8,1.6);}
  if(d<f.reach+4.5){
    f.state='ASSESS';f.assessT=hostile?rnd(.15,.45):rnd(.45,1.8)*(1.2-f.personality.aggression*.45);
  }else if(d<42&&Math.random()<(hostile?0.98:willingness)){
    f.state='HUNT';
  }else{
    f.state='IDLE';f.idleT=rnd(.8,2.8);f.lookTarget=t;f.target=null;
  }
}
function aiAct(f,dt){
  updateMood(f,dt);
  // out-of-combat regen: no damage dealt or taken for 7s -> slowly heal back up
  if(!f.dead&&!f.noRegen&&f.hp<f.maxHp&&now()-f.lastCombat>7){
    f.hp=Math.min(f.maxHp,f.hp+f.maxHp*0.06*dt);
  }
  let wx=0,wz=0,wantJump=false;
  f.sprinting=false;f.blocking=false;
  f.crouchHoldT=Math.max(0,f.crouchHoldT-dt);
  f.crouch=f.crouchHoldT>0?1:Math.max(0,f.crouch-dt*5);
  f.strafeT-=dt;f.jumpT-=dt;f.reactT-=dt;f.chatT-=dt;
  f.healCooldown=Math.max(0,f.healCooldown-dt);f.coverCooldown=Math.max(0,f.coverCooldown-dt);f.crouchActionCooldown=Math.max(0,f.crouchActionCooldown-dt);
  // Phase 3: ally bond fades over time
  if(f.allyT>0){f.allyT-=dt;if(f.allyT<=0)f.allyOf=null;}
  // social trait: chatty NPCs chime in more often
  if(f.chatT<=0&&!safeDecisionLocked(f)){
    f.chatT=rnd(14,50)-f.personality.social*10;
    if(Math.random()<.3+f.personality.social*.3)f.say(pick(Math.random()<.5?CHAT.idle:CHAT.taunt));
  }

  const goTo=(p,sprint=true)=>{
    const dx=p.x-f.pos.x,dz=p.z-f.pos.z,d=Math.hypot(dx,dz);
    if(d>0.4){wx=dx/d;wz=dz/d;f.aimYaw=Math.atan2(-dx,-dz);f.sprinting=sprint&&d>2.2;}
    return d;
  };

  switch(f.state){
    case 'ROAM':{
      const d=goTo(f.roamPt,f.roamSprint);
      if(d<1.5){
        // Phase 4: buddy system - trusted allies/friends tend to wander together
        let buddy=f.allyOf?fighters.find(x=>x.id===f.allyOf&&!x.dead):null;
        if(!buddy){
          for(const [id,m] of f.memory){
            if(m.trust>0.78){const c=fighters.find(x=>x.id===id);if(c&&!c.dead){buddy=c;break;}}
          }
        }
        if(buddy&&f.pos.distanceTo(buddy.pos)>6&&Math.random()<0.4){
          const ang=rnd(0,Math.PI*2);
          f.roamPt=new THREE.Vector3(buddy.pos.x+Math.cos(ang)*3,0,buddy.pos.z+Math.sin(ang)*3);
        }else{
          f.roamPt=arenaSpot();
        }
        f.roamSprint=Math.random()<0.12+f.personality.aggression*0.18;
      }
      // bunny-hop like a bored player
      if(f.onGround&&f.jumpT<=0&&Math.random()<0.02){wantJump=true;f.jumpT=rnd(.25,1.6);}
      break;}
    case 'HUNT':{
      if(!f.target||f.target.dead||safeDecisionLocked(f.target)){f.state='ROAM';f.target=null;break;}
      const d=f.pos.distanceTo(f.target.pos);
      const sprint=d>8&&(f.personality.aggression>0.48||f.mood.anger>0.45);
      goTo(f.target.pos,sprint);
      if(f.onGround&&f.jumpT<=0&&sprint&&Math.random()<0.018){wantJump=true;f.jumpT=rnd(.5,1.4);}
      break;}
    case 'IDLE':{
      f.idleT-=dt;f.lookT-=dt;
      if(f.lookTarget&&!f.lookTarget.dead&&!safeDecisionLocked(f.lookTarget)){
        const dx=f.lookTarget.pos.x-f.pos.x,dz=f.lookTarget.pos.z-f.pos.z;
        f.aimYaw=Math.atan2(-dx,-dz);
        const d=Math.hypot(dx,dz);
        if(!f.idleGreeted&&d<7&&f.personality.friendliness>0.65&&Math.random()<dt*0.45){
          f.idleGreeted=true;f.crouchSignal();
        }
      }else if(f.lookT<=0){
        f.aimYaw+=rnd(-1.2,1.2);f.lookT=rnd(.7,2.2);
      }
      if(f.idleT<=0){f.state='ROAM';f.roamPt=arenaSpot();f.roamSprint=false;f.lookTarget=null;f.idleGreeted=false;}
      break;}
    case 'ASSESS':{
      const t=f.target;
      if(!t||t.dead||safeDecisionLocked(t)){f.state='IDLE';f.idleT=rnd(1,2.5);f.lookTarget=null;f.target=null;break;}
      const dx=t.pos.x-f.pos.x,dz=t.pos.z-f.pos.z,d=Math.hypot(dx,dz)||.001;
      f.aimYaw=Math.atan2(-dx,-dz);f.assessT-=dt;
      if(d>7)goTo(t.pos,false);
      if(f.assessT<=0){
        const mem=f.memory.get(t.id);
        const hostile=!!(mem&&mem.revenge>0.35);
        const willingness=clamp(.28+f.personality.aggression*.58+f.mood.anger*.22+f.personality.confidence*.12-(mem&&mem.trust>.65?.38:0),0,1);
        if(hostile||Math.random()<willingness){f.state=d<f.reach+3.2?'FIGHT':'HUNT';f.reactT=f.react*rnd(.8,1.4);}
        else{
          if(d<7&&f.personality.friendliness>.62&&f.crouchBurstT<=0)f.crouchSignal();
          f.state='IDLE';f.idleT=rnd(1.2,3.5);f.lookTarget=t;f.target=null;f.idleGreeted=true;
        }
      }
      break;}
    case 'COVER':{
      const t=f.target;
      if(!f.coverPt||!t||t.dead||safeDecisionLocked(t)){f.state='ROAM';f.target=null;f.roamPt=arenaSpot();break;}
      const d=goTo(f.coverPt,false);f.coverT-=dt;
      if(d<1.2){
        wx=0;wz=0;f.sprinting=false;f.crouchHoldT=Math.max(f.crouchHoldT,.2);
        f.aimYaw=Math.atan2(-(t.pos.x-f.pos.x),-(t.pos.z-f.pos.z));
      }
      if(f.coverT<=0){
        f.coverPt=null;
        if(f.hp/f.maxHp<0.35&&f.healCooldown<=0)beginRetreat(f);
        else{f.state='ASSESS';f.assessT=rnd(.5,1.4);}
      }
      break;}
    case 'FIGHT':{
      const t=f.target;
      if(!t||t.dead||inSafe(t.pos)||safeLocked(t)){f.state='ROAM';f.target=null;break;}
      const dx=t.pos.x-f.pos.x,dz=t.pos.z-f.pos.z,d=Math.hypot(dx,dz)||.001;
      // aim (with human error + reaction)
      const err=(1-f.skill)*0.28*Math.sin(now()*rnd(1.5,3)+f.id);
      f.aimYaw=Math.atan2(-dx,-dz)+err;
      f.pitch=clamp(Math.atan2((f.pos.y+1.5)-(t.pos.y+1.4),d)*-1,-.5,.5);
      const ideal=f.reach*0.78;
      const fx=-dx/d,fz=-dz/d; // away from target
      // spacing
      if(d>ideal+0.35){wx=-fx;wz=-fz;f.sprinting=d>ideal+1.5;}
      else if(d<ideal-0.7){wx=fx*0.8;wz=fz*0.8;}
      // strafe circle
      if(f.strafeT<=0){f.strafeT=rnd(.5,1.9);if(Math.random()<.45)f.strafeDir*=-1;}
      wx+=(-fz)*f.strafeDir*0.85;wz+=(fx)*f.strafeDir*0.85;
      // jump crit
      if(f.onGround&&f.jumpT<=0&&d<f.reach*1.05&&Math.random()<0.55*f.skill+0.1){
        wantJump=true;f.jumpT=rnd(.45,1.1);
      }
      // sprint-reset (stop sprint right before hitting) — pro behaviour
      if(d<f.reach*0.9&&f.skill>0.55&&Math.random()<0.5)f.sprinting=false;
      // block when hurt & on cooldown
      if(f.atkCd>0.12&&f.hp/f.maxHp<0.65&&Math.random()<0.35*f.skill)f.blocking=true;
      // attack (Phase 4: friendly fighters may show mercy on a near-dead foe they have no grudge with)
      if(f.reactT<=0&&f.atkCd<=0&&d<f.reach*0.98){
        const mem=f.memory.get(t.id);
        const grudgeHeld=mem&&mem.revenge>0.4;
        const showMercy=!grudgeHeld&&f.personality.friendliness>0.72&&t.hp/t.maxHp<0.12&&Math.random()<f.personality.friendliness*0.16;
        if(showMercy){
          wx=0;wz=0;f.sprinting=false;
          if(f.crouchBurstT<=0)f.crouchSignal();
          f.state='ASSESS';f.assessT=rnd(.7,1.3);f.reactT=rnd(.6,1.1);
        }else{
        const missChance=clamp((1-f.skill)*0.35-(f.mood.confidence-0.5)*0.08,0.03,0.9);
        if(Math.random()>missChance){f.yaw=f.aimYaw;}   // snap aim on commit
        f.attack();
        if(Math.random()<0.35){ // w-tap forward pressure
          f.vel.x+=(-fx)*2.2;f.vel.z+=(-fz)*2.2;
        }
        }
      }
      break;}
    case 'FLEE':{
      cascadeFear(f,dt);
      const d=goTo(f.roamPt,true);f.timer-=dt;f.sprinting=true;
      if(f.onGround&&f.jumpT<=0&&Math.random()<0.05){wantJump=true;f.jumpT=rnd(.4,1);}
      if(f.target&&!f.target.dead&&Math.random()<0.025)f.aimYaw=Math.atan2(-(f.target.pos.x-f.pos.x),-(f.target.pos.z-f.pos.z));
      if(d<1.2||f.timer<=0){f.state='IDLE';f.idleT=rnd(.6,1.5);f.lookTarget=f.target;f.target=null;}
      break;}
    case 'SHOP':{
      const d=goTo(SHOP_POS,false);
      if(d<2.2){
        f.shopT-=dt;
        f.aimYaw=Math.atan2(-(SHOP_POS.x-f.pos.x),-(SHOP_POS.z-f.pos.z));
        if(f.crouchHoldT<=0&&Math.random()<dt*0.12)f.crouchHoldT=0.4; // stationary browsing crouch
        if(f.shopT<=0){
          const up=f.pendingBuy;
          if(up&&f.coins>=up.cost){
            f.coins-=up.cost;f.weapon={type:up.type,mat:up.mat};f.refreshWeaponMesh();
            if(Math.random()<.6)f.say(pick(CHAT.buy));
          }
          // sometimes armor instead
          if(f.armor<ARMORS.length-1){
            const a=ARMORS[f.armor+1];
            if(a.rank<=f.rank&&f.coins>=a.cost){f.coins-=a.cost;f.armor++;f.refreshWeaponMesh();}
          }
          f.state='ROAM';f.roamPt=arenaSpot();f.pendingBuy=null;f.campT=0;
        }
      }
      break;}
    case 'TAUNT':{
      const d=goTo(f.roamPt,false);
      f.tauntT-=dt;
      if(d<2){f.crouch=(Math.sin(now()*16)>0)?1:0;}
      if(f.tauntT<=0){f.state='ROAM';f.roamPt=arenaSpot();}
      break;}
    case 'WATCH':{
      const wt=f.watchTarget;
      if(!wt||wt.dead||wt.state!=='FIGHT'){f.state='ROAM';f.roamPt=arenaSpot();break;}
      const dx=wt.pos.x-f.pos.x,dz=wt.pos.z-f.pos.z,d=Math.hypot(dx,dz)||.001;
      f.watchT-=dt;
      if(d>12){wx=dx/d;wz=dz/d;f.aimYaw=Math.atan2(-dx,-dz);}
      else{
        f.aimYaw=Math.atan2(-dx,-dz);
        if(f.crouchBurstT<=0&&f.crouchActionCooldown<=0&&Math.random()<dt*0.08){f.crouchActionCooldown=rnd(3,6);f.crouchSignal();}
      }
      if(f.watchT<=0){f.state='ROAM';f.roamPt=arenaSpot();}
      break;}
    case 'PEACE':{
      // Phase 4: walk toward the pair, crouch-spam a plea for them to stop, never attack first
      const a=f.watchTarget,b=a?a.target:null;
      if(!a||a.dead||!b||b.dead||a.state!=='FIGHT'){f.state='ROAM';f.roamPt=arenaSpot();break;}
      const mx=(a.pos.x+b.pos.x)/2,mz=(a.pos.z+b.pos.z)/2;
      const dx=mx-f.pos.x,dz=mz-f.pos.z,d=Math.hypot(dx,dz)||.001;
      f.watchT-=dt;
      if(d>4.5){wx=dx/d;wz=dz/d;}
      f.aimYaw=Math.atan2(-dx,-dz);
      if(d<=4.5&&f.crouchBurstT<=0&&f.crouchActionCooldown<=0&&Math.random()<dt*0.18){f.crouchActionCooldown=rnd(2.5,5);f.crouchSignal();}
      if(f.watchT<=0){f.state='ROAM';f.roamPt=arenaSpot();}
      break;}
  }
  // stuck-handling only while intentionally moving; idle NPCs no longer twitch/jump from stale collision flags
  const moving=Math.hypot(wx,wz)>0.1;
  if(moving&&(f.blockedX||f.blockedZ)&&f.onGround&&Math.random()<0.25){wantJump=true;}
  if(moving&&(f.blockedX||f.blockedZ)&&Math.random()<0.04){f.strafeDir*=-1;if(f.state==='ROAM')f.roamPt=arenaSpot();}

  const rate=lerp(5,14,f.skill);
  f.yaw=angLerp(f.yaw,f.aimYaw,1-Math.exp(-dt*rate));
  f.applyMove(wx,wz,dt);
  if(wantJump)f.jump();
  if(f.atkCd>0)f.atkCd-=dt;
  physics(f,dt);
  f.updateVisual(dt);
}
