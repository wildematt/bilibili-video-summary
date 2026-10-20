// Render a safe Markdown subset using DOM nodes; model HTML is always plain text.
export function inlineMarkdown(node,text) {
  const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let offset=0;
  for(const match of text.matchAll(pattern)) {
    node.append(document.createTextNode(text.slice(offset,match.index)));
    const value=match[0];let child;
    if(value.startsWith('`')) {child=document.createElement('code');child.textContent=value.slice(1,-1);}
    else if(value.startsWith('**') || value.startsWith('__')) {child=document.createElement('strong');child.textContent=value.slice(2,-2);}
    else if(value.startsWith('*')) {child=document.createElement('em');child.textContent=value.slice(1,-1);}
    else {const parts=value.match(/^\[([^\]]+)\]\((.+)\)$/);child=document.createElement('a');child.textContent=parts[1];child.href=parts[2];child.target='_blank';child.rel='noopener noreferrer';}
    node.append(child);offset=match.index+value.length;
  }
  node.append(document.createTextNode(text.slice(offset)));
}
export function renderMarkdown(node,text) {
  node.replaceChildren();let list=null,pre=null,paragraph=null;
  for(const line of text.split('\n')) {
    if(/^\s*```/.test(line)) {if(pre)pre=null;else {pre=document.createElement('pre');pre.append(document.createElement('code'));node.append(pre);}list=null;paragraph=null;continue;}
    if(pre) {pre.firstChild.append(document.createTextNode(line+'\n'));continue;}
    if(!line.trim()) {list=null;paragraph=null;continue;}
    const heading=line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/);
    const item=line.match(/^\s*(?:(\d+)[.)]|[-*+])\s+(.+)$/);
    if(heading) {const h=document.createElement('h3');inlineMarkdown(h,heading[1]);node.append(h);list=null;paragraph=null;}
    else if(item) {
      const type=item[1]?'ol':'ul';
      if(!list || list.tagName.toLowerCase()!==type) {list=document.createElement(type);if(item[1])list.start=Number(item[1]);node.append(list);}
      const li=document.createElement('li');inlineMarkdown(li,item[2]);list.append(li);paragraph=null;
    } else {
      list=null;
      if(!paragraph) {paragraph=document.createElement(line.startsWith('> ')?'blockquote':'p');node.append(paragraph);}else paragraph.append(document.createTextNode('\n'));
      inlineMarkdown(paragraph,line.replace(/^>\s?/,''));
    }
  }
}
// Also hide legacy sections when reopening a conversation created by older versions.
export function summarySections(text) {
  const lines=String(text).split('\n');let allowed=true,seen=false;
  return lines.filter(line=>{
    const heading=line.match(/^\s*#{1,6}\s+(.+)/);
    if(heading) {allowed=/^(一句话(?:总结)?|核心观点)/.test(heading[1].replace(/\*\*/g,''));seen=true;}
    return allowed && (seen || !/^\s*```/.test(line));
  }).join('\n').trim();
}
