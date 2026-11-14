import { randomInt, randomUUID } from "crypto";
import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";
import InvoiceDatabaseRepository from "../src/infra/repository/InvoiceDatabaseRepository";
import CloseInvoicing from "../src/application/usecase/CloseInvoicing";
import Contract from "../src/domain/Contract";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";
import { InvoiceData } from "../src/application/repository/InvoiceRepository";

let connection: DatabaseConnection;
let invoiceRepository: InvoiceDatabaseRepository;
let year: number;
const idContract = "4224a279-c162-4283-86f5-1095f559b08c";
let invoice: InvoiceData;

beforeEach(async () => {
	connection = new PgPromiseAdapter();
	invoiceRepository = new InvoiceDatabaseRepository(connection);
	do {
		year = randomInt(2100, 10000);
	} while ((await connection.query("select 1 from branas.invoice where year = $1 limit 1", [year])).length);
	invoice = { idContract, date: new Date(`${year}-01-01T10:00:00`), amount: 500 };
});

afterEach(async () => {
	try {
		await connection.query("delete from branas.invoice where year = $1", [year]);
	} finally {
		await connection.close();
	}
});

test("Deve reprocessar sem duplicar nem alterar outros periodos ou regimes", async function () {
	await invoiceRepository.replacePeriod(1, year, "cash", [invoice]);
	await invoiceRepository.replacePeriod(2, year, "accrual", [invoice]);
	const others = await connection.query("select * from branas.invoice where year = $1 order by month, type", [year]);
	await invoiceRepository.replacePeriod(1, year, "accrual", [invoice]);
	await invoiceRepository.replacePeriod(1, year, "accrual", [{ ...invoice, amount: 750 }]);

	const persisted = await connection.query("select id_contract, amount from branas.invoice where month = $1 and year = $2 and type = $3", [1, year, "accrual"]);
	expect(persisted).toEqual([{ id_contract: idContract, amount: "750" }]);
	expect(await connection.query("select * from branas.invoice where year = $1 and (month = 2 or type = 'cash') order by month, type", [year])).toEqual(others);
});

test("Deve preservar o fechamento anterior quando uma fatura do novo lote falha", async function () {
	await invoiceRepository.replacePeriod(1, year, "accrual", [
		invoice,
		{ ...invoice, date: new Date(`${year}-01-10T10:00:00`), amount: 250 }
	]);
	const previous = await connection.query("select * from branas.invoice where year = $1 order by id_invoice", [year]);
	const contractRepository = {
		async list () {
			return [
				new Contract(idContract, "", 9000, 12, invoice.date),
				new Contract(randomUUID(), "", 3000, 12, invoice.date)
			];
		}
	};
	const publish = jest.fn(async () => {});
	const closeInvoicing = new CloseInvoicing(contractRepository, invoiceRepository, new DynamicPresenterFactory(), { publish });
	await expect(closeInvoicing.execute({ month: 1, year, type: "accrual" })).rejects.toMatchObject({ code: "23503" });
	expect(await connection.query("select * from branas.invoice where year = $1 order by id_invoice", [year])).toEqual(previous);
	expect(publish).not.toHaveBeenCalled();
});

test("Deve preservar faturas anteriores quando o fechamento solicita formato invalido", async function () {
	await invoiceRepository.replacePeriod(1, year, "accrual", [invoice]);
	const previous = await connection.query("select * from branas.invoice where year = $1", [year]);
	const list = jest.fn(async () => [new Contract(idContract, "", 6000, 12, invoice.date)]);
	const publish = jest.fn(async () => {});
	const closeInvoicing = new CloseInvoicing({ list }, invoiceRepository, new DynamicPresenterFactory(), { publish });

	await expect(closeInvoicing.execute({ month: 1, year, type: "accrual", format: "xml" })).rejects.toThrow(new Error("Invalid format"));

	expect(await connection.query("select * from branas.invoice where year = $1", [year])).toEqual(previous);
	expect(list).not.toHaveBeenCalled();
	expect(publish).not.toHaveBeenCalled();
});

test("Deve remover faturas anteriores ao substituir por lote vazio", async function () {
	await invoiceRepository.replacePeriod(1, year, "accrual", [invoice]);
	await invoiceRepository.replacePeriod(1, year, "cash", [invoice]);
	await invoiceRepository.replacePeriod(1, year, "accrual", []);

	expect(await connection.query("select type from branas.invoice where year = $1", [year])).toEqual([{ type: "cash" }]);
});

test("Deve consultar apenas o periodo e regime em ordem de data com valores numericos", async function () {
	const first = { ...invoice, date: new Date(`${year}-01-02T10:00:00`), amount: 500 };
	const last = { ...invoice, date: new Date(`${year}-01-10T10:00:00`), amount: 750.5 };
	await invoiceRepository.replacePeriod(1, year, "accrual", [last, first]);
	await invoiceRepository.replacePeriod(1, year, "cash", [invoice]);
	await invoiceRepository.replacePeriod(2, year, "accrual", [invoice]);

	expect(await invoiceRepository.listPeriod(1, year, "accrual")).toEqual([
		{ date: first.date, amount: first.amount },
		{ date: last.date, amount: last.amount }
	]);
	expect(await invoiceRepository.listPeriod(3, year, "accrual")).toEqual([]);
});