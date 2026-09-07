import {writeFileSync} from 'node:fs';
const origin=process.argv[2];
if(!origin||new URL(origin).protocol!=='https:'||new URL(origin).pathname!=='/'||new URL(origin).search||new URL(origin).username)throw new Error('Provide the deployed HTTPS origin, e.g. https://setwise.example.workers.dev');
const str={type:'string'},integer=(min,max)=>({type:'integer',minimum:min,...(max?{maximum:max}:{})});
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const boundedString=max=>({type:'string',minLength:1,maxLength:max});
const prescription=object({variantId:boundedString(180),minReps:integer(1,50),maxReps:integer(1,50),sets:integer(1,10),targetRir:integer(0,3)});
const workout=object({id:boundedString(180),name:boundedString(80),notes:{type:'string',maxLength:2000},timeLimitMinutes:{type:['integer','null'],minimum:5,maximum:180},exercises:{type:'array',minItems:1,maxItems:20,items:prescription}});
const routine=object({name:boundedString(80),notes:{type:'string',maxLength:2000},constraints:{type:'array',maxItems:15,items:boundedString(300)},workouts:{type:'array',minItems:1,maxItems:7,items:workout}});
const response={description:'Stored data or acknowledged change. A 409 requires a fresh read before a new change.',content:{'application/json':{schema:{type:'object',additionalProperties:true}}}};
const operation=(operationId,description,body)=>({operationId,description,'x-openai-isConsequential':false,...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),responses:{'200':response,'400':response,'401':response,'409':response,'503':response}});
const schema={openapi:'3.1.0',info:{title:'Setwise Coach',version:'1.0.0',description:'Read saved strength workouts and update current or future routines for the account owner.'},servers:[{url:new URL(origin).origin}],security:[{coachKey:[]}],components:{securitySchemes:{coachKey:{type:'http',scheme:'bearer'}}},paths:{
 '/api/coach/context':{get:operation('getTrainingContext','Read current routine, exercise catalog, active session, recent sets and notes. History is partial; fetch more pages when needed.')},
 '/api/coach/routine':{get:operation('getRoutine','Read the latest saved routine and its revision.'),put:operation('saveRoutine','Save a complete routine for FUTURE workouts. Preserve fields the user did not ask to change. expectedRevision prevents stale overwrites.',object({requestId:boundedString(180),expectedRevision:integer(0),reason:boundedString(1000),routine}))},
 '/api/coach/apply':{post:operation('adjustActiveWorkout','Adjust exercise lineup and prescriptions for TODAY only. Logged sets, pain pauses, notes, deadlines and existing session rules remain. Read context for expectedConfiguration.',object({requestId:boundedString(180),sessionId:boundedString(180),expectedConfiguration:{type:'string',pattern:'^[a-f0-9]{64}$'},reason:boundedString(1000),workout:object({name:boundedString(80),exercises:{type:'array',minItems:1,maxItems:20,items:prescription}})}))},
 '/api/coach/history':{get:{...operation('getTrainingHistory','Read paginated sets, session notes, or routine revisions. Restore a prior routine by saving its contents as a new revision.'),parameters:[
  {name:'kind',in:'query',schema:{type:'string',enum:['sets','sessions','revisions'],default:'sets'}},
  {name:'offset',in:'query',schema:integer(0)},
  {name:'before',in:'query',schema:integer(1),description:'Revision cursor from nextBefore; only used for revisions.'},
  {name:'variantId',in:'query',schema:str},{name:'sessionId',in:'query',schema:str}
 ]}}
}};
writeFileSync('docs/gpt/openapi.json',JSON.stringify(schema,null,2)+'\n');
console.log('Wrote docs/gpt/openapi.json for '+new URL(origin).origin);
