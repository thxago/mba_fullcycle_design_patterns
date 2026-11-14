export interface TransactionConnection {
	query (statement: string, params: any): Promise<any>;
}

export default interface DatabaseConnection extends TransactionConnection {
	transaction<T> (work: (connection: TransactionConnection) => Promise<T>): Promise<T>;
	close (): Promise<void>;
}