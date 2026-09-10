'use strict';
// No packages or real browser storage required: exercise the shipped functions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const projectRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.webmanifest'), 'utf8'));
new vm.Script(source);
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, 'Test source boundary exists');
  return source.slice(from, to);
}
async function run() {
  assert(source.includes('function renderUnifiedEditors('), 'Editors share one renderer');
  assert(source.includes('function bindUnifiedEditor('), 'Editors share one event binder');
  assert.equal((source.match(/function unifiedEditorToolbar\(/g) || []).length, 1, 'Only one editor toolbar implementation exists');
  assert(html.includes('<section class="document-card" id="documentCard"></section>'), 'The primary editor has no duplicate static implementation');
  assert(!html.includes('id="imageInput"'), 'Obsolete global image input is removed');
  assert(html.includes('rel="manifest" href="manifest.webmanifest"'), 'Page declares its PWA manifest');
  assert.equal(manifest.name, 'Ramizom PowerMind');
  assert.equal(manifest.short_name, 'Ramizom PowerMind');
  assert.equal(manifest.description, 'A visual note workspace for blocks, mind maps, and handwriting.');
  assert(!source.includes('serviceWorker.register'), 'The app does not register a service worker');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Static HTML IDs are unique');
  const localAssets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1].split('?')[0]).filter(value => value && !value.startsWith('#') && !/^[a-z]+:/i.test(value));
  localAssets.forEach(asset => assert(fs.existsSync(path.join(projectRoot, asset)), `Local asset exists: ${asset}`));
  assert(source.includes('const detectedLanguage = () =>'), 'Browser language is detected before a preference is saved');
  assert(source.includes("$('#collapseNav').onclick=toggleNavigationAndNotes"), 'The sole hamburger controls the primary and notes panes together');
  assert(source.includes("function toggleNavigationAndNotes(){const shell=$('.app-shell')"), 'Navigation and notes collapse in one atomic action');
  assert(source.includes('function activateNavigationScope(filter,folderId=null)'), 'Navigation items own the notes-pane toggle behavior');
  assert(source.includes("if(!isPortraitMobile()&&isCurrent){togglePane('notes');return;}"), 'Repeated desktop navigation selection toggles the notes pane');
  assert(source.includes("workSlot=$('#workMenuSlot')"), 'The sole hamburger moves into the editor after navigation is collapsed');
  assert(source.includes('function updateNoteCommandAvailability('), 'Selecting a newly created note refreshes command availability');
  assert(source.includes('updateNoteCommandAvailability(true);'), 'Newly selected notes immediately enable their note commands');
  assert(!html.includes('id="openNotesMobile"') && !html.includes('id="openNav"'), 'Redundant hamburger buttons are removed');
  assert(source.includes('class="menu-check"'), 'Sort selection uses an icon checkmark, not a text character');
  let sequence = 0;
  const context = vm.createContext({
    id: () => `test-${++sequence}`, clone: value => JSON.parse(JSON.stringify(value)),
    state: {}, updateStorageLabel() {}, console,
    localStorage: { getItem: () => null, setItem() { throw new Error('Quota'); } },
    navigator: { storage: { getDirectory: async () => { throw new Error('Unavailable'); } } }
  });
  vm.runInContext(section('  function copyImportedNote(', '  async function importBackup('), context);
  const original = { id:'n', blocks:[{id:'b', text:'正文'}], ideas:[{id:'root',root:true},{id:'child',parentId:'root'}], editors:[{id:'e',blocks:[{id:'eb',text:'second editor'}]}], inkStrokes:[{id:'ink',points:[]}] };
  const imported = context.copyImportedNote(original, 'workspace', 'folder');
  assert.equal(imported.ideas[1].parentId, imported.ideas[0].id);
  assert.notEqual(imported.ideas[0].id, 'root');
  assert.notEqual(imported.editors[0].blocks[0].id, 'eb');
  assert.equal(original.ideas[1].parentId, 'root', 'Source backup remains unchanged');
  assert.equal(imported.editors[0].blocks[0].text, 'second editor');
  assert.equal(context.copyImportedNote({id:'minimal'}, 'w', 'f').workspaceId, 'w');
  context.clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  context.safeColor=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'#c42b1c';
  context.t=key=>key;
  context.normalizedId=(value,used)=>{let next=value||context.id();while(used.has(next))next=context.id();used.add(next);return next;};
  vm.runInContext(section('  function findEditorPosition(', '  function firstMindMapPosition('), context);
  vm.runInContext(section('  function migrateDatabase(', '  function applyTranslations('), context);
  const normalized=context.migrateDatabase({version:3,workspaces:[{id:'w'}],folders:[{id:'f',workspaceId:'w'}],notes:[{id:'n',workspaceId:'w',folderId:'f',blocks:[{id:'b',type:'bad" onclick="alert(1)',color:'red" onmouseover="x'}],ideas:[{id:'r',root:true},{id:'a',parentId:'c'},{id:'c',parentId:'a'}]}]});
  assert.equal(normalized.notes[0].blocks[0].type,'text');
  assert.equal(normalized.notes[0].blocks[0].color,undefined);
  assert.equal(normalized.notes[0].ideas[1].parentId,'r','Cyclic parent chain repaired');
  assert.equal(normalized.notes[0].card.x,620);
  assert(Array.isArray(normalized.notes[0].editors));
  const layoutNote={card:{x:100,y:100,width:620,height:410},editors:[{id:'e1',x:120,y:120,width:620,height:410,blocks:[]},{id:'e2',x:140,y:140,width:620,height:410,blocks:[]}]};
  context.repairEditorOverlaps(layoutNote);
  const boxes=[{x:100,y:100,width:620,height:410},...layoutNote.editors];
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert(boxes[i].x+boxes[i].width<=boxes[j].x||boxes[j].x+boxes[j].width<=boxes[i].x||boxes[i].y+boxes[i].height<=boxes[j].y||boxes[j].y+boxes[j].height<=boxes[i].y,'Editors do not overlap');
  vm.runInContext(section('  const storage = {', '  function seedDatabase()') + '\nthis.testStorage=storage;', context);
  await assert.rejects(context.testStorage.save({notes:[]}), /Choose a system folder/);
  const makeDirectory=name=>{const entries=new Map();return{name,entries,queryPermission:async()=> 'granted',getDirectoryHandle:async(child,{create}={})=>{if(!entries.has(child)&&create)entries.set(child,makeDirectory(child));if(!entries.has(child))Object.assign(new Error('not found'),{name:'NotFoundError'});return entries.get(child);},getFileHandle:async(file,{create}={})=>{if(!entries.has(file)&&create)entries.set(file,{kind:'file',name:file,text:''});const record=entries.get(file);if(!record)throw Object.assign(new Error('not found'),{name:'NotFoundError'});return{getFile:async()=>({text:async()=>record.text}),createWritable:async()=>({write:async value=>{record.text=value;},close:async()=>{}})};},values:async function*(){for(const entry of entries.values())yield entry;},removeEntry:async key=>entries.delete(key)};};
  const directory=makeDirectory('Notes');context.state.directoryHandle=directory;
  const db={savedAt:20,notes:[{id:'recent',title:'Visible file'}],workspaces:[{id:'w'}],folders:[]};
  await context.testStorage.save(db);
  assert(directory.entries.has('powermind.workspace.json'),'Manifest is visible in selected folder');
  assert([...directory.entries.get('notes').entries.keys()].some(name=>name.includes('Visible file')&&name.endsWith('.powermind.json')),'Each note has a readable visible filename');
  const loaded=await context.testStorage.loadDirectory(directory);
  assert.equal(loaded.notes[0].title,'Visible file','Folder workspace round-trips');
  vm.runInContext(section('  function pointInPolygon(', '  function resolveInkColor('), context);
  const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
  assert.equal(context.pointInPolygon({x:5,y:5},square),true);
  assert.equal(context.pointInPolygon({x:15,y:5},square),false);
  console.log('PASS: syntax, unified editor path, import tree/IDs/content/source isolation, missing optional fields, system-folder storage, ink geometry');
}
module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
