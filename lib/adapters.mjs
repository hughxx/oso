import { IntegrationError } from './cli.mjs';

export function list(value, key) {
  const rows = key ? value?.[key] : value;
  if (!Array.isArray(rows)) throw new IntegrationError(`返回结构不匹配：预期 ${key || '根节点'} 为数组`, 'SCHEMA');
  return rows;
}
export const text = value => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
export function conversations(data) {
  return list(data, 'conversation_info').map(c => ({
    id:c.recent_conversation_type === 'CHAT_TYPE_GROUP_MSG' ? `group:${c.group_id}` : `user:${c.target_account}`,
    kind:c.recent_conversation_type === 'CHAT_TYPE_GROUP_MSG' ? 'group' : 'user',
    target:String(c.recent_conversation_type === 'CHAT_TYPE_GROUP_MSG' ? c.group_id : c.target_account),
    title:c.group_name || c.native_name || c.staff_name || c.target_account,
  }));
}
export function messages(data, conversation) {
  return list(data?.respData, 'chatInfo').map(m => ({
    id:`im:${conversation.id}:${m.msgId}`, remoteId:String(m.msgId), source:'im',
    conversation, sender:m.sender, title:conversation.title, body:text(m.content),
    contentType:m.contentType, sentAt:new Date(Number(m.serverSendTime)).toISOString(),
    mentionConfirmed:false, mentionHint:!!m.at || text(m.content).includes('@'),
    read:false, readScope:'local',
  }));
}
export function mails(data) {
  return list(data).map(m => ({id:`mail:${m.itemId}`,remoteId:m.itemId,source:'mail',title:m.subject || '(无主题)',
    sender:m.fromEmail || m.from, body:m.body || m.preview || '', fullBody:!!m.body,
    sentAt:m.dateTimeReceived,read:!!m.isRead,readScope:'local',urgent:m.importance === 'High',attachments:m.attachments || []}));
}
export function calendars(data) {
  return list(data).map(e => ({id:`calendar:${e.itemId}`,remoteId:e.itemId,source:'calendar',title:e.subject,
    start:e.start,end:e.end,location:e.location,allDay:!!e.isAllDay,cancelled:!!e.isCancelled,
    availability:e.legacyFreeBusyStatus,body:e.body || '',organizer:e.organizer}));
}
export function meetings(data) {
  return list(data?.data, 'data').map(e => ({id:`meeting:${e.meetingId}`,remoteId:String(e.meetingId),source:'meeting',title:e.subject,
    start:new Date(Number(e.meetingStartTime)).toISOString(),end:new Date(Number(e.meetingEndTime)).toISOString(),location:e.location,rawStatus:e.status}));
}
export function cloudFiles(data, spaceId) {
  return list(data, 'files').map(f => ({id:`onebox:${spaceId}:${f.id}`,remoteId:String(f.id),spaceId:String(spaceId),source:'onebox',
    title:f.name,size:f.size,modifiedAt:f.modifiedAt,parent:f.parent,searchScope:'filename'}));
}
export function runStatus(run) {
  if (run.error) return 'failed';
  switch (run.status) {
    case 'completed': return 'review'; // A model's completion is not human acceptance.
    case 'running': return 'running';
    case 'created': case 'queued': case 'pending': case 'dispatched': return 'queued';
    case 'failed': case 'error': return 'failed';
    case 'cancelled': case 'canceled': return 'cancelled';
    case 'blocked': case 'waiting_input': case 'waiting_approval': return 'blocked';
    default: return 'unknown';
  }
}
export function mergeActivity(old, incoming, runId) {
  const items = new Map(old.map(m => [m.seq,m]));
  for (const m of incoming) {
    if (m.task_id && m.task_id !== runId) continue;
    if (!Number.isSafeInteger(Number(m.seq))) continue;
    // Never expose intermediate reasoning or raw tool payloads as a final answer.
    items.set(Number(m.seq),{seq:Number(m.seq),type:m.type,at:m.created_at,
      label:m.type === 'tool_use' ? `调用工具：${text(m.tool)}` : m.type === 'tool_result' ? `工具返回：${text(m.tool)}` : 'Agent 正在处理上下文'});
  }
  return [...items.values()].sort((a,b) => a.seq-b.seq).slice(-200);
}
