import App from "../src/components/App";
import { LOCAL_USER } from "../src/edition/server";

/**
 * The whole app, for the one person running it.
 *
 * The hosted build resolves a session here, sends signed-out visitors to
 * /login, and holds new accounts at a plan step. None of that exists in
 * this edition: there is no sign-in, no plan and nobody else on the
 * install, so the page just renders.
 */

export const dynamic = "force-dynamic";

export default function Page() {
  return <App initialUser={LOCAL_USER} plan="paid" canGenerate />;
}
