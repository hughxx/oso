import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3210);
const run=(file,args)=>new Promise(resolve=>execFile(file,args,{timeout:20000,maxBuffer:1024*1024,windowsHide:true,shell:false},(err,stdout,stderr)=>resolve({ok:!err,output:stdout.trim(),error:err?(stderr.trim()||err.message):undefined})));
// Only fixed, read-only commands are exposed. For Windows npm CLIs, use the JS entry point.
async function cli(name,args){
 const entry=process.env[name==='welink'?'WELINK_CLI_ENTRY':'MULTICA_CLI_ENTRY'];
 return entry?run(process.execPath,[entry,...args]):run(name==='welink'?'welink-cli':'multica',args);
}
const commands={multica:{status:['auth','status'],agents:['agent','list','--output','json'],issues:['issue','list','--output','json'],runtime:['daemon','status']},welink:{status:['auth','status'],messages:['im','query-recent-conversation'],mail:['mail','--format','json','list'],calendar:['calendar','--format','json','list']}};
let queue=Promise.resolve();
const server=http.createServer(async(req,res)=>{
 const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
 try{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return send(403,{error:'仅允许本机访问'});
  if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return send(403,{error:'不允许跨站请求'});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/state'){
   if(req.method==='GET'){try{return send(200,JSON.parse(await readFile(path.join(root,'data/state.json'),'utf8')));}catch(e){if(e.code==='ENOENT')return send(200,null);throw e;}}
   if(req.method==='PUT'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2e6)return send(413,{error:'数据过大'});}
    let state;try{state=JSON.parse(body);}catch{return send(400,{error:'无效 JSON'});}
    if(!state||!Array.isArray(state.tasks)||!Array.isArray(state.messages)||!Array.isArray(state.events)||!Array.isArray(state.docs))return send(400,{error:'无效工作台数据'});
    const job=queue.catch(()=>{}).then(async()=>{await mkdir(path.join(root,'data'),{recursive:true});await writeFile(path.join(root,'data/state.tmp'),JSON.stringify(state,null,2));await rename(path.join(root,'data/state.tmp'),path.join(root,'data/state.json'));});queue=job;await job;return send(200,{ok:true});
   }
  }
  if(url.pathname==='/api/cli'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,{error:'请求过大'});}
   let params;try{params=JSON.parse(body);}catch{return send(400,{error:'无效 JSON'});}
   const args=Object.hasOwn(commands,params.provider||'')&&Object.hasOwn(commands[params.provider],params.action||'')?commands[params.provider][params.action]:null;
   if(!args)return send(400,{error:'不支持的命令'});
   return send(200,await cli(params.provider,args));
  }
  if(req.method!=='GET')return send(405,{error:'不支持的方法'});
  const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
  const file=assets[url.pathname];if(!file)return send(404,{error:'未找到'});
  const types={html:'text/html',js:'text/javascript',css:'text/css'};
  return send(200,await readFile(path.join(root,'public',file)),types[file.split('.').pop()]+'; charset=utf-8');
 }catch(err){console.error(err.message);send(500,{error:'本地服务处理失败，请检查终端日志'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`OSO 工作台已启动：http://127.0.0.1:${port}`));
