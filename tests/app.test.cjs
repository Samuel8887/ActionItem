// Runs the actual app script against a small DOM adapter and a simulated backend.
// This covers browser event flow; it is not a live Supabase/RLS integration test.
const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const domain=require('../domain.js');
class Element {
  constructor(){this.hidden=false;this.value='';this.textContent='';this.innerHTML='';this.disabled=false;this.listeners={};this.dataset={};this.classList={toggle(){}};this.submitButton={disabled:false};}
  addEventListener(event,fn){this.listeners[event]=fn;}
  setAttribute(name,value){this[name]=value;}
  querySelector(){return this.submitButton;}
  querySelectorAll(){return [];}
  focus(){}
  reset(){this.value='';}
  checkValidity(){return true;}
  async fire(event,extra={}){await this.listeners[event]?.({target:this,currentTarget:this,preventDefault(){},...extra});}
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
async function boot(){
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  get('modal-layer').hidden=true;
  const activeCount=new Element(),completeCount=new Element(),tabs=['active','completed'].map(view=>{const e=new Element();e.dataset.view=view;return e;});
  const group={id:'g1',name:'Product team'};
  const rows=[{id:'t1',group_id:'g1',title:'Review checklist',details:'',created_at:'today',due_on:null,completed_at:null,tg_participants:[{email:'sam@example.com',done_at:null},{email:'alex@example.com',done_at:'today'},{email:'riley@example.com',done_at:null}]}];
  let rejectWrite=false,writes=0;
  const db={from(table){let groupFilter;return{select(){return this;},eq(_,value){groupFilter=value;return this;},order(){return this;},then(resolve,reject){const data=table==='tg_groups'?[group]:table==='tg_members'?rows[0].tg_participants.map(p=>({email:p.email})):rows.filter(t=>t.group_id===groupFilter);return Promise.resolve({data:structuredClone(data)}).then(resolve,reject);}};},
    async rpc(fn,args){writes++;if(rejectWrite)return{error:{message:'Write rejected'}};
      if(fn==='tg_set_done'){const row=rows.find(t=>t.id===args.p_task_id);const person=row.tg_participants.find(p=>p.email==='sam@example.com');person.done_at=args.p_done?'now':null;row.completed_at=row.tg_participants.every(p=>p.done_at)?'now':null;return{data:{completed:!!row.completed_at}};}
      if(fn==='tg_create_task'){rows.unshift({id:'new',group_id:args.p_group_id,title:args.p_title,details:args.p_details,due_on:args.p_due_on,completed_at:null,tg_participants:rows[0].tg_participants.map(p=>({email:p.email,done_at:null}))});return{data:'new'};}
      throw Error('Unexpected RPC');
    },auth:{onAuthStateChange(){},async getSession(){return{data:{session:{user:{id:'u1',email:'sam@example.com'}}}};}}};
  const document={hidden:false,getElementById:get,querySelectorAll(selector){if(selector==='[data-active-count]')return[activeCount];if(selector==='[data-completed-count]')return[completeCount];if(selector.includes('[data-view]'))return tabs;return[];},addEventListener(){}};
  const context={document,location:{href:'https://sam.github.io/together/',search:''},history:{replaceState(){}},URL,URLSearchParams,Date,Map,Set,Promise,console,globalThis:null,localStorage:{setItem(){},removeItem(){}},setTimeout:fn=>setImmediate(fn),setInterval(){},TogetherDomain:domain,TOGETHER_CONFIG:{supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'},supabase:{createClient:()=>db},addEventListener(){}};
  context.window=context;context.self=context;context.top=context;context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);await settle();
  const click=()=>get('task-list').fire('click',{target:{closest:()=>({dataset:{toggle:'t1'}})}});
  return{get,rows,tabs,click,activeCount,completeCount,get writes(){return writes;},reject(){rejectWrite=true;}};
}
test('actual UI keeps partially completed task visible and waits for pending member',async()=>{
  const app=await boot();await app.click();await settle();
  assert.match(app.get('task-list').innerHTML,/Review checklist/);assert.match(app.get('task-list').innerHTML,/2 of 3 done/);assert.equal(app.rows[0].completed_at,null);assert.equal(app.activeCount.textContent,1);
});
test('final completion moves task to archive, and undo reopens it',async()=>{
  const app=await boot();app.rows[0].tg_participants[2].done_at='today';await app.click();await settle();
  assert.doesNotMatch(app.get('task-list').innerHTML,/Review checklist/);assert.equal(app.completeCount.textContent,1);
  await app.tabs[1].fire('click');assert.match(app.get('task-list').innerHTML,/Review checklist/);
  await app.click();await settle();assert.equal(app.rows[0].completed_at,null);assert.equal(app.activeCount.textContent,1);
});
test('failed backend write does not invent a completion',async()=>{
  const app=await boot();app.reject();await app.click();await settle();
  assert.equal(app.rows[0].tg_participants[0].done_at,null);assert.match(app.get('notice').textContent,/Write rejected/);assert.match(app.get('task-list').innerHTML,/1 of 3 done/);
});
test('form creation saves a shared task and renders escaped title',async()=>{
  const app=await boot();app.get('task-title').value='<b>Shared review</b>';app.get('task-details').value='Review this';app.get('task-due').value='2026-10-12';
  await app.get('task-form').fire('submit');await settle();assert.equal(app.writes,1);assert.equal(app.rows[0].title,'<b>Shared review</b>');assert.match(app.get('task-list').innerHTML,/&lt;b&gt;Shared review&lt;\/b&gt;/);assert.equal(app.rows[0].tg_participants.length,3);
});
