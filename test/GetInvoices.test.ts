import GetInvoices from "../src/application/usecase/GetInvoices";
import InvoiceRepository from "../src/application/repository/InvoiceRepository";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";

let invoiceRepository: InvoiceRepository;
let getInvoices: GetInvoices;

beforeEach(() => {
	invoiceRepository = {
		replacePeriod: jest.fn(async () => {}),
		listPeriod: jest.fn(async () => [
			{ date: new Date("2022-01-01T10:00:00"), amount: 500 },
			{ date: new Date("2022-01-05T10:00:00"), amount: 250 }
		])
	};
	getInvoices = new GetInvoices(invoiceRepository, new DynamicPresenterFactory());
});

test.each([undefined, "json", "csv"])("Deve consultar o periodo e apresentar no formato %s", async function (format) {
	const output = await getInvoices.execute({ month: 1, year: 2022, type: "accrual", format });

	expect(invoiceRepository.listPeriod).toHaveBeenCalledWith(1, 2022, "accrual");
	expect(output).toEqual(format === "csv" ? "2022-01-01;500\n2022-01-05;250" : [
		{ date: new Date("2022-01-01T13:00:00.000Z"), amount: 500 },
		{ date: new Date("2022-01-05T13:00:00.000Z"), amount: 250 }
	]);
	expect(invoiceRepository.replacePeriod).not.toHaveBeenCalled();
});

test.each([undefined, "csv"])("Deve apresentar periodo vazio em %s sem erro", async function (format) {
	jest.spyOn(invoiceRepository, "listPeriod").mockResolvedValue([]);

	expect(await getInvoices.execute({ month: 3, year: 2023, type: "cash", format })).toEqual(format === "csv" ? "" : []);
});

test.each([
	{ type: "cash", format: "xml", message: "Invalid format" },
	{ type: "unknown", format: undefined, message: "Invalid type" }
])("Deve rejeitar $message antes de consultar", async function ({ type, format, message }) {
	await expect(getInvoices.execute({ month: 1, year: 2022, type, format })).rejects.toThrow(new Error(message));

	expect(invoiceRepository.listPeriod).not.toHaveBeenCalled();
	expect(invoiceRepository.replacePeriod).not.toHaveBeenCalled();
});