import { Server } from "http";
import { AddressInfo } from "net";
import axios from "axios";
import ExpressAdapter from "../src/infra/http/ExpressAdapter";
import GetInvoicesController from "../src/infra/http/GetInvoicesController";

let adapter: ExpressAdapter;
let server: Server;
let url: string;

beforeEach(async () => {
	adapter = new ExpressAdapter();
	await new Promise<void>(resolve => {
		server = adapter.app.listen(0, "127.0.0.1", resolve);
	});
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
	await new Promise<void>((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
	});
});

test("Deve repassar params, body, headers e query nessa ordem", async function () {
	adapter.on("post", "/parameters/:id", async function (params, body, headers, query) {
		return { params, body, header: headers["x-test"], query };
	});

	const response = await axios.post(`${url}/parameters/123?month=1&year=2022`, { amount: 500 }, {
		headers: { "x-test": "header-value" }
	});

	expect(response.data).toEqual({
		params: { id: "123" },
		body: { amount: 500 },
		header: "header-value",
		query: { month: "1", year: "2022" }
	});
});

test.each([
	{ output: "2022-01-01;500", contentType: "text/plain", body: "2022-01-01;500" },
	{ output: "", contentType: "text/plain", body: "" },
	{ output: [{ date: new Date("2022-01-01T10:00:00"), amount: 500 }], contentType: "application/json", body: '[{"date":"2022-01-01T13:00:00.000Z","amount":500}]' },
	{ output: { invoices: 1 }, contentType: "application/json", body: '{"invoices":1}' }
])("Deve serializar a resposta como $contentType preservando o corpo", async function ({ output, contentType, body }) {
	adapter.on("get", "/response", async () => output);

	const response = await axios.get(`${url}/response`, { responseType: "text" });

	expect(response.headers["content-type"]).toContain(contentType);
	expect(response.data).toBe(body);
});

test("Deve converter month e year da query no controller de consulta", async function () {
	const execute = jest.fn(async () => []);
	new GetInvoicesController(adapter, { execute });

	const response = await axios.get(`${url}/invoices?month=1&year=2022&type=cash&format=csv`);

	expect(execute).toHaveBeenCalledWith({ month: 1, year: 2022, type: "cash", format: "csv" });
	expect(response.data).toEqual([]);
});