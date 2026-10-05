(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let db,teamsReady=false,groups=[];
  const base=new URL('./',location.href);
  const status=(text,error=false)=>{$('config-status').textContent=text;$('config-status').classList.toggle('tg-error',error);};
  function valid(){if(teamsReady)window.microsoftTeams.pages.config.setValidityState(groups.some(g=>g.id===$('config-group').value));}
  async function loadGroups(){
    const session=await db.auth.getSession();if(session.error)throw session.error;
    if(!session.data.session){$('config-signin').hidden=false;$('config-picker').hidden=true;groups=[];valid();return;}
    const result=await db.from('tg_groups').select('id,name').order('created_at');if(result.error)throw result.error;
    groups=result.data;$('config-group').replaceChildren(...groups.map(g=>{const option=document.createElement('option');option.value=g.id;option.textContent=g.name;return option;}));
    $('config-signin').hidden=true;$('config-picker').hidden=!groups.length;
    status(groups.length?'':'No groups found. Open Together and create a group first.');valid();
  }
  async function boot(){
    const c=window.TOGETHER_CONFIG;
    if(!c || c.supabaseUrl.includes('YOUR_PROJECT') || c.supabasePublishableKey.includes('YOUR_'))throw new Error('Configure Supabase in config.js before adding the Teams tab.');
    if(!window.supabase)throw new Error('The sign-in library did not load. Please reload.');
    let storage;
    try{localStorage.setItem('tg-storage-check','1');localStorage.removeItem('tg-storage-check');storage=localStorage;}catch{const m=new Map();storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
    db=window.supabase.createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{storage}});
    if(window.self!==window.top && window.microsoftTeams){
      await window.microsoftTeams.app.initialize();teamsReady=true;
      window.microsoftTeams.pages.config.setValidityState(false);
      window.microsoftTeams.pages.config.registerOnSaveHandler(async event=>{
        try{
          const group=groups.find(g=>g.id===$('config-group').value);if(!group)throw new Error('Sign in and choose a group first.');
          const url=new URL('index.html',base);url.searchParams.set('group',group.id);
          await window.microsoftTeams.pages.config.setConfig({entityId:'together-'+group.id+'-'+crypto.randomUUID(),suggestedDisplayName:'Action items',contentUrl:url.href,websiteUrl:url.href});event.notifySuccess();
        }catch(e){event.notifyFailure(e.message);}
      });
      window.microsoftTeams.app.notifySuccess();
    }
    await loadGroups();
    if(!teamsReady)status('This configuration page is used when adding the Together app as a tab inside Teams.');
  }
  $('config-group').addEventListener('change',valid);
  $('config-signin').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{if(!db)throw new Error('Configure the website first.');const r=await db.auth.signInWithPassword({email:$('config-email').value.trim(),password:$('config-password').value});if(r.error)throw r.error;$('config-password').value='';await loadGroups();}catch(err){status(err.message,true);}finally{button.disabled=false;}
  });
  boot().catch(e=>{status(e.message,true);$('config-signin').querySelector('button').disabled=true;});
})();
