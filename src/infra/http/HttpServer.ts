export default interface HttpServer {
	on (method: string, url: string, callback: HttpCallback): void;
	listen (port: number): void;
}

export type HttpCallback = (params: any, body: any, headers: any, query: any) => Promise<any>;