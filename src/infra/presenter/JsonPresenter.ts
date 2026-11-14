import Presenter from "../../application/presenter/Presenter";

export default class JsonPresenter<T = any> implements Presenter<T> {

	present(output: T): T {
		return output;
	}

}