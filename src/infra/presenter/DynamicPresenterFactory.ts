import Presenter from "../../application/presenter/Presenter";
import PresenterFactory from "../../application/presenter/PresenterFactory";
import CsvPresenter from "./CsvPresenter";
import JsonPresenter from "./JsonPresenter";

export default class DynamicPresenterFactory implements PresenterFactory {

	create (format: string = "json"): Presenter {
		if (format === "json") {
			return new JsonPresenter();
		}
		if (format === "csv") {
			return new CsvPresenter();
		}
		throw new Error("Invalid format");
	}
}