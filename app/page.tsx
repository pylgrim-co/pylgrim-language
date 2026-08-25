import App from "../src/components/App";
import { LOCAL_USER, providerStatus } from "../src/edition/server";

/**
 * The whole app, for the one person running it.
 *
 * The hosted build resolves a session here, sends signed-out visitors to
 * /login, and holds new accounts at a plan step. None of that exists in
 * this edition: there is no sign-in, no plan and nobody else on the
 * install, so the page just renders.
 *
 * It does pass down which provider was resolved. Config is
 * environment-only, so without this nothing in the app ever tells you
 * which model is writing your stories.
 */

export const dynamic = "force-dynamic";

export default function Page() {
  return <App initialUser={LOCAL_USER} plan="paid" canGenerate provider={providerStatus()} />;
}
