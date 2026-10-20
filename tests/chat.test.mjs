import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildChatMessages,conversationId,answerQuestion} from '../modules/chat.js';
const draft={bvid:'BV1LZ421H741',page:1,title:'示例',language:'中文',cues:[{from:0,text:'模型从例子学习规律'}]};
test('conversation IDs separate video parts and languages',()=>{
 assert.notEqual(conversationId(draft),conversationId({...draft,page:2}));
 assert.notEqual(conversationId(draft),conversationId({...draft,language:'英文'}));
 assert.throws(()=>conversationId({...draft,bvid:'invalid'}));
});
test('followups include completed pairs but exclude interrupted answers',()=>{
 const turns=[{role:'assistant',kind:'summary',content:'总结',status:'complete'},{role:'user',content:'第一问'},{role:'assistant',content:'第一答',status:'complete'},{role:'user',content:'失败问题'},{role:'assistant',content:'未完成',status:'cancelled'}];
 const {messages}=buildChatMessages(draft,turns,'继续解释');
 assert.deepEqual(messages.slice(1).map(x=>x.content),['第一问','第一答','继续解释']);
 assert.ok(messages[0].content.includes('总结'));
});
test('long source selects relevant chunks with explicit limitation',()=>{
 const long={...draft,cues:Array.from({length:10},(_,i)=>({from:i*60,text:(i===8?'量子计算':'普通话题')+'文'.repeat(17000)}))};
 const result=buildChatMessages(long,[],'量子计算是什么');
 assert.equal(result.limited,true);assert.ok(result.messages[0].content.includes('量子计算'));assert.ok(result.messages[0].content.length<57000);
});
test('question validation and request forwarding',async()=>{
 assert.throws(()=>buildChatMessages(draft,[],' '));assert.throws(()=>buildChatMessages(draft,[],'a'.repeat(4001)));
 const controller=new AbortController();
 const result=await answerQuestion({draft,key:'fixture',turns:[],question:'解释',signal:controller.signal,complete:async input=>{assert.equal(input.signal,controller.signal);assert.equal(input.messages.at(-1).content,'解释');return '回答';}});assert.equal(result,'回答');
});
