import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown,summarySections} from '../modules/markdown.js';
class Node {
 constructor(tag,text='') {this.tagName=tag;this.children=[];this.textContent=text;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(){this.children=[];}
 get firstChild(){return this.children[0];}
}
globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',text)};
const all=node=>[node,...node.children.flatMap(all)];
test('Markdown renders headings, bold, lists and code without executing raw HTML',()=>{
 const root=new Node('div');renderMarkdown(root,'## 核心观点\n1. **观点**：解释\n2. `代码`\n\n<script>alert(1)</script>\n\n[危险](javascript:alert)');
 const nodes=all(root);assert.equal(nodes.filter(n=>n.tagName==='ol').length,1);assert.equal(nodes.filter(n=>n.tagName==='li').length,2);
 assert.equal(nodes.find(n=>n.tagName==='strong').textContent,'观点');assert.ok(nodes.some(n=>n.tagName==='code'));assert.ok(!nodes.some(n=>n.tagName==='script'||n.tagName==='a'));
});
test('Old summaries hide all sections except sentence summary and core points',()=>{
 const text='## 一句话总结\n概括\n## 核心观点\n1. **观点**\n## 章节摘要\n旧章节\n## 值得记住\n旧内容\n## 信息局限\n旧局限';
 assert.equal(summarySections(text),'## 一句话总结\n概括\n## 核心观点\n1. **观点**');
});
