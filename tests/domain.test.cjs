const test = require('node:test');
const assert = require('node:assert/strict');
const {parseMembers,progress,escapeHTML} = require('../domain.js');
const {zipBytes,crc32,teamsManifest} = require('../zip.js');

test('roster includes organiser and deduplicates addresses without losing pending members',()=>{
  assert.deepEqual(parseMembers('Alex@example.com, alex@example.com\n riley@example.com; jordan@example.com','SAM@example.com'),['sam@example.com','alex@example.com','riley@example.com','jordan@example.com']);
});
test('invalid addresses and oversized rosters are rejected',()=>{
  assert.throws(()=>parseMembers('alex@','sam@example.com'));
  assert.throws(()=>parseMembers(Array.from({length:100},(_,i)=>`p${i}@example.com`).join('\n'),'sam@example.com'));
});
test('partial completion stays active, including not-yet-registered members',()=>{
  const participants=[{email:'sam@example.com',done_at:'2026-10-05'},{email:'alex@example.com',done_at:null}];
  assert.deepEqual(progress(participants,'sam@example.com'),{done:1,total:2,complete:false,mine:true,remaining:['alex@example.com']});
});
test('all participants must finish and undo returns task to pending',()=>{
  const participants=[{email:'sam@example.com',done_at:'today'},{email:'alex@example.com',done_at:'today'}];
  assert.equal(progress(participants,'sam@example.com').complete,true);
  participants[0].done_at=null;
  assert.equal(progress(participants,'sam@example.com').complete,false);
  assert.equal(progress([],'sam@example.com').complete,false);
});
test('task content is escaped before HTML rendering',()=>{
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('Teams URLs preserve GitHub repository path and require HTTPS',()=>{
  const m=teamsManifest('https://sam.github.io/together','Sam’s team');
  assert.equal(m.configurableTabs[0].configurationUrl,'https://sam.github.io/together/teams-config.html');
  assert.deepEqual(m.validDomains,['sam.github.io']);
  assert.throws(()=>teamsManifest('http://example.com/','Team'));
  assert.throws(()=>teamsManifest('https://example.com/?group=1','Team'));
});
test('ZIP writer stores known bytes and a valid directory and CRC',()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const zipped=zipBytes([{name:'manifest.json',data:'{}'}]);
  const v=new DataView(zipped.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);
  assert.equal(v.getUint32(zipped.length-22,true),0x06054b50);
  assert.equal(v.getUint16(zipped.length-14,true),1);
});
