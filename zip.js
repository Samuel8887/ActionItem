// Small, dependency-free ZIP writer (uncompressed entries, UTF-8 filenames).
(function(scope){
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
  function zipBytes(files){
    const enc=new TextEncoder(),chunks=[],directory=[];let offset=0;
    for(const file of files){
      const name=enc.encode(file.name),data=typeof file.data==='string'?enc.encode(file.data):file.data,crc=crc32(data);
      const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);
      const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
      chunks.push(header,data);directory.push(central);offset+=header.length+data.length;
    }
    const length=directory.reduce((sum,d)=>sum+d.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);
    const out=new Uint8Array(offset+length+22);let pos=0;for(const chunk of [...chunks,...directory,end]){out.set(chunk,pos);pos+=chunk.length;}return out;
  }
  function teamsManifest(site,developer){
    const url=new URL(site);if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash)throw new Error('Use an HTTPS website base URL without a query string or fragment.');
    if(!url.pathname.endsWith('/'))url.pathname+='/';
    return {$schema:'https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',manifestVersion:'1.19',version:'1.0.0',id:'99f86bce-a867-44e8-a094-9c75bf8ec82a',name:{short:'Together',full:'Together · Shared action items'},developer:{name:developer,websiteUrl:url.href,privacyUrl:new URL('privacy.html',url).href,termsOfUseUrl:new URL('terms.html',url).href},description:{short:'Shared action items that complete when everyone is done.',full:'Create shared action items for a fixed group. Each person marks their own part done. An item stays active until every assigned member completes it. Progress is securely stored in your configured Supabase project.'},icons:{color:'color.png',outline:'outline.png'},accentColor:'#6552CC',configurableTabs:[{configurationUrl:new URL('teams-config.html',url).href,canUpdateConfiguration:true,scopes:['team','groupChat']}],validDomains:[url.hostname]};
  }
  const api={crc32,zipBytes,teamsManifest};if(typeof module!=='undefined')module.exports=api;else scope.TogetherZIP=api;
})(globalThis);
