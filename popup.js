import { parseVideoUrl, normalizeCues, toSrt, toTxt, filename } from './modules/subtitles.js';
const el = id => document.getElementById(id);
let tabId, windowId, video, selectedPage, tracks = [], cues = [], sequence = 0;
const status = (text, kind = '') => { el('status').textContent = text; el('status').dataset.kind = kind; };
const exportEnabled = enabled => ['srt','txt','copy','summarize'].forEach(id=>el(id).disabled=!enabled);
const clearPreview = () => { cues=[]; exportEnabled(false); };
async function ask(type, args = {}) {
  const result = await chrome.runtime.sendMessage({type, tabId, ...args});
  if (!result?.ok) throw new Error(result?.error || '插件后台未响应，请关闭弹窗后重试。');
  return result.data;
}
async function loadSubtitle(ticket) {
  clearPreview();
  const track = tracks[0];
  if (!track) {status('当前视频没有可提取的字幕。','error');return;}
  status('正在下载字幕并在本地整理…','loading');
  try {
    const data = await ask('subtitle', { url:track.url });
    if (ticket !== sequence) return;
    cues = normalizeCues(data);
    exportEnabled(true); status('');
  } catch (e) { if (ticket === sequence) status(e.message,'error'); }
}
async function loadTracks(ticket) {
  clearPreview(); tracks=[];
  status('正在读取当前分 P 的字幕列表…','loading');
  try {
    const page = selectedPage;
    const result = await ask('tracks', {bvid:video.bvid,cid:page.cid});
    if (ticket !== sequence) return;
    tracks = result;
    await loadSubtitle(ticket);
  } catch (e) {
    if (ticket !== sequence) return;
    status(e.message,'error');
  }
}
async function refresh() {
  const ticket = ++sequence;
  clearPreview(); video=null; selectedPage=null; tracks=[];
  el('refresh').disabled=true;
  el('video-title').textContent='正在读取当前视频…'; el('video-detail').textContent='支持普通视频与多分 P';
  status('正在识别当前视频…','loading');
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    windowId=tab?.windowId;
    const parsed = parseVideoUrl(tab?.url);
    tabId=tab.id;
    const result = await ask('video',{bvid:parsed.bvid});
    if (ticket !== sequence) return;
    video=result; el('video-title').textContent=video.title; el('video-title').title=video.title;
    selectedPage = video.pages.find(p=>p.page===parsed.page) || video.pages[0];
    el('video-detail').textContent=`当前 P${selectedPage.page} · 共 ${video.pages.length} 个分 P`;
    el('refresh').disabled=false;
    await loadTracks(ticket);
  } catch (e) {
    if (ticket !== sequence) return;
    el('video-title').textContent='请打开 B 站视频播放页';
    status(e.message,'error');
  } finally { if(ticket===sequence) el('refresh').disabled=false; }
}
function download(ext) {
  if (!cues.length || !video) return;
  const track=tracks[0];
  const page=selectedPage;
  const body=ext==='srt'?toSrt(cues):toTxt(cues);
  const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download=filename(video.title,page.page,track.label,ext);
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status(`已发起 ${ext.toUpperCase()} 下载，请在 Chrome 下载列表中查看。`);
}
el('refresh').addEventListener('click',refresh);
el('srt').addEventListener('click',()=>download('srt'));
el('txt').addEventListener('click',()=>download('txt'));
el('copy').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(toTxt(cues)); status('已复制纯文本到剪贴板。'); }
  catch { status('复制未获允许，请使用下载 TXT 保存字幕。','error'); }
});
function openPanel(action,draft) {
  // Must invoke open synchronously within the user's click gesture.
  const opened=chrome.sidePanel.open({windowId});
  return Promise.all([opened,chrome.storage.session.set({[`panel-command:${windowId}`]:{id:crypto.randomUUID(),action,draft}})]);
}
el('summarize').addEventListener('click',()=>{
  if(!cues.length || !video) return;
  const page=selectedPage;
  const track=tracks[0];
  if(cues.reduce((n,c)=>n+c.text.length,0)>500000) {status('字幕超过 50 万字符，请选择更短的分 P。','error');return;}
  openPanel('summarize',{title:video.title,bvid:video.bvid,page:page.page,part:page.part,language:track.label,cues,created:Date.now()}).catch(e=>status(e.message || '无法打开侧栏，请重新加载插件。','error'));
});
refresh();
