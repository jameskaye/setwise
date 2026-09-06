interface D1Result<T=Record<string,unknown>> {results:T[];success:boolean;meta:Record<string,unknown>;}
interface D1PreparedStatement {bind(...values:unknown[]):D1PreparedStatement;first<T=Record<string,unknown>>(column?:string):Promise<T|null>;all<T=Record<string,unknown>>():Promise<D1Result<T>>;run<T=Record<string,unknown>>():Promise<D1Result<T>>;raw<T=unknown[]>():Promise<T[]>;}
interface D1Database {prepare(sql:string):D1PreparedStatement;batch<T=Record<string,unknown>>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>;exec(sql:string):Promise<{count:number;duration:number}>;dump():Promise<ArrayBuffer>;}
interface Fetcher {fetch(request:Request):Promise<Response>;}
declare module 'cloudflare:workers' {export const env:{DB:D1Database};}
