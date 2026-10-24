import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelSettings,credentialFingerprint} from '../modules/model-settings.js';
test('旧版手填模型迁移到固定预设',()=>{
 const config=modelSettings({siliconflow:{models:['custom'],selected:'custom'}});
 assert.deepEqual(config.siliconflow,{models:['Qwen/Qwen3-8B'],selected:'Qwen/Qwen3-8B'});
 assert.deepEqual(config.zhipu.models,['glm-4.7-flash']);
});
test('验证记录绑定 Key 和模型，不存储明文 Key',async()=>{
 const fingerprint=await credentialFingerprint('test-key','model');
 assert.match(fingerprint,/^[a-f0-9]{64}$/);
 assert.notEqual(fingerprint,await credentialFingerprint('other-key','model'));
 assert.notEqual(fingerprint,await credentialFingerprint('test-key','other-model'));
});
