import Contract from "../src/domain/Contract";
import Payment from "../src/domain/Payment";
import CloseInvoicing from "../src/application/usecase/CloseInvoicing";
import ContractRepository from "../src/application/repository/ContractRepository";
import InvoiceRepository from "../src/application/repository/InvoiceRepository";
import Mediator from "../src/application/mediator/Mediator";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";

let contractRepository: ContractRepository;
let invoiceRepository: InvoiceRepository;
let mediator: Mediator;
let closeInvoicing: CloseInvoicing;
let steps: string[];

beforeEach(() => {
	const contract = new Contract("contract-id", "", 6000, 12, new Date("2022-01-01T10:00:00"));
	contract.addPayment(new Payment("payment-id", new Date("2022-01-05T10:00:00"), 6000));
	contractRepository = { list: jest.fn(async () => [contract]) };
	steps = [];
	invoiceRepository = {
		listPeriod: jest.fn(async () => []),
		replacePeriod: jest.fn(async () => {
			await Promise.resolve();
			steps.push("persist");
		})
	};
	mediator = { publish: jest.fn(async () => { steps.push("publish"); }) };
	closeInvoicing = new CloseInvoicing(contractRepository, invoiceRepository, new DynamicPresenterFactory(), mediator);
});

test.each([
	{ type: "accrual", format: undefined, amount: 500, date: "2022-01-01T13:00:00.000Z" },
	{ type: "cash", format: "json", amount: 6000, date: "2022-01-05T13:00:00.000Z" },
	{ type: "cash", format: "csv", amount: 6000, date: "2022-01-05T13:00:00.000Z" }
])("Deve fechar $type em $format, vinculando o contrato e publicando o resumo", async function ({ type, format, amount, date }) {
	const output = await closeInvoicing.execute({ month: 1, year: 2022, type, format });

	expect(invoiceRepository.replacePeriod).toHaveBeenCalledWith(1, 2022, type, [
		{ idContract: "contract-id", date: new Date(date), amount }
	]);
	expect(output).toEqual(format === "csv" ? "2022-01-05;6000" : [{ date: new Date(date), amount }]);
	expect(mediator.publish).toHaveBeenCalledWith("InvoicesClosed", { month: 1, year: 2022, type, invoices: 1, total: amount });
	expect(steps).toEqual(["persist", "publish"]);
	expect(invoiceRepository.listPeriod).not.toHaveBeenCalled();
});

test.each([false, true])("Deve substituir por lote vazio e publicar resumo zero, sem contratos: %s", async function (noContracts) {
	if (noContracts) jest.spyOn(contractRepository, "list").mockResolvedValue([]);

	const output = await closeInvoicing.execute({ month: 3, year: 2023, type: "cash" });

	expect(output).toEqual([]);
	expect(invoiceRepository.replacePeriod).toHaveBeenCalledWith(3, 2023, "cash", []);
	expect(mediator.publish).toHaveBeenCalledWith("InvoicesClosed", { month: 3, year: 2023, type: "cash", invoices: 0, total: 0 });
});

test.each([
	{ type: "cash", format: "xml", message: "Invalid format" },
	{ type: "unknown", format: undefined, message: "Invalid type" }
])("Deve rejeitar $message sem efeitos, mesmo sem contratos", async function ({ type, format, message }) {
	jest.spyOn(contractRepository, "list").mockResolvedValue([]);

	await expect(closeInvoicing.execute({ month: 1, year: 2022, type, format })).rejects.toThrow(message);

	expect(contractRepository.list).not.toHaveBeenCalled();
	expect(invoiceRepository.replacePeriod).not.toHaveBeenCalled();
	expect(mediator.publish).not.toHaveBeenCalled();
});

test("Deve propagar falha de persistencia sem publicar evento ou apresentar sucesso", async function () {
	const error = new Error("Persistence failed");
	jest.spyOn(invoiceRepository, "replacePeriod").mockRejectedValue(error);
	const present = jest.fn();
	closeInvoicing = new CloseInvoicing(contractRepository, invoiceRepository, { create: () => ({ present }) }, mediator);

	await expect(closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" })).rejects.toBe(error);

	expect(mediator.publish).not.toHaveBeenCalled();
	expect(present).not.toHaveBeenCalled();
});

test("Deve publicar quantidade e total do lote de varios contratos", async function () {
	const contracts = [
		new Contract("first", "", 6000, 12, new Date("2022-01-01T10:00:00")),
		new Contract("second", "", 3000, 12, new Date("2022-01-01T10:00:00"))
	];
	jest.spyOn(contractRepository, "list").mockResolvedValue(contracts);

	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });

	expect(invoiceRepository.replacePeriod).toHaveBeenCalledWith(1, 2022, "accrual", [
		{ idContract: "first", date: contracts[0].date, amount: 500 },
		{ idContract: "second", date: contracts[1].date, amount: 250 }
	]);
	expect(mediator.publish).toHaveBeenCalledWith("InvoicesClosed", { month: 1, year: 2022, type: "accrual", invoices: 2, total: 750 });
});