import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════════════
// Landing page — clean, high-trust, product-first. Black/white/neutral with
// subtle green accent for the "clean" state. No AI buzzwords, no playful
// startup aesthetic. Refer to CLAUDE.md §4.1.
// ═══════════════════════════════════════════════════════════════════════════

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <Header />
      <Hero />
      <BeforeAfter />
      <HowItWorks />
      <Safety />
      <FAQ />
      <Footer />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Wordmark */}
        <Link href="/" className="text-lg font-bold tracking-tight text-gray-900">
          Inbox Autopilot
        </Link>

        {/* Nav — hidden on mobile, shown on sm+ */}
        <nav className="hidden items-center gap-8 sm:flex">
          <a href="#how-it-works" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            How it works
          </a>
          <a href="#safety" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            Security
          </a>
          <Link href="/sign-in" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            Sign in
          </Link>
          <Link
            href="/connect-gmail"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Connect Gmail
          </Link>
        </nav>

        {/* Mobile CTA */}
        <Link
          href="/connect-gmail"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white sm:hidden"
        >
          Connect Gmail
        </Link>
      </div>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Subtle gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gray-50/80 to-white" />

      <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-24 text-center sm:pt-32 lg:pt-40">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Gmail only &middot; Free to start
        </div>

        {/* Headline */}
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
          Your inbox,{" "}
          <span className="text-emerald-600">on autopilot.</span>
        </h1>

        {/* Sub-headline */}
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-500 sm:text-xl">
          Clean up clutter, protect important email, and keep your inbox under
          control automatically.
        </p>

        {/* CTA row */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/connect-gmail"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-900/10 transition-all hover:bg-gray-800 hover:shadow-xl"
          >
            <GoogleIcon />
            Connect Gmail
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            Sign in
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
          >
            See how it works
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
            </svg>
          </a>
        </div>

        {/* Trust microcopy */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle />
            Gmail only
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle />
            No permanent deletion
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle />
            Everything is reversible
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Before / After ──────────────────────────────────────────────────────────

function BeforeAfter() {
  return (
    <section className="border-t border-gray-100 bg-gray-50/60 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
          Before &amp; after
        </p>
        <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          From overwhelming to effortless
        </h2>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* Before */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="text-xs font-semibold text-gray-500">Before</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 px-5 py-2">
              <InboxRow unread sender="Promo Store" subject="FLASH SALE: 70% off everything!!!" tag="Promo" tagColor="red" />
              <InboxRow unread sender="Newsletter Weekly" subject="This week's top 10 stories you missed" tag="Newsletter" tagColor="yellow" />
              <InboxRow sender="Mom" subject="Dinner Sunday?" important />
              <InboxRow unread sender="DealBlast" subject="Don't miss out — limited time offer" tag="Promo" tagColor="red" />
              <InboxRow unread sender="SaaS Tool" subject="Your weekly activity report" tag="Low value" tagColor="yellow" />
              <InboxRow sender="Chase Bank" subject="Your statement is ready" important />
              <InboxRow unread sender="Marketing Co" subject="We think you'll love this..." tag="Promo" tagColor="red" />
              <InboxRow unread sender="Random List" subject="Edition #47: The future of everything" tag="Newsletter" tagColor="yellow" />
              <InboxRow sender="Professor Davis" subject="RE: Assignment deadline extended" important />
              <InboxRow unread sender="ShopNow" subject="New arrivals just for you" tag="Promo" tagColor="red" />
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-center text-xs font-medium text-gray-400">
              47 unread &middot; important emails buried
            </div>
          </div>

          {/* After */}
          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm ring-1 ring-emerald-100">
            <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">After Autopilot</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 px-5 py-2">
              <InboxRow sender="Mom" subject="Dinner Sunday?" important clean />
              <InboxRow sender="Chase Bank" subject="Your statement is ready" important clean />
              <InboxRow sender="Professor Davis" subject="RE: Assignment deadline extended" important clean />
            </div>
            <div className="px-5 py-4">
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500">Handled by Autopilot</p>
                <div className="mt-2 space-y-1.5">
                  <AutopilotRow label="7 promotions archived" />
                  <AutopilotRow label="2 newsletters moved to digest" />
                  <AutopilotRow label="1 low-value recurring muted" />
                </div>
              </div>
            </div>
            <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-2.5 text-center text-xs font-medium text-emerald-700">
              3 emails that matter &middot; inbox clean
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-gray-100 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
          How it works
        </p>
        <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Three steps to a clean inbox
        </h2>

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          <Step
            number="1"
            title="Connect Gmail"
            description="One-click Google sign-in. We read your inbox to classify messages — we never send email on your behalf."
          />
          <Step
            number="2"
            title="Review cleanup plan"
            description="We scan your inbox, find obvious clutter, and show you a clear plan. You approve what gets archived or unsubscribed."
          />
          <Step
            number="3"
            title="Turn on autopilot"
            description="New clutter gets handled automatically. Important emails stay front and center. You stay in control."
          />
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/connect-gmail"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-900/10 transition-all hover:bg-gray-800 hover:shadow-xl"
          >
            <GoogleIcon />
            Get started free
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Safety ──────────────────────────────────────────────────────────────────

function Safety() {
  return (
    <section id="safety" className="border-t border-gray-100 bg-gray-50/60 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
          Safety first
        </p>
        <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Built so you never worry
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-sm leading-relaxed text-gray-500">
          We designed every decision around the question: what if we get it wrong?
          The answer is always the same — you can undo it.
        </p>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          <SafetyCard
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            }
            title="Never permanently deletes"
            description="Emails are archived, not deleted. They stay in your Gmail and can be found anytime through search."
          />
          <SafetyCard
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            }
            title="Undo every action"
            description="Every archive, every unsubscribe, every rule — all reversible from the Recovery Center with one click."
          />
          <SafetyCard
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
            }
            title="Important categories protected"
            description="Finance, travel, security, school, and personal contacts are shielded by default. Autopilot won't touch them."
          />
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What email accounts do you support?",
    a: "Gmail only for now. We built deep integration with Gmail to make autopilot reliable. We may add other providers in the future.",
  },
  {
    q: "Do you read my email?",
    a: "We read email metadata (sender, subject, labels) and content only when needed to classify ambiguous messages. We never store full email bodies long-term, and we never share your data.",
  },
  {
    q: "Can I undo mistakes?",
    a: "Yes, always. Every action the autopilot takes is logged in the Recovery Center. You can undo archives, restore senders, and reverse rules with one click.",
  },
  {
    q: "Will it unsubscribe me automatically?",
    a: "Only if you explicitly approve it during setup or enable auto-unsubscribe in settings. By default, the system only archives — it won't unsubscribe without your permission.",
  },
  {
    q: "How is this different from Gmail filters?",
    a: "Gmail filters are static rules you write yourself. Inbox Autopilot learns from your behavior — what you open, reply to, and ignore — and adapts over time without manual rule management.",
  },
];

function FAQ() {
  return (
    <section id="faq" className="border-t border-gray-100 py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
          FAQ
        </p>
        <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Common questions
        </h2>

        <div className="mt-12 divide-y divide-gray-100">
          {FAQ_ITEMS.map((item, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-gray-900">
                {item.q}
                <svg
                  className="ml-4 h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-45"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-gray-500">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold tracking-tight text-gray-900">
            Inbox Autopilot
          </span>
          <nav className="flex gap-6 text-xs text-gray-400">
            <a href="#how-it-works" className="hover:text-gray-600">How it works</a>
            <a href="#safety" className="hover:text-gray-600">Security</a>
            <a href="#faq" className="hover:text-gray-600">FAQ</a>
          </nav>
        </div>
        <p className="text-xs text-gray-300">
          &copy; {new Date().getFullYear()} Inbox Autopilot
        </p>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

// ─── Step card ───────────────────────────────────────────────────────────────

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative rounded-2xl border border-gray-100 bg-white p-6">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
        {number}
      </span>
      <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}

// ─── Safety card ─────────────────────────────────────────────────────────────

function SafetyCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}

// ─── Mock inbox rows ─────────────────────────────────────────────────────────

function InboxRow({
  sender,
  subject,
  unread,
  important,
  tag,
  tagColor,
  clean,
}: {
  sender: string;
  subject: string;
  unread?: boolean;
  important?: boolean;
  tag?: string;
  tagColor?: "red" | "yellow";
  clean?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Unread dot */}
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          unread ? "bg-blue-500" : "bg-transparent"
        }`}
      />
      {/* Sender */}
      <span
        className={`w-28 shrink-0 truncate text-xs ${
          unread ? "font-semibold text-gray-900" : "text-gray-500"
        }`}
      >
        {sender}
      </span>
      {/* Subject */}
      <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
        {subject}
      </span>
      {/* Tag or importance */}
      {tag && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            tagColor === "red"
              ? "bg-red-50 text-red-500"
              : "bg-amber-50 text-amber-600"
          }`}
        >
          {tag}
        </span>
      )}
      {important && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            clean
              ? "bg-emerald-50 text-emerald-600"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {clean ? "Protected" : "Important"}
        </span>
      )}
    </div>
  );
}

function AutopilotRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      {label}
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function CheckCircle() {
  return (
    <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
