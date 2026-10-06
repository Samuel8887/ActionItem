/* Together: GitHub Pages frontend with Supabase shared storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const {escapeHTML:esc, parseMembers, progress} = window.TogetherDomain;
  let db, user, groups = [], members = [], tasks = [], groupId = '', view = 'active';
  let signup = false, recovering = false, generation = 0, syncing = false, lastTrigger;
  const busyTasks = new Set();
  const config = window.TOGETHER_CONFIG || {};
  const requestedGroup = new URLSearchParams(location.search).get('group');
  function name(email) {return email.split('@')[0].replace(/[._-]/g,' ');}
  function message(id, text, error = false) {$(id).textContent = text; $(id).hidden = !text; $(id).classList.toggle('tg-error',error);}
  function check(result) {if(result.error) throw result.error; return result.data;}
  function friendly(error) {return error?.message || 'Something went wrong. Please try again.';}
  async function submit(form, fn, status = 'modal-message') {
    const button = form.querySelector('[type="submit"]'); button.disabled = true; message(status,'');
    try {await fn();} catch(e) {message(status,friendly(e),true);} finally {button.disabled = false;}
  }
  function openModal(kind, trigger) {
    lastTrigger = trigger; $('modal-message').textContent = '';
    $('modal-title').textContent = kind === 'task' ? 'New action item' : kind === 'members' ? 'Add group members' : 'Create your group';
    $('task-form').hidden = kind !== 'task'; $('group-form').hidden = kind !== 'group';
    $('member-form').hidden = kind !== 'members';
    $('task-assignment-note').textContent = `Assigned to all ${members.length} members. Completes only when every member has clicked Done.`;
    $('modal-layer').hidden = false; (kind === 'task' ? $('task-title') : kind === 'members' ? $('member-emails') : $('group-name')).focus();
  }
  function closeModal() {$('modal-layer').hidden = true; lastTrigger?.focus();}
  function updateCounts() {
    const active = tasks.filter(t => !t.completed_at).length;
    document.querySelectorAll('[data-active-count]').forEach(el => el.textContent = active);
    document.querySelectorAll('[data-completed-count]').forEach(el => el.textContent = tasks.length - active);
  }
  function renderTasks() {
    updateCounts();
    document.querySelectorAll('.tg-tabs [data-view]').forEach(el => el.setAttribute('aria-selected',String(el.dataset.view === view)));
    document.querySelectorAll('.tg-nav [data-view]').forEach(el => el.classList.toggle('tg-active',el.dataset.view === view));
    $('task-list').setAttribute('aria-labelledby','tab-' + view);
    const visible = tasks.filter(t => view === 'active' ? !t.completed_at : !!t.completed_at);
    $('task-list').innerHTML = visible.map(t => {
      const participants = (t.tg_participants || []).sort((a,b) => a.email.localeCompare(b.email));
      const p = progress(participants,user.email.toLowerCase());
      const complete = !!t.completed_at;
      const date = t.due_on ? 'Due ' + new Date(t.due_on + 'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'}) : 'No due date';
      const pending = p.remaining.map(name).join(', ');
      return `<article class="tg-task" data-task="${esc(t.id)}"><div class="tg-task-top"><div class="tg-meta"><span class="tg-tag">${esc(groups.find(g=>g.id===groupId)?.name || 'GROUP')}</span><span>${esc(date)}</span></div><span class="tg-status ${p.mine || complete ? 'tg-done':''}">${complete?'✓ Everyone is done':p.mine?'✓ You’re done':p.remaining.length === 1?'You’re the last one':'Your action needed'}</span></div><h2>${esc(t.title)}</h2><p class="tg-description">${esc(t.details)}</p><div class="tg-task-bottom"><div class="tg-completion"><div class="tg-progress-label"><b>${p.done} of ${p.total} done</b><span>${complete?'Completed by everyone':`${p.total-p.done} remaining`}</span></div><div class="tg-track" role="progressbar" aria-label="Group completion" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><span class="tg-meter" style="width:${p.total?100*p.done/p.total:0}%"></span></div><div class="tg-people">${participants.map(person => `<span class="tg-person ${person.done_at?'tg-checked':''}"><span class="tg-dot" aria-hidden="true">${person.done_at?'✓':'·'}</span><span>${person.email===user.email.toLowerCase()?'You':esc(name(person.email))}<span class="tg-sr"> (${esc(person.email)}): ${person.done_at?'done':'pending'}</span></span></span>`).join('')}</div><details class="tg-roster"><summary>Member details</summary><ul>${participants.map(person=>`<li>${esc(person.email)} — ${person.done_at?'Done':'Pending'}</li>`).join('')}</ul></details></div><div class="tg-task-action"><button class="tg-done-button ${p.mine?'tg-undo-button':''}" data-toggle="${esc(t.id)}" ${busyTasks.has(t.id)?'disabled':''}>${busyTasks.has(t.id)?'Saving…':p.mine?'✓ Done by you · Undo':'✓ Mark done'}</button><div class="tg-action-note">${complete?'Undo reopens this item':p.mine?'Waiting for '+esc(pending):'Only marks your part done'}</div></div></div></article>`;
    }).join('') || `<div class="tg-empty"><h2>${view==='active'?'All caught up.':'No completed items yet.'}</h2><p>${view==='active'?'Create an action item for your group.':'Items arrive here once every group member has clicked Done.'}</p></div>`;
  }
  function renderGroup() {
    const group = groups.find(g => g.id === groupId);
    $('groups').innerHTML = groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    $('groups').value = groupId;
    $('no-group').hidden = !!group; $('group-content').hidden = !group; $('create-task').disabled = !group;
    $('add-members').hidden = !group || group.owner_id !== user.id;
    $('breadcrumb').textContent = group ? group.name + ' / Action items' : 'Your workspace';
    $('members').innerHTML = members.map(m=>`<div class="tg-member"><span class="tg-avatar">${esc(name(m.email).slice(0,2).toUpperCase())}</span><span>${esc(name(m.email))}${m.email===user.email.toLowerCase()?' · you':''}</span></div>`).join('');
    $('rule-text').textContent = `Items stay here until all ${members.length} members mark them done. Then they move to Completed.`;
    if(group) {
      const url = new URL(location.href); url.searchParams.set('group',groupId); url.hash=''; history.replaceState(null,'',url);
    }
    renderTasks();
  }
  async function sync(force = false) {
    if(!user || syncing && !force) return;
    const stamp = ++generation, uid = user.id;
    syncing = true; $('sync-state').textContent = 'Syncing shared progress…';
    try {
      const freshGroups = check(await db.from('tg_groups').select('id,name,owner_id').order('created_at'));
      if(stamp !== generation || user?.id !== uid) return;
      groups = freshGroups;
      if(!groups.some(g => g.id === groupId)) groupId = groups.find(g=>g.id===requestedGroup)?.id || groups[0]?.id || '';
      const selected = groupId;
      const [memberResult, taskResult] = selected ? await Promise.all([
        db.from('tg_members').select('email').eq('group_id',selected).order('email'),
        db.from('tg_tasks').select('*,tg_participants(email,done_at)').eq('group_id',selected).order('created_at',{ascending:false})
      ]) : [{data:[]},{data:[]}];
      const freshMembers = check(memberResult), freshTasks = check(taskResult);
      if(stamp !== generation || user?.id !== uid || selected !== groupId) return;
      members = freshMembers; tasks = freshTasks; renderGroup();
      $('sync-state').textContent = 'Shared progress · updates every 15 seconds · last synced ' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    } catch(e) {if(stamp===generation) {message('notice',friendly(e),true); $('sync-state').textContent='Could not sync. Use Refresh to try again.';}}
    finally {if(stamp===generation) syncing = false;}
  }
  function showUser(session) {
    const previous = user?.id; user = session?.user || null;
    $('auth').hidden = !!user; $('workspace').hidden = !user;
    if(!user) {++generation; syncing=false;groups=[];members=[];tasks=[];groupId='';closeModal();return;}
    $('current-user').textContent = user.email;
    if(previous !== user.id) {groupId='';sync(true);}
  }
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;renderTasks();}));
  $('groups').addEventListener('change',()=>{groupId=$('groups').value;tasks=[];members=[];view='active';renderGroup();sync(true);});
  $('refresh').addEventListener('click',()=>sync(true));
  $('create-task').addEventListener('click',e=>openModal('task',e.currentTarget));
  $('add-members').addEventListener('click',e=>openModal('members',e.currentTarget));
  ['new-group','first-group'].forEach(id=>$(id).addEventListener('click',e=>openModal('group',e.currentTarget)));
  $('modal-close').addEventListener('click',closeModal);document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModal));
  $('modal-layer').addEventListener('click',e=>{if(e.target===$('modal-layer'))closeModal();});
  document.addEventListener('keydown',e=>{
    if($('modal-layer').hidden)return;
    if(e.key==='Escape')closeModal();
    if(e.key==='Tab') {const controls=[...$('modal-layer').querySelectorAll('button,input,textarea')].filter(el=>!el.disabled && !el.closest('[hidden]'));const first=controls[0],last=controls.at(-1);if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}}
  });
  $('task-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{
    const title=$('task-title').value.trim();if(!title)throw new Error('Enter an action item title.');
    check(await db.rpc('tg_create_task',{p_group_id:groupId,p_title:title,p_details:$('task-details').value.trim(),p_due_on:$('task-due').value||null}));
    e.target.reset();closeModal();view='active';await sync(true);message('notice','Action item created for everyone in the group.');
  });});
  $('group-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{
    const emails=parseMembers($('group-emails').value,user.email);
    const title=$('group-name').value.trim();if(!title)throw new Error('Enter a group name.');
    groupId=check(await db.rpc('tg_create_group',{p_name:title,p_emails:emails}));
    e.target.reset();closeModal();view='active';await sync(true);message('notice','Group created. Share this page’s URL with the group. Each person signs up using their listed email.');
  });});
  $('member-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{
    const selected = groupId;
    if(groups.find(g=>g.id===selected)?.owner_id !== user.id) throw new Error('Only the group administrator can add members.');
    const emails=parseMembers($('member-emails').value,'');
    if(!emails.length) throw new Error('Enter at least one email address.');
    const result=check(await db.rpc('tg_add_members',{p_group_id:selected,p_emails:emails}));
    e.target.reset();closeModal();await sync(true);
    message('notice',result.added ? `${result.added} member(s) added to the group and active action items. Share this page with them; they sign in with their listed email.` : 'These email addresses are already in the group.');
  });});
  $('task-list').addEventListener('click',async e=>{
    const button=e.target.closest('[data-toggle]');if(!button)return;
    const id=button.dataset.toggle;if(busyTasks.has(id))return;
    const task=tasks.find(t=>t.id===id);if(!task)return;
    const desired=!progress(task.tg_participants,user.email.toLowerCase()).mine;
    busyTasks.add(id);button.disabled=true;button.textContent='Saving…';
    try {
      const result=check(await db.rpc('tg_set_done',{p_task_id:id,p_done:desired}));
      // A successful server write is required; never invent a local completion.
      await sync(true);
      message('notice',result.completed?'Everyone is done! The action item has moved to Completed.':desired?'Your part is done. The item stays active until everyone finishes.':'Your completion was undone. The item is active again.');
    }catch(err){message('notice',friendly(err),true);}
    finally {busyTasks.delete(id);renderTasks();}
  });
  $('auth-toggle').addEventListener('click',()=>{
    signup=!signup;recovering=false;$('auth-title').textContent=signup?'Your next step, together.':'Move forward, together.';$('auth-submit').textContent=signup?'Create account':'Sign in';$('auth-toggle').textContent=signup?'Already have an account? Sign in':'Create an account';$('password').autocomplete=signup?'new-password':'current-password';message('auth-message','');
  });
  $('auth-form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{
    const email=$('email').value.trim(),password=$('password').value;
    if(recovering) {check(await db.auth.updateUser({password}));recovering=false;$('auth-submit').textContent='Sign in';check(await db.auth.signOut());message('auth-message','Password updated. Sign in with your new password.');return;}
    if(signup) {
      const redirect=new URL('index.html',location.href).href;
      const data=check(await db.auth.signUp({email,password,options:{emailRedirectTo:redirect}}));
      message('auth-message',data.session?'Account created.':'Check your email to confirm your account, then return here and sign in.');
    }else check(await db.auth.signInWithPassword({email,password}));
    $('password').value='';
  },'auth-message');});
  $('forgot').addEventListener('click',async()=>{
    const email=$('email').value.trim();if(!email || !$('email').checkValidity()){message('auth-message','Enter your email address first.',true);return;}
    try {check(await db.auth.resetPasswordForEmail(email,{redirectTo:new URL('index.html',location.href).href}));message('auth-message','If an account exists, a password reset link will be sent to your email.');}catch(e){message('auth-message',friendly(e),true);}
  });
  $('signout').addEventListener('click',async()=>{try{check(await db.auth.signOut());}catch(e){message('notice',friendly(e),true);}});
  setInterval(()=>{if(!document.hidden)sync();},15000);
  window.addEventListener('focus',()=>sync());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  async function initializeTeams() {
    if(window.self===window.top || !window.microsoftTeams) return;
    try {await window.microsoftTeams.app.initialize();window.microsoftTeams.app.notifySuccess();const ctx=await window.microsoftTeams.app.getContext();document.documentElement.dataset.theme=ctx.app.theme;window.microsoftTeams.app.registerOnThemeChangeHandler(theme=>document.documentElement.dataset.theme=theme);}catch{/* Normal browser use does not depend on Teams. */}
  }
  initializeTeams();
  if(!config.supabaseUrl || config.supabaseUrl.includes('YOUR_PROJECT') || !config.supabasePublishableKey || config.supabasePublishableKey.includes('YOUR_')) {$('setup').hidden=false;return;}
  if(!window.supabase) {$('auth').hidden=false;message('auth-message','Could not load the sign-in library. Check your internet connection and reload.',true);$('auth-submit').disabled=true;return;}
  try {
    // In-memory fallback allows sign-in in Teams clients that block local storage.
    const memory=new Map();let storage;
    try{localStorage.setItem('tg-storage-check','1');localStorage.removeItem('tg-storage-check');storage=localStorage;}
    catch{storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};}
    db=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{storage,detectSessionInUrl:true,persistSession:true}});
    db.auth.onAuthStateChange((event,session)=>{
      setTimeout(()=>{
        if(event==='PASSWORD_RECOVERY'){recovering=true;user=null;$('workspace').hidden=true;$('auth').hidden=false;$('auth-title').textContent='Choose a new password';$('auth-submit').textContent='Save new password';$('email').value=session.user.email;$('password').autocomplete='new-password';return;}
        if(!recovering)showUser(session);
      },0);
    });
    db.auth.getSession().then(result=>{if(result.error)throw result.error;if(!recovering)showUser(result.data.session);}).catch(e=>{$('auth').hidden=false;message('auth-message',friendly(e),true);});
  }catch(e){$('auth').hidden=false;message('auth-message',friendly(e),true);}
})();
