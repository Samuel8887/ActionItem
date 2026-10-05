(() => {
  const $=id=>document.getElementById(id);
  $('site-url').value=new URL('./',location.href).href;
  $('package-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const manifest=window.TogetherZIP.teamsManifest($('site-url').value.trim(),$('developer').value.trim());
      if(!manifest.developer.name)throw new Error('Enter your team or developer name.');
      const icons=await Promise.all(['color','outline'].map(async icon=>{const response=await fetch('teams/'+icon+'.png');if(!response.ok)throw new Error('Icon file missing. Upload the entire site folder first.');return{name:icon+'.png',data:new Uint8Array(await response.arrayBuffer())};}));
      const bytes=window.TogetherZIP.zipBytes([{name:'manifest.json',data:JSON.stringify(manifest,null,2)},...icons]);
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download='together-teams-app.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      $('package-status').textContent='Downloaded. Upload this ZIP to Teams as a custom app.';
    }catch(err){$('package-status').textContent=err.message;}finally{button.disabled=false;}
  });
})();
