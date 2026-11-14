import Contract from "../src/domain/Contract";
import ContractRepository from "../src/application/repository/ContractRepository";
import GenerateInvoices from "../src/application/usecase/GenerateInvoices";
import Mediator from "../src/application/mediator/Mediator";
import Presenter from "../src/application/presenter/Presenter";
import PresenterFactory from "../src/application/presenter/PresenterFactory";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";

test("Deve aguardar a publicacao pelo mediator injetado antes de apresentar as faturas", async function () {
	const contractRepository: ContractRepository = {
		async list () {
			return [new Contract("", "", 6000, 12, new Date("2022-01-01T10:00:00"))];
		}
	};
	const steps: string[] = [];
	const publish = jest.fn(async (_event: string, _data: any) => {
		await Promise.resolve();
		steps.push("publish");
	});
	const mediator: Mediator = { publish };
	const present = jest.fn(() => {
		steps.push("present");
		return "presented invoices";
	});
	const presenter: Presenter = { present };
	const create = jest.fn(() => presenter);
	const presenterFactory: PresenterFactory = { create };
	const generateInvoices = new GenerateInvoices(contractRepository, presenterFactory, mediator);

	const output = await generateInvoices.execute({ month: 1, year: 2022, type: "accrual", format: "custom" });

	expect(output).toBe("presented invoices");
	expect(create).toHaveBeenCalledWith("custom");
	expect(publish).toHaveBeenCalledTimes(1);
	expect(publish).toHaveBeenCalledWith("InvoicesGenerated", [
		{ date: new Date("2022-01-01T13:00:00.000Z"), amount: 500 }
	]);
	expect(present).toHaveBeenCalledTimes(1);
	expect(present).toHaveBeenCalledWith(publish.mock.calls[0][1]);
	expect(steps).toEqual(["publish", "present"]);
});

test.each([undefined, "json", "csv"])("Deve selecionar o formato %s ao gerar faturas", async function (format) {
	const contractRepository: ContractRepository = {
		async list () {
			return [new Contract("", "", 6000, 12, new Date("2022-01-01T10:00:00"))];
		}
	};
	const mediator: Mediator = { publish: jest.fn(async () => {}) };
	const generateInvoices = new GenerateInvoices(contractRepository, new DynamicPresenterFactory(), mediator);

	const output = await generateInvoices.execute({ month: 1, year: 2022, type: "accrual", format });

	expect(output).toEqual(format === "csv" ? "2022-01-01;500" : [
		{ date: new Date("2022-01-01T13:00:00.000Z"), amount: 500 }
	]);
});

test("Deve rejeitar formato invalido antes de carregar contratos ou publicar eventos", async function () {
	const list = jest.fn(async () => []);
	const publish = jest.fn(async () => {});
	const generateInvoices = new GenerateInvoices({ list }, new DynamicPresenterFactory(), { publish });

	await expect(generateInvoices.execute({
		month: 1, year: 2022, type: "accrual", format: "xml"
	})).rejects.toThrow("Invalid format");

	expect(list).not.toHaveBeenCalled();
	expect(publish).not.toHaveBeenCalled();
});