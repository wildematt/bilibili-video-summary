import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testConnection} from '../modules/summary.js';
const key='fixture_only_not_a_real_key_12345';
test('连接测试验证实际模型流式输出，使用短请求且不发送视频资料',async()=>{
 for(const provider of ['zhipu','siliconflow']) {
  const result=await testConnection({provider,key,fetcher:async(url,init)=>{
   const body=JSON.parse(init.body);
   assert.equal(body.max_tokens,32);assert.equal(body.stream,true);
   assert.deepEqual(body.messages,[{role:'user',content:'请只回复 OK'}]);
   return new Response('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  }});
  assert.equal(result,'OK');
 }
});
test('拒绝无效 Key、模型无权限、额度不足、网络失败和空响应',async()=>{
 for(const code of [401,403,404,429,503]) await assert.rejects(testConnection({provider:'siliconflow',key,fetcher:async()=>new Response(key,{status:code})}),e=>e.message.includes('硅基流动')&&!e.message.includes(key));
 await assert.rejects(testConnection({key,fetcher:async()=>{throw new TypeError('network');}}),/无法连接/);
 await assert.rejects(testConnection({key,fetcher:async()=>new Response('data: [DONE]\n\n')}),/没有返回/);
});
