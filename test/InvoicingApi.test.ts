import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { Server } from "http";
import { AddressInfo } from "net";
import { resolve } from "path";
import axios from "axios";
import CloseInvoicing from "../src/application/usecase/CloseInvoicing";
import GenerateInvoices from "../src/application/usecase/GenerateInvoices";
import GetInvoices from "../src/application/usecase/GetInvoices";
import LoggerDecorator from "../src/application/decorator/LoggerDecorator";
import SendEmail from "../src/application/usecase/SendEmail";
import { InvoiceOutput } from "../src/application/repository/InvoiceRepository";
import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";
import ContractDatabaseRepository from "../src/infra/repository/ContractDatabaseRepository";
import InvoiceDatabaseRepository from "../src/infra/repository/InvoiceDatabaseRepository";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";
import Mediator from "../src/infra/mediator/Mediator";
import ExpressAdapter from "../src/infra/http/ExpressAdapter";
import MainController from "../src/infra/http/MainController";
import CloseInvoicingController from "../src/infra/http/CloseInvoicingController";
import GetInvoicesController from "../src/infra/http/GetInvoicesController";

type ClosedEvent = {
	month: number,
	year: number,
	type: string,
	invoices: number,
	total: number
}

const schema = `teste_${randomUUID().replace(/-/g, "")}`;
const date = new Date("2022-01-01T13:00:00.000Z");
const expected = [{ date: date.toISOString(), amount: 500 }];
let connection: DatabaseConnection;
let scopedConnection: DatabaseConnection;
let invoiceRepository: InvoiceDatabaseRepository;
let server: Server;
let url: string;
let consoleLog: jest.SpyInstance;
let closedEvents: { summary: ClosedEvent, persisted: InvoiceOutput[] }[];

beforeAll(async () => {
	consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
	connection = new PgPromiseAdapter();
	// Isola o DDL e o seed, preservando queries e transacoes reais do adapter.
	const scopedStatement = (statement: string) => statement.replace(/\bbranas\b/g, schema);
	scopedConnection = {
		query: (statement, params) => connection.query(scopedStatement(statement), params),
		transaction: work => connection.transaction(transaction => work({
			query: (statement, params) => transaction.query(scopedStatement(statement), params)
		})),
		close: () => connection.close()
	};
	await scopedConnection.query(readFileSync(resolve(__dirname, "..", "create.sql"), "utf8"), []);
	const contractRepository = new ContractDatabaseRepository(scopedConnection);
	invoiceRepository = new InvoiceDatabaseRepository(scopedConnection);
	const presenterFactory = new DynamicPresenterFactory();
	const mediator = new Mediator();
	const sendEmail = new SendEmail();
	mediator.on("InvoicesGenerated", async (data: any) => sendEmail.execute(data));
	mediator.on("InvoicesClosed", async (summary: ClosedEvent) => {
		closedEvents.push({
			summary,
			persisted: await invoiceRepository.listPeriod(summary.month, summary.year, summary.type)
		});
		await sendEmail.execute(summary);
	});
	const adapter = new ExpressAdapter();
	new MainController(adapter, new LoggerDecorator(new GenerateInvoices(contractRepository, presenterFactory, mediator)));
	new CloseInvoicingController(adapter, new LoggerDecorator(new CloseInvoicing(contractRepository, invoiceRepository, presenterFactory, mediator)));
	new GetInvoicesController(adapter, new GetInvoices(invoiceRepository, presenterFactory));
	await new Promise<void>(resolve => {
		server = adapter.app.listen(0, "127.0.0.1", resolve);
	});
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
	await scopedConnection.query("delete from branas.invoice", []);
	closedEvents = [];
	consoleLog.mockClear();
});

afterAll(async () => {
	try {
		if (server) {
			await new Promise<void>((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
			});
		}
	} finally {
		try {
			if (connection) await connection.query(`drop schema if exists ${schema} cascade`, []);
		} finally {
			if (connection) await connection.close();
			if (consoleLog) consoleLog.mockRestore();
		}
	}
});

test("Deve fechar accrual do seed, consultar e reprocessar sem duplicacao", async function () {
	const input = { month: 1, year: 2022, type: "accrual" };
	const close = await axios.post(`${url}/close_invoicing`, input);
	const query = await axios.get(`${url}/invoices?month=1&year=2022&type=accrual`);

	expect(close.headers["content-type"]).toContain("application/json");
	expect(close.data).toEqual(expected);
	expect(query.data).toEqual(expected);
	const persisted = await scopedConnection.query("select id_invoice, id_contract, month, year, type, date, amount from branas.invoice", []);
	expect(persisted).toEqual([{
		id_invoice: expect.any(String),
		id_contract: "4224a279-c162-4283-86f5-1095f559b08c",
		month: 1,
		year: 2022,
		type: "accrual",
		date,
		amount: "500"
	}]);

	expect((await axios.post(`${url}/close_invoicing`, { ...input, format: "json" })).data).toEqual(expected);
	expect((await axios.get(`${url}/invoices?month=1&year=2022&type=accrual&format=json`)).data).toEqual(expected);
	const reprocessed = await scopedConnection.query("select id_invoice from branas.invoice", []);
	expect(reprocessed).toHaveLength(1);
	expect(reprocessed[0].id_invoice).not.toBe(persisted[0].id_invoice);
	const summary = { ...input, invoices: 1, total: 500 };
	expect(closedEvents).toEqual([
		{ summary, persisted: [{ date, amount: 500 }] },
		{ summary, persisted: [{ date, amount: 500 }] }
	]);
	expect(consoleLog).toHaveBeenCalledWith(summary);
});

test("Deve responder CSV puro nos tres endpoints sem persistir na simulacao", async function () {
	const input = { month: 1, year: 2022, type: "cash", format: "csv" };
	const close = await axios.post(`${url}/close_invoicing`, input, { responseType: "text" });
	const query = await axios.get(`${url}/invoices?month=1&year=2022&type=cash&format=csv`, { responseType: "text" });

	for (const response of [close, query]) {
		expect(response.headers["content-type"]).toContain("text/plain");
		expect(response.data).toBe("2022-01-05;6000");
	}
	const previous = await scopedConnection.query("select * from branas.invoice order by id_invoice", []);
	const simulation = await axios.post(`${url}/generate_invoices`, { ...input, type: "accrual" }, { responseType: "text" });
	expect(simulation.headers["content-type"]).toContain("text/plain");
	expect(simulation.data).toBe("2022-01-01;500");
	const jsonSimulation = await axios.post(`${url}/generate_invoices`, { month: 1, year: 2022, type: "cash", format: "json" });
	expect(jsonSimulation.data).toEqual([{ date: "2022-01-05T13:00:00.000Z", amount: 6000 }]);
	expect(await scopedConnection.query("select * from branas.invoice order by id_invoice", [])).toEqual(previous);
	expect(consoleLog).toHaveBeenCalledWith({ month: 1, year: 2022, type: "cash", invoices: 1, total: 6000 });
});

test("Deve substituir fechamento por lote vazio, consultar vazio e publicar resumo zero", async function () {
	await invoiceRepository.replacePeriod(3, 2023, "cash", [{
		idContract: "4224a279-c162-4283-86f5-1095f559b08c", date, amount: 500
	}]);

	const response = await axios.post(`${url}/close_invoicing`, { month: 3, year: 2023, type: "cash" });
	expect(response.data).toEqual([]);
	expect((await axios.get(`${url}/invoices?month=3&year=2023&type=cash`)).data).toEqual([]);
	const csv = await axios.get(`${url}/invoices?month=3&year=2023&type=cash&format=csv`, { responseType: "text" });
	expect(csv.headers["content-type"]).toContain("text/plain");
	expect(csv.data).toBe("");
	expect(await scopedConnection.query("select * from branas.invoice", [])).toEqual([]);
	const summary = { month: 3, year: 2023, type: "cash", invoices: 0, total: 0 };
	expect(closedEvents).toEqual([{ summary, persisted: [] }]);
	expect(consoleLog).toHaveBeenCalledWith(summary);
});