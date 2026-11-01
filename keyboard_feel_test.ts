// keyboard_feel_test.ts  --  run with: npx tsx keyboard_feel_test.ts   (exit code 1 if any check fails)
// Measures how the car responds to DIGITAL (keyboard) steering at speed, with W held.
// Thresholds are STARTING TARGETS chosen from simple physics (a ~1 G car at 100 mph can only turn ~13 deg/s)
// and from the reference reel (full steer input at ~125 mph did not rotate the car). Tune them after driving.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
class HW { world=new RAPIER.World({x:0,y:-9.81,z:0}); rapier=RAPIER; acc=0;
  step(dt:number,fn:(d:number)=>void){this.acc+=dt; let n=0; while(this.acc>=1/120&&n<4){fn(1/120);this.world.step();this.acc-=1/120;n++;}}}
const { CustomRallyVehicle } = await import('./src/vehicles/CustomRallyVehicle.js');
const gearFor=(m:number)=>m>113?5:m>100?4:m>60?3:m>26?2:1;
type Hist={t:number;slip:number;yaw:number;head:number;latG:number;roll:number};
function drive(mph:number, steerFn:(t:number)=>number, dur:number, throttle=1.0):Hist[]{
  const p=new HW(); const g=p.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.5,0));
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(50000,0.5,50000).setFriction(0.9),g);
  const v:any=new CustomRallyVehicle(new THREE.Scene(),p as any); v.tuning.surfaceMode='dirt'; v.resetPosition();
  const ms=mph*0.44704; v.chassisBody.setLinvel({x:0,y:0,z:ms},true); v.currentGear=gearFor(mph);
  for(let i=0;i<4;i++) v.wheelAngularVel[i]=ms/v.wheelRadius;
  const base={throttle,brake:0,steer:0,handbrake:false,reset:false,drivetrainToggle:false,demoSkidpad:false,demoHandbrake:false};
  for(let i=0;i<15;i++) p.step(1/120,d=>v.updatePhysicsSubstep(d,base));
  v.chassisBody.setLinvel({x:0,y:0,z:ms},true); for(let i=0;i<4;i++) v.wheelAngularVel[i]=ms/v.wheelRadius;
  const out:Hist[]=[]; let last=0, unwrapped=0, first=true;
  for(let f=0;f<dur*30;f++){
    const t=f/30; const inp={...base,steer:steerFn(t)};
    p.step(1/30,d=>v.updatePhysicsSubstep(d,inp)); v.updateVisuals(inp,1/30);
    const r=v.chassisBody.rotation(); const q=new THREE.Quaternion(r.x,r.y,r.z,r.w);
    const lv=v.chassisBody.linvel(); const vel=new THREE.Vector3(lv.x,0,lv.z);
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(q).setY(0).normalize(); const right=new THREE.Vector3(1,0,0).applyQuaternion(q).setY(0).normalize();
    const slip=THREE.MathUtils.radToDeg(Math.atan2(vel.dot(right),Math.max(Math.abs(vel.dot(fwd)),1)));
    const head=THREE.MathUtils.radToDeg(Math.atan2(fwd.x,fwd.z)); if(first){last=head;first=false;}
    let d=head-last; if(d>180)d-=360; if(d<-180)d+=360; unwrapped+=d; last=head;
    out.push({t,slip,yaw:THREE.MathUtils.radToDeg(v.chassisBody.angvel().y),head:unwrapped,latG:v.smoothedLateralG||0,roll:v.currentVisualRoll||0});
  }
  return out;
}
let fails=0,total=0; const check=(ok:boolean,label:string,detail:string)=>{total++; if(!ok)fails++; console.log(`${ok?'PASS':'FAIL'}  ${label.padEnd(52)} ${detail}`);};
const recoverTime=(h:Hist[],tEnd:number)=>{ for(const s of h) if(s.t>tEnd && Math.abs(s.slip)<3 && Math.abs(s.yaw)<4) return s.t-tEnd; return Infinity; };
console.log('=== 1. SINGLE 0.3 s KEY TAP, W held ===');
for(const mph of [60,80,100,120]) for(const side of [1,-1]){
  const h=drive(mph,t=>(t>=0.5&&t<0.8)?side:0,4.0); const post=h.filter(s=>s.t>=0.5);
  const ps=Math.max(...post.map(s=>Math.abs(s.slip))), hd=Math.abs(h[h.length-1].head), rec=recoverTime(h,0.8);
  const maxSlip=mph>=100?6:9;
  check(ps<=maxSlip && hd<=10 && rec<=0.8,`${mph} mph tap ${side>0?'right':'left '}`,`peak slip ${ps.toFixed(1)} (<=${maxSlip}) heading ${hd.toFixed(1)} (<=10) recover ${rec===Infinity?'never':rec.toFixed(2)+'s'} (<=0.8)`);
}
console.log('\n=== 2. KEY HELD 1.0 s, then released ===');
for(const mph of [60,80,100]){
  const h=drive(mph,t=>(t>=0.5&&t<1.5)?1:0,5.0); const post=h.filter(s=>s.t>=0.5);
  const ps=Math.max(...post.map(s=>Math.abs(s.slip))), hd=Math.abs(h[h.length-1].head), rec=recoverTime(h,1.5);
  check(ps<=12 && hd<=40 && rec<=1.5,`${mph} mph hold 1 s`,`peak slip ${ps.toFixed(1)} (<=12) heading ${hd.toFixed(1)} (<=40) recover ${rec===Infinity?'never':rec.toFixed(2)+'s'} (<=1.5)`);
}
console.log('\n=== 3. LEFT/RIGHT SYMMETRY (80 mph tap) ===');
{ const a=drive(80,t=>(t>=0.5&&t<0.8)?1:0,3), b=drive(80,t=>(t>=0.5&&t<0.8)?-1:0,3);
  const pa=Math.max(...a.map(s=>Math.abs(s.slip))), pb=Math.max(...b.map(s=>Math.abs(s.slip)));
  check(Math.abs(pa-pb)<=1,'left vs right peak slip',`right ${pa.toFixed(1)} left ${pb.toFixed(1)} (diff <=1)`); }
console.log('\n=== 4. BODY ROLL FOLLOWS LATERAL G, NOT THE KEY (70 mph, hold 1 s then release) ===');
{ const h=drive(70,t=>(t>=0.5&&t<1.5)?1:0,4.0); const pre=Math.abs(h.filter(s=>s.t<1.5).pop()!.roll);
  const after=h.filter(s=>s.t>1.5&&s.t<=2.0&&Math.abs(s.latG)>0.6);
  const minRoll=Math.min(...after.map(s=>Math.abs(s.roll))); let maxStep=0; for(let i=1;i<h.length;i++) maxStep=Math.max(maxStep,Math.abs(h[i].roll-h[i-1].roll));
  check(after.length>0 && minRoll>=0.4*pre,'roll stays while still sliding after release',`pre-release roll ${pre.toFixed(1)}deg, min roll while |latG|>0.6: ${minRoll.toFixed(1)}deg (>= ${(0.4*pre).toFixed(1)})`);
  check(maxStep<=1.0,'no roll jump larger than 1 deg per frame',`largest per-frame change ${maxStep.toFixed(2)}deg (<=1.0)`); }
console.log(`\nSUMMARY: ${total-fails} passed, ${fails} failed`); process.exit(fails?1:0);
