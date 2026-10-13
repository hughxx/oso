import { execFile } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

export class IntegrationError extends Error {
  constructor(message, code = 'CLI_ERROR', details = {}) { super(message); this.code = code; Object.assign(this, details); }
}

// Preserve long IM / cloud IDs before JSON.parse can round them. Never alter strings.
export function parseJSON(text) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\uFEFF/, '').trim();
  const exact = clean.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
    if (!token.startsWith('"') && /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) return JSON.stringify(token);
    return token;
  });
  try { return JSON.parse(exact); }
  catch { throw new IntegrationError('CLI 未返回有效 JSON。请核对版本、输出选项和登录状态。', 'INVALID_JSON'); }
}

export function checkBusiness(result) {
  const im = result?.error?.error_code;
  if (im && im !== 'IM.0000') throw new IntegrationError(result.error.error_msg || `WeLink 错误 ${im}`, 'BUSINESS_ERROR');
  if (result && !Array.isArray(result) && Object.hasOwn(result, 'code') && !['0', '200'].includes(String(result.code))) {
    throw new IntegrationError(typeof result.message === 'string' ? result.message : result.description || `业务错误 ${result.code}`, 'BUSINESS_ERROR');
  }
  return result;
}

export function redact(text) {
  return String(text).replace(/\b(?:mul|mcn)_[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|signature|access_token)=)[^&\s]+/gi, '$1[REDACTED]');
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }
export async function resolveCLI(provider, config = {}, env = process.env) {
  const prefix = provider === 'welink' ? 'WELINK' : 'MULTICA';
  const configured = config[`${provider}Path`] || env[`${prefix}_CLI_ENTRY`] || env[`${prefix}_CLI_PATH`];
  if (configured) {
    if (/\.(?:cmd|bat|ps1)$/i.test(configured)) throw new IntegrationError('请选择原生 .exe 或 npm 包的 JavaScript wrapper，不使用 cmd/shell 拼接参数。', 'CONFIG');
    return /\.[cm]?js$/i.test(configured) ? {file:process.execPath, args:[configured]} : {file:configured, args:[]};
  }
  if (provider === 'welink' && process.platform === 'win32') {
    const dirs = [...(env.PATH || '').split(path.delimiter), env.APPDATA ? path.join(env.APPDATA, 'npm') : ''].filter(Boolean);
    for (const dir of dirs) {
      const exe = path.join(dir, 'welink-cli.exe');
      if (await exists(exe)) return {file:exe, args:[]};
      const pkgDir = path.join(dir, 'node_modules', '@welink', 'welink-cli');
      try {
        const pkg = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
        const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['welink-cli'];
        if (entry && await exists(path.resolve(pkgDir, entry))) return {file:process.execPath, args:[path.resolve(pkgDir, entry)]};
      } catch { /* continue discovery */ }
    }
  }
  return {file:provider === 'multica' ? (process.platform === 'win32' ? 'multica.exe' : 'multica') : 'welink-cli', args:[]};
}

export function createCLI({env = process.env} = {}) {
  const lanes = new Map();
  return async function call(provider, args, {config = {}, json = true, timeout, input} = {}) {
    const previous = lanes.get(provider) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const command = await resolveCLI(provider, config, env);
      const flags = [];
      if (provider === 'multica') {
        for (const [key, flag] of [['profile','--profile'],['serverUrl','--server-url'],['workspaceId','--workspace-id']]) if(config[key]) flags.push(flag,config[key]);
      }
      return new Promise((resolve, reject) => {
        const child = execFile(command.file, [...command.args,...flags,...args], {
          env:{...env,NO_COLOR:'1'}, windowsHide:true, shell:false, encoding:'utf8',
          timeout:timeout || (provider === 'welink' ? 15000 : 30000), maxBuffer:4 * 1024 * 1024,
        }, (err, stdout, stderr) => {
          if (err) {
            const code = err.code === 'ENOENT' ? 'CLI_NOT_FOUND' : err.killed ? 'TIMEOUT' : 'CLI_ERROR';
            const message = code === 'CLI_NOT_FOUND' ? `${provider} CLI 未找到，请设置可执行文件或 wrapper 路径。` :
              code === 'TIMEOUT' ? 'CLI 调用超时；写操作可能已提交，请先核对远端记录。' : redact(stderr || `CLI 退出码 ${err.code}`);
            return reject(new IntegrationError(message.slice(0,1800), code, {exitCode:err.code}));
          }
          try { resolve(json ? checkBusiness(parseJSON(stdout)) : redact(stdout.trim())); }
          catch (e) { reject(e); }
        });
        child.stdin.on('error', () => {});
        child.stdin.end(input || '');
      });
    });
    lanes.set(provider, operation);
    return operation;
  };
}
