import { toInstant } from './calendar';
import type { Snapshot } from './types';
export const demoMembers=[{user_id:'demo-kiki',display_name:'Kiki',persona:'kiki' as const},{user_id:'demo-marty',display_name:'Marty',persona:'marty' as const}];
export function demoData():Snapshot {
  const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const make=(id:string,day:number,title:string,owner:number,hour:number,location:string,description:string,recurrence:'none'|'weekly'='none')=>({id,owner_id:demoMembers[owner].user_id,title,starts_at:toInstant(`${month}-${String(day).padStart(2,'0')}T${hour}:00`),ends_at:toInstant(`${month}-${String(day).padStart(2,'0')}T${hour+2}:00`),location,description,recurrence,all_day:false,birthday_user_id:null});
  return {members:demoMembers,requests:[],plans:[make('date-night',Math.min(now.getDate()+1,28),'Een avondje voor ons',0,19,'Ons favoriete restaurant','Telefoons weg, lekker eten en samen bijpraten.'),make('weekend',Math.min(now.getDate()+3,28),'Weekendplannen maken',1,17,'Thuis','Waar gaan we deze keer naartoe?'),make('walk',3,'Samen een rondje wandelen',0,10,'Het park','Frisse lucht en koffie onderweg.','weekly')],attendance:[{event_id:'date-night',user_id:'demo-kiki',occurrence_start:null,attending:true},{event_id:'date-night',user_id:'demo-marty',occurrence_start:null,attending:true},{event_id:'walk',user_id:'demo-kiki',occurrence_start:null,attending:true}]};
}
