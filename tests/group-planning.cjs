const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/groupPlanning.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports});
const {chooseGroupCount:count,buildGroupSizes:sizes,parseTableCount:parse}=mod.exports;
assert.deepEqual(Array.from(sizes(24,count(24,4,6,5,4))),[6,6,6,6]);
assert.deepEqual(Array.from(sizes(22,count(22,4,6,5,4))),[6,6,5,5]);
assert.equal(count(24,4,6,5),5);
assert.equal(count(24,4,6,5,2),4);
assert.equal(count(12,4,6,5,4),3);
assert.equal(count(7,4,6,5,4),null);
assert.equal(count(16,3,4,3,4),4);
assert.equal(parse(''),null);assert.equal(parse('4'),4);
for(const invalid of ['0','-1','1.5','four','4x','Infinity']) assert.throws(()=>parse(invalid));
for(let n=3;n<=300;n++) for(let tables=1;tables<=30;tables++) {
 const g=count(n,4,6,5,tables);if(!g)continue;
 const s=Array.from(sizes(n,g));
 assert.equal(s.reduce((a,b)=>a+b,0),n);
 assert.ok(s.every(x=>x>=4&&x<=6));assert.ok(Math.max(...s)-Math.min(...s)<=1);
 if(tables*4<=n&&n<=tables*6)assert.equal(g,tables);
}
console.log('PASS: 24/4, uneven attendance, legacy grouping, limited/excess tables, upper groups, validation and 8,940 combinations.');
