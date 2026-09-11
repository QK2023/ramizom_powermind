(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value||'')) ? value : '#c42b1c';
  const safeDataImage = value => /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(String(value||'')) ? String(value) : '';
  const normalizedId = (value, used) => {let next=/^[A-Za-z0-9_-]{1,128}$/.test(String(value||''))?String(value):id();while(used.has(next))next=id();used.add(next);return next;};

  const state = {
    db: null,
    workspaceId: null,
    noteId: null,
    filter: 'all',
    folderId: null,
    search: '',
    noteSort: localStorage.getItem('pm.noteSort') || 'recent',
    tool: 'select',
    view: { x: 40, y: 30, zoom: .78 },
    pen: { color: 'auto-contrast', size: 3, mode: 'pen' },
    drawing: false,
    inkSelection: new Set(),
    inkGuide: null,
    panning: false,
    history: [],
    future: [],
    saveTimer: null,
    selectedObject: null,
    formulaEdit: { target:'document', id:null },
    savedRange: null,
    contextTarget: null,
    noteMenuNoteId: null,
    noteMenuAnchor: null,
    directoryHandle: null,
    directoryName: '',
    recalledDirectoryHandle: null,
    recalledDirectoryName: '',
    legacyData: false,
    saveQueue: Promise.resolve(),
    recoveredData: false,
    imageViewer: { zoom:1, x:0, y:0 },
    readingMode: false,
    printing: false,
    mobileStage: 'editor',
    inkRenderTimer: null
  };

  const supportedLanguages = new Set(['en','zh','es','fr','de','pt','ko','ja']);
  const detectedLanguage = () => {
    const browserLanguage = String(navigator.language || navigator.languages?.[0] || 'en').toLowerCase().split('-')[0];
    return supportedLanguages.has(browserLanguage) ? browserLanguage : 'en';
  };
  const language = () => {
    const saved = localStorage.getItem('pm.language');
    return supportedLanguages.has(saved) ? saved : detectedLanguage();
  };
  const t = key => (window.PM_I18N[language()] || window.PM_I18N.en)[key] || window.PM_I18N.en[key] || key;
  const activeNote = () => state.db.notes.find(note => note.id === state.noteId);
  const noteName = note => note?.fileName || note?.title || t('untitled');
  const activeWorkspace = () => state.db.workspaces.find(workspace => workspace.id === state.workspaceId);
  const folderName = folderId => state.db.folders.find(folder => folder.id === folderId)?.name || t('allNotes');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[char]);
  const plainText = value => {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return template.content.textContent || '';
  };
  const formatDate = timestamp => new Intl.DateTimeFormat(language(), { month:'short', day:'numeric', year:'numeric' }).format(timestamp);
  function applyBodyFontSize(value=localStorage.getItem('pm.bodyFontSize')||'16') { const size=clamp(Number(value)||16,14,22); document.documentElement.style.setProperty('--body-font-size',`${size}px`); const input=$('#bodyFontSize'),output=$('#bodyFontSizeValue');if(input)input.value=size;if(output)output.value=`${size} px`; }

  function formulaToMathML(source='') {
    const greek={alpha:'α',beta:'β',gamma:'γ',delta:'δ',theta:'θ',lambda:'λ',mu:'μ',pi:'π',sigma:'σ',phi:'φ',omega:'ω',infty:'∞',sum:'∑',prod:'∏',int:'∫',pm:'±',times:'×',div:'÷',le:'≤',ge:'≥',neq:'≠',approx:'≈'};
    let index=0;
    const atom=()=>{
      const char=source[index];
      if(char==='{'){index++;const value=sequence('}');index++;return `<mrow>${value}</mrow>`;}
      if(char==='\\'){
        index++;let command='';while(/[A-Za-z]/.test(source[index]||''))command+=source[index++];
        if(command==='frac'){const top=atom(),bottom=atom();return `<mfrac>${top}${bottom}</mfrac>`;}
        if(command==='sqrt')return `<msqrt>${atom()}</msqrt>`;
        if(command==='text')return `<mtext>${stripTags(atom())}</mtext>`;
        return `<mo>${greek[command]||escapeHtml(command)}</mo>`;
      }
      index++;
      if(/[0-9.]/.test(char)){let value=char;while(/[0-9.]/.test(source[index]||''))value+=source[index++];return `<mn>${value}</mn>`;}
      if(/[A-Za-z]/.test(char))return `<mi>${char}</mi>`;
      if(/[ \t\r\n]/.test(char))return '<mspace width=".25em"/>';
      return `<mo>${escapeHtml(char)}</mo>`;
    };
    const sequence=stop=>{const tokens=[];while(index<source.length&&source[index]!==stop){if((source[index]==='^'||source[index]==='_')&&tokens.length){const kind=source[index++],script=atom(),base=tokens.pop();tokens.push(kind==='^'?`<msup>${base}${script}</msup>`:`<msub>${base}${script}</msub>`);}else tokens.push(atom());}return tokens.join('');};
    const stripTags=value=>value.replace(/<[^>]+>/g,'');
    try{return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow>${sequence()}</mrow></math>`;}catch{return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext>${escapeHtml(source)}</mtext></math>`;}
  }

  const storage = {
    manifest: 'powermind.workspace.json',
    handleDb: 'ramizom.powermind.handles',
    parse(value){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:null;}catch{return null;}},
    openHandleStore(mode='readonly') {
      return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(new Error('IndexedDB unavailable'));const request=indexedDB.open(this.handleDb,1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result.transaction('handles',mode).objectStore('handles'));});
    },
    async rememberHandle(handle){const store=await this.openHandleStore('readwrite');await new Promise((resolve,reject)=>{const request=store.put(handle,'workspace-directory');request.onsuccess=resolve;request.onerror=()=>reject(request.error);});},
    async forgetHandle(){try{const store=await this.openHandleStore('readwrite');await new Promise((resolve,reject)=>{const request=store.delete('workspace-directory');request.onsuccess=resolve;request.onerror=()=>reject(request.error);});}catch{}},
    async recalledHandle(){try{const store=await this.openHandleStore();return await new Promise((resolve,reject)=>{const request=store.get('workspace-directory');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}catch{return null;}},
    async writeJson(directory,name,value){const file=await directory.getFileHandle(name,{create:true}),writer=await file.createWritable();await writer.write(JSON.stringify(value,null,2));await writer.close();},
    async readJson(directory,name){const handle=await directory.getFileHandle(name),file=await handle.getFile(),parsed=this.parse(await file.text());if(!parsed)throw new Error(`${name} is not valid JSON`);return parsed;},
    async loadDirectory(directory) {
      const manifest=await this.readJson(directory,this.manifest);
      if(manifest.app!=='Ramizom PowerMind'||!Array.isArray(manifest.noteFiles))throw new Error('This is not a valid PowerMind workspace folder.');
      const notesDirectory=await directory.getDirectoryHandle('notes');
      const notes=[];
      for(const entry of manifest.noteFiles){if(!entry?.file||!entry.file.endsWith('.powermind.json'))continue;const note=await this.readJson(notesDirectory,entry.file);if(note&&note.id===entry.id)notes.push(note);}
      return {version:3,savedAt:manifest.savedAt,workspaces:manifest.workspaces||[],folders:manifest.folders||[],notes};
    },
    async loadLegacy(){const candidates=[];for(const key of ['ramizom.powermind.v3','ramizom.powermind.v3.backup','ramizom.powermind.data.v1']){try{const value=this.parse(localStorage.getItem(key));if(value)candidates.push(value);}catch{}}const valid=candidates.filter(value=>Array.isArray(value.notes)&&Array.isArray(value.workspaces));valid.sort((a,b)=>(Number(b.savedAt)||0)-(Number(a.savedAt)||0));if(valid[0])state.legacyData=true;return valid[0]||null;},
    async restore() {
      const handle=await this.recalledHandle();
      if(handle){
        let permission='prompt';try{permission=await handle.queryPermission?.({mode:'readwrite'})||'prompt';}catch{}
        if(permission==='granted'){try{const db=await this.loadDirectory(handle);state.directoryHandle=handle;state.directoryName=handle.name;return db;}catch(error){console.warn('Could not reopen PowerMind folder',error);}}
        state.recalledDirectoryHandle=handle;state.recalledDirectoryName=handle.name||'';
      }
      return await this.loadLegacy();
    },
    async save(db) {
      const directory=state.directoryHandle;if(!directory){const error=new Error('Choose a system folder to save notes.');error.code='NO_DIRECTORY';throw error;}
      if(await directory.queryPermission?.({mode:'readwrite'})!=='granted'){const error=new Error('Folder access is no longer available.');error.code='NO_DIRECTORY';throw error;}
      const notesDirectory=await directory.getDirectoryHandle('notes',{create:true}),noteFiles=[];
      const filePart=value=>String(value||'Untitled').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1F]/g,' ').replace(/[. ]+$/g,'').trim().slice(0,54)||'Untitled';
      for(const note of db.notes){const workspace=db.workspaces.find(item=>item.id===note.workspaceId),folder=db.folders.find(item=>item.id===note.folderId),file=`${filePart(workspace?.name)} - ${filePart(folder?.name)} - ${filePart(note.fileName||'Untitled')} -- ${String(note.id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,8)}.powermind.json`;await this.writeJson(notesDirectory,file,note);noteFiles.push({id:note.id,file});}
      const keep=new Set(noteFiles.map(item=>item.file));if(notesDirectory.values)for await(const entry of notesDirectory.values()){if(entry.kind==='file'&&entry.name.endsWith('.powermind.json')&&!keep.has(entry.name))await notesDirectory.removeEntry(entry.name);}
      await this.writeJson(directory,this.manifest,{app:'Ramizom PowerMind',format:'folder-workspace',version:1,savedAt:db.savedAt||Date.now(),workspaces:db.workspaces,folders:db.folders,noteFiles});
      updateStorageLabel();
    },
    async clearLegacy(){for(const key of ['ramizom.powermind.v3','ramizom.powermind.v3.backup','ramizom.powermind.data.v1'])try{localStorage.removeItem(key);}catch{}try{const root=await navigator.storage?.getDirectory?.();for(const name of ['powermind-v3.json','powermind-v3.backup.json'])try{await root.removeEntry(name);}catch{}}catch{}state.legacyData=false;}
  };

  function seedDatabase() {
    const workspaceId = id();
    const inboxId = id();
    const projectsId = id();
    const rootIdeaId = id();
    const now = Date.now();
    return {
      version: 3,
      workspaces: [{ id:workspaceId, name:'PowerMind', color:'#c42b1c' }],
      folders: [
        { id:inboxId, workspaceId, name:language() === 'zh' ? '收件箱' : 'Inbox' },
        { id:projectsId, workspaceId, name:language() === 'zh' ? '项目' : 'Projects' }
      ],
      notes: [{
        id:id(), workspaceId, folderId:inboxId, fileName:language() === 'zh' ? '欢迎使用 PowerMind' : 'Welcome to PowerMind', title:language() === 'zh' ? '欢迎使用 PowerMind' : 'Welcome to PowerMind',
        created:now, updated:now, favorite:true, trashed:false,
        card:{ x:620, y:420 },
        blocks:[
          { id:id(), type:'heading', text:language() === 'zh' ? '把想法放在同一张画布上' : 'Keep every kind of thought on one canvas' },
          { id:id(), type:'text', text:language() === 'zh' ? '这里可以像 Loop 一样编辑内容块，也能直接添加思维节点和手写批注。' : 'Edit structured blocks, connect mind-map ideas, and annotate with ink without changing views.' },
          { id:id(), type:'todo', text:language() === 'zh' ? '拖动卡片和想法节点' : 'Drag the card and idea nodes', done:false },
          { id:id(), type:'todo', text:language() === 'zh' ? '使用平移工具浏览画布' : 'Use the Pan tool to navigate the canvas', done:false }
        ],
        ideas:[
          { id:rootIdeaId, text:'PowerMind', x:1550, y:620, root:true, parentId:null, collapsed:false },
          { id:id(), text:language() === 'zh' ? '研究' : 'Research', x:1330, y:420, parentId:rootIdeaId, collapsed:false },
          { id:id(), text:language() === 'zh' ? '灵感' : 'Ideas', x:1810, y:430, parentId:rootIdeaId, collapsed:false },
          { id:id(), text:language() === 'zh' ? '行动' : 'Actions', x:1810, y:820, parentId:rootIdeaId, collapsed:false }
        ],
        cards:[], editors:[], ink:null, inkStrokes:[]
      }]
    };
  }

  function migrateDatabase(raw) {
    if (!raw) return seedDatabase();
    const source = raw.data || raw;
    if (source.version === 3&&Array.isArray(source.workspaces)&&Array.isArray(source.folders)&&Array.isArray(source.notes)) {
      if(!source.workspaces.length)return seedDatabase();
      const usedIds=new Set(),workspaceIds=new Map(source.workspaces.map(item=>[item.id,normalizedId(item.id,usedIds)])),folderIds=new Map(source.folders.map(item=>[item.id,normalizedId(item.id,usedIds)]));
      source.workspaces.forEach(workspace=>{workspace.id=workspaceIds.get(workspace.id);workspace.color=safeColor(workspace.color);});
      source.folders.forEach(folder=>{folder.id=folderIds.get(folder.id);folder.workspaceId=workspaceIds.get(folder.workspaceId)||source.workspaces[0].id;});
      source.workspaces.forEach(workspace=>{if(!source.folders.some(folder=>folder.workspaceId===workspace.id))source.folders.push({id:normalizedId(null,usedIds),workspaceId:workspace.id,name:'Inbox'});});
      source.notes.forEach(note => {
        note.title=String(note.title||'');note.fileName=String(note.fileName||note.title||'');note.primaryEditorDeleted=Boolean(note.primaryEditorDeleted);note.created=Number.isFinite(Number(note.created))?Number(note.created):Date.now();note.updated=Number.isFinite(Number(note.updated))?Number(note.updated):note.created;
        note.id=normalizedId(note.id,usedIds);note.workspaceId=workspaceIds.get(note.workspaceId)||source.workspaces[0].id;note.folderId=folderIds.get(note.folderId)||source.folders.find(folder=>folder.workspaceId===note.workspaceId)?.id||null;
        if(!Array.isArray(note.blocks)||!note.blocks.length)note.blocks=[{id:id(),type:'text',text:''}];if(!Array.isArray(note.ideas))note.ideas=[];if(!Array.isArray(note.cards))note.cards=[];if(!Array.isArray(note.editors))note.editors=[];if(!Array.isArray(note.inkStrokes))note.inkStrokes=[];note.card ||= {x:620,y:420};note.card.z=Number.isFinite(note.card.z)?note.card.z:3;note.card.width=clamp(Number(note.card.width)||620,360,1400);{const savedHeight=Number(note.card.height);note.card.height=note.card.height!=null&&Number.isFinite(savedHeight)?clamp(savedHeight,410,2000):null;}
        note.blocks.forEach(block=>block.id=normalizedId(block.id,usedIds));note.cards.forEach(card=>card.id=normalizedId(card.id,usedIds));note.cards.forEach(card=>note.ideas.push({id:normalizedId(null,usedIds),text:card.text||t('newMindMap'),x:Number.isFinite(card.x)?card.x:1400,y:Number.isFinite(card.y)?card.y:600,root:true,parentId:null,collapsed:false,formula:null}));note.cards=[];note.editors.forEach((editor,index)=>{editor.id=normalizedId(editor.id,usedIds);editor.title=String(editor.title??'');editor.x=Number.isFinite(editor.x)?editor.x:900+index*40;editor.y=Number.isFinite(editor.y)?editor.y:500+index*40;editor.z=Number.isFinite(editor.z)?editor.z:4+index;editor.width=clamp(Number(editor.width)||460,360,1400);editor.height=clamp(Number(editor.height)||330,410,2000);if(!Array.isArray(editor.blocks)||!editor.blocks.length)editor.blocks=[{id:normalizedId(null,usedIds),type:'text',text:''}];else editor.blocks.forEach(block=>block.id=normalizedId(block.id,usedIds));});repairEditorOverlaps(note);note.inkStrokes.forEach(stroke=>{stroke.id=normalizedId(stroke.id,usedIds);if(['#202124','#000000','#000'].includes(String(stroke.color).toLowerCase()))stroke.color='auto-contrast';if(['#ffffff','#fff'].includes(String(stroke.color).toLowerCase()))stroke.color='auto-inverse';});const ideaIds=new Map(note.ideas.map(idea=>[idea.id,normalizedId(idea.id,usedIds)]));note.ideas.forEach(idea=>{idea.id=ideaIds.get(idea.id);idea.parentId=idea.parentId?ideaIds.get(idea.parentId)||null:null;});
        const root=note.ideas.find(idea=>idea.root)||note.ideas[0];
        note.ideas.forEach(idea=>{idea.collapsed=Boolean(idea.collapsed);idea.root=Boolean(idea.root)||idea===root;if(idea.root)idea.parentId=null;else if(root&&(idea.parentId===undefined||idea.parentId===idea.id||!note.ideas.some(parent=>parent.id===idea.parentId)))idea.parentId=root.id;idea.x=Number.isFinite(idea.x)?idea.x:1400;idea.y=Number.isFinite(idea.y)?idea.y:600;});
        const byId=new Map(note.ideas.map(idea=>[idea.id,idea]));
        note.ideas.forEach(idea=>{const seen=new Set([idea.id]);let parent=byId.get(idea.parentId);while(parent){if(seen.has(parent.id)){idea.parentId=root&&root!==idea?root.id:null;break;}seen.add(parent.id);parent=byId.get(parent.parentId);}});
        const blockTypes=new Set(['text','heading1','heading','heading3','todo','bullets','quote','code','divider','formula','image']);
        [...note.blocks,...note.editors.flatMap(editor=>editor.blocks)].forEach(block=>{if(!blockTypes.has(block.type))block.type='text';block.text=String(block.text||'');if(block.html)block.html=sanitizeRichHtml(String(block.html));if(block.type==='image'){block.src=safeDataImage(block.src);if(!block.src){block.type='text';block.text='';delete block.src;}}if(block.color&&!/^#[0-9a-f]{6}$/i.test(block.color))delete block.color;});
        note.ink=safeDataImage(note.ink)||null;
        note.card.x=Number.isFinite(note.card.x)?note.card.x:620;note.card.y=Number.isFinite(note.card.y)?note.card.y:420;
      });
      return source;
    }
    const fallbackWorkspace = source.workspaces?.[0]?.id || id();
    const workspaces = (source.workspaces || [{ id:fallbackWorkspace, name:'PowerMind', color:'#c42b1c' }]).map(workspace => ({
      id:workspace.id || id(), name:workspace.name || 'PowerMind', color:['#687fd0','#7a68c8'].includes(workspace.color)?'#c42b1c':safeColor(workspace.color)
    }));
    const folders = (source.folders || []).map(folder => ({
      id:folder.id || id(), workspaceId:folder.workspaceId || folder.workspace || fallbackWorkspace, name:folder.name || 'Folder'
    }));
    if (!folders.length) folders.push({ id:id(), workspaceId:fallbackWorkspace, name:'Inbox' });
    const notes = (source.notes || []).map(note => {
      const container = document.createElement('div');
      container.innerHTML = note.content || '';
      let blocks = [...container.children].map(node => ({
        id:id(), type:/^H[1-3]$/.test(node.tagName) ? 'heading' : node.tagName === 'LI' ? 'bullets' : 'text', text:node.textContent || ''
      }));
      if (!blocks.length) blocks = [{ id:id(), type:'text', text:plainText(note.content) }];
      return {
        id:note.id || id(), workspaceId:note.workspaceId || fallbackWorkspace,
        folderId:note.folderId || note.folder || folders[0].id,
        fileName:note.fileName||note.title||'',title:note.title || '', created:note.created || note.updated || Date.now(), updated:note.updated || Date.now(),
        favorite:Boolean(note.favorite), trashed:Boolean(note.trashed), card:{ x:620, y:420 }, blocks,
        ideas:(note.ideas || note.map || []).map(idea => ({ id:idea.id || id(), text:idea.text || 'Idea', formula:idea.formula||null, parentId:idea.parentId||null, collapsed:Boolean(idea.collapsed), x:idea.x > 100 ? idea.x : 1200 + idea.x * 10, y:idea.y > 100 ? idea.y : 300 + idea.y * 12, root:Boolean(idea.root) })),
        cards:note.cards || [], editors:note.editors || [], ink:safeDataImage(note.ink)||null, inkStrokes:note.inkStrokes || []
      };
    });
    return { version:3, workspaces, folders, notes:notes.length ? notes : seedDatabase().notes };
  }

  function applyTranslations() {
    document.documentElement.lang = language();
    $$('[data-i18n]').forEach(element => element.textContent = t(element.dataset.i18n));
    $$('[data-i18n-placeholder]').forEach(element => element.placeholder = t(element.dataset.i18nPlaceholder));
    $$('[data-i18n-aria]').forEach(element=>{const label=t(element.dataset.i18nAria);element.setAttribute('aria-label',label);element.title=label;});
    updatePicker('language',language());updatePicker('theme',localStorage.getItem('pm.theme')||'system');updatePicker('accent',localStorage.getItem('pm.accent')||'red');updatePicker('penButton',localStorage.getItem('pm.penButtonAction')||'lasso');
  }

  function noteVisible(note) {
    if (note.workspaceId !== state.workspaceId) return false;
    if (state.filter === 'trash') return note.trashed;
    if (note.trashed) return false;
    if (state.filter === 'favorites' && !note.favorite) return false;
    if (state.filter === 'folder' && note.folderId !== state.folderId) return false;
    const haystack = `${note.fileName||''} ${note.title} ${[...note.blocks,...(note.editors||[]).flatMap(editor=>[{text:editor.title},...editor.blocks]),...(note.ideas||[])].map(block => block.text||block.formula||'').join(' ')}`.toLowerCase();
    return !state.search || haystack.includes(state.search.toLowerCase());
  }

  function openFolderMenu(folderId,anchor,x=null,y=null){
    const folder=state.db.folders.find(item=>item.id===folderId);if(!folder)return;
    const menu=$('#workspaceMenu');menu.innerHTML=`<button data-folder-action="rename">${t('rename')}</button><button data-folder-action="delete" class="danger">${t('permanentlyDelete')}</button>`;
    x===null?openMenuAt(menu,anchor):openMenu(menu,x,y);
    $('[data-folder-action="rename"]',menu).onclick=()=>showNameDialog(t('rename'),folder.name,name=>{folder.name=name;closeMenus();scheduleSave(true);renderAll();});
    $('[data-folder-action="delete"]',menu).onclick=()=>{if(!confirm(`${t('permanentlyDelete')} “${folder.name}”?`))return;let target=state.db.folders.find(item=>item.workspaceId===state.workspaceId&&item.id!==folderId);if(!target){target={id:id(),workspaceId:state.workspaceId,name:language()==='zh'?'收件箱':language()==='ja'?'受信トレイ':'Inbox'};state.db.folders.push(target);}state.db.notes.filter(note=>note.folderId===folderId).forEach(note=>note.folderId=target.id);state.db.folders=state.db.folders.filter(item=>item.id!==folderId);state.filter='folder';state.folderId=target.id;closeMenus();scheduleSave(true);renderAll();};
  }

  function renderNavigation() {
    const workspace = activeWorkspace();
    $('#workspaceName').textContent = workspace?.name || 'PowerMind';
    $('#workspaceColor').style.background = safeColor(workspace?.color);
    const activeNotes = state.db.notes.filter(note => note.workspaceId === state.workspaceId);
    $('#allCount').textContent = activeNotes.filter(note => !note.trashed).length;
    $('#favoriteCount').textContent = activeNotes.filter(note => note.favorite && !note.trashed).length;
    $('#trashCount').textContent = activeNotes.filter(note => note.trashed).length;
    $$('.nav-list .nav-item').forEach(button => button.classList.toggle('selected', button.dataset.filter === state.filter));
    $('#folderList').innerHTML = state.db.folders.filter(folder => folder.workspaceId === state.workspaceId).map(folder => `
      <div class="nav-item folder-item ${state.filter === 'folder' && state.folderId === folder.id ? 'selected' : ''}" data-folder-id="${folder.id}" role="button" tabindex="0">
        <span class="folder-glyph"></span><span>${escapeHtml(folder.name)}</span>
        <em>${state.db.notes.filter(note => note.folderId === folder.id && !note.trashed).length}</em><button class="folder-more overflow-button" aria-label="More"><svg><use href="#i-more"/></svg></button>
      </div>`).join('');
    $$('.folder-item').forEach(button => {
      button.addEventListener('click', event => {if(event.target.closest('.folder-more'))return;activateNavigationScope('folder',button.dataset.folderId);});
      button.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();activateNavigationScope('folder',button.dataset.folderId);}});
      $('.folder-more',button).onclick=event=>{event.stopPropagation();openFolderMenu(button.dataset.folderId,event.currentTarget);};
      button.addEventListener('contextmenu', event => {
        event.preventDefault();openFolderMenu(button.dataset.folderId,null,event.clientX,event.clientY);
      });
    });
  }

  function activateNavigationScope(filter,folderId=null) {
    const isCurrent = state.filter===filter && (filter!=='folder'||state.folderId===folderId);
    if(!isPortraitMobile()&&isCurrent){togglePane('notes');return;}
    state.filter=filter;state.folderId=filter==='folder'?folderId:null;
    renderNavigation();renderNoteList();revealPane('notes');showMobileStage('notes');
  }

  function renderNoteList() {
    const sorters={recent:(a,b)=>b.updated-a.updated,created:(a,b)=>b.created-a.created,title:(a,b)=>noteName(a).localeCompare(noteName(b),language()),manual:(a,b)=>(a.manualOrder??Number.MAX_SAFE_INTEGER)-(b.manualOrder??Number.MAX_SAFE_INTEGER)};
    const notes = state.db.notes.filter(noteVisible).sort(sorters[state.noteSort]||sorters.recent);
    let title = t('notes');
    if (state.filter === 'favorites') title = t('favorites');
    if (state.filter === 'trash') title = t('trash');
    if (state.filter === 'folder') title = folderName(state.folderId);
    $('#listTitle').textContent = title;
    $('#noteCount').textContent = `${notes.length} ${t('notes').toLowerCase()}`;
    $('#notesList').innerHTML = notes.map(note => `
      <article class="note-card ${note.id === state.noteId ? 'active' : ''}" data-note-id="${note.id}" tabindex="0" draggable="${state.noteSort==='manual'}">
        <div class="note-card-head"><h3>${escapeHtml(noteName(note))}</h3>${note.favorite ? '<svg><use href="#i-star"/></svg>' : ''}<button class="note-more overflow-button" aria-label="More"><svg><use href="#i-more"/></svg></button></div>
        <p>${escapeHtml(note.blocks.map(block => block.text).filter(Boolean).join(' · ') || '—')}</p>
        <footer><span>${formatDate(note.updated)}</span><span>•</span><span class="folder">${escapeHtml(folderName(note.folderId))}</span></footer>
      </article>`).join('');
    $('#notesList').hidden=notes.length===0;
    $('#notesEmpty').classList.toggle('show', notes.length === 0);
    $$('.note-card').forEach(card => {
      card.addEventListener('click', event => {if(event.target.closest('.note-more'))return;selectNote(card.dataset.noteId);showMobileStage('editor');});
      $('.note-more',card).onclick=event=>{event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();state.noteMenuNoteId=card.dataset.noteId;state.noteMenuAnchor=event.currentTarget;prepareNoteMenu();openMenu($('#noteMenu'),rect.right,rect.bottom);};
      $('h3',card).ondblclick=event=>{event.preventDefault();event.stopPropagation();state.noteMenuNoteId=card.dataset.noteId;handleNoteAction('rename');};
      card.addEventListener('keydown', event => { if (event.key === 'Enter') selectNote(card.dataset.noteId); });
      card.addEventListener('contextmenu', event => { event.preventDefault();state.noteMenuNoteId=card.dataset.noteId;state.noteMenuAnchor=card;selectNote(card.dataset.noteId);prepareNoteMenu();openMenu($('#noteMenu'),event.clientX,event.clientY); });
      card.addEventListener('dragstart',event=>{if(state.noteSort!=='manual'){event.preventDefault();return;}card.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/note-id',card.dataset.noteId);});
      card.addEventListener('dragend',()=>{$$('.note-card').forEach(item=>item.classList.remove('dragging','drop-before','drop-after'));});
      card.addEventListener('dragover',event=>{if(state.noteSort!=='manual')return;event.preventDefault();const before=event.clientY<card.getBoundingClientRect().top+card.offsetHeight/2;card.classList.toggle('drop-before',before);card.classList.toggle('drop-after',!before);});
      card.addEventListener('dragleave',()=>card.classList.remove('drop-before','drop-after'));
      card.addEventListener('drop',event=>{if(state.noteSort!=='manual')return;event.preventDefault();const sourceId=event.dataTransfer.getData('text/note-id'),targetId=card.dataset.noteId;if(!sourceId||sourceId===targetId)return;const ordered=state.db.notes.filter(noteVisible).sort(sorters.manual),sourceIndex=ordered.findIndex(note=>note.id===sourceId),[moved]=ordered.splice(sourceIndex,1),targetIndex=ordered.findIndex(note=>note.id===targetId),before=event.clientY<card.getBoundingClientRect().top+card.offsetHeight/2;ordered.splice(targetIndex+(before?0:1),0,moved);ordered.forEach((note,index)=>note.manualOrder=index);scheduleSave();renderNoteList();});
    });
    const sortLabels={recent:'recent',created:'dateCreated',title:'titleSort',manual:'manualSort'};$('#sortNotesLabel').textContent=t(sortLabels[state.noteSort]);
  }

  function selectNote(noteId, preserveHistory=false) {
    state.noteId = noteId;
    if(!preserveHistory){state.history=[];state.future=[];}state.selectedObject = null;
    const note = activeNote();
    if (!note) return;
    updateNoteCommandAvailability(true);
    $('#workEmpty').classList.remove('show');$('#canvasWorld').setAttribute('aria-hidden','false');
    $('#breadcrumb').textContent = `${activeWorkspace()?.name || 'PowerMind'}  /  ${folderName(note.folderId)}  /  ${noteName(note)}`;
    renderSecondaryEditors();renderIdeas();renderInk();renderNoteList();applyReadingMode();
    $('#notesList').closest('.notes-pane').classList.remove('mobile-open');
    if(isPortraitMobile()) showMobileStage('editor');
    if(!preserveHistory)requestAnimationFrame(focusPrimaryDocument);
  }

  function createNote() {
    state.readingMode=false;
    const folderId = state.filter === 'folder' ? state.folderId : state.db.folders.find(folder => folder.workspaceId === state.workspaceId)?.id;
    const note = { id:id(), workspaceId:state.workspaceId, folderId, fileName:'', title:'', created:Date.now(), updated:Date.now(), manualOrder:state.db.notes.filter(item=>item.workspaceId===state.workspaceId).length, favorite:false, trashed:false, primaryEditorDeleted:false, card:{x:620,y:420}, blocks:[{id:id(),type:'text',text:''}], ideas:[], cards:[], editors:[], ink:null, inkStrokes:[] };
    state.db.notes.unshift(note); state.noteId = note.id; state.filter = 'all'; scheduleSave(true); renderNavigation(); revealPane('notes'); selectNote(note.id); $('#noteTitle')?.focus();
  }

  function sanitizeRichHtml(html=''){const template=document.createElement('template');template.innerHTML=html;const allowed=new Set(['B','STRONG','I','EM','U','S','A','FONT','BR','CODE','SPAN']);[...template.content.querySelectorAll('*')].forEach(node=>{if(!allowed.has(node.tagName)){node.replaceWith(...node.childNodes);return;}[...node.attributes].forEach(attribute=>{const keep=(node.tagName==='A'&&['href','target','rel','class','data-wiki-title'].includes(attribute.name))||(node.tagName==='FONT'&&attribute.name==='color')||(node.tagName==='SPAN'&&attribute.name==='style');if(!keep)node.removeAttribute(attribute.name);});if(node.tagName==='A'&&node.hasAttribute('href')&&!/^(https?:|mailto:)/i.test(node.getAttribute('href')))node.removeAttribute('href');if(node.tagName==='SPAN'&&node.getAttribute('style')&&!/^color:\s*(#[0-9a-f]{3,8}|rgb\([^)]+\));?$/i.test(node.getAttribute('style')))node.removeAttribute('style');});return template.innerHTML;}
  function renderBlockHtml(block){const html=sanitizeRichHtml(block.html||escapeHtml(block.text));return html.replace(/\[\[([^\]]+)\]\]/g,(_,title)=>`<a class="wiki-link" data-wiki-title="${escapeHtml(title)}">${escapeHtml(title)}</a>`);}
  function renderBacklinks(){const note=activeNote(),area=$('#backlinks');if(!note||!area)return;const target=`[[${note.title}]]`.toLowerCase();const links=note.title?state.db.notes.filter(other=>other.id!==note.id&&!other.trashed&&other.blocks.some(block=>(`${block.text||''} ${block.html||''}`).toLowerCase().includes(target))):[];area.classList.toggle('show',links.length>0);area.innerHTML=links.length?`<strong>${escapeHtml(t('backlinks'))}</strong>${links.map(link=>`<button data-backlink="${link.id}">${escapeHtml(noteName(link))}</button>`).join('')}`:'';$$('[data-backlink]',area).forEach(button=>button.onclick=()=>selectNote(button.dataset.backlink));}

  function bindTypingHistory(editor){
    if(!editor)return;let lastCheckpoint=0;
    editor.addEventListener('input',()=>{if(state.readingMode)return;const now=Date.now();if(now-lastCheckpoint>1200){checkpoint();lastCheckpoint=now;}});
    editor.addEventListener('blur',()=>{lastCheckpoint=0;});
  }
  function prepareNoteImage(file,onReady){if(!file?.type?.startsWith('image/')){toast('Choose an image file.');return;}const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{const max=1600,scale=Math.min(1,max/image.width,max/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);onReady({src:canvas.toDataURL('image/jpeg',.88),alt:file.name,text:file.name});};image.onerror=()=>toast('The selected image could not be read.');image.src=reader.result;};reader.readAsDataURL(file);}
  function insertImageFile(file,afterId=null){prepareNoteImage(file,properties=>addBlock('image',afterId,properties));}

  const createEditorBlock=(type='text',properties={})=>({id:id(),type,text:'',done:false,...properties});
  function addBlock(type = 'text', afterId = null, properties = {}) {
    checkpoint();
    const note = activeNote();
    const block = createEditorBlock(type,properties);
    const index = afterId ? note.blocks.findIndex(item => item.id === afterId) + 1 : note.blocks.length;
    note.blocks.splice(index,0,block); renderBlocks(block.id); markChanged();
  }

  function setSlashSelection(index,focus=false){const menu=$('#slashMenu'),buttons=$$('button',menu);if(!buttons.length)return;const next=(index+buttons.length)%buttons.length;menu.dataset.activeIndex=String(next);buttons.forEach((button,itemIndex)=>{const selected=itemIndex===next;button.classList.toggle('keyboard-selected',selected);button.setAttribute('aria-selected',String(selected));});if(focus)buttons[next].focus();}
  function moveSlashSelection(delta,focus=false){const menu=$('#slashMenu'),current=Number(menu.dataset.activeIndex??-1),buttons=$$('button',menu);if(!buttons.length)return;setSlashSelection(current<0?(delta>0?0:buttons.length-1):current+delta,focus);}

  function renderIdeas() {
    const note = activeNote();
    const visible=note.ideas.filter(idea=>isIdeaVisible(idea,note.ideas));
    $('#ideaLayer').innerHTML = visible.map(idea => {const childCount=note.ideas.filter(item=>item.parentId===idea.id).length;return `<div class="idea-node ${idea.root?'root':''} ${idea.formula?'formula-node':''} ${idea.collapsed?'collapsed':''} ${state.selectedObject?.type==='idea'&&state.selectedObject.id===idea.id?'selected':''}" data-idea-id="${idea.id}" style="left:${idea.x}px;top:${idea.y}px">${idea.formula?formulaToMathML(idea.formula):`<input value="${escapeHtml(idea.text)}" aria-label="Idea" readonly>`}<span class="node-tools">${childCount?`<button data-toggle-branch="${idea.id}" aria-label="${escapeHtml(idea.collapsed?t('expand'):t('collapse'))}">${idea.collapsed?childCount:'−'}</button>`:''}<button data-add-child="${idea.id}" aria-label="${escapeHtml(t('addChild'))}">+</button><button data-delete-idea="${idea.id}" aria-label="${escapeHtml(t('delete'))}">×</button></span></div>`;}).join('');
    $$('.idea-node').forEach(element => {
      const idea = note.ideas.find(item => item.id === element.dataset.ideaId);
      $('input',element)?.addEventListener('input', event => { idea.text = event.target.value; markChanged(); });
      $('input',element)?.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();addChildIdea(idea.id);}else if(event.key==='Enter'){event.preventDefault();idea.root?addChildIdea(idea.id):addSiblingIdea(idea.id);}else if(event.key==='ArrowLeft'&&idea.parentId){event.preventDefault();focusIdea(idea.parentId);}else if(event.key==='ArrowRight'){const child=note.ideas.find(item=>item.parentId===idea.id);if(child){event.preventDefault();focusIdea(child.id);}}else if((event.key==='ArrowUp'||event.key==='ArrowDown')&&idea.parentId){const siblings=note.ideas.filter(item=>item.parentId===idea.parentId),index=siblings.indexOf(idea),next=siblings[index+(event.key==='ArrowUp'?-1:1)];if(next){event.preventDefault();focusIdea(next.id);}}else if(event.key==='Escape')event.target.blur();});
      bindWorldDrag(element, idea, () => drawConnections());
      element.addEventListener('click', event => { event.stopPropagation(); selectObject('idea', idea.id, element); });
      element.addEventListener('dblclick',()=>{if(idea.formula)openFormulaDialog('mindmap',idea.id);else editIdea(idea.id);});
      element.addEventListener('contextmenu',event=>{if(event.target.closest('input'))return;event.preventDefault();event.stopPropagation();selectObject('idea',idea.id,element);openObjectContextMenu('idea',idea.id,event.clientX,event.clientY);});
      $('[data-add-child]',element)?.addEventListener('click',event=>{event.stopPropagation();addChildIdea(idea.id);});
      $('[data-toggle-branch]',element)?.addEventListener('click',event=>{event.stopPropagation();toggleIdeaCollapse(idea.id);});
      $('[data-delete-idea]',element)?.addEventListener('click',event=>{event.stopPropagation();deleteIdea(idea.id);});
    });
    drawConnections();
  }

  function isIdeaVisible(idea,ideas){let current=idea,guard=0;while(current?.parentId&&guard++<100){const parent=ideas.find(item=>item.id===current.parentId);if(!parent)return true;if(parent.collapsed)return false;current=parent;}return true;}

  function drawConnections() {
    const note = activeNote();
    const svg = $('#connectionLayer');
    if (!note?.ideas.length) { svg.innerHTML = ''; return; }
    const root=note.ideas.find(idea=>idea.root)||note.ideas[0],visible=note.ideas.filter(idea=>isIdeaVisible(idea,note.ideas));
    svg.innerHTML = visible.filter(idea=>idea.id!==root.id).map(idea => {
      const parent=note.ideas.find(item=>item.id===idea.parentId)||root;if(!isIdeaVisible(parent,note.ideas))return '';
      const parentElement=$(`[data-idea-id="${parent.id}"]`),ideaElement=$(`[data-idea-id="${idea.id}"]`),parentWidth=parentElement?.offsetWidth||160,parentHeight=parentElement?.offsetHeight||52,ideaWidth=ideaElement?.offsetWidth||160,ideaHeight=ideaElement?.offsetHeight||52;
      const goesRight=idea.x>=parent.x,x1=goesRight?parent.x+parentWidth:parent.x,y1=parent.y+parentHeight/2,x2=goesRight?idea.x:idea.x+ideaWidth,y2=idea.y+ideaHeight/2;
      const bend = Math.max(70, Math.abs(x2-x1)*.45);
      return `<path class="connection-path" d="M${x1} ${y1} C${x1 + (x2>x1?bend:-bend)} ${y1},${x2 - (x2>x1?bend:-bend)} ${y2},${x2} ${y2}"/>`;
    }).join('');
  }

  function addIdea(parentId=null) {
    const note=activeNote();if(!note)return;checkpoint();const selected=state.selectedObject?.type==='idea'?state.selectedObject.id:null,parent=note.ideas.find(item=>item.id===(parentId||selected))||note.ideas.find(item=>item.root),center=viewportCenterInWorld();
    const siblings=parent?note.ideas.filter(item=>item.parentId===parent.id).length:0;
    const root=note.ideas.find(item=>item.root),direction=parent&&root&&parent.x<root.x?-1:1,first=note.ideas.length===0,spawn=first?firstMindMapPosition(note):{x:center.x-70,y:center.y-24};note.ideas.push({id:id(),text:t('addIdea'),x:parent?parent.x+direction*260:spawn.x,y:parent?parent.y+siblings*76:spawn.y,root:first,parentId:parent?.id||null,collapsed:false,formula:null});
    renderIdeas(); markChanged(); setTool('select');if(first)requestAnimationFrame(fitCanvasContent);
  }

  function addChildIdea(parentId){addIdea(parentId);const idea=activeNote().ideas.at(-1);state.selectedObject={type:'idea',id:idea.id};renderIdeas();requestAnimationFrame(()=>editIdea(idea.id));}
  function addSiblingIdea(ideaId){const note=activeNote(),idea=note?.ideas.find(item=>item.id===ideaId);if(!idea)return;addIdea(idea.parentId);const created=note.ideas.at(-1);state.selectedObject={type:'idea',id:created.id};renderIdeas();requestAnimationFrame(()=>editIdea(created.id));}
  function editIdea(ideaId){if(state.readingMode)return;const element=$(`[data-idea-id="${ideaId}"]`),input=$('input',element);if(!input)return;element.classList.add('editing');input.readOnly=false;input.focus();input.select();input.addEventListener('blur',()=>{input.readOnly=true;element.classList.remove('editing');},{once:true});}
  function focusIdea(ideaId){const element=$(`[data-idea-id="${ideaId}"]`);if(!element)return;selectObject('idea',ideaId,element);const input=$('input',element);input?.focus();input?.select();}
  function addFormulaIdea(latex){const note=activeNote();if(!note)return;const parent=note.ideas.find(item=>item.id===(state.selectedObject?.type==='idea'?state.selectedObject.id:null))||note.ideas.find(item=>item.root),root=note.ideas.find(item=>item.root),direction=parent&&root&&parent.x<root.x?-1:1,center=viewportCenterInWorld(),siblings=parent?note.ideas.filter(item=>item.parentId===parent.id).length:0;note.ideas.push({id:id(),text:'',formula:latex,x:parent?parent.x+direction*260:center.x-90,y:parent?parent.y+siblings*76:center.y-25,root:note.ideas.length===0,parentId:parent?.id||null,collapsed:false});}
  function deleteIdea(ideaId){const note=activeNote(),idea=note?.ideas.find(item=>item.id===ideaId);if(!idea)return;checkpoint();const remove=new Set([ideaId]);let changed=true;while(changed){changed=false;note.ideas.forEach(item=>{if(item.parentId&&remove.has(item.parentId)&&!remove.has(item.id)){remove.add(item.id);changed=true;}});}note.ideas=note.ideas.filter(item=>!remove.has(item.id));state.selectedObject=null;renderIdeas();markChanged();}
  function setIdeaRoot(ideaId){const note=activeNote(),next=note.ideas.find(item=>item.id===ideaId),old=note.ideas.find(item=>item.root);if(!next||next===old)return;checkpoint();next.parentId=null;next.root=true;if(old){old.root=false;old.parentId=next.id;}renderIdeas();markChanged();}
  function toggleIdeaCollapse(ideaId){const idea=activeNote().ideas.find(item=>item.id===ideaId);if(!idea)return;checkpoint();idea.collapsed=!idea.collapsed;renderIdeas();markChanged();}
  function autoLayoutMindMap(){
    const note=activeNote(),root=note?.ideas.find(item=>item.root)||note?.ideas[0];
    if(!root)return;
    checkpoint();root.x=note.card.x+920;root.y=note.card.y+220;
    const visited=new Set([root.id]),top=note.ideas.filter(item=>item.parentId===root.id);
    note.ideas.filter(item=>item!==root&&!note.ideas.some(parent=>parent.id===item.parentId)).forEach(item=>{item.parentId=root.id;if(!top.includes(item))top.push(item);});
    const layoutSide=(branches,direction)=>{
      let row=0;const placed=[];
      const place=(idea,depth)=>{if(visited.has(idea.id))return;visited.add(idea.id);placed.push(idea);const children=note.ideas.filter(item=>item.parentId===idea.id&&!visited.has(item.id));if(children.length){children.forEach(child=>place(child,depth+1));idea.y=children.reduce((sum,child)=>sum+child.y,0)/children.length;}else idea.y=row++*92;idea.x=root.x+direction*depth*270;};
      branches.forEach(branch=>place(branch,1));
      if(placed.length){const min=Math.min(...placed.map(item=>item.y)),max=Math.max(...placed.map(item=>item.y)),offset=root.y-(min+max)/2;placed.forEach(item=>item.y+=offset);}
    };
    layoutSide(top.filter((_,index)=>index%2===0),1);layoutSide(top.filter((_,index)=>index%2===1),-1);
    note.ideas.filter(item=>!visited.has(item.id)).forEach((item,index)=>{item.parentId=root.id;item.x=root.x+270;item.y=root.y+(index+1)*92;});
    renderIdeas();markChanged();requestAnimationFrame(fitCanvasContent);
  }

  function renderFreeCards() {
    $$('.free-card', $('#canvasWorld')).forEach(card => card.remove());
    const note = activeNote();
    (note.cards || []).forEach(card => {
      const element = document.createElement('section');
      element.className = 'idea-node free-card'; element.dataset.cardId = card.id;
      element.style.left = `${card.x}px`; element.style.top = `${card.y}px`; element.style.width = '240px';
      element.innerHTML = `<input value="${escapeHtml(card.text)}" aria-label="Card text">`;
      $('input',element).addEventListener('input', event => { card.text = event.target.value; markChanged(); });
      bindWorldDrag(element, card);element.addEventListener('contextmenu',event=>{if(event.target.closest('input'))return;event.preventDefault();event.stopPropagation();openObjectContextMenu('card',card.id,event.clientX,event.clientY);});$('#canvasWorld').append(element);
    });
  }

  function editorRecords(note=activeNote()){
    if(!note)return[];
    return [...(note.primaryEditorDeleted?[]:[{id:null,primary:true,layout:note.card,blocks:note.blocks,title:note.title,setTitle:value=>note.title=value}]),...(note.editors||[]).map(editor=>({id:editor.id,primary:false,layout:editor,blocks:editor.blocks,title:editor.title,setTitle:value=>editor.title=value}))];
  }
  function unifiedEditorToolbar(){return `<button data-editor-format="bold"><strong>B</strong></button><button data-editor-format="italic"><i>I</i></button><button data-editor-format="underline"><u>U</u></button><button data-editor-format="strikeThrough"><s>S</s></button><span></span><button data-editor-add="text">T</button><button data-editor-add="heading1">H1</button><button data-editor-add="heading">H2</button><button data-editor-add="heading3">H3</button><button data-editor-add="todo">☐</button><button data-editor-add="bullets">•</button><button data-editor-add="quote">❝</button><button data-editor-add="code">&lt;/&gt;</button><button data-editor-add="divider">—</button><button data-editor-image title="${escapeHtml(t('image'))}"><svg><use href="#i-image"/></svg></button><button data-editor-link>${escapeHtml(t('link'))}</button><button class="text-color-button" data-editor-color>A<span></span></button><button data-editor-formula>ƒx</button>`;}
  function unifiedEditorBlockMarkup(block,only=false){
    const attrs=`data-block-id="${block.id}" data-secondary-block="${block.id}" data-type="${block.type}"`;
    if(block.type==='divider')return `<div class="content-block secondary-block" ${attrs}><hr class="block-divider"></div>`;
    if(block.type==='formula')return `<div class="content-block secondary-block" ${attrs}><button class="formula-block" data-editor-formula-block="${block.id}">${formulaToMathML(block.latex||'')}</button></div>`;
    if(block.type==='image')return `<div class="content-block secondary-block" ${attrs}><button class="image-block" data-editor-image-block="${block.id}"><img src="${escapeHtml(block.src||'')}" alt="${escapeHtml(block.alt||'')}"></button></div>`;
    const marker=block.type==='todo'?'<button class="todo-check" tabindex="-1"></button>':block.type==='bullets'?'<span class="bullet-marker">•</span>':'';
    return `<div class="content-block secondary-block ${block.done?'done':''}" ${attrs} style="--block-color:${block.color||'inherit'}">${marker}<div class="block-content secondary-block-content" contenteditable="${!state.readingMode}" spellcheck="true" style="color:var(--block-color)" data-placeholder="${only&&!block.text&&!block.html?escapeHtml(t('emptyNote')):''}">${renderBlockHtml(block)}</div></div>`;
  }
  function openUnifiedSlashMenu(anchor,record,blockId){
    const menu=$('#slashMenu'),items=['text','heading1','heading','heading3','todo','bullets','quote','code','formula','divider'];menu.innerHTML=items.map(type=>`<button data-type="${type}" role="option">${escapeHtml(t(type))}</button>`).join('');menu.dataset.activeIndex='-1';menu.setAttribute('role','listbox');const rect=anchor.getBoundingClientRect();menu.style.left=`${Math.min(rect.left+20,innerWidth-210)}px`;menu.style.top=`${Math.min(rect.bottom+3,innerHeight-230)}px`;menu.classList.add('open');
    $$('button',menu).forEach((button,index)=>{button.onpointerenter=()=>setSlashSelection(index);button.onclick=()=>{const blockIndex=record.blocks.findIndex(item=>item.id===blockId),block=record.blocks[blockIndex];if(!block)return;if(button.dataset.type==='formula'){closeMenus();openFormulaDialog(record.primary?'document':'editor',blockId,record.id);return;}checkpoint();block.type=button.dataset.type;block.text='';block.html='';let focusId=blockId;if(block.type==='divider'){const next=createEditorBlock('text');record.blocks.splice(blockIndex+1,0,next);focusId=next.id;}closeMenus();renderUnifiedEditors({editorId:record.id,blockId:focusId});markChanged();};});
  }
  function openUnifiedBlockContextMenu(record,blockId,x,y){const menu=$('#contextMenu'),block=record.blocks.find(item=>item.id===blockId);if(!block)return;menu.innerHTML=`<button data-editor-context="duplicate">${escapeHtml(t('duplicate'))}</button><button data-editor-context="color">${escapeHtml(t('textColor'))}</button><button data-editor-context="formula">${escapeHtml(t('formula'))}</button><button data-editor-context="delete" class="danger">${escapeHtml(t('delete'))}</button>`;openMenu(menu,x,y);$$('[data-editor-context]',menu).forEach(button=>button.onclick=()=>{const action=button.dataset.editorContext;closeMenus();if(action==='duplicate'){checkpoint();record.blocks.splice(record.blocks.indexOf(block)+1,0,{...clone(block),id:id()});renderUnifiedEditors();markChanged();}else if(action==='color')openTextColorPalette(null,blockId,x,y,record.id);else if(action==='formula')openFormulaDialog(record.primary?'document':'editor',blockId,record.id);else if(action==='delete'){checkpoint();record.blocks=record.blocks.length===1?[createEditorBlock('text')]:record.blocks.filter(item=>item.id!==blockId);if(record.primary)activeNote().blocks=record.blocks;else activeNote().editors.find(item=>item.id===record.id).blocks=record.blocks;renderUnifiedEditors();markChanged();}});}
  function renderUnifiedEditors(focus=null){
    const note=activeNote();if(!note)return;$$('.document-card',$('#canvasWorld')).forEach(element=>element.remove());
    const records=editorRecords(note);records.forEach(record=>{
      const root=document.createElement('section'),layout=record.layout;root.className='document-card secondary-document-card unified-editor-card';root.id=record.primary?'documentCard':'';root.dataset.editorId=record.id||'primary';root.style.left=`${layout.x}px`;root.style.top=`${layout.y}px`;root.style.width=`${layout.width||620}px`;root.style.height=layout.height?`${layout.height}px`:'auto';root.style.zIndex=layout.z||3;
      root.innerHTML=`<div class="document-resize-frame secondary-resize-frame" aria-hidden="true"></div><div class="card-drag-handle unified-editor-grip" data-editor-drag><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="editor-title-row"><input class="note-title unified-editor-title" ${record.primary?'id="noteTitle"':''} value="${escapeHtml(record.title||'')}" placeholder="${escapeHtml(t('untitled'))}"><button class="secondary-editor-delete" data-delete-editor aria-label="${escapeHtml(t('delete'))}"><svg><use href="#i-trash"/></svg></button></div><div class="note-meta"><span ${record.primary?'id="noteDate"':''}>${escapeHtml(formatDate(note.updated))}</span><span class="dot"></span><button ${record.primary?'id="noteFolderButton"':''}>${escapeHtml(folderName(note.folderId))}</button></div><div class="format-bar secondary-format-bar">${unifiedEditorToolbar()}</div><div class="block-list secondary-block-list" ${record.primary?'id="blockList"':''}>${record.blocks.map(block=>unifiedEditorBlockMarkup(block,record.blocks.length===1)).join('')}</div><button class="add-block-row secondary-add-row" ${record.primary?'id="addBlockRow"':''}><svg><use href="#i-add"/></svg><span>${escapeHtml(t('addBlock'))}</span></button>${record.primary?'<div class="backlinks" id="backlinks"></div>':''}<div class="document-resize-handle resize-east" data-editor-resize="east"></div><div class="document-resize-handle resize-south" data-editor-resize="south"></div><div class="document-resize-handle resize-corner" data-editor-resize="corner"></div>`;
      $('#canvasWorld').append(root);
      bindUnifiedEditor(root,record);
    });
    if(note.primaryEditorDeleted){const placeholder=document.createElement('section');placeholder.id='documentCard';placeholder.hidden=true;$('#canvasWorld').append(placeholder);}
    $('#blockCount').textContent=`${records.reduce((count,record)=>count+record.blocks.length,0)} ${t('blocks')}`;renderBacklinks();
    if(focus){const editorKey=focus.editorId||'primary',target=$(`[data-editor-id="${editorKey}"] [data-block-id="${focus.blockId}"] .block-content`);target?.focus();if(target){placeCaretAtEnd(target);if(focus.start)getSelection()?.collapse(target,0);}}
  }
  function bindUnifiedEditor(root,record){
    const rerender=(blockId=null,start=false)=>renderUnifiedEditors(blockId?{editorId:record.id,blockId,start}:null),add=(type='text',afterId=null,properties={})=>{checkpoint();const block=createEditorBlock(type,properties),index=afterId?record.blocks.findIndex(item=>item.id===afterId):-1;record.blocks.splice(index<0?record.blocks.length:index+1,0,block);rerender(block.id);markChanged();};
    const title=$('.unified-editor-title',root);bindTypingHistory(title);title.oninput=()=>{if(state.readingMode)return;record.setTitle(title.value);markChanged();};
    $('[data-delete-editor]',root).onclick=()=>{if(!confirm(t('deleteEditorConfirm')))return;checkpoint();const note=activeNote();if(record.primary){note.primaryEditorDeleted=true;note.blocks=[];note.title='';}else note.editors=note.editors.filter(editor=>editor.id!==record.id);state.selectedObject=null;renderUnifiedEditors();markChanged();};
    $('.note-meta button',root).onclick=()=>handleNoteAction('move');$$('[data-editor-add]',root).forEach(button=>button.onclick=()=>add(button.dataset.editorAdd));$('.secondary-add-row',root).onclick=()=>add('text');
    $$('[data-editor-format]',root).forEach(button=>button.onpointerdown=event=>{event.preventDefault();const content=$('.block-content:focus',root);if(!content)return;document.execCommand(button.dataset.editorFormat,false,null);const block=record.blocks.find(item=>item.id===content.closest('.content-block').dataset.blockId);block.text=content.textContent;block.html=sanitizeRichHtml(content.innerHTML);markChanged();});
    $('[data-editor-link]',root).onpointerdown=event=>{event.preventDefault();const content=$('.block-content:focus',root);if(!content)return;let url=prompt('https://');if(!url)return;if(!/^[a-z][a-z0-9+.-]*:/i.test(url))url='https://'+url;if(!/^(https?:|mailto:)/i.test(url)){toast('Only web and email links are supported.');return;}const selection=getSelection();if(selection&&!selection.isCollapsed)document.execCommand('createLink',false,url);else document.execCommand('insertHTML',false,`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);const block=record.blocks.find(item=>item.id===content.closest('.content-block').dataset.blockId);block.html=sanitizeRichHtml(content.innerHTML);block.text=content.textContent;markChanged();};
    $('[data-editor-color]',root).onpointerdown=event=>{event.preventDefault();const blockId=$('.block-content:focus',root)?.closest('.content-block')?.dataset.blockId||record.blocks.at(-1)?.id;openTextColorPalette(event.currentTarget,blockId,null,null,record.id);};
    $('[data-editor-formula]',root).onpointerdown=event=>{event.preventDefault();const blockId=$('.block-content:focus',root)?.closest('.content-block')?.dataset.blockId||null;openFormulaDialog(record.primary?'document':'editor',blockId,record.id);};
    $('[data-editor-image]',root).onclick=()=>{const afterId=$('.block-content:focus',root)?.closest('.content-block')?.dataset.blockId||null,input=document.createElement('input');input.type='file';input.accept='image/*';input.onchange=()=>prepareNoteImage(input.files[0],properties=>add('image',afterId,properties));input.click();};
    $$('.content-block',root).forEach(blockElement=>{const blockId=blockElement.dataset.blockId,block=record.blocks.find(item=>item.id===blockId),content=$('.block-content',blockElement);bindTypingHistory(content);content?.addEventListener('input',()=>{if(state.readingMode)return;block.text=content.textContent;block.html=sanitizeRichHtml(content.innerHTML);markChanged();if(block.text==='/')openUnifiedSlashMenu(blockElement,record,blockId);});content?.addEventListener('paste',event=>{if(state.readingMode)return;const image=[...(event.clipboardData?.files||[])].find(file=>file.type.startsWith('image/'));if(image){event.preventDefault();prepareNoteImage(image,properties=>add('image',blockId,properties));return;}event.preventDefault();const html=event.clipboardData?.getData('text/html'),text=event.clipboardData?.getData('text/plain')||'';document.execCommand(html?'insertHTML':'insertText',false,html?sanitizeRichHtml(html):text);});content?.addEventListener('keydown',event=>handleUnifiedBlockKeydown(event,record,blockId,blockElement));$('.todo-check',blockElement)?.addEventListener('click',()=>{checkpoint();block.done=!block.done;rerender();markChanged();});$('[data-editor-delete]',blockElement)?.addEventListener('click',()=>{checkpoint();record.blocks=record.blocks.length===1?[createEditorBlock('text')]:record.blocks.filter(item=>item.id!==blockId);if(record.primary)activeNote().blocks=record.blocks;else activeNote().editors.find(item=>item.id===record.id).blocks=record.blocks;rerender(record.blocks[0].id);markChanged();});$('[data-editor-formula-block]',blockElement)?.addEventListener('click',()=>openFormulaDialog(record.primary?'document':'editor',blockId,record.id));$('[data-editor-image-block]',blockElement)?.addEventListener('click',()=>block.src&&openImageViewer(block));$('.block-handle',blockElement)?.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/editor-block-id',blockId);checkpoint();});blockElement.addEventListener('dragover',event=>event.preventDefault());blockElement.addEventListener('drop',event=>{const sourceId=event.dataTransfer.getData('text/editor-block-id');if(!sourceId||sourceId===blockId)return;event.preventDefault();const from=record.blocks.findIndex(item=>item.id===sourceId),to=record.blocks.findIndex(item=>item.id===blockId);if(from<0||to<0)return;const[moved]=record.blocks.splice(from,1);record.blocks.splice(to,0,moved);rerender(sourceId);markChanged();});$$('.wiki-link',blockElement).forEach(link=>link.onclick=event=>{event.preventDefault();const target=state.db.notes.find(note=>note.title.toLowerCase()===link.dataset.wikiTitle.toLowerCase()&&!note.trashed);if(target){state.workspaceId=target.workspaceId;selectNote(target.id);renderNavigation();}else toast(`“${link.dataset.wikiTitle}”`);});});
    root.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files'))event.preventDefault();});root.addEventListener('drop',event=>{const image=[...(event.dataTransfer.files||[])].find(file=>file.type.startsWith('image/'));if(!image)return;event.preventDefault();event.stopPropagation();const afterId=event.target.closest('.content-block')?.dataset.blockId||null;prepareNoteImage(image,properties=>add('image',afterId,properties));});
    bindWorldDrag(root,record.layout);$$('[data-editor-resize]',root).forEach(handle=>handle.addEventListener('pointerdown',event=>{if(state.readingMode||state.tool!=='select')return;event.preventDefault();event.stopPropagation();checkpoint();handle.setPointerCapture(event.pointerId);const mode=handle.dataset.editorResize,sx=event.clientX,sy=event.clientY,ow=root.offsetWidth,oh=root.offsetHeight;const move=pointer=>{if(mode!=='south')record.layout.width=Math.round(clamp(ow+(pointer.clientX-sx)/state.view.zoom,360,1400));if(mode!=='east')record.layout.height=Math.round(clamp(oh+(pointer.clientY-sy)/state.view.zoom,410,2000));root.style.width=`${record.layout.width}px`;root.style.height=`${record.layout.height}px`;};const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);markChanged();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);}));root.addEventListener('pointerdown',()=>activateEditor(record.id));root.addEventListener('contextmenu',event=>{if(event.target.closest('input,[contenteditable]'))return;event.preventDefault();event.stopPropagation();const blockElement=event.target.closest('.content-block');if(blockElement)openUnifiedBlockContextMenu(record,blockElement.dataset.blockId,event.clientX,event.clientY);else if(!record.primary)openObjectContextMenu('editor',record.id,event.clientX,event.clientY);else openObjectContextMenu('canvas',null,event.clientX,event.clientY);});
  }
  function handleUnifiedBlockKeydown(event,record,blockId,blockElement){if(state.readingMode||event.isComposing)return;const index=record.blocks.findIndex(item=>item.id===blockId),block=record.blocks[index],content=event.currentTarget,menu=$('#slashMenu');if(menu.classList.contains('open')){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();moveSlashSelection(event.key==='ArrowDown'?1:-1);return;}if(event.key==='Enter'){const selected=$('.keyboard-selected',menu);if(selected){event.preventDefault();selected.click();return;}}if(event.key==='Escape'){event.preventDefault();closeMenus();return;}}if((event.key==='ArrowUp'||event.key==='ArrowDown')&&!event.shiftKey){const selection=getSelection(),range=selection?.rangeCount&&selection.getRangeAt(0),probe=document.createRange();if(range&&selection.isCollapsed){probe.selectNodeContents(content);if(event.key==='ArrowUp')probe.setEnd(range.startContainer,range.startOffset);else probe.setStart(range.endContainer,range.endOffset);if(probe.toString()===''){const direction=event.key==='ArrowUp'?-1:1;for(let next=index+direction;next>=0&&next<record.blocks.length;next+=direction){if(['divider','formula','image'].includes(record.blocks[next].type))continue;event.preventDefault();renderUnifiedEditors({editorId:record.id,blockId:record.blocks[next].id});return;}}}}if(event.key===' '&&['#','##','###','-','>','```','[]','[ ]'].includes(block.text)){event.preventDefault();checkpoint();block.type={'#':'heading1','##':'heading','###':'heading3','-':'bullets','>':'quote','```':'code','[]':'todo','[ ]':'todo'}[block.text];block.text='';block.html='';renderUnifiedEditors({editorId:record.id,blockId});markChanged();return;}if(event.key==='Enter'&&!event.shiftKey&&block.type!=='code'){event.preventDefault();const selection=getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!content.contains(range.commonAncestorContainer))return;checkpoint();range.deleteContents();const tail=range.cloneRange();tail.setEnd(content,content.childNodes.length);const holder=document.createElement('div');holder.append(tail.extractContents());block.text=content.textContent;block.html=sanitizeRichHtml(content.innerHTML);const next=createEditorBlock(['todo','bullets'].includes(block.type)?block.type:'text',{text:holder.textContent,html:sanitizeRichHtml(holder.innerHTML)});record.blocks.splice(index+1,0,next);renderUnifiedEditors({editorId:record.id,blockId:next.id,start:true});markChanged();}else if(event.key==='Backspace'&&!content.textContent&&record.blocks.length>1){event.preventDefault();checkpoint();record.blocks.splice(index,1);renderUnifiedEditors({editorId:record.id,blockId:record.blocks[Math.max(0,index-1)]?.id});markChanged();}else if(event.key==='/'&&!block.text)setTimeout(()=>openUnifiedSlashMenu(blockElement,record,blockId));}
  function renderBlocks(focusId=null){renderUnifiedEditors(focusId?{editorId:null,blockId:focusId}:null);}
  function renderSecondaryEditors(focus=null){renderUnifiedEditors(focus);}

  function activateEditor(editorId=null){const note=activeNote();if(!note)return;const all=[note.card,...note.editors],target=editorId?note.editors.find(editor=>editor.id===editorId):note.card;if(!target)return;let top=Math.max(2,...all.map(editor=>Number(editor.z)||3)),raised=(Number(target.z)||3)<top;if(top>80){all.sort((a,b)=>(a.z||3)-(b.z||3)).forEach((editor,index)=>editor.z=3+index);top=Math.max(...all.map(editor=>editor.z));raised=true;}if(raised)target.z=top+1;state.selectedObject=editorId?{type:'editor',id:editorId}:{type:'document',id:'primary'};$$('.secondary-document-card').forEach(card=>{const primary=card.id==='documentCard',selected=primary?!editorId:card.dataset.editorId===editorId,layout=primary?note.card:note.editors.find(editor=>editor.id===card.dataset.editorId);card.classList.toggle('selected',selected);card.style.zIndex=layout?.z||3;});if(raised)scheduleSave();}

  function findEditorPosition(note,width=620,height=410){
    const card={x:Number.isFinite(note.card.x)?note.card.x:620,y:Number.isFinite(note.card.y)?note.card.y:420,w:note.card.width||620,h:note.card.height||410},occupied=[...(note.primaryEditorDeleted?[]:[card]),...(note.editors||[]).map(editor=>({x:editor.x,y:editor.y,w:editor.width,h:editor.height}))],gap=72;
    const candidates=[{x:card.x+card.w+gap,y:card.y},{x:Math.max(36,card.x-width-gap),y:card.y},{x:card.x,y:card.y+card.h+gap}];
    for(let row=0;row<8;row++)for(let column=0;column<5;column++)candidates.push({x:80+column*(width+gap),y:80+row*(height+gap)});
    return candidates.find(candidate=>candidate.x+width<3960&&candidate.y+height<2960&&!occupied.some(box=>candidate.x<box.x+box.w+gap&&candidate.x+width+gap>box.x&&candidate.y<box.y+box.h+gap&&candidate.y+height+gap>box.y))||{x:Math.min(3300,card.x+gap),y:Math.min(2450,card.y+card.h+gap)};
  }
  function repairEditorOverlaps(note){const accepted=[];for(const editor of note.editors||[]){const primary={x:Number.isFinite(note.card.x)?note.card.x:620,y:Number.isFinite(note.card.y)?note.card.y:420,w:note.card.width||620,h:note.card.height||410},boxes=[primary,...accepted.map(item=>({x:item.x,y:item.y,w:item.width,h:item.height}))],overlaps=boxes.some(box=>editor.x<box.x+box.w&&editor.x+editor.width>box.x&&editor.y<box.y+box.h&&editor.y+editor.height>box.y);if(overlaps)Object.assign(editor,findEditorPosition({...note,editors:accepted},editor.width,editor.height));accepted.push(editor);}}
  function addSecondaryEditor(){const note=activeNote();if(!note)return;checkpoint();if(note.primaryEditorDeleted){note.primaryEditorDeleted=false;note.title='';note.blocks=[createEditorBlock('text')];renderUnifiedEditors({editorId:null,blockId:note.blocks[0].id});setTool('select');markChanged();return;}const width=620,height=410,position=findEditorPosition(note,width,height),editor={id:id(),title:'',...position,width,height,z:Math.max(note.card.z||3,...note.editors.map(item=>item.z||3))+1,blocks:[createEditorBlock('text')]};note.editors.push(editor);state.selectedObject={type:'editor',id:editor.id};renderSecondaryEditors({editorId:editor.id,blockId:editor.blocks[0].id});setTool('select');requestAnimationFrame(fitCanvasContent);markChanged();}

  function firstMindMapPosition(note){const width=note.card.width||$('#documentCard').offsetWidth||620,height=note.card.height||$('#documentCard').offsetHeight||410,x=note.card.x+width+110;return{x:Math.min(3760,x),y:clamp(note.card.y+Math.min(90,height*.22),40,2900)};}
  function addFreeCard() {
    const note=activeNote();if(!note)return;checkpoint();const first=note.ideas.length===0,position=findEditorPosition(note,210,90),spawn=first?firstMindMapPosition(note):position,topic={id:id(),text:t('newMindMap'),x:spawn.x,y:spawn.y,root:true,parentId:null,collapsed:false,formula:null,z:90};note.ideas.push(topic);state.selectedObject={type:'idea',id:topic.id};renderIdeas();markChanged();setTool('select');requestAnimationFrame(()=>{if(first)fitCanvasContent();editIdea(topic.id);});
  }

  function clearAlignmentGuides(){const layer=$('#alignmentLayer');if(layer)layer.replaceChildren();}
  function drawAlignmentGuides(guides){const layer=$('#alignmentLayer');if(!layer)return;layer.replaceChildren(...guides.map(guide=>{const line=document.createElementNS('http://www.w3.org/2000/svg','line');Object.entries(guide).forEach(([key,value])=>line.setAttribute(key,value));return line;}));}
  function snapWorldPosition(element,x,y){
    const width=element.offsetWidth,height=element.offsetHeight,threshold=10/state.view.zoom,world=$('#canvasWorld');
    const others=$$('.document-card:not([hidden]),.idea-node',world).filter(candidate=>candidate!==element&&candidate.offsetParent!==null).map(candidate=>({x:parseFloat(candidate.style.left)||0,y:parseFloat(candidate.style.top)||0,w:candidate.offsetWidth,h:candidate.offsetHeight}));
    const nearest=(moving,axis)=>{let match=null;for(const other of others){const targets=axis==='x'?[other.x,other.x+other.w/2,other.x+other.w]:[other.y,other.y+other.h/2,other.y+other.h];for(const source of moving)for(const target of targets){const delta=target-source;if(Math.abs(delta)<=threshold&&(!match||Math.abs(delta)<Math.abs(match.delta)))match={delta,target,other};}}return match;};
    const xMatch=nearest([x,x+width/2,x+width],'x'),yMatch=nearest([y,y+height/2,y+height],'y'),guides=[];
    if(xMatch){x+=xMatch.delta;guides.push({x1:xMatch.target,y1:Math.min(y,xMatch.other.y)-34,x2:xMatch.target,y2:Math.max(y+height,xMatch.other.y+xMatch.other.h)+34});}
    if(yMatch){y+=yMatch.delta;guides.push({x1:Math.min(x,yMatch.other.x)-34,y1:yMatch.target,x2:Math.max(x+width,yMatch.other.x+yMatch.other.w)+34,y2:yMatch.target});}
    drawAlignmentGuides(guides);return{x:Math.round(x),y:Math.round(y)};
  }

  function bindWorldDrag(element, object, onMove = () => {}) {
    element.addEventListener('pointerdown', event => {
      if (state.readingMode||state.tool !== 'select' || event.target.closest('button,[contenteditable],[data-secondary-resize],.document-resize-handle') || (event.target.closest('input')&&!event.target.readOnly)) return;
      event.preventDefault();element.setPointerCapture(event.pointerId);let moved=false;
      const startX = event.clientX, startY = event.clientY, originX = object.x, originY = object.y;
      const move = pointer => {
        if(!moved&&Math.hypot(pointer.clientX-startX,pointer.clientY-startY)<4)return;if(!moved){checkpoint();moved=true;element.classList.add('dragging');}
        const rawX=originX+(pointer.clientX-startX)/state.view.zoom,rawY=originY+(pointer.clientY-startY)/state.view.zoom,snapped=pointer.altKey?(clearAlignmentGuides(),{x:Math.round(rawX),y:Math.round(rawY)}):snapWorldPosition(element,rawX,rawY);
        object.x=snapped.x;object.y=snapped.y;
        element.style.left = `${object.x}px`; element.style.top = `${object.y}px`; onMove();
      };
      const end = () => { clearAlignmentGuides();element.classList.remove('dragging');element.removeEventListener('pointermove',move); element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);if(moved)markChanged(); };
      element.addEventListener('pointermove',move); element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
    });
  }

  function inkContext(canvas){const quality=canvas.id==='inkOverlay'?1:clamp((window.devicePixelRatio||1)*state.view.zoom,1,1.25),width=Math.round(4000*quality),height=Math.round(3000*quality);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;canvas.dataset.quality=quality;}const context=canvas.getContext('2d',{alpha:true,desynchronized:true});context.setTransform(quality,0,0,quality,0,0);return context;}
  function renderInk() {
    const canvas = $('#inkCanvas');
    const context = inkContext(canvas);
    context.clearRect(0,0,4000,3000);
    const note = activeNote();
    if (!note) return;
    const noteId=note.id,renderVectors=()=>{if(activeNote()?.id!==noteId)return;(note.inkStrokes||[]).forEach(stroke=>drawStroke(context,stroke));renderInkSelection();};
    if (note.ink) {
      const image = new Image();
      image.onload = () => { context.drawImage(image,0,0); renderVectors(); };
      image.src = note.ink;
    } else renderVectors();
  }

  function renderInkSelection(lassoPoints=null){
    const canvas=$('#inkOverlay'),context=inkContext(canvas);context.clearRect(0,0,4000,3000);
    context.save();context.strokeStyle=getComputedStyle(document.body).getPropertyValue('--nav-accent').trim()||'#0f6cbd';context.lineWidth=2/state.view.zoom;context.setLineDash([7/state.view.zoom,5/state.view.zoom]);
    if(lassoPoints?.length){context.beginPath();context.moveTo(lassoPoints[0].x,lassoPoints[0].y);lassoPoints.slice(1).forEach(point=>context.lineTo(point.x,point.y));context.stroke();}
    const selected=(activeNote()?.inkStrokes||[]).filter(stroke=>state.inkSelection.has(stroke.id)).flatMap(stroke=>stroke.points||[]);
    const box=$('#inkSelectionBox');if(selected.length){const bounds=selected.reduce((result,p)=>({left:Math.min(result.left,p.x),top:Math.min(result.top,p.y),right:Math.max(result.right,p.x),bottom:Math.max(result.bottom,p.y)}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity}),pad=9/state.view.zoom;context.strokeRect(bounds.left-pad,bounds.top-pad,bounds.right-bounds.left+pad*2,bounds.bottom-bounds.top+pad*2);box.hidden=false;box.style.left=`${bounds.left-pad}px`;box.style.top=`${bounds.top-pad}px`;box.style.width=`${Math.max(28/state.view.zoom,bounds.right-bounds.left+pad*2)}px`;box.style.height=`${Math.max(28/state.view.zoom,bounds.bottom-bounds.top+pad*2)}px`;}else box.hidden=true;
    context.restore();
  }

  function pointInPolygon(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j],cross=(a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y||Number.EPSILON)+a.x;if(cross)inside=!inside;}return inside;}

  function setupInkSelectionUI(){
    const box=$('#inkSelectionBox');let drag=null,frame=0;
    const selected=()=>activeNote()?.inkStrokes.filter(stroke=>state.inkSelection.has(stroke.id))||[];
    box.addEventListener('pointerdown',event=>{if(event.target.closest('.ink-selection-menu')&&!event.target.closest('[data-ink-action="move"]'))return;if(!state.inkSelection.size)return;event.preventDefault();event.stopPropagation();checkpoint();drag={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY};box.setPointerCapture(event.pointerId);});
    box.addEventListener('pointermove',event=>{if(!drag)return;drag.lastX=event.clientX;drag.lastY=event.clientY;if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const dx=(drag.lastX-drag.x)/state.view.zoom,dy=(drag.lastY-drag.y)/state.view.zoom;drag.x=drag.lastX;drag.y=drag.lastY;selected().forEach(stroke=>stroke.points.forEach(point=>{point.x=clamp(point.x+dx,0,4000);point.y=clamp(point.y+dy,0,3000);}));renderInk();});});
    const end=()=>{if(!drag)return;drag=null;markChanged();};box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
    $('[data-ink-action="duplicate"]',box).onclick=()=>{checkpoint();const copies=selected().map(stroke=>({...clone(stroke),id:id(),points:stroke.points.map(point=>({...point,x:clamp(point.x+24,0,4000),y:clamp(point.y+24,0,3000)}))}));activeNote().inkStrokes.push(...copies);state.inkSelection=new Set(copies.map(stroke=>stroke.id));renderInk();markChanged();};
    $('[data-ink-action="front"]',box).onclick=()=>{checkpoint();const chosen=selected(),ids=state.inkSelection;activeNote().inkStrokes=[...activeNote().inkStrokes.filter(stroke=>!ids.has(stroke.id)),...chosen];renderInk();markChanged();};
    $('[data-ink-action="delete"]',box).onclick=()=>{checkpoint();activeNote().inkStrokes=activeNote().inkStrokes.filter(stroke=>!state.inkSelection.has(stroke.id));state.inkSelection.clear();renderInk();markChanged();};
    $('#selectedInkColor').oninput=event=>{checkpoint();selected().filter(stroke=>!String(stroke.mode).startsWith('eraser')).forEach(stroke=>stroke.color=event.target.value);renderInk();markChanged();};
  }

  function resolveInkColor(color,dark=document.body.classList.contains('theme-dark')){if(color==='auto-contrast')return dark?'#ffffff':'#171717';if(color==='auto-inverse')return dark?'#171717':'#ffffff';return color||'#171717';}
  function drawStroke(context, stroke, fromIndex = 1, darkForAutoColor=document.body.classList.contains('theme-dark')) {
    const points = stroke.points || [];
    if (!points.length) return;
    context.save();
    if(stroke.mode==='eraser-stroke')return;
    context.globalCompositeOperation = (stroke.mode === 'eraser'||stroke.mode==='eraser-pixel') ? 'destination-out' : 'source-over';
    context.globalAlpha = stroke.mode === 'highlighter' ? .16 : 1;
    const resolvedColor=resolveInkColor(stroke.color,darkForAutoColor);context.strokeStyle=resolvedColor;
    context.lineCap = stroke.mode === 'highlighter' ? 'butt' : 'round';
    context.lineJoin = stroke.mode === 'highlighter' ? 'miter' : 'round';
    if (points.length === 1) {
      context.fillStyle=resolvedColor;
      if(stroke.mode==='highlighter'){const side=Math.max(3,stroke.size*3.6);context.fillRect(points[0].x-side/2,points[0].y-side/2,side,side);}
      else{context.beginPath(); context.arc(points[0].x,points[0].y,Math.max(1,stroke.size/2),0,Math.PI*2); context.fill();}
    }
    for (let index=Math.max(1,fromIndex); index<points.length; index++) {
      const previous=points[index-1], current=points[index];
      const pressure=(previous.p+current.p)/2 || .5;
      const multiplier=(stroke.mode==='eraser'||stroke.mode==='eraser-pixel')?5:stroke.mode==='highlighter'?3.6:.55+pressure*.9;
      context.lineWidth=stroke.size*multiplier;
      context.beginPath();
      if(index>1&&stroke.mode!=='highlighter'){const before=points[index-2];context.moveTo((before.x+previous.x)/2,(before.y+previous.y)/2);context.quadraticCurveTo(previous.x,previous.y,(previous.x+current.x)/2,(previous.y+current.y)/2);}
      else{context.moveTo(previous.x,previous.y);context.lineTo(current.x,current.y);}
      context.stroke();
    }
    context.restore();
  }

  function setupInkGuides(){
    const guide=$('#inkGuide');let drag=null;
    const scaleMarkup=type=>type==='compass'?'<span class="guide-center"></span><span class="guide-grip"></span><span class="guide-rotate"></span>':type==='triangle'?'<span class="guide-cutout"></span><span class="guide-grip"></span><span class="guide-rotate"></span>':'<span class="guide-grip"></span><span class="guide-rotate"></span>';
    const render=()=>{const model=state.inkGuide;guide.hidden=!model;if(!model)return;if(guide.dataset.guide!==model.type){guide.dataset.guide=model.type;guide.innerHTML=scaleMarkup(model.type);}guide.style.left=`${model.x}px`;guide.style.top=`${model.y}px`;guide.style.transform=`rotate(${model.angle||0}deg)`;$$('[data-ink-guide]').forEach(button=>button.classList.toggle('selected',button.dataset.inkGuide===model.type));};
    $$('[data-ink-guide]').forEach(button=>button.onclick=()=>{const type=button.dataset.inkGuide;if(state.inkGuide?.type===type)state.inkGuide=null;else{const center=viewportCenterInWorld();state.inkGuide={type,x:center.x-(type==='ruler'?2600:type==='compass'?140:150),y:center.y-(type==='ruler'?34:type==='compass'?140:105),angle:0};}render();});
    const guideCenter=model=>({x:model.x+(model.type==='ruler'?2600:model.type==='triangle'?150:140),y:model.y+(model.type==='ruler'?34:model.type==='triangle'?105:140)});
    guide.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();const center=guideCenter(state.inkGuide),rect=$('#canvasViewport').getBoundingClientRect(),worldX=(event.clientX-rect.left-state.view.x)/state.view.zoom,worldY=(event.clientY-rect.top-state.view.y)/state.view.zoom;drag={mode:event.target.closest('.guide-rotate')?'rotate':'move',x:event.clientX,y:event.clientY,ox:state.inkGuide.x,oy:state.inkGuide.y,center,angle:state.inkGuide.angle||0,startAngle:Math.atan2(worldY-center.y,worldX-center.x)};guide.setPointerCapture(event.pointerId);});
    guide.addEventListener('pointermove',event=>{if(!drag)return;if(drag.mode==='rotate'){const rect=$('#canvasViewport').getBoundingClientRect(),worldX=(event.clientX-rect.left-state.view.x)/state.view.zoom,worldY=(event.clientY-rect.top-state.view.y)/state.view.zoom;state.inkGuide.angle=drag.angle+(Math.atan2(worldY-drag.center.y,worldX-drag.center.x)-drag.startAngle)*180/Math.PI;}else{state.inkGuide.x=clamp(drag.ox+(event.clientX-drag.x)/state.view.zoom,-900,3900);state.inkGuide.y=clamp(drag.oy+(event.clientY-drag.y)/state.view.zoom,-200,2900);}render();});
    const end=()=>drag=null;guide.addEventListener('pointerup',end);guide.addEventListener('pointercancel',end);
  }

  function constrainInkPoint(next){
    const guide=state.inkGuide;if(!guide)return next;
    const rotation=(guide.angle||0)*Math.PI/180,cx=guide.x+(guide.type==='ruler'?2600:guide.type==='triangle'?150:140),cy=guide.y+(guide.type==='ruler'?34:guide.type==='triangle'?105:140),cos=Math.cos(rotation),sin=Math.sin(rotation),dx=next.x-cx,dy=next.y-cy,local={x:dx*cos+dy*sin,y:-dx*sin+dy*cos};
    const world=point=>({...next,x:cx+point.x*cos-point.y*sin,y:cy+point.x*sin+point.y*cos});
    if(guide.type==='compass'){const distance=Math.hypot(local.x,local.y);if(Math.abs(distance-140)>34||distance<1)return next;return world({x:local.x*140/distance,y:local.y*140/distance});}
    if(guide.type==='ruler'){if(Math.abs(local.y)>42)return next;return world({x:local.x,y:0});}
    const project=(point,a,b)=>{const vx=b.x-a.x,vy=b.y-a.y,length=vx*vx+vy*vy,t=clamp(((point.x-a.x)*vx+(point.y-a.y)*vy)/length,0,1);return{x:a.x+vx*t,y:a.y+vy*t};},corners=[{x:-150,y:105},{x:150,y:105},{x:-150,y:-105}],candidates=[[corners[0],corners[1]],[corners[1],corners[2]],[corners[2],corners[0]]].map(edge=>project(local,...edge)),nearest=candidates.sort((a,b)=>Math.hypot(local.x-a.x,local.y-a.y)-Math.hypot(local.x-b.x,local.y-b.y))[0];return Math.hypot(local.x-nearest.x,local.y-nearest.y)<=34?world(nearest):next;
  }

  function eraseWholeStrokeAt(next){const note=activeNote(),radius=Math.max(10,state.pen.size*3.2),before=note.inkStrokes.length;note.inkStrokes=note.inkStrokes.filter(item=>!item.points?.some(point=>Math.hypot(point.x-next.x,point.y-next.y)<=radius));return before!==note.inkStrokes.length;}

  function updateInkCursor(event){const cursor=$('#inkCursor');if(!cursor)return;const erasing=state.pen.mode.startsWith('eraser'),color=resolveInkColor(state.pen.color);cursor.style.setProperty('--ink-cursor-color',color);cursor.style.setProperty('--ink-cursor-size',`${clamp((erasing?state.pen.size*2.4:state.pen.size),4,18)}px`);cursor.classList.toggle('eraser',erasing);if(event){const rect=$('#canvasViewport').getBoundingClientRect();cursor.style.left=`${event.clientX-rect.left}px`;cursor.style.top=`${event.clientY-rect.top}px`;cursor.classList.toggle('show',state.tool==='ink'&&event.pointerType==='mouse');}}
  function setupInkCursor(){const viewport=$('#canvasViewport'),cursor=$('#inkCursor');viewport.addEventListener('pointermove',event=>updateInkCursor(event),{passive:true});viewport.addEventListener('pointerleave',()=>cursor.classList.remove('show'));viewport.addEventListener('pointercancel',()=>cursor.classList.remove('show'));}

  function setupInk() {
    const canvas = $('#inkCanvas');
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return { x:(event.clientX-rect.left)/state.view.zoom, y:(event.clientY-rect.top)/state.view.zoom, p:event.pressure > 0 ? event.pressure : .5 };
    };
    let context=inkContext(canvas),stroke=null,pointerId=null,lastEventTime=-1,lastPenSeen=-Infinity,strokeErased=false;
    const requestedMode=event=>event.pointerType==='pen'&&((event.button===5||(event.buttons&32))?'eraser-stroke':(event.button===2||(event.buttons&2))?(localStorage.getItem('pm.penButtonAction')||'lasso'):null);
    canvas.addEventListener('pointerover',event=>{if(event.pointerType==='pen')lastPenSeen=performance.now();},{passive:true});
    canvas.addEventListener('pointerdown', event => {
      if(event.pointerType==='pen')lastPenSeen=performance.now();
      if (state.tool !== 'ink'||state.drawing||(event.pointerType==='touch'&&(performance.now()-lastPenSeen<1800||Math.max(event.width||0,event.height||0)>24))||(event.pointerType!=='pen'&&event.button!==0)) return;
      event.preventDefault();event.stopPropagation();state.drawing=true;pointerId=event.pointerId;lastEventTime=-1;
      const mode=requestedMode(event)||state.pen.mode;strokeErased=false;stroke={id:id(),mode,color:state.pen.color,size:state.pen.size,points:[constrainInkPoint(point(event))],temporary:mode!==state.pen.mode};if(mode==='eraser-stroke'){checkpoint();strokeErased=eraseWholeStrokeAt(stroke.points[0]);if(strokeErased)renderInk();}
      if(mode!=='lasso'){state.inkSelection.clear();renderInkSelection();}
      canvas.setPointerCapture(event.pointerId);
    });
    const sample=event=>{
      if(!state.drawing||event.pointerId!==pointerId||event.timeStamp===lastEventTime)return;if(event.pointerType==='pen')lastPenSeen=performance.now();lastEventTime=event.timeStamp;
      const events=event.getCoalescedEvents?.()||[event];let added=false;
      for(const source of events){const next=constrainInkPoint(point(source)),last=stroke.points.at(-1),minimum=source.pointerType==='pen'?.22:.7;if(Math.hypot(next.x-last.x,next.y-last.y)<minimum)continue;stroke.points.push(next);added=true;if(stroke.mode==='eraser-stroke'){if(eraseWholeStrokeAt(next)){strokeErased=true;renderInk();}}else if(stroke.mode!=='lasso')drawStroke(context,stroke,stroke.points.length-1);}
      if(added&&stroke.mode==='lasso')renderInkSelection(stroke.points);
    };
    canvas.addEventListener('pointermove',sample,{passive:true});
    if('onpointerrawupdate' in window)canvas.addEventListener('pointerrawupdate',sample,{passive:true});
    const finish=event=>{
      if(!state.drawing||(event&&event.pointerId!==pointerId))return;state.drawing=false;
      const completed=stroke;stroke=null;pointerId=null;
      if(event?.type==='pointercancel'){renderInk();return;}
      if(completed.mode==='lasso'){
        state.inkSelection.clear();if(completed.points.length>2)(activeNote().inkStrokes||[]).forEach(item=>{if(!String(item.mode).startsWith('eraser')&&(item.points||[]).some(p=>pointInPolygon(p,completed.points)))state.inkSelection.add(item.id);});renderInkSelection();return;
      }
      if(completed.mode==='eraser-stroke'){if(strokeErased)markChanged();return;}
      checkpoint();if(completed.points.length===1)drawStroke(context,completed);delete completed.temporary;activeNote().inkStrokes.push(completed);markChanged();
    };
    canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
  }

  function updateTransform() {
    $('#canvasWorld').style.transform = `translate(${state.view.x}px,${state.view.y}px) scale(${state.view.zoom})`;
    $('#zoomLabel').textContent = `${Math.round(state.view.zoom*100)}%`;
  }

  function zoomAt(nextZoom, clientX = $('#canvasViewport').getBoundingClientRect().left + $('#canvasViewport').clientWidth/2, clientY = $('#canvasViewport').getBoundingClientRect().top + $('#canvasViewport').clientHeight/2) {
    const rect = $('#canvasViewport').getBoundingClientRect();
    const worldX = (clientX-rect.left-state.view.x)/state.view.zoom, worldY = (clientY-rect.top-state.view.y)/state.view.zoom;
    state.view.zoom = clamp(nextZoom,.3,1.8);
    state.view.x = clientX-rect.left-worldX*state.view.zoom; state.view.y = clientY-rect.top-worldY*state.view.zoom;
    updateTransform();clearTimeout(state.inkRenderTimer);state.inkRenderTimer=setTimeout(renderInk,120);
  }

  function viewportCenterInWorld() {
    const viewport = $('#canvasViewport');
    return { x:(viewport.clientWidth/2-state.view.x)/state.view.zoom, y:(viewport.clientHeight/2-state.view.y)/state.view.zoom };
  }

  function focusPrimaryDocument(){const note=activeNote(),viewport=$('#canvasViewport'),card=$('#documentCard');if(!note||!viewport.clientWidth||!viewport.clientHeight)return;if(note.primaryEditorDeleted){fitCanvasContent();return;}const portrait=isPortraitMobile(),width=card.offsetWidth||note.card.width||620,height=card.offsetHeight||note.card.height||410,padX=portrait?34:82,padY=portrait?110:84;state.view.zoom=clamp(Math.min((viewport.clientWidth-padX)/width,(viewport.clientHeight-padY)/height),portrait ? .48 : .72,.96);state.view.x=(viewport.clientWidth-width*state.view.zoom)/2-note.card.x*state.view.zoom;state.view.y=Math.max(portrait?22:34,(viewport.clientHeight-height*state.view.zoom)/2)-note.card.y*state.view.zoom;updateTransform();}

  function fitCanvasContent() {
    const note=activeNote(),viewport=$('#canvasViewport');if(!note||!viewport.clientWidth||!viewport.clientHeight)return;
    const documentCard=$('#documentCard'),cardWidth=documentCard.offsetWidth||620,cardHeight=documentCard.offsetHeight||410;
    if(isPortraitMobile()){
      state.view.zoom=clamp(Math.min((viewport.clientWidth-42)/cardWidth,(viewport.clientHeight-118)/cardHeight),.48,.9);
      state.view.x=(viewport.clientWidth-cardWidth*state.view.zoom)/2-note.card.x*state.view.zoom;
      state.view.y=Math.max(28,(viewport.clientHeight-cardHeight*state.view.zoom)/2)-note.card.y*state.view.zoom;
      updateTransform();
      return;
    }
    const boxes=[...(note.primaryEditorDeleted?[]:[{x:note.card.x,y:note.card.y,w:cardWidth,h:cardHeight}]),...note.ideas.map(item=>({x:item.x,y:item.y,w:170,h:56})),...(note.editors||[]).map(item=>({x:item.x,y:item.y,w:item.width||460,h:item.height||330}))];if(!boxes.length)boxes.push({x:600,y:400,w:620,h:410});
    const minX=Math.min(...boxes.map(box=>box.x)),minY=Math.min(...boxes.map(box=>box.y)),maxX=Math.max(...boxes.map(box=>box.x+box.w)),maxY=Math.max(...boxes.map(box=>box.y+box.h));
    const contentWidth=Math.max(cardWidth,maxX-minX),contentHeight=Math.max(cardHeight,maxY-minY);
    state.view.zoom=clamp(Math.min((viewport.clientWidth-100)/contentWidth,(viewport.clientHeight-90)/contentHeight),.35,.9);
    state.view.x=(viewport.clientWidth-contentWidth*state.view.zoom)/2-minX*state.view.zoom;
    state.view.y=(viewport.clientHeight-contentHeight*state.view.zoom)/2-minY*state.view.zoom;
    updateTransform();
  }

  function setupCanvasNavigation() {
    const viewport = $('#canvasViewport');
    const touches=new Map();let pinch=null;
    viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'||state.tool==='ink')return;touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touches.size===2){const [a,b]=[...touches.values()],rect=viewport.getBoundingClientRect(),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:state.view.zoom,worldX:(center.x-rect.left-state.view.x)/state.view.zoom,worldY:(center.y-rect.top-state.view.y)/state.view.zoom};state.pinchActive=true;}},{capture:true});
    viewport.addEventListener('pointermove',event=>{if(!touches.has(event.pointerId))return;touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch&&touches.size===2){event.preventDefault();const [a,b]=[...touches.values()],rect=viewport.getBoundingClientRect(),distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};state.view.zoom=clamp(pinch.zoom*distance/pinch.distance,.3,1.8);state.view.x=center.x-rect.left-pinch.worldX*state.view.zoom;state.view.y=center.y-rect.top-pinch.worldY*state.view.zoom;updateTransform();}},{capture:true});
    const releaseTouch=event=>{touches.delete(event.pointerId);if(touches.size<2){pinch=null;state.pinchActive=false;}};viewport.addEventListener('pointerup',releaseTouch,{capture:true});viewport.addEventListener('pointercancel',releaseTouch,{capture:true});
    viewport.addEventListener('wheel', event => {
      if(!event.ctrlKey){const scroller=event.target.closest('.format-bar,.secondary-format-bar,.secondary-block-list,#documentCard');if(scroller){if(scroller.matches('.format-bar,.secondary-format-bar')&&scroller.scrollWidth>scroller.clientWidth){event.preventDefault();scroller.scrollLeft+=event.deltaX||event.deltaY;return;}if(scroller.scrollHeight>scroller.clientHeight)return;}}
      event.preventDefault();
      if (event.ctrlKey) zoomAt(state.view.zoom * Math.exp(-event.deltaY*.0015),event.clientX,event.clientY);
      else { state.view.x -= event.deltaX; state.view.y -= event.deltaY; updateTransform(); }
    }, { passive:false });
    viewport.addEventListener('pointerdown', event => {
      const shouldPan = state.tool === 'pan' || event.button === 1 || (event.pointerType==='touch'&&state.tool!=='ink');
      if (!shouldPan || event.target.closest('button,input,textarea,a,[contenteditable],.menu-surface,.app-dialog') || (!state.readingMode&&event.target.closest('.document-card,.idea-node'))) return;
      event.preventDefault(); state.panning = true; viewport.classList.add('panning'); viewport.setPointerCapture(event.pointerId);
      const sx=event.clientX, sy=event.clientY, ox=state.view.x, oy=state.view.y;
      const move = pointer => { if(state.pinchActive)return;state.view.x=ox+pointer.clientX-sx; state.view.y=oy+pointer.clientY-sy; updateTransform(); };
      const end = () => { state.panning=false; viewport.classList.remove('panning'); viewport.removeEventListener('pointermove',move); viewport.removeEventListener('pointerup',end); viewport.removeEventListener('pointercancel',end); };
      viewport.addEventListener('pointermove',move); viewport.addEventListener('pointerup',end); viewport.addEventListener('pointercancel',end);
    });
    viewport.addEventListener('pointermove', event => {
      const rect=viewport.getBoundingClientRect(), x=Math.round((event.clientX-rect.left-state.view.x)/state.view.zoom), y=Math.round((event.clientY-rect.top-state.view.y)/state.view.zoom);
      $('#canvasCoordinates').textContent=`${x}, ${y}`;
    });
    viewport.addEventListener('click', event => { if (event.target === viewport || event.target === $('#canvasWorld')) clearSelection(); });
  }

  function setTool(tool) {
    const toolbar=$('.canvas-toolbar'),previousScroll=toolbar.scrollLeft;state.tool = tool; $('#canvasViewport').dataset.tool = tool;
    if(tool!=='ink'){state.inkSelection.clear();renderInkSelection();}
    $('.canvas-toolbar').classList.toggle('ink-active',tool==='ink');
    $$('.tool-button').forEach(button => button.classList.toggle('active',button.dataset.tool===tool));
    $('#inkOptions').classList.toggle('show',tool==='ink');
    if(tool!=='ink')$('#inkCursor')?.classList.remove('show');else updateInkCursor();
    toolbar.scrollLeft=previousScroll;requestAnimationFrame(()=>toolbar.scrollLeft=previousScroll);
    const badge=$('#canvasModeBadge'); badge.textContent=t(tool); badge.classList.add('show'); clearTimeout(badge.timer); badge.timer=setTimeout(()=>badge.classList.remove('show'),900);
  }

  function applyReadingMode(){const pane=$('.work-pane'),button=$('#readingModeButton');pane.classList.toggle('reading-mode',state.readingMode);button?.setAttribute('aria-pressed',String(state.readingMode));if(button)button.title=t(state.readingMode?'editingMode':'readingMode');$$('.unified-editor-title').forEach(input=>input.readOnly=state.readingMode);$$('.block-content').forEach(editor=>editor.contentEditable=String(!state.readingMode));if(state.readingMode){setTool('pan');clearSelection();}}
  function toggleReadingMode(){state.readingMode=!state.readingMode;applyReadingMode();if(!state.readingMode)setTool('select');toast(t(state.readingMode?'readingMode':'editingMode'));}

  function selectObject(type, objectId, element) {
    clearSelection(); state.selectedObject={type,id:objectId}; element.classList.add('selected');
  }
  function clearSelection() { state.selectedObject=null; $$('.selected',$('#canvasWorld')).forEach(el=>el.classList.remove('selected')); }

  function checkpoint() {
    const note=activeNote(); if(!note)return;
    state.history.push(clone(note)); if(state.history.length>40)state.history.shift(); state.future=[]; updateUndoButtons();
  }
  function undo(){if(!state.history.length)return;const current=clone(activeNote());state.future.push(current);const previous=state.history.pop();state.db.notes[state.db.notes.findIndex(n=>n.id===state.noteId)]=previous;selectNote(state.noteId,true);scheduleSave(true);updateUndoButtons();}
  function redo(){if(!state.future.length)return;state.history.push(clone(activeNote()));const next=state.future.pop();state.db.notes[state.db.notes.findIndex(n=>n.id===state.noteId)]=next;selectNote(state.noteId,true);scheduleSave(true);updateUndoButtons();}
  const noteCommandIds=['addEditor','addCard','formulaButton','layoutMindMap','noteMenuButton','readingModeButton'];
  function updateNoteCommandAvailability(hasNote=Boolean(activeNote())){$$('[data-note-command]').forEach(button=>button.disabled=!hasNote);noteCommandIds.forEach(elementId=>{const button=$('#'+elementId);if(button)button.disabled=!hasNote;});if(!hasNote){$('#undoButton').disabled=true;$('#redoButton').disabled=true;}else updateUndoButtons();}
  function updateUndoButtons(){ $('#undoButton').disabled=!state.history.length; $('#redoButton').disabled=!state.future.length; }

  function markChanged() {
    const note=activeNote(); if(!note)return; note.updated=Date.now();
    $('#saveState').classList.add('saving'); $('#saveState span').textContent=t('saving');
    clearTimeout(state.saveTimer); state.saveTimer=setTimeout(()=>{state.saveTimer=null;scheduleSave(true);},450);
  }
  // Anything still inside the 450 ms debounce window is written out as soon as the page is
  // hidden or torn down, so leaving the app cannot swallow the last edit. createWritable()
  // streams into a temporary file that close() swaps in, so an interrupted flush cannot
  // corrupt an existing note file.
  function flushPendingSave(){if(state.saveTimer==null)return;clearTimeout(state.saveTimer);state.saveTimer=null;scheduleSave(true);}
  async function scheduleSave(refresh=false) {
    state.db.savedAt=Date.now();const snapshot=clone(state.db);state.saveQueue=state.saveQueue.catch(()=>{}).then(()=>storage.save(snapshot));
    try{await state.saveQueue;$('#saveState').classList.remove('saving');$('#saveState span').textContent=t('saved');if(refresh){renderNavigation();renderNoteList();const note=activeNote();if(note)$('#breadcrumb').textContent=`${activeWorkspace()?.name}  /  ${folderName(note.folderId)}  /  ${noteName(note)}`;}}catch(error){console.error('PowerMind save failed',error);$('#saveState').classList.remove('saving');$('#saveState span').textContent=error?.code==='NO_DIRECTORY'?t('chooseFolder'):t('saveFailed');}
  }

  function openMenu(menu,x,y){closeMenus();menu.classList.add('open');menu.style.left=`${Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))}px`;}
  function openMenuAt(menu,anchor){closeMenus();menu.classList.add('open');const rect=anchor.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(rect.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.min(rect.bottom+4,innerHeight-menu.offsetHeight-8)}px`;}
  function closeMenus(){ $$('.menu-surface.open,.slash-menu.open,.color-palette.open,.fluent-options.open').forEach(menu=>menu.classList.remove('open'));$$('.fluent-select').forEach(button=>button.setAttribute('aria-expanded','false')); }

  function prepareNoteMenu(){const note=state.db.notes.find(item=>item.id===(state.noteMenuNoteId||state.noteId)),trashed=Boolean(note?.trashed);$('[data-action="restore"]').hidden=!trashed;$('[data-action="trash"] span').textContent=trashed?t('permanentlyDelete'):t('delete');}

  function openObjectContextMenu(type,objectId,x,y){
    if(state.readingMode&&type!=='text')return;
    const menu=$('#contextMenu');let actions=[];
    if(type==='idea'){const idea=activeNote().ideas.find(item=>item.id===objectId);actions=[['child',t('addChild')],...(!idea?.root?[['sibling',t('addSibling')]]:[]),['formula',t('formula')],[idea?.collapsed?'expand':'collapse',idea?.collapsed?t('expand'):t('collapse')],['root',t('setRoot')],['delete',t('delete')]];}
    else if(type==='block')actions=[['duplicate',t('duplicate')],['color',t('textColor')],['formula',t('formula')],['delete',t('delete')]];
    else if(type==='card'||type==='editor')actions=[['duplicate',t('duplicate')],['delete',t('delete')]];
    else if(type==='text')actions=[['cut','Cut'],['copy','Copy'],['paste','Paste'],['selectAll','Select all']];
    else actions=[['editor',t('addEditor')],['card',t('newMindMap')],['formula',t('formula')],['layout',t('autoLayout')]];
    menu.innerHTML=actions.map(([action,label])=>`<button data-context-action="${action}" class="${action==='delete'?'danger':''}">${escapeHtml(label)}</button>`).join('');
    openMenu(menu,x,y);
    $$('[data-context-action]',menu).forEach(button=>button.onclick=()=>{
      const action=button.dataset.contextAction;closeMenus();
      if(type==='idea'){if(action==='child')addChildIdea(objectId);if(action==='sibling')addSiblingIdea(objectId);if(action==='formula')openFormulaDialog('mindmap',objectId);if(action==='collapse'||action==='expand')toggleIdeaCollapse(objectId);if(action==='root')setIdeaRoot(objectId);if(action==='delete')deleteIdea(objectId);}
      else if(type==='block'){const note=activeNote(),index=note.blocks.findIndex(block=>block.id===objectId),block=note.blocks[index];if(action==='duplicate'){checkpoint();note.blocks.splice(index+1,0,{...clone(block),id:id()});renderBlocks();markChanged();}if(action==='formula')openFormulaDialog('document',objectId);if(action==='color')openTextColorPalette(null,objectId,x,y);if(action==='delete'&&note.blocks.length>1){checkpoint();note.blocks.splice(index,1);renderBlocks();markChanged();}}
      else if(type==='card'){const note=activeNote(),index=note.cards.findIndex(card=>card.id===objectId);if(action==='duplicate'){checkpoint();const copy={...clone(note.cards[index]),id:id(),x:note.cards[index].x+30,y:note.cards[index].y+30};note.cards.splice(index+1,0,copy);}if(action==='delete'){checkpoint();note.cards.splice(index,1);}renderFreeCards();markChanged();}
      else if(type==='editor'){const note=activeNote(),index=note.editors.findIndex(editor=>editor.id===objectId);if(index<0)return;if(action==='duplicate'){checkpoint();const copy=clone(note.editors[index]);copy.id=id();copy.x+=34;copy.y+=34;copy.blocks.forEach(block=>block.id=id());note.editors.splice(index+1,0,copy);}if(action==='delete'){checkpoint();note.editors.splice(index,1);}renderSecondaryEditors();markChanged();}
      else if(type==='text'){state.contextTarget?.focus();if(action==='cut'||action==='copy'||action==='selectAll')document.execCommand(action);if(action==='paste')navigator.clipboard?.readText().then(text=>document.execCommand('insertText',false,text)).catch(()=>toast('Clipboard permission is required.'));}
      else{if(action==='editor')addSecondaryEditor();if(action==='card')addFreeCard();if(action==='formula')openFormulaDialog('mindmap');if(action==='layout')autoLayoutMindMap();}
    });
  }

  const documentColors=['#1b1a19','#c42b1c','#e36c09','#986f0b','#107c10','#0078d4','#5c2d91','#c239b3','#69797e','#ffffff','#000000','#3a3a3a'];
  function openTextColorPalette(anchor,blockId=null,x=null,y=null,editorId=null){
    const currentSelection=getSelection();state.savedRange=currentSelection?.rangeCount?currentSelection.getRangeAt(0).cloneRange():null;
    const palette=$('#textColorPalette');palette.innerHTML=documentColors.map(color=>`<button data-text-color="${color}" style="--color:${color}" aria-label="${color}"></button>`).join('');
    palette.classList.add('open');const rect=anchor?.getBoundingClientRect();palette.style.left=`${x??Math.min(rect?.left||20,innerWidth-210)}px`;palette.style.top=`${y??(rect?.bottom||20)+4}px`;
    $$('[data-text-color]',palette).forEach(button=>button.onclick=()=>{const color=button.dataset.textColor,model=editorId?activeNote().editors.find(item=>item.id===editorId):null,content=editorId?$(`[data-editor-id="${editorId}"] [data-secondary-block="${blockId}"] .secondary-block-content`):$(`[data-block-id="${blockId}"] .block-content`),block=(model?.blocks||activeNote().blocks).find(item=>item.id===blockId);if(!block)return;checkpoint();const selection=getSelection();if(state.savedRange&&content?.contains(state.savedRange.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(state.savedRange);document.execCommand('foreColor',false,color);block.html=sanitizeRichHtml(content.innerHTML);block.text=content.textContent;}else block.color=color;state.savedRange=null;closeMenus();editorId?renderSecondaryEditors({editorId,blockId}):renderBlocks(block.id);markChanged();});
  }

  function showNameDialog(title,initialValue,onConfirm) {
    const dialog=$('#nameDialog'),input=$('#dialogInput');$('#dialogTitle').textContent=title;input.value=initialValue||'';dialog.returnValue='';dialog.showModal();setTimeout(()=>{input.focus();input.select();});
    dialog.onclose=()=>{if(dialog.returnValue==='default'&&input.value.trim())onConfirm(input.value.trim());};
  }

  function handleNoteAction(action) {
    const note=state.db.notes.find(item=>item.id===(state.noteMenuNoteId||state.noteId));if(!note)return;closeMenus();
    if(action==='favorite'){if(note.id===state.noteId)checkpoint();note.favorite=!note.favorite;note.updated=Date.now();scheduleSave(true);renderNoteList();}
    if(action==='restore'){note.trashed=false;state.filter='all';note.updated=Date.now();scheduleSave(true);renderNavigation();renderNoteList();}
    if(action==='duplicate'){const copy=clone(note);copy.id=id();copy.fileName=`${noteName(copy)} copy`;copy.updated=Date.now();copy.blocks.forEach(block=>block.id=id());const ideaIds=new Map(copy.ideas.map(idea=>[idea.id,id()]));copy.ideas.forEach(idea=>{idea.id=ideaIds.get(idea.id);idea.parentId=idea.parentId?ideaIds.get(idea.parentId)||null:null;});copy.cards.forEach(card=>card.id=id());(copy.editors||[]).forEach(editor=>{editor.id=id();editor.blocks.forEach(block=>block.id=id());});copy.inkStrokes.forEach(stroke=>stroke.id=id());state.db.notes.unshift(copy);state.noteId=copy.id;scheduleSave(true);selectNote(copy.id);}
    if(action==='rename')showNameDialog(t('renameNote'),note.fileName||'',value=>{if(note.id===state.noteId)checkpoint();note.fileName=value;note.updated=Date.now();scheduleSave(true);renderNoteList();if(note.id===state.noteId)$('#breadcrumb').textContent=`${activeWorkspace()?.name||'PowerMind'}  /  ${folderName(note.folderId)}  /  ${noteName(note)}`;});
    if(action==='move'){const menu=$('#workspaceMenu'),folders=state.db.folders.filter(folder=>folder.workspaceId===note.workspaceId);menu.innerHTML=folders.map(folder=>`<button data-move-folder="${folder.id}"><span class="folder-glyph"></span>${escapeHtml(folder.name)}${folder.id===note.folderId?' ✓':''}</button>`).join('');openMenuAt(menu,state.noteMenuAnchor||$('#noteFolderButton')||$('.note-meta button'));$$('[data-move-folder]',menu).forEach(button=>button.onclick=()=>{note.folderId=button.dataset.moveFolder;closeMenus();note.updated=Date.now();scheduleSave(true);renderNoteList();});}
    if(action==='print')printNote(false);
    if(action==='pdf')printNote(true);
    if(action==='export-note')exportBackup('note');
    if(action==='trash'){
      if(state.filter==='trash'){if(confirm(t('permanentlyDelete')+'?')){state.db.notes=state.db.notes.filter(item=>item.id!==note.id);state.noteId=state.db.notes.find(noteVisible)?.id||null;scheduleSave(true);renderAll();}}
      else{if(note.id===state.noteId)checkpoint();note.trashed=true;if(state.noteId===note.id)state.noteId=state.db.notes.find(noteVisible)?.id||null;scheduleSave(true);renderAll();}
    }
  }

  function updateStorageLabel(){const status=$('#folderStorageStatus'),button=$('#openDataFolder'),close=$('#closeDataFolder'),save=$('#saveState span'),gate=$('#folderGate'),gateButton=$('#chooseFolderGate span');if(status)status.textContent=state.directoryHandle?state.directoryName:t('folderRequired');if(button)button.textContent=t(state.directoryHandle?'changeFolder':'chooseFolder');if(close)close.hidden=!state.directoryHandle;if(save&&!state.directoryHandle)save.textContent=t('chooseFolder');if(gateButton)gateButton.textContent=state.recalledDirectoryHandle&&!state.directoryHandle?t('reopenFolder'):t('chooseFolder');if(gate)gate.hidden=Boolean(state.directoryHandle);}
  async function connectDataFolder(){
    if(!window.showDirectoryPicker){toast(t('directFolderUnsupported'));return;}
    try{
      const directory=await showDirectoryPicker({mode:'readwrite'});if(await directory.requestPermission?.({mode:'readwrite'})!=='granted')return;
      let existing=null,hasManifest=true;try{await directory.getFileHandle(storage.manifest);}catch(error){if(error?.name==='NotFoundError'||/not found|could not be found|does not exist/i.test(String(error?.message||error)))hasManifest=false;else throw error;}if(hasManifest)existing=await storage.loadDirectory(directory);
      const switching=state.directoryHandle?!(await state.directoryHandle.isSameEntry?.(directory)):state.legacyData;if(existing&&switching&&!confirm(t('openExistingFolder')))return;
      state.directoryHandle=directory;state.directoryName=directory.name;await storage.rememberHandle(directory);
      state.recalledDirectoryHandle=null;state.recalledDirectoryName='';
      if(existing){state.db=migrateDatabase(existing);state.workspaceId=state.db.workspaces[0]?.id;state.noteId=state.db.notes.find(note=>note.workspaceId===state.workspaceId&&!note.trashed)?.id||null;state.history=[];state.future=[];renderAll();}
      else await scheduleSave(true);
      await storage.clearLegacy();updateStorageLabel();$('#settingsDialog')?.close();toast(t('folderConnected'));
    }catch(error){if(error?.name!=='AbortError'){console.error('Could not open PowerMind folder',error);toast(error.message||t('folderRequired'));}}
  }
  async function resumeRememberedFolder(){
    const directory=state.recalledDirectoryHandle;if(!directory)return connectDataFolder();
    try{
      const permission=await directory.requestPermission?.({mode:'readwrite'});
      if(permission!=='granted')return;
      const existing=await storage.loadDirectory(directory);
      state.directoryHandle=directory;state.directoryName=directory.name||state.recalledDirectoryName;state.recalledDirectoryHandle=null;state.recalledDirectoryName='';
      state.db=migrateDatabase(existing);state.workspaceId=state.db.workspaces[0]?.id;state.noteId=state.db.notes.find(note=>note.workspaceId===state.workspaceId&&!note.trashed)?.id||null;state.history=[];state.future=[];
      renderAll();updateStorageLabel();toast(t('folderConnected'));
    }catch(error){console.error('Could not reopen remembered PowerMind folder',error);toast(error.message||t('folderRequired'));}
  }
  async function closeDataFolder(){try{await state.saveQueue;}catch{}await storage.forgetHandle();state.directoryHandle=null;state.directoryName='';state.db=migrateDatabase(null);state.workspaceId=state.db.workspaces[0]?.id;state.noteId=state.db.notes[0]?.id||null;state.history=[];state.future=[];$('#settingsDialog').close();renderAll();updateStorageLabel();}
  function toast(message){const element=$('#toast');element.textContent=message;element.classList.add('show');clearTimeout(element.timer);element.timer=setTimeout(()=>element.classList.remove('show'),2200);}
  function updateImageViewer(){const stage=$('#imageViewerStage'),view=state.imageViewer;stage.style.setProperty('--image-zoom',view.zoom);stage.style.setProperty('--image-x',`${view.x}px`);stage.style.setProperty('--image-y',`${view.y}px`);$('#imageZoomReset').textContent=`${Math.round(view.zoom*100)}%`;}
  function openImageViewer(block){state.imageViewer={zoom:1,x:0,y:0};$('#imageViewerImage').src=block.src;$('#imageViewerImage').alt=block.alt||'';$('#imageViewerTitle').textContent=block.alt||t('image');updateImageViewer();$('#imageViewer').showModal();}
  function setupImageViewerGestures(){const stage=$('#imageViewerStage'),pointers=new Map();let gesture=null;const snapshot=()=>{const values=[...pointers.values()];if(values.length===1)return{kind:'pan',point:values[0],x:state.imageViewer.x,y:state.imageViewer.y};if(values.length===2){const [a,b]=values;return{kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},zoom:state.imageViewer.zoom,x:state.imageViewer.x,y:state.imageViewer.y};}return null;};stage.addEventListener('wheel',event=>{event.preventDefault();state.imageViewer.zoom=clamp(state.imageViewer.zoom+(event.deltaY<0?.12:-.12),.2,4);updateImageViewer();},{passive:false});stage.addEventListener('pointerdown',event=>{event.preventDefault();stage.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});gesture=snapshot();stage.classList.add('panning');});stage.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const values=[...pointers.values()];if(values.length===2){if(gesture?.kind!=='pinch')gesture=snapshot();const [a,b]=values,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));state.imageViewer.zoom=clamp(gesture.zoom*distance/gesture.distance,.2,4);state.imageViewer.x=gesture.x+center.x-gesture.center.x;state.imageViewer.y=gesture.y+center.y-gesture.center.y;}else if(values.length===1){if(gesture?.kind!=='pan')gesture=snapshot();state.imageViewer.x=gesture.x+values[0].x-gesture.point.x;state.imageViewer.y=gesture.y+values[0].y-gesture.point.y;}updateImageViewer();});const release=event=>{pointers.delete(event.pointerId);gesture=snapshot();if(!pointers.size)stage.classList.remove('panning');};stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);}
  function printInkDataUrl(note){const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=3000;const context=canvas.getContext('2d',{alpha:true});if(note.ink){const fallback=$('#inkCanvas');if(fallback?.width)context.drawImage(fallback,0,0,4000,3000);}else (note.inkStrokes||[]).forEach(stroke=>drawStroke(context,stroke,1,false));return canvas.toDataURL('image/png');}
  function preparePrintSheet(){
    const note=activeNote(),sheet=$('#printSheet');if(!note)return;
    const cardElement=$('#documentCard'),cardWidth=cardElement.offsetWidth||note.card.width||620,cardHeight=cardElement.offsetHeight||note.card.height||410;
    const boxes=[...(note.primaryEditorDeleted?[]:[{x:note.card.x,y:note.card.y,w:cardWidth,h:cardHeight}]),...note.ideas.map(idea=>({x:idea.x,y:idea.y,w:190,h:64})),...(note.editors||[]).map(editor=>({x:editor.x,y:editor.y,w:editor.width,h:editor.height}))];if(!boxes.length)boxes.push({x:600,y:400,w:620,h:410});
    (note.inkStrokes||[]).forEach(stroke=>(stroke.points||[]).forEach(point=>boxes.push({x:point.x-18,y:point.y-18,w:36,h:36})));
    const bounds=boxes.reduce((b,box)=>({left:Math.min(b.left,box.x),top:Math.min(b.top,box.y),right:Math.max(b.right,box.x+box.w),bottom:Math.max(b.bottom,box.y+box.h)}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
    const padding=54,minX=Math.max(0,bounds.left-padding),minY=Math.max(0,bounds.top-padding),maxX=Math.min(4000,bounds.right+padding),maxY=Math.min(3000,bounds.bottom+padding),rawWidth=Math.max(420,maxX-minX),rawHeight=Math.max(300,maxY-minY),scale=Math.min(1,720/rawWidth,970/rawHeight);
    sheet.replaceChildren();const heading=document.createElement('header');heading.className='print-heading';heading.innerHTML=`<strong>${escapeHtml(note.title||t('untitled'))}</strong><span>${escapeHtml(folderName(note.folderId))} · ${escapeHtml(formatDate(note.updated))}</span>`;
    const board=document.createElement('section');board.className='print-canvas-board';board.style.width=`${rawWidth*scale}px`;board.style.height=`${rawHeight*scale}px`;
    const scene=document.createElement('div');scene.className='print-canvas-scene';scene.style.width='4000px';scene.style.height='3000px';scene.style.left=`${-minX*scale}px`;scene.style.top=`${-minY*scale}px`;scene.style.transform=`scale(${scale})`;
    const connections=$('#connectionLayer').cloneNode(true);connections.removeAttribute('id');scene.append(connections);
    if(note.ink||(note.inkStrokes||[]).length){const ink=document.createElement('img');ink.className='print-ink';ink.src=printInkDataUrl(note);scene.append(ink);}
    if(!note.primaryEditorDeleted){const card=cardElement.cloneNode(true);card.removeAttribute('id');card.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));card.querySelectorAll('.document-resize-frame,.card-drag-handle,.document-resize-handle,.format-bar,.add-block-row,.block-handle,.divider-delete,.backlinks,.secondary-editor-delete').forEach(element=>element.remove());card.querySelectorAll('[contenteditable]').forEach(element=>element.removeAttribute('contenteditable'));const title=card.querySelector('.note-title'),titleText=document.createElement('h1');titleText.className='print-note-title';titleText.textContent=note.title||t('untitled');title?.replaceWith(titleText);card.style.left=`${note.card.x}px`;card.style.top=`${note.card.y}px`;card.style.width=`${cardWidth}px`;card.style.height='auto';card.style.minHeight=`${cardHeight}px`;scene.append(card);}
    const ideas=$('#ideaLayer').cloneNode(true);ideas.removeAttribute('id');ideas.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));ideas.querySelectorAll('.node-tools').forEach(element=>element.remove());scene.append(ideas);
    $$('.secondary-document-card:not(#documentCard)').forEach(source=>{const editor=source.cloneNode(true);editor.querySelectorAll('.secondary-resize-frame,.secondary-resize-handle,.secondary-format-bar,.secondary-add-row,.secondary-editor-delete,.secondary-editor-grip').forEach(control=>control.remove());editor.querySelectorAll('[contenteditable]').forEach(content=>content.removeAttribute('contenteditable'));const input=editor.querySelector('.unified-editor-title'),editorTitle=document.createElement('h2');editorTitle.textContent=input?.value||t('untitled');input?.replaceWith(editorTitle);scene.append(editor);});
    board.append(scene);sheet.append(heading,board);
  }
  function printNote(asPdf=false){if(!activeNote())return;preparePrintSheet();const previous=document.title;state.printing=true;document.body.classList.add('printing');document.title=`${noteName(activeNote())||'PowerMind'}${asPdf?'.pdf':''}`;if(asPdf)toast(t('pdfHint'));let restored=false;const restore=()=>{if(restored)return;restored=true;state.printing=false;document.body.classList.remove('printing');document.title=previous;applyTheme();applyAccent();requestAnimationFrame(()=>document.body.getBoundingClientRect());};addEventListener('afterprint',restore,{once:true});addEventListener('focus',restore,{once:true});setTimeout(()=>{try{window.print();}finally{setTimeout(restore,0);}},30);}
  function placeCaretAtEnd(element){const range=document.createRange(),selection=getSelection();range.selectNodeContents(element);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}

  function downloadPayload(payload,name){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('exported'));}
  function exportBackup(scope='all'){const date=new Date().toISOString().slice(0,10),workspace=activeWorkspace(),note=activeNote();let payload,name;if(scope==='workspace'){payload={app:'Ramizom PowerMind',version:3,scope:'workspace',exportedAt:new Date().toISOString(),workspace,folders:state.db.folders.filter(folder=>folder.workspaceId===workspace.id),notes:state.db.notes.filter(item=>item.workspaceId===workspace.id)};name=`PowerMind-workspace-${date}.json`;}else if(scope==='note'&&note){payload={app:'Ramizom PowerMind',version:3,scope:'note',exportedAt:new Date().toISOString(),note};name=`PowerMind-note-${date}.json`;}else{payload={app:'Ramizom PowerMind',version:3,scope:'all',exportedAt:new Date().toISOString(),data:state.db};name=`PowerMind-${date}.json`;}downloadPayload(payload,name);}
  function copyImportedNote(original,workspaceId,folderId){
    const copy=clone(original),ideaIds=new Map((copy.ideas||[]).map(idea=>[idea.id,id()]));
    copy.id=id();copy.workspaceId=workspaceId;copy.folderId=folderId;
    (copy.blocks||[]).forEach(block=>block.id=id());
    (copy.ideas||[]).forEach(idea=>{const previous=idea.id;idea.id=ideaIds.get(previous);idea.parentId=idea.parentId?ideaIds.get(idea.parentId)||null:null;});
    (copy.editors||[]).forEach(editor=>{editor.id=id();(editor.blocks||[]).forEach(block=>block.id=id());});
    (copy.inkStrokes||[]).forEach(stroke=>stroke.id=id());
    return copy;
  }
  async function importBackup(file){
    try{
      if(file.size>100*1024*1024)throw new Error('Backup exceeds 100 MB');
      const raw=JSON.parse(await file.text());
      if(raw.app!=='Ramizom PowerMind')throw new Error('Wrong application');
      let next=clone(state.db),workspaceId=state.workspaceId,noteId=null;
      if(raw.scope==='note'&&raw.note){
        const folderId=next.folders.find(folder=>folder.workspaceId===workspaceId)?.id||null;
        const copy=copyImportedNote(raw.note,workspaceId,folderId);next.notes.unshift(copy);noteId=copy.id;
      }else if(raw.scope==='workspace'&&raw.workspace&&Array.isArray(raw.notes)){
        const workspace={...clone(raw.workspace),id:id()},folderMap=new Map();workspaceId=workspace.id;
        (raw.folders||[]).forEach(folder=>{const copy={...clone(folder),id:id(),workspaceId};folderMap.set(folder.id,copy.id);next.folders.push(copy);});
        if(!folderMap.size){const folder={id:id(),workspaceId,name:'Inbox'};next.folders.push(folder);folderMap.set('',folder.id);}
        next.workspaces.push(workspace);
        next.notes.push(...raw.notes.map(note=>copyImportedNote(note,workspaceId,folderMap.get(note.folderId)||folderMap.values().next().value)));
      }else if((!raw.scope||raw.scope==='all')&&raw.data&&Array.isArray(raw.data.workspaces)&&raw.data.workspaces.length&&Array.isArray(raw.data.folders)&&Array.isArray(raw.data.notes)){
        next=clone(raw.data);workspaceId=next.workspaces[0].id;
      }else throw new Error('Invalid backup structure');
      next=migrateDatabase(next);
      if(!confirm(t('import')+' “'+file.name+'”?'))return;
      state.db=next;state.workspaceId=workspaceId;state.noteId=noteId||next.notes.find(note=>note.workspaceId===workspaceId&&!note.trashed)?.id||null;
      state.filter='all';state.folderId=null;state.search='';$('#searchInput').value='';state.history=[];state.future=[];
      await scheduleSave(true);renderAll();toast(t('imported'));
    }catch(error){console.error('PowerMind import failed',error);toast('Invalid PowerMind backup');}
  }

  function updateSystemChrome(){
    const dark=document.body.classList.contains('theme-dark'),accent=document.body.dataset.accent||localStorage.getItem('pm.accent')||'red',lightColors={red:'#f5e8e5',orange:'#f6ebe1',yellow:'#f5eedb',green:'#e7f1e7',teal:'#e3f1ef',blue:'#e6eef7',purple:'#eee8f5'},darkColors={red:'#302426',orange:'#302822',yellow:'#302d22',green:'#222e25',teal:'#202e2d',blue:'#202a33',purple:'#292530'},color=(dark?darkColors:lightColors)[accent]||(dark?'#25282b':'#f5eee9');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content',dark?'black-translucent':'default');document.documentElement.style.backgroundColor=color;document.documentElement.style.colorScheme=dark?'dark':'light';document.body.style.setProperty('--system-chrome-color',color);
  }
  function applyTheme(theme=localStorage.getItem('pm.theme')||'system'){
    const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.body.classList.toggle('theme-dark',dark);document.body.classList.toggle('theme-light',!dark);localStorage.setItem('pm.theme',theme);updatePicker('theme',theme);updateSystemChrome();if(state.db&&activeNote())renderInk();
  }
  const pickerLabels={language:{en:'English',zh:'中文',es:'Español',fr:'Français',de:'Deutsch',pt:'Português',ko:'한국어',ja:'日本語'},theme:{system:'system',light:'light',dark:'dark'},accent:{red:'accentRed',orange:'accentOrange',yellow:'accentYellow',green:'accentGreen',teal:'accentTeal',blue:'accentBlue',purple:'accentPurple'},penButton:{lasso:'sideButtonLasso',eraser:'sideButtonEraser'}};
  function updatePicker(name,value){const picker=$(`[data-picker="${name}"]`);if(!picker)return;const label=$('.fluent-select span',picker),labelKey=pickerLabels[name]?.[value];if(name==='language'){label.removeAttribute('data-i18n');label.textContent=labelKey||value;}else{label.dataset.i18n=labelKey;label.textContent=t(labelKey);}$$('[data-picker-value]',picker).forEach(option=>{const selected=option.dataset.pickerValue===value;option.classList.toggle('selected',selected);option.setAttribute('aria-selected',String(selected));});}
  function setupFluentPickers(){const handlers={language:value=>{localStorage.setItem('pm.language',value);applyTranslations();renderAll();},theme:applyTheme,accent:applyAccent,penButton:value=>{localStorage.setItem('pm.penButtonAction',value);updatePicker('penButton',value);}};$$('.fluent-picker').forEach(picker=>{const name=picker.dataset.picker,button=$('.fluent-select',picker),menu=$('.fluent-options',picker),options=$$('[data-picker-value]',menu);const open=()=>{closeMenus();menu.classList.add('open');button.setAttribute('aria-expanded','true');(options.find(option=>option.classList.contains('selected'))||options[0])?.focus();};button.onclick=event=>{event.stopPropagation();menu.classList.contains('open')?closeMenus():open();};button.onkeydown=event=>{if(event.key==='ArrowDown'||event.key==='Enter'||event.key===' '){event.preventDefault();open();}};options.forEach((option,index)=>{option.onclick=event=>{event.stopPropagation();handlers[name](option.dataset.pickerValue);closeMenus();button.focus();};option.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeMenus();button.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}};});});}
  function syncNavigationToggle(){const toggle=$('#collapseNav'),shell=$('.app-shell'),navSlot=$('#navMenuSlot'),workSlot=$('#workMenuSlot');if(!toggle||!shell||!navSlot||!workSlot)return;const collapsed=shell.classList.contains('nav-collapsed'),destination=collapsed?workSlot:navSlot;if(toggle.parentElement!==destination)destination.append(toggle);toggle.classList.toggle('in-work-pane',collapsed);}
  function applyPaneLayout(){const shell=$('.app-shell');shell.classList.toggle('nav-collapsed',localStorage.getItem('pm.navCollapsed')==='1');shell.classList.toggle('notes-collapsed',localStorage.getItem('pm.notesCollapsed')==='1');shell.classList.remove('focus-mode');localStorage.removeItem('pm.focusMode');syncNavigationToggle();}
  const isPortraitMobile=()=>matchMedia('(max-width: 800px) and (orientation: portrait)').matches;
  function showMobileStage(stage){
    if(!isPortraitMobile())return;
    state.mobileStage=stage;
    const shell=$('.app-shell');
    $('#navPane').classList.toggle('open',stage==='workspace');
    $('.notes-pane').classList.toggle('mobile-open',stage==='notes');
    shell.dataset.mobileStage=stage;
    $('#navPane').inert=stage!=='workspace';$('.notes-pane').inert=stage!=='notes';$('.work-pane').inert=stage!=='editor';
    closeMenus();
    if(stage==='editor')requestAnimationFrame(fitCanvasContent);
  }
  function syncMobileHierarchy(){
    const shell=$('.app-shell');
    if(isPortraitMobile())showMobileStage(state.mobileStage||'workspace');
    else{shell.removeAttribute('data-mobile-stage');$('#navPane').classList.remove('open');$('.notes-pane').classList.remove('mobile-open');$$('#navPane,.notes-pane,.work-pane').forEach(pane=>pane.inert=false);}
  }
  function togglePane(name){const key=`pm.${name}Collapsed`,next=localStorage.getItem(key)!=='1';localStorage.setItem(key,next?'1':'0');applyPaneLayout();requestAnimationFrame(()=>fitCanvasContent());}
  function revealPane(name){localStorage.setItem(`pm.${name}Collapsed`,'0');applyPaneLayout();requestAnimationFrame(()=>fitCanvasContent());}
  function toggleNavigationAndNotes(){const shell=$('.app-shell'),collapse=!shell.classList.contains('nav-collapsed');localStorage.setItem('pm.navCollapsed',collapse?'1':'0');localStorage.setItem('pm.notesCollapsed',collapse?'1':'0');applyPaneLayout();requestAnimationFrame(()=>fitCanvasContent());}
  function applyAccent(accent=localStorage.getItem('pm.accent')||'red'){
    if(!['red','orange','yellow','green','teal','blue','purple'].includes(accent))accent='red';
    const colors={red:'#c42b1c',orange:'#d05d00',yellow:'#e5ad14',green:'#107c10',teal:'#008272',blue:'#095ea7',purple:'#744da9'};document.body.dataset.accent=accent;localStorage.setItem('pm.accent',accent);$('#accentSelect').style.setProperty('--option-color',colors[accent]);updatePicker('accent',accent);updateSystemChrome();
  }

  function setupFormulaKeyboard(){
    const keys=[['7','7'],['8','8'],['9','9'],['+','+'],['−','-'],['×','\\times '],['÷','\\div '],['α','\\alpha '],['β','\\beta '],['π','\\pi '],['4','4'],['5','5'],['6','6'],['=','='],['≠','\\neq '],['≤','\\le '],['≥','\\ge '],['θ','\\theta '],['∞','\\infty '],['√','\\sqrt{}'],['1','1'],['2','2'],['3','3'],['(', '('],[')',')'],['x²','^{2}'],['xₙ','_{}'],['a⁄b','\\frac{}{}'],['Σ','\\sum '],['∫','\\int '],['0','0'],['.','.'],['±','\\pm '],['←','BACK'],['Clear','CLEAR']];
    $('#formulaKeyboard').innerHTML=keys.map(([label,value])=>`<button data-formula-key="${escapeHtml(value)}">${label}</button>`).join('');
    $$('[data-formula-key]').forEach(button=>button.onclick=()=>{const input=$('#formulaInput'),value=button.dataset.formulaKey;if(value==='BACK'){const start=input.selectionStart;if(start>0){input.value=input.value.slice(0,start-1)+input.value.slice(input.selectionEnd);input.selectionStart=input.selectionEnd=start-1;}}else if(value==='CLEAR'){input.value='';}else{const start=input.selectionStart,end=input.selectionEnd;input.value=input.value.slice(0,start)+value+input.value.slice(end);const offset=value.includes('{}')?value.indexOf('{}')+1:value.length;input.selectionStart=input.selectionEnd=start+offset;}input.focus();updateFormulaPreview();});
  }

  function updateFormulaPreview(){const latex=$('#formulaInput').value;$('#formulaPreview').innerHTML=latex?formulaToMathML(latex):`<span style="color:var(--text-3)">${escapeHtml(t('formulaHint'))}</span>`;}
  function openFormulaDialog(target='document',objectId=null,editorId=null){
    const note=activeNote();let value='';
    if(!note)return;
    state.formulaEdit={target,id:objectId,editorId};
    if(target==='document'&&objectId)value=note.blocks.find(block=>block.id===objectId)?.latex||'';
    if(target==='mindmap'&&objectId)value=note.ideas.find(idea=>idea.id===objectId)?.formula||'';
    if(target==='editor'&&objectId)value=note.editors.find(editor=>editor.id===editorId)?.blocks.find(block=>block.id===objectId)?.latex||'';
    $('#formulaInput').value=value;
    $$('.formula-target button').forEach(button=>button.classList.toggle('selected',button.dataset.target===(target==='editor'?'document':target)));
    updateFormulaPreview();$('#formulaDialog').showModal();setTimeout(()=>$('#formulaInput').focus());
  }

  function commitFormula(){
    const latex=$('#formulaInput').value.trim();if(!latex)return;
    checkpoint();const note=activeNote();
    if(state.formulaEdit.target==='document'){
      const existing=note.blocks.find(block=>block.id===state.formulaEdit.id);
      if(existing){existing.type='formula';existing.latex=latex;existing.text=latex;delete existing.html;renderBlocks(existing.id);}else addBlock('formula',null,{latex,text:latex});
    }else if(state.formulaEdit.target==='editor'){
      const editor=note.editors.find(item=>item.id===state.formulaEdit.editorId);if(!editor)return;
      const existing=editor.blocks.find(block=>block.id===state.formulaEdit.id),block=existing||{id:id(),type:'formula',text:'',done:false};block.type='formula';block.latex=latex;block.text=latex;delete block.html;if(!existing)editor.blocks.push(block);renderSecondaryEditors({editorId:editor.id,blockId:block.id});
    }else{
      const existing=note.ideas.find(idea=>idea.id===state.formulaEdit.id);
      if(existing){existing.formula=latex;existing.text='';}else addFormulaIdea(latex);
      renderIdeas();markChanged();
    }
    $('#formulaDialog').close();markChanged();
  }

  function deleteWorkspace(workspace){if(state.db.workspaces.length===1){toast('Keep at least one workspace.');return;}if(!confirm(`${t('permanentlyDelete')}?`))return;state.db.workspaces=state.db.workspaces.filter(item=>item.id!==workspace.id);state.db.folders=state.db.folders.filter(item=>item.workspaceId!==workspace.id);state.db.notes=state.db.notes.filter(item=>item.workspaceId!==workspace.id);state.workspaceId=state.db.workspaces[0].id;state.noteId=state.db.notes.find(item=>item.workspaceId===state.workspaceId&&!item.trashed)?.id||null;state.filter='all';closeMenus();scheduleSave(true);renderAll();}
  function openWorkspaceColorMenu(workspace,menu){const colors=['#c42b1c','#d05d00','#e5ad14','#107c10','#008272','#0f6cbd','#744da9','#c239b3'];menu.innerHTML=`<div class="workspace-color-menu" role="group" aria-label="${escapeHtml(t('workspaceColor'))}">${colors.map(color=>`<button data-workspace-color="${color}" aria-label="${color}" title="${color}" style="--workspace-color:${color}" class="${safeColor(workspace.color)===color?'selected':''}"></button>`).join('')}</div>`;$$('[data-workspace-color]',menu).forEach(button=>button.onclick=()=>{workspace.color=button.dataset.workspaceColor;closeMenus();scheduleSave(true);renderNavigation();});}
  function openWorkspaceActions(workspace,menu){menu.innerHTML=`<button data-workspace-action="rename">${t('rename')}</button><button data-workspace-action="color">${t('workspaceColor')}</button><button data-workspace-action="export">${t('exportWorkspace')}</button><button data-workspace-action="delete" class="danger">${t('permanentlyDelete')}</button>`;$('[data-workspace-action="rename"]',menu).onclick=()=>showNameDialog(t('rename'),workspace.name,name=>{workspace.name=name;closeMenus();scheduleSave(true);renderAll();});$('[data-workspace-action="color"]',menu).onclick=event=>{event.stopPropagation();requestAnimationFrame(()=>{openWorkspaceColorMenu(workspace,menu);menu.classList.add('open');});};$('[data-workspace-action="export"]',menu).onclick=()=>{closeMenus();exportBackup('workspace');};$('[data-workspace-action="delete"]',menu).onclick=()=>deleteWorkspace(workspace);}
  function bindEvents() {
    document.addEventListener('keydown',event=>{if(event.key!=='Enter'||!event.shiftKey||event.isComposing)return;const content=event.target.closest('.unified-editor-card .block-content');if(!content)return;const blockElement=content.closest('.content-block'),editorElement=content.closest('.unified-editor-card'),record=editorRecords().find(item=>(item.id||'primary')===editorElement.dataset.editorId),block=record?.blocks.find(item=>item.id===blockElement?.dataset.blockId);if(!block||block.type==='code')return;event.preventDefault();event.stopImmediatePropagation();checkpoint();document.execCommand('insertLineBreak',false,null);block.text=content.textContent;block.html=sanitizeRichHtml(content.innerHTML);markChanged();},true);
    $('#newNote').onclick=$('#newNoteCompact').onclick=$('#emptyNewNote').onclick=createNote;$$('[data-empty-create]').forEach(button=>button.onclick=createNote);
    $('#searchInput').addEventListener('input',event=>{state.search=event.target.value;renderNoteList();});
    $$('.nav-list [data-filter]').forEach(button=>button.addEventListener('click',()=>activateNavigationScope(button.dataset.filter)));
    $('#addFolder').onclick=()=>showNameDialog(t('folderName'),'',name=>{state.db.folders.push({id:id(),workspaceId:state.workspaceId,name});scheduleSave(true);});
    $('#addWorkspace').onclick=()=>showNameDialog(t('workspaceName'),'',name=>{const workspace={id:id(),name,color:'#16823b'};state.db.workspaces.push(workspace);state.workspaceId=workspace.id;state.db.folders.push({id:id(),workspaceId:workspace.id,name:language()==='zh'?'收件箱':language()==='ja'?'受信トレイ':'Inbox'});state.noteId=null;scheduleSave(true);renderAll();});
    $('#workspacePicker').onclick=()=>{const menu=$('#workspaceMenu');menu.innerHTML=state.db.workspaces.map(w=>`<button data-workspace-id="${w.id}"><i style="width:9px;height:9px;border-radius:3px;background:${safeColor(w.color)}"></i>${escapeHtml(w.name)}</button>`).join('');openMenuAt(menu,$('#workspacePicker'));$$('[data-workspace-id]',menu).forEach(b=>b.onclick=()=>{state.workspaceId=b.dataset.workspaceId;state.noteId=state.db.notes.find(n=>n.workspaceId===state.workspaceId&&!n.trashed)?.id||null;state.filter='all';closeMenus();revealPane('notes');renderAll();showMobileStage('notes');});};
    $('#workspacePicker').oncontextmenu=event=>{event.preventDefault();const menu=$('#workspaceMenu');openWorkspaceActions(activeWorkspace(),menu);openMenu(menu,event.clientX,event.clientY);};
    $('#workspaceMore').onclick=event=>{event.stopPropagation();const menu=$('#workspaceMenu');openWorkspaceActions(activeWorkspace(),menu);openMenuAt(menu,event.currentTarget);};
    $('#navScrim').onclick=()=>$('#navPane').classList.remove('open');
    $('#backToWorkspace').onclick=()=>showMobileStage('workspace');
    $('#backToNotes').onclick=()=>showMobileStage('notes');
    $('#collapseNav').onclick=toggleNavigationAndNotes;
    $$('.tool-button').forEach(button=>button.onclick=()=>setTool(button.dataset.tool));
    $('#addCard').onclick=addFreeCard;$('#addEditor').onclick=addSecondaryEditor;
    $('#layoutMindMap').onclick=autoLayoutMindMap;
    $('#formulaButton').onclick=()=>openFormulaDialog(state.selectedObject?.type==='idea'?'mindmap':'document',state.selectedObject?.type==='idea'?state.selectedObject.id:null);
    $$('.color-chip').forEach(button=>button.onclick=()=>{$$('.color-chip').forEach(item=>item.classList.toggle('selected',item===button));state.pen.color=button.dataset.color;updateInkCursor();});
    $('#inkColorInput').oninput=event=>{state.pen.color=event.target.value;$$('.color-chip').forEach(item=>item.classList.remove('selected'));$('.custom-color span').style.background=event.target.value;updateInkCursor();};
    $$('.ink-mode').forEach(button=>button.onclick=()=>{$$('.ink-mode').forEach(item=>item.classList.toggle('selected',item===button));state.pen.mode=button.dataset.inkMode;state.inkSelection.clear();renderInkSelection();$('#inkOptions').classList.toggle('erasing',state.pen.mode.startsWith('eraser')||state.pen.mode==='lasso');updateInkCursor();});
    $('#penSize').oninput=event=>{state.pen.size=Number(event.target.value);updateInkCursor();};
    $('#clearInk').onclick=()=>{if(confirm(t('clearInk')+'?')){checkpoint();state.inkSelection.clear();activeNote().ink=null;activeNote().inkStrokes=[];renderInk();markChanged();}};
    $('#zoomIn').onclick=()=>zoomAt(state.view.zoom*1.15);$('#zoomOut').onclick=()=>zoomAt(state.view.zoom/1.15);$('#zoomReset').onclick=fitCanvasContent;
    $('#undoButton').onclick=undo;$('#redoButton').onclick=redo;
    $('#readingModeButton').onclick=toggleReadingMode;
    $('#noteMenuButton').onclick=event=>{event.stopPropagation();state.noteMenuNoteId=state.noteId;state.noteMenuAnchor=event.currentTarget;prepareNoteMenu();openMenuAt($('#noteMenu'),event.currentTarget);};
    $$('[data-action]',$('#noteMenu')).forEach(button=>button.onclick=()=>handleNoteAction(button.dataset.action));
    $('#sortNotesButton').onclick=event=>{const menu=$('#workspaceMenu'),sorts=[['recent','recent'],['created','dateCreated'],['title','titleSort'],['manual','manualSort']];menu.innerHTML=sorts.map(([value,key])=>`<button data-note-sort="${value}"><span>${escapeHtml(t(key))}</span>${state.noteSort===value?'<svg class="menu-check" aria-hidden="true"><use href="#i-check"/></svg>':''}</button>`).join('');openMenuAt(menu,event.currentTarget);$$('[data-note-sort]',menu).forEach(button=>button.onclick=()=>{const value=button.dataset.noteSort;if(value==='manual'&&!state.db.notes.filter(noteVisible).every(note=>Number.isFinite(note.manualOrder)))state.db.notes.filter(noteVisible).sort((a,b)=>b.updated-a.updated).forEach((note,index)=>note.manualOrder=index);state.noteSort=value;localStorage.setItem('pm.noteSort',state.noteSort);closeMenus();scheduleSave();renderNoteList();});};
    $('#settingsButton').onclick=()=>$('#settingsDialog').showModal();
    $('#openDataFolder').onclick=connectDataFolder;
    $('#closeDataFolder').onclick=closeDataFolder;
    $('#chooseFolderGate').onclick=()=>state.recalledDirectoryHandle?resumeRememberedFolder():connectDataFolder();
    setupFluentPickers();
    $('#bodyFontSize').oninput=event=>{localStorage.setItem('pm.bodyFontSize',event.target.value);applyBodyFontSize(event.target.value);};
    setupFormulaKeyboard();
    $('#formulaInput').oninput=updateFormulaPreview;
    $$('.formula-target button').forEach(button=>button.onclick=()=>{const keepEditor=button.dataset.target==='document'&&state.formulaEdit.editorId;state.formulaEdit={target:keepEditor?'editor':button.dataset.target,id:null,editorId:keepEditor?state.formulaEdit.editorId:null};$$('.formula-target button').forEach(item=>item.classList.toggle('selected',item===button));});
    $('#cancelFormula').onclick=()=>$('#formulaDialog').close();$('#insertFormula').onclick=commitFormula;
    $('#closeImageViewer').onclick=()=>$('#imageViewer').close();$('#imageZoomIn').onclick=()=>{state.imageViewer.zoom=clamp(state.imageViewer.zoom+.2,.2,4);updateImageViewer();};$('#imageZoomOut').onclick=()=>{state.imageViewer.zoom=clamp(state.imageViewer.zoom-.2,.2,4);updateImageViewer();};$('#imageZoomReset').onclick=()=>{state.imageViewer={zoom:1,x:0,y:0};updateImageViewer();};
    setupImageViewerGestures();
    $$('dialog').forEach(dialog=>dialog.addEventListener('pointerdown',event=>{const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close('cancel');}));
    document.addEventListener('click',event=>{const inside=event.composedPath().some(node=>node?.matches?.('.menu-surface,.color-palette,.fluent-picker,#noteMenuButton,#workspacePicker,#workspaceMore,#sortNotesButton,#textColorButton'));if(!inside)closeMenus();});
    document.addEventListener('contextmenu',event=>{event.preventDefault();if(state.tool==='ink'&&event.target.closest('#inkCanvas'))return;if(state.readingMode&&event.target.closest('.work-pane'))return;const editable=event.target.closest('input,textarea,[contenteditable]');if(editable){state.contextTarget=editable;openObjectContextMenu('text',null,event.clientX,event.clientY);return;}if(event.target.closest('.note-card,.folder-item,#workspacePicker,.idea-node'))return;const block=event.target.closest('.content-block');if(block){openObjectContextMenu('block',block.dataset.blockId,event.clientX,event.clientY);return;}if(event.target.closest('#canvasViewport'))openObjectContextMenu('canvas',null,event.clientX,event.clientY);});
    let longPressTimer=null,longPressStart=null;
    document.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'||event.target.closest('input,[contenteditable],button,select'))return;longPressStart={x:event.clientX,y:event.clientY,target:event.target};longPressTimer=setTimeout(()=>{const editorElement=longPressStart.target.closest('.unified-editor-card'),editorBlock=longPressStart.target.closest('.content-block'),card=longPressStart.target.closest('.free-card'),idea=longPressStart.target.closest('.idea-node');if(editorBlock&&editorElement){const record=editorRecords().find(item=>(item.id||'primary')===editorElement.dataset.editorId);if(record)openUnifiedBlockContextMenu(record,editorBlock.dataset.blockId,longPressStart.x,longPressStart.y);}else if(editorElement&&editorElement.id!=='documentCard')openObjectContextMenu('editor',editorElement.dataset.editorId,longPressStart.x,longPressStart.y);else if(card)openObjectContextMenu('card',card.dataset.cardId,longPressStart.x,longPressStart.y);else if(idea)openObjectContextMenu('idea',idea.dataset.ideaId,longPressStart.x,longPressStart.y);else if(longPressStart.target.closest('#canvasViewport'))openObjectContextMenu('canvas',null,longPressStart.x,longPressStart.y);navigator.vibrate?.(20);},560);},{passive:true});
    document.addEventListener('pointermove',event=>{if(longPressStart&&Math.hypot(event.clientX-longPressStart.x,event.clientY-longPressStart.y)>10){clearTimeout(longPressTimer);longPressStart=null;}},{passive:true});
    document.addEventListener('pointerup',()=>{clearTimeout(longPressTimer);longPressStart=null;},{passive:true});
    document.addEventListener('keydown',event=>{
      const editing=event.target.isContentEditable||/TEXTAREA|SELECT/.test(event.target.tagName)||(event.target.tagName==='INPUT'&&!event.target.readOnly);
      if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();scheduleSave(true);}
      if(!editing&&event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
      if(!editing&&event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}
      if(event.key==='Escape'){closeMenus();state.inkSelection.clear();renderInkSelection();}
      if(!editing&&(event.key==='Delete'||event.key==='Backspace')&&state.selectedObject?.type==='idea'){event.preventDefault();deleteIdea(state.selectedObject.id);}
      if(!editing&&(event.key==='Delete'||event.key==='Backspace')&&state.inkSelection.size){event.preventDefault();checkpoint();activeNote().inkStrokes=activeNote().inkStrokes.filter(stroke=>!state.inkSelection.has(stroke.id));state.inkSelection.clear();renderInk();markChanged();}
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(!state.printing&&(localStorage.getItem('pm.theme')||'system')==='system')applyTheme('system');});
    addEventListener('beforeprint',()=>{if(activeNote())preparePrintSheet();});
    matchMedia('(max-width: 800px) and (orientation: portrait)').addEventListener('change',event=>{state.mobileStage=event.matches?'workspace':'editor';syncMobileHierarchy();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushPendingSave();});
    addEventListener('pagehide',flushPendingSave);
  }

  function renderAll(){
    applyTranslations(); renderNavigation(); renderNoteList();
    const hasNote=Boolean(activeNote());
    $('#workEmpty').classList.toggle('show',!hasNote);
    $('#canvasWorld').setAttribute('aria-hidden',String(!hasNote));
    updateNoteCommandAvailability(hasNote);
    if(hasNote)selectNote(state.noteId);else{state.readingMode=false;applyReadingMode();setTool('select');$('#breadcrumb').textContent=activeWorkspace()?.name||'PowerMind';$('#blockCount').textContent=`0 ${t('blocks')}`;}
    updateStorageLabel(); updateUndoButtons();
  }

  // Explains, in the reader's own language, why notes cannot be saved on this platform.
  const insecureOrigin = () => location.protocol === 'file:' || window.isSecureContext === false;
  const storageSupported = () => location.protocol !== 'file:' && typeof window.showDirectoryPicker === 'function';
  const unsupportedLanguages = () => [['en','English'],['zh','中文'],['es','Español'],['fr','Français'],['de','Deutsch'],['pt','Português'],['ko','한국어'],['ja','日本語']];

  function showUnsupportedGate() {
    document.body.classList.add('platform-unsupported');
    const gate=$('#unsupportedGate'),reason=$('#unsupportedReason'),picker=$('#unsupportedLanguage');
    if(!gate)return;
    if(reason)reason.dataset.i18n=insecureOrigin()?'unsupportedInsecure':'unsupportedBody';
    if(picker){picker.innerHTML=unsupportedLanguages().map(([value,label])=>`<option value="${value}"${value===language()?' selected':''}>${escapeHtml(label)}</option>`).join('');picker.value=language();picker.onchange=()=>{try{localStorage.setItem('pm.language',picker.value);}catch{/* Language still applies for this session. */}applyTranslations();};}
    applyTranslations();
    gate.hidden=false;
  }

  function dismissStartupSplash(){const splash=$('#startupSplash');if(!splash)return;const elapsed=performance.now()-(window.PM_SPLASH_STARTED||0);setTimeout(()=>{splash.classList.add('is-hiding');setTimeout(()=>splash.remove(),360);},Math.max(0,1400-elapsed));}

  async function init() {
    try{localStorage.removeItem('pm.wallpaper');}catch{/* Remove the retired setting when storage is available. */}
    if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration().catch(()=>null);await registration?.unregister();}
    if('caches' in window){const cacheNames=await caches.keys().catch(()=>[]);await Promise.all(cacheNames.filter(name=>name.startsWith('powermind-shell-')).map(name=>caches.delete(name)));}
    state.db=migrateDatabase(await storage.restore());
    state.workspaceId=state.db.workspaces[0]?.id;
    state.noteId=state.db.notes.find(note=>note.workspaceId===state.workspaceId&&!note.trashed)?.id||null;
    applyTheme();applyAccent();applyBodyFontSize();
    if(!storageSupported()){showUnsupportedGate();dismissStartupSplash();return;}
    applyTranslations();applyPaneLayout();bindEvents();setupCanvasNavigation();setupInk();setupInkCursor();setupInkGuides();setupInkSelectionUI();updateTransform();renderAll();state.mobileStage=isPortraitMobile()?'workspace':'editor';syncMobileHierarchy();dismissStartupSplash();updateStorageLabel();
  }

  init().catch(error=>{dismissStartupSplash();console.error(error);toast(`PowerMind could not start: ${error.message}`);});
})();
