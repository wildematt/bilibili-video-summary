import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseModels,modelSettings} from '../modules/model-settings.js';
test('旧版配置迁移保持默认模型，保留合法选项',()=>{
 assert.equal(modelSettings().siliconflow.selected,'Qwen/Qwen3-8B');
 const config=modelSettings({siliconflow:{models:['a','b'],selected:'b'}});
 assert.equal(config.siliconflow.selected,'b');
 assert.equal(modelSettings({siliconflow:{models:['a'],selected:'deleted'}}).siliconflow.selected,'a');
});
test('模型配置去重并拒绝空列表与无效 ID',()=>{
 assert.deepEqual(parseModels(' Qwen/Qwen3-8B\nother-model,other-model '),['Qwen/Qwen3-8B','other-model']);
 for(const value of ['', '   ', '<script>', 'bad model']) assert.throws(()=>parseModels(value));
 assert.equal(modelSettings({zhipu:{models:['<script>']}}).zhipu.selected,'glm-4.7-flash');
});
