import DatabaseConnection, { TransactionConnection } from "./DatabaseConnection";
import pgp from "pg-promise";

export default class PgPromiseAdapter implements DatabaseConnection {
	connection: any;

	constructor () {
		this.connection = pgp()("postgres://postgres:123456@localhost:5432/app");
	}

	query(statement: string, params: any): Promise<any> {
		return this.connection.query(statement, params);
	}

	transaction<T>(work: (connection: TransactionConnection) => Promise<T>): Promise<T> {
		return this.connection.tx((transaction: any) => work({
			query: (statement: string, params: any) => transaction.query(statement, params)
		}));
	}

	close(): Promise<void> {
		return this.connection.$pool.end();
	}

}