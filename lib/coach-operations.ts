import {z} from 'zod';
import {prescriptionSchema,routineSchema} from './routine';

// The model can propose only these operations. No SQL, arbitrary paths, history edits, or set logging.
export const coachOperationSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('adjust_workout'),workout:z.object({name:z.string().trim().min(1).max(80),exercises:z.array(prescriptionSchema).min(1).max(20)}).strict()}).strict(),
 z.object({type:z.literal('replace_routine'),routine:routineSchema}).strict(),
]);
export const coachAnswerSchema=z.object({reply:z.string().trim().min(1).max(3000),operation:coachOperationSchema.nullable()}).strict();
export type CoachAnswer=z.infer<typeof coachAnswerSchema>;
export interface CoachProposal extends CoachAnswer {id:string;status:string;message:string;sessionId:string|null;expectedConfiguration:string|null;expectedRevision:number;}

const text={type:'string'};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const prescription=object({variantId:text,minReps:{type:'integer'},maxReps:{type:'integer'},sets:{type:'integer'},targetRir:{type:'integer'}});
const workout=object({name:text,exercises:{type:'array',items:prescription}});
const template=object({id:text,name:text,notes:text,timeLimitMinutes:{type:['integer','null']},exercises:{type:'array',items:prescription}});
export const coachJSONSchema=object({reply:text,operation:{anyOf:[
 object({type:{type:'string',enum:['adjust_workout']},workout}),
 object({type:{type:'string',enum:['replace_routine']},routine:object({name:text,notes:text,constraints:{type:'array',items:text},workouts:{type:'array',items:template}})}),
 {type:'null'},
]}});
