import Contract from "../src/domain/Contract";
import ContractRepository from "../src/application/repository/ContractRepository";
import GenerateInvoices from "../src/application/usecase/GenerateInvoices";
import Mediator from "../src/application/mediator/Mediator";
import Presenter from "../src/application/presenter/Presenter";

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
	const generateInvoices = new GenerateInvoices(contractRepository, presenter, mediator);

	const output = await generateInvoices.execute({ month: 1, year: 2022, type: "accrual" });

	expect(output).toBe("presented invoices");
	expect(publish).toHaveBeenCalledTimes(1);
	expect(publish).toHaveBeenCalledWith("InvoicesGenerated", [
		{ date: new Date("2022-01-01T13:00:00.000Z"), amount: 500 }
	]);
	expect(present).toHaveBeenCalledTimes(1);
	expect(present).toHaveBeenCalledWith(publish.mock.calls[0][1]);
	expect(steps).toEqual(["publish", "present"]);
});