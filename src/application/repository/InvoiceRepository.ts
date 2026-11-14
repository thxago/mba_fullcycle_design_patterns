export default interface InvoiceRepository {
	replacePeriod (month: number, year: number, type: string, invoices: InvoiceData[]): Promise<void>;
	listPeriod (month: number, year: number, type: string): Promise<InvoiceOutput[]>;
}

export type InvoiceOutput = {
	date: Date,
	amount: number
}

export type InvoiceData = InvoiceOutput & {
	idContract: string
}