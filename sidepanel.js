import {renderMarkdown,summarySections} from './modules/markdown.js';
import {modelSettings,credentialFingerprint} from './modules/model-settings.js';
import {providerConfig} from './modules/providers.js';
import {validateKey,summarize,completion,testConnection} from './modules/summary.js';
import {conversationId,answerQuestion} from './modules/chat.js';
const el=id=>document.getElementById(id);
let provider='zhipu', credentials={}, key='', current=null, windowId, controller=null, queue=Promise.resolve();
let configs=modelSettings(), testing=false, verifiedKeys={};
const isVerified=()=>!!key && verifiedKeys[provider]===key;
const status=text=>el('status').textContent=text;
const persist=()=>current?chrome.storage.session.set({[current.id]:current}):Promise.resolve();
function render() {
  if(current) {
    el('title').textContent=current.draft.title;
    el('title').title=current.draft.title;
    el('messages').replaceChildren(...current.turns.map((t,index)=>{
      const article=document.createElement('article');article.className=`turn ${t.role}`;
      const label=document.createElement('div');label.className='turn-label';label.textContent=t.role==='user'?'你':t.kind==='summary'?'视频总结':'AI';
      const body=document.createElement('div');body.className='bubble';renderMarkdown(body,(t.kind==='summary'?summarySections(t.content):t.content) || '正在思考…');article.append(label,body);
      if(['error','cancelled','interrupted'].includes(t.status)) {const hint=document.createElement('small');hint.className='incomplete';hint.textContent='本次回答未完成，可点击重试。';article.append(hint);}
      if(t.role==='assistant' && t.status==='complete') {
        const actions=el('answer-actions').content.firstElementChild.cloneNode(true);
        const restart=actions.querySelector('[data-action="restart"]');
        restart.disabled=!isVerified() || !!controller || testing;
        restart.onclick=restartSummary;
        actions.querySelector('[data-action="copy"]').onclick=copyTranscript;
        actions.querySelector('[data-action="export"]').onclick=exportTranscript;
        article.append(actions);
      } else if(t.role==='assistant' && index===current.turns.length-1 && ['error','cancelled','interrupted'].includes(t.status) && !controller && !testing) {
        const retry=document.createElement('button');retry.type='button';retry.className='answer-retry';retry.textContent='重试';retry.onclick=()=>start(null,true);article.append(retry);
      }
      return article;
    }));
  }
  const busy=!!controller || testing, ready=!!current && isVerified();
  el('provider').disabled=busy;el('save-key').disabled=busy;el('key').disabled=busy;
  el('save-key').textContent=testing?'正在测试连接…':'测试并保存';
  el('close-settings').disabled=testing;
  renderPicker();
  el('question').disabled=!ready || busy;
  el('send').disabled=!ready || busy;
  el('stop').hidden=!busy;

}
async function generate(question=null,retry=false) {
  if(controller || testing || !current) return;
  if(!isVerified()) {openSettings();status('请先验证并保存 API Key，通过后将自动总结。');return;}
  const selectedProvider=provider, selectedKey=key, selectedModel=configs[provider].selected;
  const complete=options=>completion({...options,key:selectedKey,provider:selectedProvider,model:selectedModel});
  const chat=current;
  if(retry) {
    const last=chat.turns.at(-1);
    if(last?.role==='assistant' && last.status!=='complete') {chat.turns.pop();if(last.kind!=='summary') question=chat.turns.pop()?.content;}
  }
  const history=chat.turns.slice();
  if(question) chat.turns.push({role:'user',content:question,status:'complete'});
  const turn={role:'assistant',kind:question?'answer':'summary',provider,model:selectedModel,content:'',status:'running'};chat.turns.push(turn);
  const run=new AbortController();controller=run;status('');render();el('messages').scrollTop=el('messages').scrollHeight;
  let limited=false;
  try {
    await persist();
    const onText=text=>{
      if(current!==chat) return;
      const box=el('messages'),follow=box.scrollHeight-box.scrollTop-box.clientHeight<100;
      turn.content=text;render();if(follow) box.scrollTop=box.scrollHeight;
    };
    turn.content=question?await answerQuestion({key,complete,draft:chat.draft,turns:history,question,signal:run.signal,onText,onScope:value=>{limited=value;}}):await summarize({key,complete,title:`${chat.draft.title} · ${chat.draft.part}`,cues:chat.draft.cues,signal:run.signal,onText});
    turn.status='complete';status(limited?'长视频：本轮根据总结及相关字幕片段回答。':'');
  } catch(e) {turn.status=run.signal.aborted?'cancelled':'error';status(e.message || '生成失败，请重试。');}
  finally {
    controller=null;chat.updated=Date.now();
    try {await persist();}catch {status('浏览器会话存储已满，本次对话暂未保存。');}
    render();
  }
}
async function handle(command) {
  if(command.action==='settings') {openSettings();return;}
  if(!command.draft) return;
  // Finish cancellation before switching the bound video or overwriting its state.
  if(controller) {controller.abort();await activeGeneration;}
  const id=`${conversationId(command.draft)}:${windowId}`;
  const saved=(await chrome.storage.session.get(id))[id];
  current=saved || {id,draft:command.draft,turns:[],updated:Date.now()};
  for(const turn of current.turns) if(turn.status==='running') turn.status='interrupted';
  await persist();await chrome.storage.session.set({[`panel-state:${windowId}`]:id});render();status('');
  if(!current.turns.length) start();
}
let activeGeneration=Promise.resolve();
function start(question=null,retry=false) {activeGeneration=generate(question,retry);return activeGeneration;}
const received=new Set();
function receive(command) {
  if(received.has(command.id)) return;
  received.add(command.id);
  queue=queue.then(()=>handle(command)).then(async()=>{
    const name=`panel-command:${windowId}`;
    if((await chrome.storage.session.get(name))[name]?.id===command.id) await chrome.storage.session.remove(name);
  }).catch(e=>status(e.message || '无法读取视频，请重新提取。'));
}
function closeMenu() {el('model-menu').hidden=true;el('model-toggle').setAttribute('aria-expanded','false');}
function renderPicker() {
  el('model-label').textContent=configs[provider].selected.split('/').at(-1);
  el('model-toggle').title=`${providerConfig(provider).name} · ${configs[provider].selected}`;
  el('model-toggle').disabled=!!controller || testing;
  if(controller) closeMenu();
  const menu=el('model-menu');menu.replaceChildren();
  for(const [id,config] of Object.entries(configs)) {
    if(!credentials[providerConfig(id).keyName]) continue;
    const heading=document.createElement('div');heading.className='model-group';heading.textContent=providerConfig(id).name;menu.append(heading);
    for(const model of config.models) {
      const button=document.createElement('button');button.type='button';button.role='menuitemradio';button.setAttribute('aria-checked',String(id===provider && model===config.selected));button.textContent=model;button.title=model;
      button.onclick=async()=>{
        if(controller) return;
        const next={...configs,[id]:{...config,selected:model}};
        try {await chrome.storage.local.set({aiProvider:id,aiModelSettings:next});configs=next;provider=id;key=credentials[providerConfig(id).keyName] || '';closeMenu();render();el('model-toggle').focus();}
        catch {status('模型切换失败，请重试。');}
      };menu.append(button);
    }
  }
  const settings=document.createElement('button');settings.type='button';settings.role='menuitem';settings.className='manage-models';settings.textContent='设置模型与 API…';settings.onclick=()=>openSettings();menu.append(settings);
}
function loadSettings() {
  const id=el('provider').value, config=providerConfig(id);
  el('key').value='';el('models').textContent=config.model;
  const configured=!!credentials[config.keyName];
  el('key').placeholder=configured?'已保存，留空保留原 Key':'粘贴你的 API Key';
  el('key-badge').textContent=configured?(verifiedKeys[id]===credentials[config.keyName]?'已验证':'待验证'):'未配置';
  el('api-key-link').href=config.apiKeyUrl;
  el('api-key-link').textContent=`前往${config.name}申请 API Key ↗`;
  el('key-status').textContent='密钥按服务商分别保存在此浏览器，不同步。';
}
function openSettings() {closeMenu();el('provider').value=provider;loadSettings();if(!el('settings').open) el('settings').showModal();}
function closeSettings() {if(!testing) el('settings').close();}
el('settings').addEventListener('cancel',event=>{if(testing)event.preventDefault();});
el('close-settings').onclick=closeSettings;
el('provider').onchange=loadSettings;
el('model-toggle').onclick=()=>{const show=el('model-menu').hidden;el('model-menu').hidden=!show;el('model-toggle').setAttribute('aria-expanded',String(show));if(show) el('model-menu').querySelector('button')?.focus();};
document.addEventListener('click',event=>{if(!event.target.closest('.model-picker'))closeMenu();});
el('model-menu').onkeydown=event=>{
  const buttons=[...el('model-menu').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(event.key==='Escape'){closeMenu();el('model-toggle').focus();event.preventDefault();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
};
el('save-key').onclick=async()=>{
  if(controller || testing) return;
  const id=el('provider').value, selected=providerConfig(id);
  let saved=false;
  try {
    const value=el('key').value.trim()?validateKey(el('key').value):credentials[selected.keyName];
    if(!value) throw new Error('请填写 API Key。');
    testing=true;render();el('key-status').textContent='正在测试 Key 和模型连接，请稍候…';
    await testConnection({key:value,provider:id,model:selected.model});
    const fingerprint=await credentialFingerprint(value,selected.model);
    await chrome.storage.local.set({[selected.keyName]:value,[`${id}Verification`]:fingerprint,aiProvider:id});
    credentials[selected.keyName]=value;verifiedKeys[id]=value;provider=id;key=value;
    el('key').value='';saved=true;
  }catch(e){el('key-status').textContent=`未保存：${e.message || '连接测试失败，请重试。'}`;}
  finally {testing=false;render();}
  if(saved) {closeSettings();status('连接测试通过，Key 已保存。');if(current && !current.turns.length) start();}
};
el('stop').onclick=()=>controller?.abort();
function restartSummary() {if(!controller && !testing && current && isVerified()) {current.turns=[];start();}}
el('chat-form').onsubmit=event=>{event.preventDefault();const question=el('question').value.trim();if(!question || controller || !key || !current)return;el('question').value='';start(question);};
el('question').onkeydown=event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing && event.keyCode!==229) {event.preventDefault();el('chat-form').requestSubmit();}};
function transcript() {return `# ${current.draft.title}\n\n`+current.turns.map(t=>`## ${t.role==='user'?'你':t.kind==='summary'?'视频总结':'回答'}${t.status!=='complete'?'（未完成）':''}\n\n${t.kind==='summary'?summarySections(t.content):t.content}`).join('\n\n');}
const copyTranscript=async()=>{try {await navigator.clipboard.writeText(transcript());status('已复制对话。');}catch {status('复制失败，请使用导出笔记。');}};
const exportTranscript=()=>{const url=URL.createObjectURL(new Blob([transcript()],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='视频对话笔记.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
window.addEventListener('pagehide',()=>controller?.abort());
async function init() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  windowId=(await chrome.windows.getCurrent()).id;
  credentials=await chrome.storage.local.get(['zhipuApiKey','siliconflowApiKey','aiProvider','aiModelSettings','zhipuVerification','siliconflowVerification']);
  for(const id of ['zhipu','siliconflow']) {
    const config=providerConfig(id), savedKey=credentials[config.keyName];
    if(savedKey && credentials[`${id}Verification`]===await credentialFingerprint(savedKey,config.model)) verifiedKeys[id]=savedKey;
  }
  configs=modelSettings(credentials.aiModelSettings);
  provider=['zhipu','siliconflow'].includes(credentials.aiProvider)?credentials.aiProvider:(credentials.zhipuApiKey?'zhipu':'siliconflow');
  key=credentials[providerConfig(provider).keyName] || '';
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='session' && changes[`panel-command:${windowId}`]?.newValue) receive(changes[`panel-command:${windowId}`].newValue);
    if(area==='local') {
      for(const name of ['zhipuApiKey','siliconflowApiKey']) if(changes[name]) {credentials[name]=changes[name].newValue || '';const id=name==='zhipuApiKey'?'zhipu':'siliconflow';if(verifiedKeys[id]!==credentials[name]) delete verifiedKeys[id];}
      if(!controller) {
        if(changes.aiModelSettings) configs=modelSettings(changes.aiModelSettings.newValue);
        if(['zhipu','siliconflow'].includes(changes.aiProvider?.newValue)) provider=changes.aiProvider.newValue;
      }
      key=credentials[providerConfig(provider).keyName] || '';render();
    }
  });
  const names=[`panel-command:${windowId}`,`panel-state:${windowId}`];
  const state=await chrome.storage.session.get(names);
  const saved=state[names[1]];
  if(saved) {current=(await chrome.storage.session.get(saved))[saved] || null;if(current) for(const t of current.turns) if(t.status==='running') t.status='interrupted';}
  render();
  if(state[names[0]]) receive(state[names[0]]);
}
init().catch(e=>status(e.message || '侧栏初始化失败，请重新加载插件。'));
