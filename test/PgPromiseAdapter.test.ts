import { randomUUID } from "crypto";
import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";

let connection: DatabaseConnection;
let table: string;

beforeEach(async () => {
	connection = new PgPromiseAdapter();
	table = `branas.task04_transaction_${randomUUID().replace(/-/g, "")}`;
	await connection.query(`create table ${table} (id integer primary key)`, []);
	await connection.query(`insert into ${table} (id) values ($1)`, [1]);
});

afterEach(async () => {
	try {
		await connection.query(`drop table if exists ${table}`, []);
	} finally {
		await connection.close();
	}
});

test("Deve confirmar todas as queries na mesma transacao e retornar o resultado do trabalho", async function () {
	const output = await connection.transaction(async transaction => {
		await transaction.query(`delete from ${table}`, []);
		await transaction.query(`insert into ${table} (id) values ($1)`, [2]);
		expect(await connection.query(`select id from ${table} order by id`, [])).toEqual([{ id: 1 }]);
		await transaction.query(`insert into ${table} (id) values ($1)`, [3]);
		return transaction.query(`select id from ${table} order by id`, []);
	});

	expect(output).toEqual([{ id: 2 }, { id: 3 }]);
	expect(await connection.query(`select id from ${table} order by id`, [])).toEqual(output);
});

test.each(["callback", "constraint"])("Deve desfazer remocao e insercao parcial quando falha por %s", async function (failure) {
	const error = new Error("Forced transaction failure");
	const work = connection.transaction(async transaction => {
		await transaction.query(`delete from ${table}`, []);
		await transaction.query(`insert into ${table} (id) values ($1)`, [2]);
		if (failure === "callback") throw error;
		await transaction.query(`insert into ${table} (id) values ($1)`, [2]);
	});

	if (failure === "callback") {
		await expect(work).rejects.toBe(error);
	} else {
		await expect(work).rejects.toMatchObject({ code: "23505" });
	}
	expect(await connection.query(`select id from ${table} order by id`, [])).toEqual([{ id: 1 }]);
});