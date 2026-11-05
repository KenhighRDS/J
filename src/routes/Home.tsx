import { Empty, PageTitle } from "../components/ui";
export function Home() {
  return (<div className="mx-auto w-full max-w-md"><PageTitle>Signals</PageTitle><Empty title="No signals yet" body="When a trade is called, it rings here with everything to copy." /></div>);
}
