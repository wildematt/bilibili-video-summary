import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseVideoUrl,normalizeCues,timecode,toSrt,toTxt,filename,safeSubtitleUrl} from '../modules/subtitles.js';
import {md5,signWbi} from '../modules/wbi.js';
import {createClient} from '../modules/api.js';

const bvid='BV1LZ421H741';
const caption={body:[{from:59.9996,to:62.3,content:'第一行\r\n第二行'},{from:0,to:2,content:'开头'}]};
test('识别 BV 和分 P，拒绝伪造域名与不支持页面',()=>{
 assert.deepEqual(parseVideoUrl(`https://www.bilibili.com/video/${bvid}/?p=3`),{bvid,page:3});
 assert.equal(parseVideoUrl(`https://www.bilibili.com/video/${bvid}?p=-1`).page,1);
 for(const url of [`https://bilibili.com.evil.test/video/${bvid}`,`https://evilbilibili.com/video/${bvid}`,'https://www.bilibili.com/bangumi/play/ep123','chrome://extensions']) assert.throws(()=>parseVideoUrl(url));
});
test('SRT 毫秒进位、排序、多行、空项过滤与 TXT',()=>{
 assert.equal(timecode(59.9996),'00:01:00,000');
 assert.equal(timecode(3600.001),'01:00:00,001');
 const cues=normalizeCues({...caption,body:[...caption.body,{from:-1,to:3,content:'无效'},null,{from:2,to:2,content:'无效'},{from:3,to:4,content:'  '}]});
 assert.equal(toSrt(cues),'1\n00:00:00,000 --> 00:00:02,000\n开头\n\n2\n00:01:00,000 --> 00:01:02,300\n第一行\n第二行\n');
 assert.equal(toTxt(cues),'开头\n第一行\n第二行');
 assert.throws(()=>normalizeCues({body:[]}));assert.throws(()=>normalizeCues({}));
});
test('安全文件名和字幕地址：阻止任意站点、凭据及非 HTTPS',()=>{
 assert.equal(filename('a/b:c',2,'中文','srt'),'a_b_c_P2_中文.srt');
 assert.equal(safeSubtitleUrl('//aisubtitle.hdslb.com/a.json'),'https://aisubtitle.hdslb.com/a.json');
 for(const url of ['https://evil.test/a','https://hdslb.com.evil.test/a','http://aisubtitle.hdslb.com/a','https://user:pass@aisubtitle.hdslb.com/a','file:///tmp/a','https://aisubtitle.hdslb.com:444/a']) assert.throws(()=>safeSubtitleUrl(url));
});
test('MD5 与 Node 标准实现比对，包括 Unicode 和跨块输入',()=>{
 for(const s of ['', 'abc', '你好世界', 'x'.repeat(55),'x'.repeat(56),'x'.repeat(64),'x'.repeat(1000)]) assert.equal(md5(s),createHash('md5').update(s).digest('hex'));
});
test('WBI 与独立 Python 参考结果一致',()=>{
 const signed=signWbi({foo:'114',bar:'514',baz:1919810},'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png','https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',1702204169);
 assert.equal(signed,'bar=514&baz=1919810&foo=114&wts=1702204169&w_rid=6149fdadf571698ca7e6a567265cd0ee');
});
test('完整 API 数据流：视频 → 当前分 P → 字幕 → 导出',async()=>{
 const calls=[];
 const api=createClient(async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/view?'))return {code:0,data:{title:'测试',pages:[{cid:100,page:1,part:'上'},{cid:200,page:2,part:'下'}]}};
  if(url.includes('/wbi/v2?'))return {code:0,data:{subtitle:{subtitles:[{lan:'ai-zh',lan_doc:'中文（自动生成）',subtitle_url:'//aisubtitle.hdslb.com/test.json'}]}}};
  return caption;
 });
 const video=await api.video(bvid); const tracks=await api.tracks(bvid,video.pages[1].cid); const cues=normalizeCues(await api.subtitle(tracks[0].url));
 assert.ok(calls[1].url.includes('cid=200'));assert.equal(calls[2].options.subtitle,true);assert.equal(cues.length,2);assert.ok(toSrt(cues).includes('00:01:02,300'));
});
test('区分登录失效、无字幕、无权限，不误报为空列表',async()=>{
 for(const [response,pattern] of [[{code:0,data:{need_login_subtitle:true,subtitle:{subtitles:[]}}},/登录/],[{code:0,data:{subtitle:{subtitles:[]}}},/没有可提取/],[{code:-101},/登录/],[{code:-404},/访问权限/]]) {
  await assert.rejects(createClient(async()=>response).tracks(bvid,1),pattern);
 }
});
test('签名错误仅重试一次，并使用 nav 的 WBI 密钥',async()=>{
 const calls=[];
 const api=createClient(async url=>{
  calls.push(url);
  if(url.includes('/nav'))return {code:-101,data:{wbi_img:{img_url:'https://i0.hdslb.com/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i0.hdslb.com/4932caff0ff746eab6f01bf08b70ac45.png'}}};
  if(!url.includes('w_rid'))return {code:-403};
  return {code:0,data:{subtitle:{subtitles:[{lan:'zh',subtitle_url:'https://aisubtitle.hdslb.com/test.json'}]}}};
 });
 assert.equal((await api.tracks(bvid,1)).length,1);assert.equal(calls.length,3);assert.ok(calls[2].includes('w_rid='));
});
test('后台消息桥接优先页面请求，CDN 请求不带登录凭据',async()=>{
 let listener;const calls=[];
 globalThis.chrome={runtime:{id:'unit-test',onMessage:{addListener(fn){listener=fn;}}},scripting:{async executeScript(spec){calls.push(spec);return [{result:{data:{code:0,data:{title:'测试',pages:[{page:1,cid:100,part:'主视频'}]}}}}];}}};
 const nativeFetch=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(caption));};
 try {
  await import('../background.js');
  const message=m=>new Promise(resolve=>listener({...m,tabId:10},{id:'unit-test'},resolve));
  assert.equal((await message({type:'video',bvid})).ok,true);assert.equal(calls[0].target.tabId,10);
  assert.equal((await message({type:'subtitle',url:'https://aisubtitle.hdslb.com/test.json'})).ok,true);
  assert.equal(calls[1].init.credentials,'omit');
  assert.equal(listener({type:'video'},{id:'other'},()=>{}),false);
 } finally {globalThis.fetch=nativeFetch;delete globalThis.chrome;}
});
