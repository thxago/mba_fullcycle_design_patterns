export default interface Presenter<T = any> {
	present (output: T): any;
}