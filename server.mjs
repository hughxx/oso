import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCLI } from './lib/cli.mjs';
import { createIntegration } from './lib/integration.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3210);
const dataDirectory=process.env.OSO_DATA_DIR || path.join(root,'data');
const executeCLI=createCLI();
const integration=await createIntegration({directory:dataDirectory,cli:executeCLI});
async function cli(name,args){try{return {ok:true,output:await executeCLI(name,args,{json:false})};}catch(e){return {ok:false,error:e.message,code:e.code};}}
const commands={multica:{status:['auth','status'],agents:['agent','list','--output','json'],issues:['issue','list','--output','json'],runtime:['daemon','status']},welink:{status:['auth','status'],messages:['im','query-recent-conversation'],mail:['mail','--format','json','list'],calendar:['calendar','--format','json','list']}};
let queue=Promise.resolve();
const server=http.createServer(async(req,res)=>{
 const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
 try{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return send(403,{error:'仅允许本机访问'});
  if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return send(403,{error:'不允许跨站请求'});
  if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'不允许跨站请求'});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/live/')){
   const action=url.pathname.slice('/api/live/'.length);
   if(req.method==='GET'&&action==='state')return send(200,await integration.action('state'));
   if(req.method!=='POST')return send(405,{error:'不支持的方法'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'需要 application/json'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)return send(413,{error:'请求过大'});}
   let input;try{input=JSON.parse(body);}catch{return send(400,{error:'无效 JSON'});}
   if(!input||Array.isArray(input)||typeof input!=='object')return send(400,{error:'无效请求'});
   try{return send(200,await integration.action(action,input));}catch(e){return send(['VALIDATION','CONFIRMATION_REQUIRED'].includes(e.code)?400:e.code==='CONFLICT'?409:502,{error:e.message,code:e.code||'INTEGRATION'});}
  }
  if(url.pathname==='/api/state'){
   if(req.method==='GET'){try{return send(200,JSON.parse(await readFile(path.join(dataDirectory,'state.json'),'utf8')));}catch(e){if(e.code==='ENOENT')return send(200,null);throw e;}}
   if(req.method==='PUT'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2e6)return send(413,{error:'数据过大'});}
    let state;try{state=JSON.parse(body);}catch{return send(400,{error:'无效 JSON'});}
    if(!state||!Array.isArray(state.tasks)||!Array.isArray(state.messages)||!Array.isArray(state.events)||!Array.isArray(state.docs))return send(400,{error:'无效工作台数据'});
    const job=queue.catch(()=>{}).then(async()=>{await mkdir(dataDirectory,{recursive:true});await writeFile(path.join(dataDirectory,'state.tmp'),JSON.stringify(state,null,2));await rename(path.join(dataDirectory,'state.tmp'),path.join(dataDirectory,'state.json'));});queue=job;await job;return send(200,{ok:true});
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
  const assets={'/':'index.html','/app.js':'app.js','/live.js':'live.js','/style.css':'style.css','/live.css':'live.css'};
  const file=assets[url.pathname];if(!file)return send(404,{error:'未找到'});
  const types={html:'text/html',js:'text/javascript',css:'text/css'};
  return send(200,await readFile(path.join(root,'public',file)),types[file.split('.').pop()]+'; charset=utf-8');
 }catch(err){console.error(err.message);send(500,{error:'本地服务处理失败，请检查终端日志'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`OSO 工作台已启动：http://127.0.0.1:${port}`));
