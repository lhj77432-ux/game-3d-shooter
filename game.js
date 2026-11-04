import * as THREE from 'three';

/* ===================== CONFIG ===================== */
const SAVE_KEY = 'darkzone_v2_progress';
const MAX_LEVEL = 10;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const LEVELS = [
  { id:1, name:'靶场教学', obj:'击破全部静止靶（5）', kind:'static', count:5, ammo:[30,60], hp:100, map:'range', tip:'移动到靶前开火' },
  { id:2, name:'开阔靶场', obj:'清除移动靶（6）', kind:'mover', count:6, ammo:[30,60], hp:100, map:'open', tip:'预判移动轨迹' },
  { id:3, name:'掩体走廊', obj:'清除掩体后敌人（7）', kind:'cover', count:7, ammo:[30,90], hp:100, map:'corridor', tip:'利用掩体侧身射击' },
  { id:4, name:'限弹两波', obj:'两波清场 · 弹药有限', kind:'waves', waves:[[4,'mover'],[5,'cover']], ammo:[24,0], hp:100, map:'yard', tip:'节省子弹' },
  { id:5, name:'中型头目', obj:'击败头目', kind:'boss', boss:{hp:220,speed:3.2,dmg:18}, minions:3, ammo:[30,60], hp:110, map:'arena', tip:'先清小兵再打头目' },
  { id:6, name:'冲锋巷', obj:'挡住近战冲锋（8）', kind:'rusher', count:8, ammo:[30,90], hp:100, map:'alley', tip:'保持距离，边退边打' },
  { id:7, name:'高台俯射', obj:'清除下方与对面敌人（8）', kind:'mixed', count:8, ammo:[30,90], hp:100, map:'tower', tip:'注意脚下与远距' },
  { id:8, name:'限时清场', obj:'60 秒内清除全部（10）', kind:'timed', count:10, time:60, ammo:[30,120], hp:100, map:'open', tip:'速度与精度并重' },
  { id:9, name:'混合编队', obj:'清除混合小队（12）', kind:'squad', count:12, ammo:[30,120], hp:120, map:'compound', tip:'优先处理冲锋单位' },
  { id:10,name:'终局突袭', obj:'击败最终头目与护卫', kind:'final', boss:{hp:360,speed:3.6,dmg:22}, minions:8, ammo:[35,150], hp:130, map:'final', tip:'利用场地掩体周旋' },
];

/* ===================== DOM ===================== */
const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const hud = $('#hud');
const crosshair = $('#crosshair');
const hitmark = $('#hitmark');
const dmgV = $('#dmg-vignette');
const toastEl = $('#toast');

/* ===================== STATE ===================== */
const state = {
  running: false,
  paused: false,
  level: 1,
  unlocked: 1,
  sens: 1,
  muted: false,
  lowfx: isTouch,
  hp: 100, maxHp: 100,
  ammo: 30, reserve: 90, magSize: 30,
  reloading: false, reloadT: 0,
  kills: 0, needed: 0,
  wave: 0, wavesLeft: null,
  timeLeft: 0, timed: false,
  spread: 0,
  hitStop: 0,
  yaw: 0, pitch: 0,
  move: { f:0, b:0, l:0, r:0 },
  vel: new THREE.Vector3(),
  shootHeld: false,
  lastShot: 0,
  pointerLocked: false,
  joy: { x:0, y:0, active:false },
  lookTouch: null,
};

function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    if (d.unlocked) state.unlocked = Math.min(MAX_LEVEL, Math.max(1, d.unlocked|0));
    if (d.sens) state.sens = +d.sens;
    if (typeof d.muted === 'boolean') state.muted = d.muted;
    if (typeof d.lowfx === 'boolean') state.lowfx = d.lowfx;
  } catch {}
}
function saveProgress() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    unlocked: state.unlocked, sens: state.sens, muted: state.muted, lowfx: state.lowfx
  }));
}
loadProgress();

/* ===================== AUDIO (WebAudio synth) ===================== */
const AudioFX = (() => {
  let ctx = null;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function beep(freq, dur, type='square', vol=0.08, slide=0) {
    if (state.muted) return;
    const c = ensure();
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq+slide), t0+dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0+dur+0.02);
  }
  function noise(dur, vol=0.05, filterFreq=2000) {
    if (state.muted) return;
    const c = ensure();
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1-i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=filterFreq;
    const g = c.createGain(); g.gain.value=vol;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }
  return {
    unlock: () => ensure(),
    shoot() { noise(0.07, 0.09, 2800); beep(180, 0.05, 'sawtooth', 0.04, -120); },
    empty() { beep(90, 0.05, 'square', 0.04); beep(70, 0.04, 'square', 0.03); },
    reload() { beep(220, 0.06, 'triangle', 0.05); setTimeout(()=>beep(160,0.08,'triangle',0.05,-40), 180); setTimeout(()=>beep(320,0.05,'square',0.035), 480); },
    hit() { beep(520, 0.04, 'square', 0.05); noise(0.04, 0.04, 4000); },
    kill() { beep(140, 0.12, 'sawtooth', 0.06, -80); noise(0.1, 0.06, 1200); },
    hurt() { beep(110, 0.15, 'sawtooth', 0.07, -60); },
    clear() { beep(440,0.1,'triangle',0.06); setTimeout(()=>beep(554,0.1,'triangle',0.06),100); setTimeout(()=>beep(659,0.18,'triangle',0.07),200); },
    click() { beep(500, 0.03, 'square', 0.03); },
  };
})();

/* ===================== THREE SETUP ===================== */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b121c);
scene.fog = new THREE.FogExp2(0x0b121c, 0.028);

const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.08, 200);
const camRig = new THREE.Object3D();
scene.add(camRig);
camRig.add(camera);
camera.position.set(0, 0, 0);

const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x1a1510, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2c4, 1.05);
sun.position.set(18, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 512 : 1024, isTouch ? 512 : 1024);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
scene.add(sun);
const fill = new THREE.PointLight(0x3ec7ff, 0.55, 40);
fill.position.set(-6, 5, -4);
scene.add(fill);

/* materials */
const matGround = new THREE.MeshStandardMaterial({ color: 0x1a2433, roughness: 0.92, metalness: 0.08 });
const matGrid = (() => {
  const c = document.createElement('canvas'); c.width=c.height=128;
  const g = c.getContext('2d');
  g.fillStyle = '#152033'; g.fillRect(0,0,128,128);
  g.strokeStyle = 'rgba(62,199,255,0.22)'; g.lineWidth = 2;
  g.strokeRect(1,1,126,126);
  g.strokeStyle = 'rgba(62,199,255,0.08)'; g.beginPath();
  g.moveTo(64,0); g.lineTo(64,128); g.moveTo(0,64); g.lineTo(128,64); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.15 });
})();
const matWall = new THREE.MeshStandardMaterial({ color: 0x2a3548, roughness: 0.78, metalness: 0.25 });
const matWallAccent = new THREE.MeshStandardMaterial({ color: 0x1e6f8f, roughness: 0.45, metalness: 0.55, emissive: 0x0a3040, emissiveIntensity: 0.35 });
const matCrate = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.7, metalness: 0.2 });
const matTarget = new THREE.MeshStandardMaterial({ color: 0xc44b3a, roughness: 0.55, metalness: 0.2, emissive: 0x401008, emissiveIntensity: 0.25 });
const matEnemy = new THREE.MeshStandardMaterial({ color: 0x4a5d78, roughness: 0.55, metalness: 0.4 });
const matEnemyHot = new THREE.MeshStandardMaterial({ color: 0xb84a3a, roughness: 0.45, metalness: 0.35, emissive: 0x501010, emissiveIntensity: 0.4 });
const matBoss = new THREE.MeshStandardMaterial({ color: 0x6b2d8b, roughness: 0.4, metalness: 0.55, emissive: 0x2a0840, emissiveIntensity: 0.55 });
const matBullet = new THREE.MeshBasicMaterial({ color: 0xffe08a });

const world = new THREE.Group();
scene.add(world);
const colliders = []; // {box: Box3, mesh}
const enemies = [];
const sparks = [];
const decals = [];
const projectiles = [];

/* viewmodel gun */
const gunRoot = new THREE.Group();
camera.add(gunRoot);
gunRoot.position.set(0.28, -0.28, -0.55);
(function buildGun() {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0x1c222c, metalness: 0.7, roughness: 0.35 }));
  body.castShadow = false; gunRoot.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.38, 8), new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.85, roughness: 0.25 }));
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.02, -0.35); gunRoot.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0x11161d, metalness: 0.5, roughness: 0.5 }));
  mag.position.set(0, -0.12, 0.02); gunRoot.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x3ec7ff, emissive: 0x3ec7ff, emissiveIntensity: 0.8 }));
  sight.position.set(0, 0.1, -0.05); gunRoot.add(sight);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 }));
  flash.position.set(0, 0.02, -0.58); flash.name = 'muzzle'; gunRoot.add(flash);
})();
let gunKick = 0, gunBob = 0, gunReloadAnim = 0;

/* ===================== MAP BUILDERS ===================== */
function clearWorld() {
  while (world.children.length) {
    const o = world.children.pop();
    o.traverse(ch => {
      if (ch.geometry) ch.geometry.dispose();
    });
  }
  colliders.length = 0;
  enemies.length = 0;
  sparks.length = 0;
  projectiles.length = 0;
  decals.forEach(d => scene.remove(d));
  decals.length = 0;
}

function addBox(x,y,z, w,h,d, mat=matWall, opts={}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = !state.lowfx;
  mesh.receiveShadow = true;
  world.add(mesh);
  if (opts.collide !== false) {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    // shrink slightly for smoother movement
    box.min.addScalar(0.02); box.max.addScalar(-0.02);
    colliders.push({ box, mesh });
  }
  return mesh;
}

function addGround(size=40) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), matGrid);
  g.rotation.x = -Math.PI/2; g.receiveShadow = true;
  world.add(g);
  // invisible floor collider
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 1, size), matGround);
  floor.position.y = -0.5; floor.visible = false; world.add(floor);
  floor.updateMatrixWorld(true);
  colliders.push({ box: new THREE.Box3().setFromObject(floor), mesh: floor, floor: true });
}

function wallRing(size, h=3.2, thick=0.6) {
  const half = size/2;
  addBox(0, h/2, -half, size, h, thick);
  addBox(0, h/2, half, size, h, thick);
  addBox(-half, h/2, 0, thick, h, size);
  addBox(half, h/2, 0, thick, h, size);
}

function buildMap(type) {
  clearWorld();
  switch (type) {
    case 'range':
      addGround(36); wallRing(36);
      addBox(-6, 0.7, -8, 2.2, 1.4, 1.2, matCrate);
      addBox(6, 0.7, -8, 2.2, 1.4, 1.2, matCrate);
      addBox(0, 1.2, -14, 10, 2.4, 0.5, matWallAccent);
      break;
    case 'open':
      addGround(42); wallRing(42);
      for (let i=0;i<6;i++) {
        const a = i/6*Math.PI*2;
        addBox(Math.cos(a)*10, 0.8, Math.sin(a)*10, 2.4, 1.6, 2.4, matCrate);
      }
      break;
    case 'corridor':
      addGround(40); wallRing(40, 3.5);
      addBox(-4, 1.5, -2, 1.2, 3, 14, matWall);
      addBox(4, 1.5, 4, 1.2, 3, 14, matWall);
      addBox(0, 0.8, -6, 2, 1.6, 2, matCrate);
      addBox(-7, 0.8, 6, 2, 1.6, 2, matCrate);
      addBox(7, 0.8, -8, 2, 1.6, 2, matCrate);
      break;
    case 'yard':
      addGround(38); wallRing(38);
      addBox(-5, 1, -5, 3, 2, 3, matCrate);
      addBox(5, 1, 5, 3, 2, 3, matCrate);
      addBox(0, 1.2, 0, 4, 2.4, 1, matWallAccent);
      break;
    case 'arena':
      addGround(36); wallRing(36, 4);
      addBox(0, 0.6, 0, 4, 1.2, 4, matWallAccent);
      addBox(-8, 1, -8, 2.5, 2, 2.5, matCrate);
      addBox(8, 1, -8, 2.5, 2, 2.5, matCrate);
      addBox(-8, 1, 8, 2.5, 2, 2.5, matCrate);
      addBox(8, 1, 8, 2.5, 2, 2.5, matCrate);
      break;
    case 'alley':
      addGround(34); wallRing(34, 4);
      for (let z=-10; z<=10; z+=5) {
        addBox(-3.5, 1.6, z, 1.2, 3.2, 3.5, matWall);
        addBox(3.5, 1.6, z+2, 1.2, 3.2, 3.5, matWall);
      }
      break;
    case 'tower':
      addGround(40); wallRing(40, 5);
      addBox(0, 2.2, 8, 8, 4.4, 8, matWall); // platform
      addBox(0, 0.8, 8, 3, 1.6, 3, matWallAccent);
      // ramp-ish steps
      addBox(0, 0.5, 2.5, 3, 1, 3, matCrate);
      addBox(0, 1.3, 4.5, 3, 1, 2, matCrate);
      addBox(0, 2.1, 6, 3, 1, 2, matCrate);
      addBox(-10, 1, -6, 2, 2, 2, matCrate);
      addBox(10, 1, -6, 2, 2, 2, matCrate);
      break;
    case 'compound':
      addGround(42); wallRing(42, 3.8);
      addBox(-8, 1.5, -4, 6, 3, 1.2, matWall);
      addBox(8, 1.5, 4, 6, 3, 1.2, matWall);
      addBox(0, 1.2, -10, 8, 2.4, 1.2, matWallAccent);
      addBox(-6, 0.9, 8, 2.5, 1.8, 2.5, matCrate);
      addBox(6, 0.9, -2, 2.5, 1.8, 2.5, matCrate);
      break;
    case 'final':
      addGround(44); wallRing(44, 5);
      addBox(0, 1.5, -12, 16, 3, 1.4, matWallAccent);
      addBox(-10, 1.2, 0, 2.5, 2.4, 8, matWall);
      addBox(10, 1.2, 0, 2.5, 2.4, 8, matWall);
      addBox(0, 0.7, 0, 5, 1.4, 5, matCrate);
      addBox(-7, 1, 10, 3, 2, 3, matCrate);
      addBox(7, 1, 10, 3, 2, 3, matCrate);
      break;
    default:
      addGround(40); wallRing(40);
  }
}

/* ===================== ENEMIES ===================== */
function makeEnemy(type, pos, overrides={}) {
  const group = new THREE.Group();
  group.position.copy(pos);
  let hp=40, speed=2.4, dmg=10, radius=0.55, score=1, colorMat=matEnemy, scale=1;
  if (type === 'static' || type === 'target') {
    hp=25; speed=0; dmg=0; colorMat=matTarget;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.4,1.4,10), colorMat);
    body.position.y = 0.9; body.castShadow = !state.lowfx; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22,10,10), colorMat);
    head.position.y = 1.75; group.add(head);
  } else if (type === 'mover' || type === 'cover') {
    hp = type==='cover' ? 45 : 35; speed = type==='cover' ? 1.8 : 3.0; dmg=12;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), colorMat);
    body.position.y = 1.0; body.castShadow = !state.lowfx; group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.35,0.35), colorMat);
    head.position.y = 1.7; group.add(head);
  } else if (type === 'rusher') {
    hp=30; speed=5.2; dmg=16; colorMat=matEnemyHot; radius=0.5;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 6), colorMat);
    body.position.y = 0.85; body.castShadow = !state.lowfx; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2,8,8), colorMat);
    head.position.y = 1.55; group.add(head);
  } else if (type === 'shooter') {
    hp=40; speed=2.2; dmg=10;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 4, 8), colorMat);
    body.position.y = 1.0; group.add(body);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.4), new THREE.MeshStandardMaterial({color:0x222}));
    gun.position.set(0.25, 1.1, -0.2); group.add(gun);
  } else if (type === 'boss') {
    hp = overrides.hp || 220; speed = overrides.speed || 3.2; dmg = overrides.dmg || 18;
    radius=1.0; scale=1.6; colorMat=matBoss; score=5;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.0, 4, 10), colorMat);
    body.position.y = 1.4; body.castShadow = !state.lowfx; group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.45,0.5), colorMat);
    head.position.y = 2.35; group.add(head);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 16), new THREE.MeshStandardMaterial({ color:0xff6b3e, emissive:0xff6b3e, emissiveIntensity:0.8 }));
    rim.position.y = 1.5; rim.rotation.x = Math.PI/2; group.add(rim);
  }
  Object.assign(group.scale, {x:scale,y:scale,z:scale});
  world.add(group);

  const e = {
    mesh: group, type, hp, maxHp: hp, speed, dmg, radius, score,
    alive: true, hitFlash: 0, attackCd: 0,
    patrol: Math.random()*Math.PI*2,
    strafe: (Math.random()>.5?1:-1),
    origin: pos.clone(),
    shootCd: 1 + Math.random(),
  };
  enemies.push(e);
  return e;
}

function spawnPattern(levelDef) {
  const spawns = [];
  const n = levelDef.count || 0;
  const kind = levelDef.kind;

  function ring(count, r, y=0) {
    for (let i=0;i<count;i++) {
      const a = (i/count)*Math.PI*2 + Math.random()*0.2;
      spawns.push({ type: 'mover', pos: new THREE.Vector3(Math.cos(a)*r, y, Math.sin(a)*r - 4) });
    }
  }

  if (kind === 'static') {
    for (let i=0;i<n;i++) {
      const x = -8 + i*4 + (i>2 ? -12 : 0);
      const z = -12 - (i%3)*2;
      spawns.push({ type:'static', pos: new THREE.Vector3(x>8?-8+(i-3)*4:x, 0, z) });
    }
    // fix positions neatly
    spawns.length = 0;
    const xs = [-8,-4,0,4,8];
    xs.forEach((x,i)=> spawns.push({ type:'static', pos: new THREE.Vector3(x, 0, -12 - (i%2)) }));
  } else if (kind === 'mover' || kind === 'timed') {
    ring(n, 11);
    spawns.forEach(s => s.type = 'mover');
  } else if (kind === 'cover') {
    const spots = [[-6,-8],[6,-6],[-5,4],[5,6],[0,-10],[-8,0],[8,-2]];
    for (let i=0;i<n;i++) {
      const s = spots[i%spots.length];
      spawns.push({ type:'cover', pos: new THREE.Vector3(s[0]+(Math.random()-0.5), 0, s[1]) });
    }
  } else if (kind === 'rusher') {
    for (let i=0;i<n;i++) {
      spawns.push({ type:'rusher', pos: new THREE.Vector3((Math.random()-0.5)*8, 0, -14 - Math.random()*3) });
    }
  } else if (kind === 'mixed' || kind === 'squad') {
    const types = kind==='squad'
      ? ['mover','rusher','cover','shooter','mover','rusher','cover','shooter','mover','rusher','cover','shooter']
      : ['mover','cover','shooter','mover','rusher','cover','shooter','mover'];
    for (let i=0;i<n;i++) {
      const a = (i/n)*Math.PI*2;
      const r = 9 + (i%3)*2;
      spawns.push({ type: types[i%types.length], pos: new THREE.Vector3(Math.cos(a)*r, 0, Math.sin(a)*r - 2) });
    }
  } else if (kind === 'waves') {
    // handled separately
  } else if (kind === 'boss' || kind === 'final') {
    spawns.push({ type:'boss', pos: new THREE.Vector3(0,0,-10), overrides: levelDef.boss });
    for (let i=0;i<(levelDef.minions||0);i++) {
      const a = (i/(levelDef.minions))*Math.PI*2;
      const t = i%2 ? 'rusher' : 'mover';
      spawns.push({ type:t, pos: new THREE.Vector3(Math.cos(a)*7, 0, Math.sin(a)*7 - 8) });
    }
  }

  spawns.forEach(s => makeEnemy(s.type, s.pos, s.overrides||{}));
  state.needed = enemies.filter(e=>e.alive).length;
}

function spawnWave(def) {
  const [count, type] = def;
  for (let i=0;i<count;i++) {
    const a = (i/count)*Math.PI*2;
    makeEnemy(type, new THREE.Vector3(Math.cos(a)*10, 0, Math.sin(a)*10 - 3));
  }
  state.needed = enemies.filter(e=>e.alive).length;
  showWave(`第 ${state.wave} 波`);
}

/* ===================== COMBAT / PHYSICS ===================== */
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

function playerPos() {
  return camRig.position;
}

function tryMove(dx, dz, dt) {
  const p = camRig.position;
  const radius = 0.4;
  // separate axes for sliding
  const tryAxis = (ax, az) => {
    const nx = p.x + ax, nz = p.z + az;
    const feetY = p.y - 1.55;
    for (const c of colliders) {
      if (c.floor) continue;
      const b = c.box;
      if (nx + radius > b.min.x && nx - radius < b.max.x &&
          nz + radius > b.min.z && nz - radius < b.max.z &&
          feetY + 1.7 > b.min.y && feetY < b.max.y) {
        return false;
      }
    }
    // keep in bounds soft
    if (Math.abs(nx) > 20 || Math.abs(nz) > 20) return false;
    return true;
  };
  if (tryAxis(dx, 0)) p.x += dx;
  if (tryAxis(0, dz)) p.z += dz;
}

function shoot() {
  if (!state.running || state.paused || state.reloading) return;
  const now = performance.now();
  if (now - state.lastShot < 110) return;
  if (state.ammo <= 0) { AudioFX.empty(); state.lastShot = now; return; }

  state.ammo--;
  state.lastShot = now;
  state.spread = Math.min(18, state.spread + 3.2);
  gunKick = 1;
  AudioFX.shoot();
  flashMuzzle();
  updateAmmoHUD();

  // spread in degrees
  const sp = state.spread * 0.012 * (0.6 + Math.random()*0.8);
  const dir = new THREE.Vector3(0,0,-1);
  dir.applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  dir.x += (Math.random()-0.5)*sp;
  dir.y += (Math.random()-0.5)*sp*0.7;
  dir.z += (Math.random()-0.5)*sp;
  dir.normalize();

  const origin = camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, dir);
  raycaster.far = 80;

  // enemy hit
  let hitEnemy = null, hitDist = 1e9, hitPoint = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    // approximate sphere
    const center = e.mesh.position.clone(); center.y += 1.0 * (e.type==='boss'?1.4:1);
    const to = center.clone().sub(origin);
    const proj = to.dot(dir);
    if (proj < 0) continue;
    const closest = origin.clone().addScaledVector(dir, proj);
    const dist = closest.distanceTo(center);
    const rad = e.radius * (e.type==='boss'?1.3:1);
    if (dist < rad && proj < hitDist) {
      hitDist = proj; hitEnemy = e; hitPoint = closest;
    }
  }

  // wall hit for sparks
  let wallHit = null, wallDist = hitDist;
  for (const c of colliders) {
    if (c.floor) continue;
    const box = c.box;
    const hits = raycaster.ray.intersectBox(box, _tmp);
    if (hits) {
      const d = hits.distanceTo(origin);
      if (d < wallDist) { wallDist = d; wallHit = hits.clone(); }
    }
  }

  if (hitEnemy && hitDist <= wallDist + 0.05) {
    damageEnemy(hitEnemy, 24 + Math.random()*8, hitPoint || hitEnemy.mesh.position);
  } else if (wallHit) {
    spawnSparks(wallHit, 4);
  } else {
    // tracer end spark far
    spawnSparks(origin.clone().addScaledVector(dir, 40), 2);
  }
}

function flashMuzzle() {
  const m = gunRoot.getObjectByName('muzzle');
  if (!m) return;
  m.material.opacity = 1;
  setTimeout(() => { m.material.opacity = 0; }, 40);
}

function damageEnemy(e, dmg, point) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.hitFlash = 1;
  showHitmark();
  AudioFX.hit();
  spawnSparks(point || e.mesh.position.clone().add(new THREE.Vector3(0,1,0)), state.lowfx ? 4 : 10);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.alive = false;
  state.kills++;
  state.hitStop = 0.07;
  AudioFX.kill();
  // death expand + fade
  const mesh = e.mesh;
  spawnSparks(mesh.position.clone().add(new THREE.Vector3(0,1,0)), state.lowfx ? 8 : 18, 0xff6b3e);
  world.remove(mesh);
  $('#kills-text').textContent = state.kills;
  checkClear();
}

function spawnSparks(pos, n=8, color=0xffe08a) {
  if (state.lowfx) n = Math.ceil(n*0.45);
  for (let i=0;i<n;i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    const v = new THREE.Vector3((Math.random()-0.5)*4, Math.random()*3, (Math.random()-0.5)*4);
    scene.add(m);
    sparks.push({ mesh:m, v, life: 0.35+Math.random()*0.25 });
  }
}

function showHitmark() {
  hitmark.classList.remove('show');
  void hitmark.offsetWidth;
  hitmark.classList.add('show');
  setTimeout(() => hitmark.classList.remove('show'), 160);
}

function reload() {
  if (state.reloading || state.ammo >= state.magSize || state.reserve <= 0) return;
  state.reloading = true;
  state.reloadT = 1.35;
  gunReloadAnim = 1;
  AudioFX.reload();
  toast('换弹中…');
}

function finishReload() {
  const need = state.magSize - state.ammo;
  const take = Math.min(need, state.reserve);
  state.ammo += take;
  state.reserve -= take;
  state.reloading = false;
  updateAmmoHUD();
}

function hurtPlayer(dmg) {
  state.hp = Math.max(0, state.hp - dmg);
  dmgV.style.opacity = '1';
  setTimeout(() => dmgV.style.opacity = '0', 180);
  AudioFX.hurt();
  updateHPHUD();
  if (state.hp <= 0) onDeath();
}

/* ===================== LEVEL FLOW ===================== */
function showWave(text) {
  const el = $('#wave-banner');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1600);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), 1400);
}

function startLevel(id) {
  const def = LEVELS[id-1];
  if (!def || id > state.unlocked) return;
  state.level = id;
  state.running = true;
  state.paused = false;
  state.hp = def.hp; state.maxHp = def.hp;
  state.ammo = def.ammo[0]; state.reserve = def.ammo[1];
  state.magSize = def.ammo[0];
  state.reloading = false;
  state.kills = 0;
  state.spread = 0;
  state.vel.set(0,0,0);
  state.yaw = 0; state.pitch = 0;
  state.wave = 0;
  state.wavesLeft = def.waves ? def.waves.slice() : null;
  state.timed = !!def.time;
  state.timeLeft = def.time || 0;

  buildMap(def.map);
  camRig.position.set(0, 1.65, 12);
  camera.rotation.set(0,0,0);
  camRig.rotation.set(0,0,0);

  if (def.kind === 'waves') {
    state.wave = 1;
    spawnWave(state.wavesLeft.shift());
  } else {
    spawnPattern(def);
  }

  // UI
  $('#overlay-start').classList.add('hidden');
  $('#overlay-pause').classList.add('hidden');
  $('#overlay-clear').classList.add('hidden');
  $('#overlay-dead').classList.add('hidden');
  hud.classList.remove('hidden');
  crosshair.classList.add('on');
  if (isTouch) $('#mobile-ui').classList.remove('hidden');
  else $('#mobile-ui').classList.add('hidden');

  $('#hud-level').textContent = `关卡 ${def.id} · ${def.name}`;
  $('#hud-objective').textContent = def.obj;
  $('#kills-text').textContent = '0';
  updateAmmoHUD(); updateHPHUD();
  const timer = $('#hud-timer');
  if (state.timed) { timer.classList.add('on'); timer.textContent = `⏱ ${state.timeLeft.toFixed(0)}s`; }
  else timer.classList.remove('on');

  if (!isTouch) {
    canvas.requestPointerLock?.();
  }
  AudioFX.unlock();
  toast(def.tip || def.name);
}

function checkClear() {
  const alive = enemies.some(e => e.alive);
  if (alive) return;
  if (state.wavesLeft && state.wavesLeft.length) {
    state.wave++;
    setTimeout(() => spawnWave(state.wavesLeft.shift()), 700);
    return;
  }
  onClear();
}

function onClear() {
  state.running = false;
  document.exitPointerLock?.();
  AudioFX.clear();
  crosshair.classList.remove('on');
  $('#mobile-ui').classList.add('hidden');
  if (state.level >= state.unlocked && state.level < MAX_LEVEL) {
    state.unlocked = state.level + 1;
    saveProgress();
  } else if (state.level === MAX_LEVEL) {
    state.unlocked = MAX_LEVEL;
    saveProgress();
  }
  const def = LEVELS[state.level-1];
  $('#clear-title').textContent = state.level === MAX_LEVEL ? '全部通关！' : `关卡 ${state.level} 通过`;
  $('#clear-stats').textContent = `击杀 ${state.kills} · ${def.name}`;
  $('#btn-next').style.display = state.level < MAX_LEVEL ? '' : 'none';
  $('#overlay-clear').classList.remove('hidden');
  buildLevelSelect();
}

function onDeath() {
  state.running = false;
  document.exitPointerLock?.();
  crosshair.classList.remove('on');
  $('#mobile-ui').classList.add('hidden');
  $('#overlay-dead').classList.remove('hidden');
}

function pauseGame() {
  if (!state.running) return;
  state.paused = true;
  document.exitPointerLock?.();
  $('#overlay-pause').classList.remove('hidden');
  crosshair.classList.remove('on');
}
function resumeGame() {
  state.paused = false;
  $('#overlay-pause').classList.add('hidden');
  crosshair.classList.add('on');
  if (!isTouch) canvas.requestPointerLock?.();
}

/* ===================== UPDATE LOOP ===================== */
function updateEnemy(e, dt) {
  if (!e.alive) return;
  // hit flash
  if (e.hitFlash > 0) {
    e.hitFlash -= dt * 4;
    e.mesh.traverse(ch => {
      if (ch.isMesh && ch.material && ch.material.emissive) {
        ch.material.emissiveIntensity = 0.2 + Math.max(0, e.hitFlash) * 1.5;
      }
    });
  }

  const p = playerPos();
  const toP = _tmp.copy(p).sub(e.mesh.position); toP.y = 0;
  const dist = toP.length();
  const dir = dist > 0.01 ? toP.normalize() : _tmp2.set(0,0,0);

  if (e.type === 'static' || e.type === 'target') {
    e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
    return;
  }

  if (e.type === 'mover') {
    e.patrol += dt;
    const side = _tmp2.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(e.patrol*1.6)*e.strafe);
    const want = dir.multiplyScalar(e.speed * (dist > 7 ? 1 : dist < 4 ? -0.6 : 0.2)).add(side.multiplyScalar(e.speed*0.7));
    moveEnemy(e, want.x*dt, want.z*dt);
    e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
  } else if (e.type === 'cover') {
    // peek: strafe near origin
    e.patrol += dt;
    const peek = Math.sin(e.patrol*1.2);
    const side = _tmp2.set(-dir.z, 0, dir.x).multiplyScalar(peek * e.speed * 0.8);
    const back = dist < 6 ? dir.clone().multiplyScalar(-e.speed*0.5) : dir.clone().multiplyScalar(e.speed*0.3);
    moveEnemy(e, (side.x+back.x)*dt, (side.z+back.z)*dt);
    e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
    e.attackCd -= dt;
    if (dist < 18 && e.attackCd <= 0 && peek > 0.4) {
      e.attackCd = 1.1;
      enemyShoot(e);
    }
  } else if (e.type === 'rusher') {
    const want = dir.multiplyScalar(e.speed);
    moveEnemy(e, want.x*dt, want.z*dt);
    e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
    e.attackCd -= dt;
    if (dist < 1.3 && e.attackCd <= 0) {
      e.attackCd = 0.85;
      hurtPlayer(e.dmg);
    }
  } else if (e.type === 'shooter') {
    const ideal = 9;
    let fwd = 0;
    if (dist > ideal+1) fwd = e.speed;
    else if (dist < ideal-1) fwd = -e.speed*0.7;
    e.patrol += dt;
    const side = _tmp2.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(e.patrol)*e.speed*0.6);
    moveEnemy(e, dir.x*fwd*dt + side.x*dt, dir.z*fwd*dt + side.z*dt);
    e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
    e.shootCd -= dt;
    if (e.shootCd <= 0 && dist < 22) {
      e.shootCd = 0.9 + Math.random()*0.5;
      enemyShoot(e);
    }
  } else if (e.type === 'boss') {
    e.patrol += dt;
    const phase = Math.sin(e.patrol*0.7);
    let fwd = dist > 6 ? e.speed : dist < 3.5 ? -e.speed*0.4 : e.speed*0.15;
    const side = _tmp2.set(-dir.z, 0, dir.x).multiplyScalar(phase * e.speed * 0.9);
    moveEnemy(e, dir.x*fwd*dt + side.x*dt, dir.z*fwd*dt + side.z*dt);
    e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
    e.shootCd -= dt;
    e.attackCd -= dt;
    if (e.shootCd <= 0) {
      e.shootCd = 0.55;
      enemyShoot(e, 1.15);
    }
    if (dist < 2.2 && e.attackCd <= 0) {
      e.attackCd = 1.0;
      hurtPlayer(e.dmg);
    }
  }
}

function moveEnemy(e, dx, dz) {
  const nx = e.mesh.position.x + dx;
  const nz = e.mesh.position.z + dz;
  let okX = true, okZ = true;
  const r = e.radius;
  for (const c of colliders) {
    if (c.floor) continue;
    const b = c.box;
    if (nx+r>b.min.x && nx-r<b.max.x && e.mesh.position.z+r>b.min.z && e.mesh.position.z-r<b.max.z &&
        1.2>b.min.y && 0<b.max.y) okX = false;
    if (e.mesh.position.x+r>b.min.x && e.mesh.position.x-r<b.max.x && nz+r>b.min.z && nz-r<b.max.z &&
        1.2>b.min.y && 0<b.max.y) okZ = false;
  }
  if (okX && Math.abs(nx)<19) e.mesh.position.x = nx;
  if (okZ && Math.abs(nz)<19) e.mesh.position.z = nz;
}

function enemyShoot(e, dmgMul=1) {
  // accuracy based on distance
  const p = playerPos();
  const dist = e.mesh.position.distanceTo(p);
  const acc = Math.min(0.85, 1.4 - dist/30);
  if (Math.random() < acc * 0.55) {
    hurtPlayer(e.dmg * dmgMul * (0.7 + Math.random()*0.3));
  }
  // visual tracer spark near gun
  const origin = e.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  spawnSparks(origin, 2, 0xff8844);
}

function updateSparks(dt) {
  for (let i=sparks.length-1;i>=0;i--) {
    const s = sparks[i];
    s.life -= dt;
    s.v.y -= 6*dt;
    s.mesh.position.addScaledVector(s.v, dt);
    s.mesh.material.opacity = Math.max(0, s.life*3);
    s.mesh.material.transparent = true;
    if (s.life <= 0) {
      scene.remove(s.mesh);
      sparks.splice(i,1);
    }
  }
}

function updateGun(dt, moving) {
  gunKick = Math.max(0, gunKick - dt*8);
  gunBob += dt * (moving ? 9 : 2);
  const bobX = Math.sin(gunBob)*0.012*(moving?1:0.3);
  const bobY = Math.abs(Math.cos(gunBob))*0.01*(moving?1:0.3);
  if (state.reloading) {
    gunReloadAnim = Math.max(0, gunReloadAnim);
    gunRoot.rotation.x = -0.55 * Math.sin((1.35-state.reloadT)/1.35*Math.PI);
    gunRoot.position.set(0.28 + bobX, -0.28 - 0.12*Math.sin((1.35-state.reloadT)/1.35*Math.PI) + bobY, -0.55);
  } else {
    gunRoot.rotation.x = -gunKick * 0.12;
    gunRoot.position.set(0.28 + bobX, -0.28 + bobY + gunKick*0.04, -0.55 - gunKick*0.03);
  }
  // crosshair spread visual
  crosshair.style.setProperty('--sp', `${8 + state.spread * 0.7}px`);
  crosshair.classList.toggle('spread', state.spread > 2);
  crosshair.classList.toggle('fire', gunKick > 0.4);
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt0 = Math.min(0.05, (now - lastT)/1000);
  lastT = now;
  let dt = dt0;
  if (state.hitStop > 0) {
    state.hitStop -= dt0;
    dt *= 0.15;
  }

  // always render
  if (state.running && !state.paused) {
    // reload
    if (state.reloading) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) finishReload();
    }
    // spread recovery
    state.spread = Math.max(0, state.spread - dt * 14);

    // movement with inertia
    const inputX = (state.move.r - state.move.l) + state.joy.x;
    const inputZ = (state.move.f - state.move.b) + state.joy.y;
    const len = Math.hypot(inputX, inputZ);
    let ix = inputX, iz = inputZ;
    if (len > 1) { ix /= len; iz /= len; }

    const yaw = state.yaw;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const wish = forward.multiplyScalar(iz).add(right.multiplyScalar(ix));
    const accel = 28, maxSpeed = 7.2, friction = 14;
    if (wish.lengthSq() > 0) {
      state.vel.x += wish.x * accel * dt;
      state.vel.z += wish.z * accel * dt;
    } else {
      const sp = Math.hypot(state.vel.x, state.vel.z);
      if (sp > 0) {
        const drop = Math.min(sp, friction*dt);
        state.vel.x *= (sp-drop)/sp;
        state.vel.z *= (sp-drop)/sp;
      }
    }
    const sp2 = Math.hypot(state.vel.x, state.vel.z);
    if (sp2 > maxSpeed) { state.vel.x *= maxSpeed/sp2; state.vel.z *= maxSpeed/sp2; }
    tryMove(state.vel.x*dt, state.vel.z*dt, dt);

    // camera orientation
    camRig.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;

    // auto fire if held
    if (state.shootHeld) shoot();

    // enemies
    for (const e of enemies) updateEnemy(e, dt);
    updateSparks(dt);
    updateGun(dt, sp2 > 0.4);

    // timer
    if (state.timed) {
      state.timeLeft -= dt;
      $('#hud-timer').textContent = `⏱ ${Math.max(0, state.timeLeft).toFixed(1)}s`;
      if (state.timeLeft <= 0) {
        if (enemies.some(e=>e.alive)) onDeath();
        else checkClear();
      }
    }
  } else {
    updateSparks(dt0);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ===================== HUD HELPERS ===================== */
function updateAmmoHUD() {
  $('#ammo-cur').textContent = state.ammo;
  $('#ammo-res').textContent = state.reserve;
  $('#ammo-text').classList.toggle('empty', state.ammo <= 0);
}
function updateHPHUD() {
  const pct = Math.max(0, state.hp / state.maxHp * 100);
  const fill = $('#hp-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('low', pct < 35);
}

/* ===================== INPUT ===================== */
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyW') state.move.f = 1;
  if (e.code === 'KeyS') state.move.b = 1;
  if (e.code === 'KeyA') state.move.l = 1;
  if (e.code === 'KeyD') state.move.r = 1;
  if (e.code === 'KeyR') reload();
  if (e.code === 'Escape') {
    if (state.running && !state.paused) pauseGame();
    else if (state.paused) resumeGame();
  }
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyW') state.move.f = 0;
  if (e.code === 'KeyS') state.move.b = 0;
  if (e.code === 'KeyA') state.move.l = 0;
  if (e.code === 'KeyD') state.move.r = 0;
});

canvas.addEventListener('click', () => {
  if (state.running && !state.paused && !isTouch) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  state.pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!state.pointerLocked || !state.running || state.paused) return;
  const s = 0.0022 * state.sens;
  state.yaw -= e.movementX * s;
  state.pitch -= e.movementY * s;
  state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state.running && !state.paused && state.pointerLocked) {
    state.shootHeld = true; shoot();
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) state.shootHeld = false;
});

/* Mobile joystick + look */
(function setupMobile() {
  const joyZone = $('#joy-zone');
  const knob = $('#joy-knob');
  const base = $('#joy-base');
  const lookZone = $('#look-zone');
  let joyId = null, lookId = null, lookLast = null;

  function setKnob(x, y) {
    const max = 34;
    const l = Math.hypot(x,y) || 1;
    const cx = x/l*Math.min(l,max), cy = y/l*Math.min(l,max);
    knob.style.transform = `translate(${cx}px, ${cy}px)`;
    state.joy.x = cx/max;
    state.joy.y = -cy/max;
  }
  function resetJoy() {
    knob.style.transform = 'translate(0,0)';
    state.joy.x = 0; state.joy.y = 0; joyId = null;
  }

  joyZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const rect = base.getBoundingClientRect();
    setKnob(t.clientX - (rect.left+rect.width/2), t.clientY - (rect.top+rect.height/2));
    e.preventDefault();
  }, {passive:false});
  joyZone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        const rect = base.getBoundingClientRect();
        setKnob(t.clientX - (rect.left+rect.width/2), t.clientY - (rect.top+rect.height/2));
      }
    }
    e.preventDefault();
  }, {passive:false});
  joyZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) resetJoy();
  });
  joyZone.addEventListener('touchcancel', resetJoy);

  lookZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookLast = { x:t.clientX, y:t.clientY };
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId && lookLast) {
        const dx = t.clientX - lookLast.x;
        const dy = t.clientY - lookLast.y;
        lookLast = { x:t.clientX, y:t.clientY };
        const s = 0.0035 * state.sens;
        state.yaw -= dx * s;
        state.pitch -= dy * s;
        state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
      }
    }
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) { lookId=null; lookLast=null; }
  });

  const fireBtn = $('#btn-fire');
  fireBtn.addEventListener('touchstart', (e) => { state.shootHeld = true; fireBtn.classList.add('held'); shoot(); e.preventDefault(); }, {passive:false});
  fireBtn.addEventListener('touchend', () => { state.shootHeld = false; fireBtn.classList.remove('held'); });
  fireBtn.addEventListener('touchcancel', () => { state.shootHeld = false; fireBtn.classList.remove('held'); });
  $('#btn-reload').addEventListener('touchstart', (e) => { reload(); e.preventDefault(); }, {passive:false});
  $('#btn-pause-m').addEventListener('click', () => pauseGame());
})();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ===================== UI WIRING ===================== */
function buildLevelSelect() {
  const box = $('#level-select');
  box.innerHTML = '';
  LEVELS.forEach((lv) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (lv.id === state.level ? ' active' : '');
    b.disabled = lv.id > state.unlocked;
    b.innerHTML = `${lv.id}<span class="mini">${lv.name}</span>`;
    b.addEventListener('click', () => {
      state.level = lv.id;
      [...box.children].forEach(c => c.classList.remove('active'));
      b.classList.add('active');
      AudioFX.click();
    });
    box.appendChild(b);
  });
}

function syncSettingsUI() {
  $('#sens').value = state.sens; $('#sens2').value = state.sens;
  $('#mute').checked = state.muted; $('#mute2').checked = state.muted;
  $('#lowfx').checked = state.lowfx;
}
['sens','sens2'].forEach(id => $(`#${id}`).addEventListener('input', (e) => {
  state.sens = +e.target.value; $('#sens').value=state.sens; $('#sens2').value=state.sens; saveProgress();
}));
['mute','mute2'].forEach(id => $(`#${id}`).addEventListener('change', (e) => {
  state.muted = e.target.checked; $('#mute').checked=state.muted; $('#mute2').checked=state.muted; saveProgress();
}));
$('#lowfx').addEventListener('change', (e) => {
  state.lowfx = e.target.checked;
  renderer.shadowMap.enabled = !state.lowfx && !isTouch;
  saveProgress();
});

$('#btn-start').addEventListener('click', () => { AudioFX.unlock(); startLevel(state.level); });
$('#btn-resume').addEventListener('click', resumeGame);
$('#btn-restart').addEventListener('click', () => startLevel(state.level));
$('#btn-menu').addEventListener('click', () => {
  state.running=false; state.paused=false;
  $('#overlay-pause').classList.add('hidden');
  hud.classList.add('hidden');
  $('#mobile-ui').classList.add('hidden');
  crosshair.classList.remove('on');
  $('#overlay-start').classList.remove('hidden');
  buildLevelSelect();
});
$('#btn-next').addEventListener('click', () => startLevel(Math.min(MAX_LEVEL, state.level+1)));
$('#btn-clear-menu').addEventListener('click', () => {
  $('#overlay-clear').classList.add('hidden');
  hud.classList.add('hidden');
  $('#overlay-start').classList.remove('hidden');
  buildLevelSelect();
});
$('#btn-retry').addEventListener('click', () => startLevel(state.level));
$('#btn-dead-menu').addEventListener('click', () => {
  $('#overlay-dead').classList.add('hidden');
  hud.classList.add('hidden');
  $('#overlay-start').classList.remove('hidden');
  buildLevelSelect();
});

// boot preview scene
buildMap('range');
camRig.position.set(0, 1.65, 10);
buildLevelSelect();
syncSettingsUI();
if (isTouch) $('#lowfx').checked = true, state.lowfx = true;

console.info('[暗区突袭 v2] ready');
