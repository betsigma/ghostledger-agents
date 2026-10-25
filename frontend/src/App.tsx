import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import { go, useRoute } from "./router";
import type { Account, Health } from "./types";
import { Banner, Ghost, Working } from "./ui";
import SignIn from "./pages/SignIn";
import NewCase from "./pages/NewCase";
import MyCases from "./pages/MyCases";
import CasePage from "./pages/CasePage";
import MyPayments from "./pages/MyPayments";
import Profile from "./pages/Profile";
import Approvals from "./pages/Approvals";
import Overview from "./pages/Overview";
import Failures from "./pages/Failures";
import Activity from "./pages/Activity";
import Customers from "./pages/Customers";
import Ledger from "./pages/Ledger";
import Scenarios from "./pages/Scenarios";
import DemoScript from "./pages/DemoScript";

export interface Me {
  account: Account;
  payment_history: Record<string, any>[];
  receipts: Record<string, any>[];
}

export const SessionContext = createContext<{ me: Me | null; health: Health | null }>({ me: null, health: null });
export const useSession = () => useContext(SessionContext);

const CUSTOMER_NAV = [["new", "New case"], ["cases", "My cases"], ["payments", "My payments"], ["profile", "Profile"]];
const ADMIN_NAV = [
  ["approvals", "Approvals"], ["overview", "Overview"], ["ledger", "Bank ledger"],
  ["failures", "Payment failures"], ["activity", "Agent activity"], ["customers", "Customers"],
];
const ADMIN_PAGES = new Set(["approvals", "overview", "ledger", "failures", "activity", "customers", "scenarios"]);
const CUSTOMER_PAGES = new Set(["new", "payments", "profile"]);

export function navFor(role: Account["role"]): string[][] {
  if (role === "CUSTOMER") return CUSTOMER_NAV;
  return role === "DEMO_ADMIN" ? [...ADMIN_NAV, ["scenarios", "Demo scenarios"], ["demo-script", "Demo script"]] : ADMIN_NAV;
}

export default function App() {
  const route = useRoute();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [health, setHealth] = useState<Health | null>(null);

  const loadMe = useCallback(async () => {
    if (!getToken()) return setMe(null);
    setLoading(true);
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      go("/signin");
    });
    loadMe();
    api<Health>("/health").then(setHealth).catch(() => setHealth(null));
  }, [loadMe]);

  const signOut = async () => {
    await api("/auth/signout", { method: "POST" }).catch(() => {});
    setToken(null);
    setMe(null);
    go("/signin");
  };

  const page = route[0] ?? "";
  let content;
  if (page === "demo-script") content = <DemoScript />;
  else if (loading) content = <Working text="Opening GhostLedger" />;
  else if (!me) content = <SignIn onSignedIn={loadMe} />;
  else content = <Page me={me} route={route} />;

  return (
    <SessionContext.Provider value={{ me, health }}>
      <Header me={me} health={health} onSignOut={signOut} current={page} />
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {health && !health.llm_configured && (
          <Banner>Live AI analysis is unavailable on this server. Scripted demo scenarios still work.</Banner>
        )}
        {content}
      </main>
    </SessionContext.Provider>
  );
}

export function Page({ me, route }: { me: Me; route: string[] }) {
  const role = me.account.role;
  const isAdmin = role !== "CUSTOMER";
  const page = route[0] ?? (isAdmin ? "approvals" : "new");

  if (!isAdmin && ADMIN_PAGES.has(page)) return <Notice text="This area is for bank admins." />;
  if (isAdmin && CUSTOMER_PAGES.has(page)) return <Notice text="This area is for customers." />;
  if (page === "scenarios" && role !== "DEMO_ADMIN") return <Notice text="Demo scenarios are for the demo admin." />;

  switch (page) {
    case "new": return <NewCase />;
    case "cases": return route[1] ? <CasePage caseId={route[1]} /> : isAdmin ? <Approvals /> : <MyCases />;
    case "payments": return <MyPayments />;
    case "profile": return <Profile />;
    case "approvals": return <Approvals />;
    case "overview": return <Overview />;
    case "failures": return <Failures />;
    case "activity": return <Activity />;
    case "customers": return <Customers />;
    case "ledger": return <Ledger />;
    case "scenarios": return <Scenarios />;
    default: return <Notice text="That page doesn't exist." />;
  }
}

const Notice = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center gap-3 py-16 text-center">
    <Ghost />
    <p className="font-display text-xl font-bold">{text}</p>
  </div>
);

function Header({ me, health, onSignOut, current }: { me: Me | null; health: Health | null; onSignOut: () => void; current: string }) {
  const nav = me ? navFor(me.account.role) : [];
  const dot = health === null ? "bg-slate-400" : health.llm_configured ? "bg-green-500" : "bg-amber-500";
  const dotText = health === null ? "Server not reachable" : health.llm_configured ? `Live AI ready (${health.llm_model})` : "Live AI not configured";
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <a href="#/" className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Ghost size={36} /> GhostLedger
        </a>
        <span className="flex items-center gap-1.5 text-xs text-sky" title={dotText}>
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden /> {dotText}
        </span>
        {me && (
          <nav aria-label="Main" className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto">
            {nav.map(([path, label]) => (
              <a
                key={path}
                href={`#/${path}`}
                aria-current={current === path ? "page" : undefined}
                className="rounded-lg px-2.5 py-1.5 text-sm hover:bg-ocean aria-[current=page]:bg-ocean"
              >
                {label}
              </a>
            ))}
            <button onClick={onSignOut} className="rounded-lg px-2.5 py-1.5 text-sm text-sky hover:bg-ocean hover:text-white">
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
