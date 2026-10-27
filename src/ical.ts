import ICAL from 'ical.js';
import { localInput, toInstant } from './calendar';
import type { Occurrence, Plan } from './types';
const escapeText = (value: string) => value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
function fold(line: string) {
  let out='',size=0;
  for(const c of line){const bytes=new TextEncoder().encode(c).length;if(size+bytes>75){out+='\r\n ';size=1;}out+=c;size+=bytes;}
  return out;
}
const utc = (value:string) => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const wall = (value:string) => localInput(value).replace(/[-:]/g,'')+'00';
export function ical(plans: Plan[]) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kiki en Marty//Party app//NL','CALSCALE:GREGORIAN'];
  if(plans.some(p=>p.recurrence!=='none'&&!p.all_day))lines.push('BEGIN:VTIMEZONE','TZID:Europe/Amsterdam','BEGIN:DAYLIGHT','DTSTART:19960331T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT','BEGIN:STANDARD','DTSTART:19961027T030000','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','END:VTIMEZONE');
  for(const p of plans) {
    const dates=p.all_day?[`DTSTART;VALUE=DATE:${wall(p.starts_at).slice(0,8)}`,`DTEND;VALUE=DATE:${wall(p.ends_at).slice(0,8)}`]:p.recurrence!=='none'?[`DTSTART;TZID=Europe/Amsterdam:${wall(p.starts_at)}`,`DTEND;TZID=Europe/Amsterdam:${wall(p.ends_at)}`]:[`DTSTART:${utc(p.starts_at)}`,`DTEND:${utc(p.ends_at)}`];
    lines.push('BEGIN:VEVENT',`UID:${escapeText(p.id)}@kiki-marty`, `DTSTAMP:${utc(new Date().toISOString())}`,...dates);
    if(p.recurrence!=='none')lines.push('RRULE:FREQ='+({daily:'DAILY',weekly:'WEEKLY',yearly:'YEARLY'})[p.recurrence]+(p.recurrence==='yearly'&&wall(p.starts_at).slice(4,8)==='0229'?';BYMONTH=2;BYMONTHDAY=-1':''));
    lines.push(`SUMMARY:${escapeText(p.title)}`,`LOCATION:${escapeText(p.location)}`,`DESCRIPTION:${escapeText(p.description)}`,'END:VEVENT');
  }
  return [...lines,'END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export function downloadCalendar(plans:Plan[]) {
  const url=URL.createObjectURL(new Blob([ical(plans)],{type:'text/calendar;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='kiki-en-marty.ics';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function exportPlan(event: Occurrence, series:boolean):Plan {
  return series?event:{...event,id:event.recurrence==='none'?event.id:event.id+'-'+utc(event.occurrence_start),starts_at:event.occurrence_start,ends_at:event.occurrence_end,recurrence:'none'};
}
export function googleCalendarUrl(p:Plan) {
  const url=new URL('https://calendar.google.com/calendar/render');
  const dates=p.all_day?wall(p.starts_at).slice(0,8)+'/'+wall(p.ends_at).slice(0,8):utc(p.starts_at)+'/'+utc(p.ends_at);
  for(const [key,value] of Object.entries({action:'TEMPLATE',text:p.title,dates,ctz:'Europe/Amsterdam',location:p.location,details:p.description}))url.searchParams.set(key,value);
  const recurrence=ical([p]).split('\r\n').find(l=>l.startsWith('RRULE:'));if(recurrence)url.searchParams.set('recur',recurrence);
  return url.href;
}
export type ImportRow = Pick<Plan,'title'|'starts_at'|'ends_at'|'location'|'description'|'all_day'|'import_key'>;
export async function parseCalendar(text:string):Promise<{rows:ImportRow[];skipped:string[]}> {
  if(new TextEncoder().encode(text).length>1048576)throw new Error('Het bestand is groter dan 1 MB.');
  let cal;try{cal=new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/,'')));}catch{throw new Error('Dit is geen leesbaar .ics-bestand.');}
  if(cal.name!=='vcalendar')throw new Error('Dit bestand bevat geen agenda.');
  ICAL.TimezoneService.reset();
  for(const component of cal.getAllSubcomponents('vtimezone')){const tzid=component.getFirstPropertyValue('tzid');if(tzid)ICAL.TimezoneService.register(new ICAL.Timezone({component,tzid:String(tzid)}),String(tzid));}
  const entries=cal.getAllSubcomponents('vevent');if(entries.length>200)throw new Error('Maximaal 200 activiteiten per import.');
  const rows:ImportRow[]=[],skipped:string[]=[],seen=new Set<string>();
  for(const component of entries){const title=String(component.getFirstPropertyValue('summary')||'').trim();try{
    if(['rrule','rdate','recurrence-id'].some(p=>component.hasProperty(p)))throw new Error('herhaalreeks wordt niet geïmporteerd');
    if(String(component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED'||String(cal.getFirstPropertyValue('method')).toUpperCase()==='CANCEL')throw new Error('geannuleerde activiteit');
    if(!title||[...title].length>100)throw new Error('titel ontbreekt of is te lang');
    if(!component.hasProperty('dtstart'))throw new Error('begintijd ontbreekt');
    for(const prop of ['dtstart','dtend'].map(n=>component.getFirstProperty(n)).filter(Boolean)){const tzid=prop!.getParameter('tzid');if(tzid&&!ICAL.TimezoneService.has(String(tzid)))throw new Error('tijdzonedefinitie ontbreekt');}
    const event=new ICAL.Event(component);
    const convert=(t:ICAL.Time)=>t.isDate||t.zone===ICAL.Timezone.localTimezone?toInstant(t.toString().slice(0,10)+'T'+(t.isDate?'00:00':t.toString().slice(11,19))):t.toJSDate().toISOString();
    const starts_at=convert(event.startDate);
    const end=component.hasProperty('dtend')||component.hasProperty('duration')?event.endDate:event.startDate.clone();
    if(!component.hasProperty('dtend')&&!component.hasProperty('duration'))end.adjust(event.startDate.isDate?1:0,event.startDate.isDate?0:1,0,0);
    const ends_at=convert(end),location=String(event.location||''),description=String(event.description||'');
    if(!Number.isFinite(Date.parse(ends_at))||Date.parse(ends_at)<=Date.parse(starts_at))throw new Error('ongeldige tijden');
    if([...location].length>200||[...description].length>2000)throw new Error('locatie of omschrijving is te lang');
    const fingerprint=event.uid?'uid:'+event.uid:JSON.stringify({title,starts_at,ends_at,location,description});
    const import_key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(seen.has(import_key))throw new Error('dubbel item in het bestand');seen.add(import_key);rows.push({title,starts_at,ends_at,location,description,all_day:event.startDate.isDate,import_key});
  }catch(e){skipped.push(`${title||'Naamloos'}: ${e instanceof Error?e.message:'ongeldig item'}`);}}
  return {rows,skipped};
}
