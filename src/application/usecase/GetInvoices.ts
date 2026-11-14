import InvoiceGenerationFactory from "../../domain/InvoiceGenerationFactory";
import InvoiceRepository from "../repository/InvoiceRepository";
import PresenterFactory from "../presenter/PresenterFactory";
import Usecase from "./Usecase";

export default class GetInvoices implements Usecase {

	constructor (
		readonly invoiceRepository: InvoiceRepository,
		readonly presenterFactory: PresenterFactory
	) {
	}

	async execute (input: Input): Promise<any> {
		const presenter = this.presenterFactory.create(input.format);
		InvoiceGenerationFactory.create(input.type);
		const invoices = await this.invoiceRepository.listPeriod(input.month, input.year, input.type);
		return presenter.present(invoices);
	}
}

type Input = {
	month: number,
	year: number,
	type: string,
	format?: string
}