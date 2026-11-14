import HttpServer from "./HttpServer";
import Usecase from "../../application/usecase/Usecase";

export default class CloseInvoicingController {

	constructor (readonly httpServer: HttpServer, readonly usecase: Usecase) {
		httpServer.on("post", "/close_invoicing", async function (params: any, body: any, headers: any) {
			const input = body;
			input.userAgent = headers["user-agent"];
			input.host = headers.host;
			return usecase.execute(input);
		});
	}
}