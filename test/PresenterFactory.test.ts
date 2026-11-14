import CsvPresenter from "../src/infra/presenter/CsvPresenter";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";
import JsonPresenter from "../src/infra/presenter/JsonPresenter";

test.each([undefined, "json"])("Deve resolver JSON para o formato %s sem acoplar a um DTO especifico", function (format) {
	const presenter = new DynamicPresenterFactory().create(format);
	const output = { month: 1, year: 2022, invoices: 2, total: 750 };

	expect(presenter).toBeInstanceOf(JsonPresenter);
	expect(presenter.present(output)).toBe(output);
});

test("Deve resolver CSV preservando o formato de cada linha", function () {
	const presenter = new DynamicPresenterFactory().create("csv");

	expect(presenter).toBeInstanceOf(CsvPresenter);
	expect(presenter.present([
		{ date: new Date("2022-01-01T10:00:00"), amount: 500 },
		{ date: new Date("2022-01-05T10:00:00"), amount: 250 }
	])).toBe("2022-01-01;500\n2022-01-05;250");
	expect(presenter.present([])).toBe("");
});

test.each(["xml", "", "JSON"])("Deve rejeitar o formato desconhecido %s", function (format) {
	expect(() => new DynamicPresenterFactory().create(format)).toThrow(new Error("Invalid format"));
});