import {WellbeingSupport} from "@/components/wellbeing-support";
import {DemoNotice,LimitContent} from "@/components/v2-ui";
export default function Page() { return <main id="main" tabIndex={-1} className="bank-inner-page"><header className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> YOUR CREDIT ACCOUNT</p><h1>Spending controls</h1><p className="page-intro">Set a monthly budget guide and manage your sample card.</p></div></header><DemoNotice/><LimitContent/><WellbeingSupport/></main>; }
