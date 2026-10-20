import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completion,summarize} from '../modules/summary.js';
import {answerQuestion} from '../modules/chat.js';
import {providerConfig} from '../modules/providers.js';
const key='fixture_only_not_a_real_key_12345';
const response=()=>new Response('data: {"choices":[{"delta":{"content":"测试回答"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
test('硅基流动使用独立端点、模型和认证，不发送智谱专用参数',async()=>{
 const result=await completion({provider:'siliconflow',key,messages:[{role:'user',content:'总结'}],fetcher:async(url,init)=>{
  assert.equal(url,'https://api.siliconflow.cn/v1/chat/completions');
  const body=JSON.parse(init.body);assert.equal(body.model,'Qwen/Qwen3-8B');
  assert.equal(init.headers.Authorization,`Bearer ${key}`);assert.equal(init.credentials,'omit');
  assert.equal(init.redirect,'error');assert.equal(body.stream,true);assert.equal('thinking' in body,false);assert.equal(body.enable_thinking,false);
  assert.equal(init.body.includes(key),false);return response();
 }});assert.equal(result,'测试回答');
});
test('硅基流动错误按服务商显示且不泄露接口错误正文',async()=>{
 for(const code of [400,401,403,429,500]) await assert.rejects(completion({provider:'siliconflow',key,messages:[],fetcher:async()=>new Response(key,{status:code})}),e=>e.message.includes('硅基流动')&&!e.message.includes(key));
 assert.throws(()=>providerConfig('https://untrusted.example'));
 assert.notEqual(providerConfig('zhipu').keyName,providerConfig('siliconflow').keyName);
});
test('硅基流动覆盖长字幕分段、合并及连续追问',async()=>{
 let calls=0;
 const complete=options=>completion({...options,provider:'siliconflow',fetcher:async(url,init)=>{calls++;assert.equal(url,providerConfig('siliconflow').endpoint);assert.equal(JSON.parse(init.body).model,providerConfig('siliconflow').model);return response();}});
 const cues=[{from:0,text:'内容'.repeat(12000)}];
 await summarize({key,title:'视频',cues,complete});assert.equal(calls,3);
 await answerQuestion({key,draft:{title:'视频',cues},turns:[],question:'介绍要点',complete});assert.equal(calls,4);
});
test('选择的模型用于请求，服务商端点和 Key 保持独立',async()=>{
 for(const provider of ['siliconflow','zhipu']) {
  await completion({provider,model:'custom-model-v2',key,messages:[],fetcher:async(url,init)=>{
   assert.equal(url,providerConfig(provider).endpoint);
   assert.equal(JSON.parse(init.body).model,'custom-model-v2');
   assert.equal(init.headers.Authorization,`Bearer ${key}`);return response();
  }});
 }
});
