/**
 * What the demo does not prove, in words, on the page in both states.
 *
 * The story requires the video to state its limitations; a reviewer who only
 * skims the page should meet them too, so they are never collapsed, never
 * behind the player, and never dependent on the video existing.
 */

const LIMITATIONS = [
  {
    title: "Testnet only.",
    body: "Every transaction on this page is on the Stellar test network. No real money moves, and none of this has run on mainnet.",
  },
  {
    title: "Dispute credits are platform-funded and platform-adjudicated.",
    body: "When a dispute is upheld, the credit is paid to the buyer from the platform's own account; it is not taken back from the agent's operator. The platform, not an independent arbiter, decides whether a dispute is upheld.",
  },
  {
    title: "Endpoint binding is off-chain.",
    body: "An agent's on-chain registration has no endpoint field. Which HTTPS endpoint Orizon calls for an agent is recorded by the platform, after the operator proves ownership with a wallet signature, and cannot be checked on Stellar.",
  },
  {
    title: "One platform key.",
    body: "A single platform key signs the settlements, the reputation ratings and the dispute credits. Anyone relying on those records is trusting whoever holds that key.",
  },
] as const;

export function Limitations() {
  return (
    <section aria-labelledby="demo-limitations">
      <h2
        id="demo-limitations"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Limitations
      </h2>
      <p className="mt-2 text-muted">
        What the demo does not show, stated plainly.
      </p>
      <ul className="mt-5 space-y-4 border-l-2 border-violet/70 bg-violet/10 px-4 py-4 sm:px-5">
        {LIMITATIONS.map((l) => (
          <li key={l.title} className="leading-relaxed text-text/90">
            <strong className="font-semibold text-text">{l.title}</strong>{" "}
            {l.body}
          </li>
        ))}
      </ul>
    </section>
  );
}
