export type Side = 'left' | 'right' | 'both' | 'unknown';
export type SetType = 'working' | 'warmup' | 'backoff' | 'drop';
export interface Exercise {id:string; name:string;}
export interface Variant {id:string; exerciseId:string; name:string; equipment:string; unilateral:number; loadMode:string; increment:number; minReps:number; maxReps:number; defaultSets:number;}
export interface Rules {easy?:boolean; easySince?:number; targetRir?:number; maxSets?:number; minReps?:number; maxReps?:number; skipped?:string[]; deadline?:number;}
export interface Session {id:string; name:string; startedAt:number; endedAt:number|null; status:string; notes:string; plan:string[]; rules:Rules;}
export interface LoggedSet {id:string; sessionId:string; variantId:string; createdAt:number; weight:number; reps:number; rir:number|null; side:Side; type:SetType; painLocation:string; painSeverity:number; note:string; suggestedWeight:number|null; suggestedReps:number|null;}
export interface Recommendation {weight:number|null; reps:number; min:number; max:number; targetRir:number; reason:string; status:'ready'|'calibrate'|'complete'|'pause'; label:string;}
export interface CoachMessage {id:string; sessionId:string; createdAt:number; message:string; response:string;}
export interface Progression {id:string; sessionId:string; setId:string; variantId:string; createdAt:number; recommendation:Recommendation;}
export interface Snapshot {exercises:Exercise[]; variants:Variant[]; sessions:Session[]; sets:LoggedSet[]; messages:CoachMessage[]; progressions:Progression[];}
export const starterExercises = [
  {key:'extension',base:'Leg extension',name:'Single-leg leg extension',equipment:'Leg extension machine',unilateral:1,loadMode:'per leg',increment:5,minReps:8,maxReps:12,defaultSets:3},
  {key:'press',base:'Leg press',name:'Leg press',equipment:'Leg press machine',unilateral:0,loadMode:'machine load',increment:10,minReps:10,maxReps:15,defaultSets:3},
  {key:'rdl',base:'Romanian deadlift',name:'Dumbbell RDL',equipment:'Dumbbells',unilateral:0,loadMode:'per dumbbell',increment:5,minReps:8,maxReps:12,defaultSets:3},
  {key:'thrust',base:'Hip thrust',name:'Dumbbell hip thrust',equipment:'Dumbbell + bench',unilateral:0,loadMode:'total load',increment:5,minReps:10,maxReps:15,defaultSets:3},
  {key:'squat',base:'Squat',name:'Slant-board squat',equipment:'Slant board + dumbbell',unilateral:0,loadMode:'total load',increment:5,minReps:10,maxReps:15,defaultSets:3},
  {key:'bench',base:'Bench press',name:'Dumbbell bench press',equipment:'Dumbbells + bench',unilateral:0,loadMode:'per dumbbell',increment:5,minReps:8,maxReps:12,defaultSets:3},
  {key:'row',base:'Row',name:'Single-arm dumbbell row',equipment:'Dumbbell + bench',unilateral:1,loadMode:'per dumbbell',increment:5,minReps:8,maxReps:12,defaultSets:3},
  {key:'shoulder',base:'Shoulder press',name:'Dumbbell shoulder press',equipment:'Dumbbells',unilateral:0,loadMode:'per dumbbell',increment:5,minReps:8,maxReps:12,defaultSets:3},
  {key:'curl',base:'Biceps curl',name:'Dumbbell curl',equipment:'Dumbbells',unilateral:0,loadMode:'per dumbbell',increment:2.5,minReps:10,maxReps:15,defaultSets:3},
  {key:'lateral',base:'Lateral raise',name:'Dumbbell lateral raise',equipment:'Dumbbells',unilateral:0,loadMode:'per dumbbell',increment:2.5,minReps:12,maxReps:20,defaultSets:3},
];
